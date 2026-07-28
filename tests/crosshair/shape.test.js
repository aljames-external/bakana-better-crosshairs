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

test('RayCrosshairShape default anchors, Template Method hooks, and graphic dimensions', async () => {
    game.modules.get("eskie-effects");
    const { RayCrosshairShape } = await import('../../src/crosshair/ray.js');
    const mockDocument = { x: 0, y: 0 };
    const mockPlaceable = { x: 0, y: 0, document: mockDocument };
    const shape = new RayCrosshairShape(mockPlaceable, { distance: 60, width: 10 });

    assert.equal(shape.defaultShapeType, 'ray');
    assert.equal(shape.getDefaultId(), 'Ray Crosshair');
    assert.deepEqual(shape.animationAnchor, { x: 0, y: 0.5 });
    assert.deepEqual(shape.shapeAnchor, { x: 0, y: 0.5 });

    const mockCrosshairSeq = {
        dist: 0,
        w: 0,
        distance(d) { this.dist = d; return this; },
        width(w) { this.w = w; return this; }
    };
    shape.configureCrosshairShape(mockCrosshairSeq);
    assert.equal(mockCrosshairSeq.dist, 60);
    assert.equal(mockCrosshairSeq.w, 10);

    const dims = shape.getGraphicDimensions();
    assert.ok(dims.widthPx > 0);
    assert.ok(dims.heightPx > 0);

    const file = shape.getGraphicFile();
    assert.ok(typeof file === 'string');
});

test('CircleCrosshairShape default anchors, Template Method hooks, and resolveCircleAsset', async () => {
    game.modules.get("eskie-effects");
    const { CircleCrosshairShape, resolveCircleAsset } = await import('../../src/crosshair/circle.js');
    const mockDocument = { x: 0, y: 0 };
    const mockPlaceable = { x: 0, y: 0, document: mockDocument };
    const shape = new CircleCrosshairShape(mockPlaceable, { radius: 20 });

    assert.equal(shape.defaultShapeType, 'circle');
    assert.equal(shape.getDefaultId(), 'Circle Crosshair');
    assert.deepEqual(shape.animationAnchor, { x: 0.5, y: 0.5 });

    const mockCrosshairSeq = {
        dist: 0,
        distance(d) { this.dist = d; return this; }
    };
    shape.configureCrosshairShape(mockCrosshairSeq);
    assert.equal(mockCrosshairSeq.dist, 20);

    const dims = shape.getGraphicDimensions();
    assert.equal(dims.widthPx, dims.heightPx);

    assert.ok(resolveCircleAsset(null, 10));
    assert.ok(resolveCircleAsset(null, 40));
    assert.equal(resolveCircleAsset('custom/path.png'), 'custom/path.png');
});

test('REGRESSION: refreshTemplateHighlights does not throw TypeError when placeable position getter throws', async () => {
    const { SquareCrosshairShape } = await import('../../src/crosshair/square.js');
    const mockDocument = { x: 100, y: 100, documentName: 'MeasuredTemplate', t: 'rect' };
    const mockPlaceable = {
        document: mockDocument,
        direction: 0,
        get position() { throw new TypeError("Cannot read properties of null (reading 'position')"); },
        get x() { throw new TypeError("Cannot read properties of null (reading 'position')"); },
        set x(val) { throw new TypeError("Cannot read properties of null (reading 'position')"); },
        get y() { throw new TypeError("Cannot read properties of null (reading 'position')"); },
        set y(val) { throw new TypeError("Cannot read properties of null (reading 'position')"); }
    };

    const shape = new SquareCrosshairShape(mockPlaceable, { distance: 20 });
    assert.doesNotThrow(() => {
        shape.refreshTemplateHighlights();
    });
});

test('BaseCrosshairShape.create enables location showRange when token is present and stickToToken is false', async () => {
    const { CircleCrosshairShape } = await import('../../src/crosshair/circle.js');
    const mockDocument = { x: 0, y: 0 };
    const mockPlaceable = { x: 0, y: 0, document: mockDocument };
    const mockToken = { name: "Caster", center: { x: 50, y: 50 } };
    const shape = new CircleCrosshairShape(mockPlaceable, { radius: 15, token: mockToken, stickToToken: false });

    let locationObj = null;
    let locationOpts = null;
    const mockCrosshairBuilder = {
        type() { return this; },
        borderColor() { return this; },
        fillColor() { return this; },
        distance() { return this; },
        snapPosition() { return this; },
        icon() { return this; },
        callback() { return this; },
        location(obj, opts) {
            locationObj = obj;
            locationOpts = opts;
            return this;
        }
    };
    globalThis.Sequence = class {
        crosshair() { return mockCrosshairBuilder; }
    };

    await shape.create();
    assert.equal(locationObj, mockToken);
    assert.deepEqual(locationOpts, { showRange: true });
});

test('BaseCrosshairShape.create suppresses location showRange when config.showRange is false', async () => {
    const { CircleCrosshairShape } = await import('../../src/crosshair/circle.js');
    const mockDocument = { x: 0, y: 0 };
    const mockPlaceable = { x: 0, y: 0, document: mockDocument };
    const mockToken = { name: "Caster", center: { x: 50, y: 50 } };
    const shape = new CircleCrosshairShape(mockPlaceable, { radius: 15, token: mockToken, stickToToken: false, showRange: false });

    let locationCalledWithOpts = null;
    const mockCrosshairBuilder = {
        type() { return this; },
        borderColor() { return this; },
        fillColor() { return this; },
        distance() { return this; },
        snapPosition() { return this; },
        icon() { return this; },
        callback() { return this; },
        location(obj, opts) {
            locationCalledWithOpts = opts;
            return this;
        }
    };
    globalThis.Sequence = class {
        crosshair() { return mockCrosshairBuilder; }
    };

    await shape.create();
    assert.equal(locationCalledWithOpts, null);
});

