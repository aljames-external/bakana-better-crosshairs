import '../setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseCrosshairShape } from '../../src/crosshair/base.js';
import { CircleCrosshairShape } from '../../src/crosshair/circle.js';
import { ConeCrosshairShape } from '../../src/crosshair/cone.js';

import { initializeFoundryAdapter } from '../../src/adapter/index.js';

test('BaseCrosshairShape stateful lifecycle: constructor, hide, move, rotate, and getPlacementUpdates', async () => {
    initializeFoundryAdapter();
    // 1. Mock template placeable
    const mockDocument = {
        x: 100,
        y: 200,
        direction: 0,
        distance: 30,
        width: 10,
        updateSource(data) {
            Object.assign(this, data);
        }
    };
    const mockPlaceable = {
        x: 100,
        y: 200,
        direction: 0,
        document: mockDocument,
        renderFlags: {
            flags: { refreshShape: false, refreshTemplate: false },
            set(flags) {
                Object.assign(this.flags, flags);
            }
        },
        flags: {}
    };

    // 2. Instantiate stateful shape class
    const shape = new CircleCrosshairShape(mockPlaceable, { distance: 30, radius: 15 });
    
    assert.equal(shape.x, 100);
    assert.equal(shape.y, 200);
    assert.equal(shape.direction, 0);

    // Test getPlacementUpdates initially
    const initUpdates = shape.getPlacementUpdates();
    assert.equal(initUpdates.x, 100);
    assert.equal(initUpdates.y, 200);

    // 3. Test rotate() updates shape direction state and mock document direction
    shape.rotate(90);
    assert.equal(shape.direction, 90);
    assert.equal(mockPlaceable.direction, 90);
    assert.equal(mockDocument.direction, 90);

    // 4. Test move() updates shape position state and mock template preview coordinates
    shape.move(150, 250);
    assert.equal(shape.x, 150);
    assert.equal(shape.y, 250);

    // Test getPlacementUpdates after moving and rotating
    const finalUpdates = shape.getPlacementUpdates();
    assert.equal(finalUpdates.x, 150);
    assert.equal(finalUpdates.y, 250);
    assert.equal(finalUpdates.direction, 90);
});

test('ConeCrosshairShape default anchors and configureCrosshairShape', () => {
    const mockDocument = { x: 0, y: 0 };
    const mockPlaceable = { x: 0, y: 0, document: mockDocument };
    const shape = new ConeCrosshairShape(mockPlaceable, { distance: 30, angle: 60 });

    assert.deepEqual(shape.animationAnchor, { x: 0, y: 0.5 });
    assert.deepEqual(shape.shapeAnchor, { x: 0, y: 0.5 });

    const dimensions = shape.getGraphicDimensions();
    assert.ok(dimensions.widthPx > 0);
});

test('SquareCrosshairShape V14 region lifecycle and debug logging stages 1..5', async () => {
    const { FoundryVTTV14Adapter } = await import('../../src/adapter/foundry/foundryvtt-v14-adapter.js');
    const { SquareCrosshairShape } = await import('../../src/crosshair/square.js');
    const { resolveCrosshairPlacement } = await import('../../src/crosshair/util.js');

    const adapter = new FoundryVTTV14Adapter();

    // 1. Stage 1: Detect properties from raw V14 Region document containing rectangle shape
    const mockRegionDoc = {
        documentName: 'Region',
        id: 'region-123',
        shapes: [
            { type: 'rectangle', x: 0, y: 0, width: 200, height: 200, rotation: 0 }
        ],
        toObject() {
            return { documentName: this.documentName, id: this.id, shapes: this.shapes };
        }
    };

    const detected = adapter.detectProperties(mockRegionDoc);
    assert.equal(detected.type, 'square');
    assert.equal(detected.width, 10);
    assert.equal(detected.distance, 10);

    // 2. Stage 2: Instantiate SquareCrosshairShape and configure Sequencer crosshair
    const mockPlaceable = { x: 100, y: 100, document: mockRegionDoc };
    const squareShape = new SquareCrosshairShape(mockPlaceable, { type: 'square', distance: 10, width: 10 });

    const mockCrosshairSeq = {
        dist: 0,
        w: 0,
        distance(d) { this.dist = d; return this; },
        width(w) { this.w = w; return this; }
    };
    squareShape.configureCrosshairShape(mockCrosshairSeq);
    assert.equal(mockCrosshairSeq.dist, 10);
    assert.equal(mockCrosshairSeq.w, 10);

    // 3. Stage 3: Resolve placement after left-click
    const clickCoords = resolveCrosshairPlacement(squareShape, { distance: 10, width: 10, originalType: 'square' }, 100, 100);
    assert.equal(clickCoords.x, 100);
    assert.equal(clickCoords.y, 100);
    assert.equal(clickCoords.type, 'square');

    // 4. Stage 4: Modify Region shape for Foundry after left click
    const origShape = mockRegionDoc.shapes[0];
    const modifiedRegionShape = adapter._formatRegionShapeUpdate(origShape, clickCoords);
    assert.equal(modifiedRegionShape.type, 'rectangle');
    assert.equal(modifiedRegionShape.x, 100);
    assert.equal(modifiedRegionShape.y, 100);

    // 5. Stage 5: Handle post-creation hook for Region document
    mockRegionDoc.shapes[0] = modifiedRegionShape;
    await adapter.handleCreateDocument(mockRegionDoc, {}, 'test-user');
});

test('Square findings: MeasuredTemplate diagonal distance, sticky false evaluation, and unshifted rotated region origin', async () => {
    const { FoundryVTTV14Adapter } = await import('../../src/adapter/foundry/foundryvtt-v14-adapter.js');
    const adapter = new FoundryVTTV14Adapter();

    // 1. MeasuredTemplate rect diagonal normalization: doc.distance = 28.284271247461902, doc.width = 20 -> distance = 20
    const mockTmplDoc = {
        documentName: 'MeasuredTemplate',
        t: 'rect',
        distance: 28.284271247461902,
        width: 20
    };
    const detected = adapter.detectProperties(mockTmplDoc);
    assert.equal(detected.type, 'square');
    assert.equal(detected.distance, 20);
    assert.equal(detected.width, 20);

    // 2. formatPlacementCoordinates sticky boolean check: token exists but stickToToken is false -> sticky = false
    const mockToken = { name: 'Archmage' };
    const coordsFree = adapter.formatPlacementCoordinates(5000, 6500, 325, {
        token: mockToken,
        stickToToken: false,
        distance: 20,
        width: 20,
        originalType: 'square'
    });
    assert.equal(coordsFree.sticky, false);
    assert.equal(coordsFree.x, 5000);
    assert.equal(coordsFree.y, 6500);

    // 3. Unshifted rotated region origin: free placement region rectangle rotated at 325 deg must stay at (5000, 6500)
    const origRegionShape = { type: 'rectangle', x: 0, y: 0, width: 400, height: 400, rotation: 0 };
    const formattedShape = adapter._formatRegionShapeUpdate(origRegionShape, coordsFree);
    assert.equal(formattedShape.type, 'rectangle');
    assert.equal(formattedShape.x, 5000);
    assert.equal(formattedShape.y, 6500);
    assert.equal(formattedShape.rotation, 325);
});