test('BaseCrosshairShape.create automatically passes limitMaxRange and displayRangePoly when calling item has range', async () => {
    const { CircleCrosshairShape } = await import('../../src/crosshair/circle.js');
    const mockDocument = { x: 0, y: 0 };
    const mockPlaceable = { x: 0, y: 0, document: mockDocument };
    const mockToken = { name: "Caster", center: { x: 50, y: 50 } };
    const mockItem = { name: "Fireball", system: { range: { value: 120 } } };
    const shape = new CircleCrosshairShape(mockPlaceable, { radius: 20, token: mockToken, stickToToken: false, item: mockItem });

    let passedLocationOpts = null;
    const mockCrosshairBuilder = {
        type() { return this; },
        borderColor() { return this; },
        fillColor() { return this; },
        distance() { return this; },
        snapPosition() { return this; },
        icon() { return this; },
        callback() { return this; },
        location(obj, opts) {
            passedLocationOpts = opts;
            return this;
        }
    };
    globalThis.Sequence = class {
        crosshair() { return mockCrosshairBuilder; }
    };

    await shape.create();
    assert.deepEqual(passedLocationOpts, { showRange: true, limitMaxRange: 120, displayRangePoly: true });
});

test('BaseCrosshairShape.create suppresses limitMaxRange when limitRange is false', async () => {
    const { CircleCrosshairShape } = await import('../../src/crosshair/circle.js');
    const mockDocument = { x: 0, y: 0 };
    const mockPlaceable = { x: 0, y: 0, document: mockDocument };
    const mockToken = { name: "Caster", center: { x: 50, y: 50 } };
    const mockItem = { name: "Fireball", system: { range: { value: 120 } } };
    const shape = new CircleCrosshairShape(mockPlaceable, { radius: 20, token: mockToken, stickToToken: false, item: mockItem, limitRange: false });

    let passedLocationOpts = null;
    const mockCrosshairBuilder = {
        type() { return this; },
        borderColor() { return this; },
        fillColor() { return this; },
        distance() { return this; },
        snapPosition() { return this; },
        icon() { return this; },
        callback() { return this; },
        location(obj, opts) {
            passedLocationOpts = opts;
            return this;
        }
    };
    globalThis.Sequence = class {
        crosshair() { return mockCrosshairBuilder; }
    };

    await shape.create();
    assert.deepEqual(passedLocationOpts, { showRange: true });
});

test('BaseCrosshairShape.playGraphicEffect isolates origin stretch line under ${id}-line effect name', async () => {
    const { CircleCrosshairShape } = await import('../../src/crosshair/circle.js');
    const mockDocument = { x: 0, y: 0 };
    const mockPlaceable = { x: 0, y: 0, document: mockDocument };
    const mockToken = { name: "Caster", center: { x: 50, y: 50 } };
    const shape = new CircleCrosshairShape(mockPlaceable, { radius: 20, token: mockToken, stickToToken: false, showLine: true, lineFile: "line.png", circleFile: "circle.png" });

    const effectNames = [];
    const mockEffectBuilder = {
        name(n) { effectNames.push(n); return this; },
        file() { return this; },
        attachTo() { return this; },
        stretchTo() { return this; },
        opacity() { return this; },
        locally() { return this; },
        persist() { return this; },
        anchor() { return this; },
        size() { return this; },
        belowTokens() { return this; }
    };
    globalThis.Sequence = class {
        wait() { return this; }
        effect() { return mockEffectBuilder; }
        play() { return Promise.resolve(); }
    };

    await shape.playGraphicEffect({ x: 100, y: 100 });
    assert.ok(effectNames.some(name => name.includes("Circle Crosshair") && name.endsWith("-line")));
    assert.ok(effectNames.some(name => name.includes("Circle Crosshair")));
});

test('BaseCrosshairShape._updateRangeText keeps distance measurement text unrotated', async () => {
    const { CircleCrosshairShape } = await import('../../src/crosshair/circle.js');
    const mockDocument = { x: 0, y: 0 };
    const mockPlaceable = { x: 0, y: 0, document: mockDocument };
    const mockToken = { name: "Caster", center: { x: 50, y: 50 } };
    const shape = new CircleCrosshairShape(mockPlaceable, { radius: 20, token: mockToken, stickToToken: false, showRange: true });

    class MockText {
        constructor(txt, style) {
            this.text = txt;
            this.style = style;
            this.anchor = { set() {} };
            this.position = { set() {} };
            this.rotation = 0;
            this.visible = true;
            this.parent = null;
        }
    }
    globalThis.foundry = { canvas: { containers: { PreciseText: MockText } } };
    shape.sequencerCrosshair = {
        x: 100,
        y: 100,
        rotation: 0.785,
        parent: { addChild(child) { child.parent = this; } }
    };
    shape._updateRangeText();
    assert.equal(shape._rangeText.rotation, 0);
});



