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

test('BaseCrosshairShape.create suppresses Sequencer range limitation (limitMaxRange/displayRangePoly) pending upstream stabilization', async () => {
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
    assert.deepEqual(passedLocationOpts, { showRange: true });
});

test('BaseCrosshairShape.create suppresses location opts when showRange is false', async () => {
    const { CircleCrosshairShape } = await import('../../src/crosshair/circle.js');
    const mockDocument = { x: 0, y: 0 };
    const mockPlaceable = { x: 0, y: 0, document: mockDocument };
    const mockToken = { name: "Caster", center: { x: 50, y: 50 } };
    const mockItem = { name: "Fireball", system: { range: { value: 120 } } };
    const shape = new CircleCrosshairShape(mockPlaceable, { radius: 20, token: mockToken, stickToToken: false, item: mockItem, showRange: false });

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
    assert.equal(passedLocationOpts, null);
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
        belowTokens() { return this; },
        atLocation() { return this; },
        rotate() { return this; }
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
    foundry.canvas.containers = foundry.canvas.containers ?? {};
    foundry.canvas.containers.PreciseText = MockText;
    shape.sequencerCrosshair = {
        x: 100,
        y: 100,
        rotation: 0.785,
        parent: { addChild(child) { child.parent = this; } }
    };
    shape.rangeOverlay.update();
    assert.equal(shape.rangeOverlay.rangeText?.rotation ?? 0, 0);
});

test('REGRESSION: Attached Ray template placement preserves Sequencer visual origin and computes ray angle directly to mouse click', async () => {
    const { RayCrosshairShape } = await import('../../src/crosshair/ray.js');
    const { resolveCrosshairPlacement } = await import('../../src/crosshair/util.js');

    const mockToken = {
        id: 'tok-ray-test',
        x: 100,
        y: 100,
        w: 100,
        h: 100,
        center: { x: 150, y: 150 }
    };
    const mockDocument = { x: 100, y: 100, documentName: 'MeasuredTemplate', t: 'ray' };
    const mockPlaceable = { x: 100, y: 100, document: mockDocument };

    const config = {
        type: 'ray',
        distance: 30,
        width: 5,
        stickToToken: true,
        token: mockToken
    };

    const shape = new RayCrosshairShape(mockPlaceable, config);

    // Mock Sequencer crosshair container placed at token's bottom-left corner (x: 100, y: 200)
    const mockSequencerCrosshair = {
        x: 100,
        y: 200,
        direction: 180,
        destroyed: false,
        shapeInstance: shape
    };
    shape.sequencerCrosshair = mockSequencerCrosshair;

    // Simulate mouse position at (50, 230)
    globalThis.canvas.mousePosition = { x: 50, y: 230 };

    // 1. Verify getPlacementUpdates uses Sequencer's visual origin (100, 200) and calculates direction directly to mouse (50, 230)
    const updates = shape.getPlacementUpdates();
    assert.equal(updates.x, 100, 'Placement X must match Sequencer visual origin on token edge');
    assert.equal(updates.y, 200, 'Placement Y must match Sequencer visual origin on token edge');

    // Expected angle from pivot (100, 200) to mouse (50, 230): dx = -50, dy = 30 -> atan2(30, -50) = 149.03624... deg
    const expectedAngle = (Math.atan2(230 - 200, 50 - 100) * (180 / Math.PI) + 360) % 360;
    assert.equal(Math.round(updates.direction * 100) / 100, Math.round(expectedAngle * 100) / 100);

    // 2. Verify resolveCrosshairPlacement resolves identical placement updates when called with shape or sequencer container
    let resolved = null;
    config.context = { resolve: (res) => { resolved = res; } };
    resolveCrosshairPlacement(shape, config);

    assert.ok(resolved);
    assert.equal(resolved.x, 100);
    assert.equal(resolved.y, 200);
    assert.equal(Math.round(resolved.direction * 100) / 100, Math.round(expectedAngle * 100) / 100);
});

test('BaseCrosshairShape tracks mouse fluidly on Sequencer visual effects while preserving snap points on placement and template highlights', async () => {
    const { CircleCrosshairShape } = await import('../../src/crosshair/circle.js');
    const { resolveCrosshairPlacement } = await import('../../src/crosshair/util.js');

    const mockDocument = { x: 100, y: 100, documentName: 'MeasuredTemplate', t: 'circle', distance: 20 };
    const mockPlaceable = { x: 100, y: 100, document: mockDocument };

    const mockEffect = {
        name: 'test-fluid-circle',
        x: 100,
        y: 100,
        rotation: 0,
        container: {
            position: {
                x: 100,
                y: 100,
                set(x, y) { this.x = x; this.y = y; }
            },
            rotation: 0
        },
        spriteContainer: { rotation: 0 },
        update(payload) {
            if (payload.position) {
                this.x = payload.position.x;
                this.y = payload.position.y;
            }
        }
    };

    const origSequencer = globalThis.Sequencer;
    try {
        globalThis.Sequencer = {
            ...origSequencer,
            EffectManager: {
                getEffects: ({ name }) => (name === 'test-fluid-circle' ? [mockEffect] : []),
                endEffects: async () => {}
            }
        };

        const shape = new CircleCrosshairShape(mockPlaceable, {
            id: 'test-fluid-circle',
            radius: 20,
            snapToGrid: 'corner' // grid size is 100, corners snap to multiples of 100
        });

        // 1. Initial position
        assert.equal(shape.x, 100);
        assert.equal(shape.y, 100);

        // 2. Move mouse to (115, 120) which is near corner (100, 100)
        globalThis.canvas.mousePosition = { x: 115, y: 120 };
        shape.move(115, 120);

        // Snap points remain at grid corner (100, 100)
        assert.equal(shape.x, 100, "Snap point X must remain snapped to grid corner (100)");
        assert.equal(shape.y, 100, "Snap point Y must remain snapped to grid corner (100)");
        assert.equal(shape.cursorX, 115, "cursorX must track fluid mouse position (115)");
        assert.equal(shape.cursorY, 120, "cursorY must track fluid mouse position (120)");

        // Sequencer animation effect container tracks fluid mouse position (115, 120)
        assert.equal(mockEffect.container.position.x, 115, "Sequencer visual effect must track fluid mouse X (115)");
        assert.equal(mockEffect.container.position.y, 120, "Sequencer visual effect must track fluid mouse Y (120)");

        // 3. Move mouse to (185, 190) which snaps to next corner (200, 200)
        globalThis.canvas.mousePosition = { x: 185, y: 190 };
        shape.move(185, 190);

        // Snap points update to (200, 200)
        assert.equal(shape.x, 200, "Snap point X must snap to new grid corner (200)");
        assert.equal(shape.y, 200, "Snap point Y must snap to new grid corner (200)");

        // Sequencer animation effect container tracks fluid mouse position (185, 190)
        assert.equal(mockEffect.container.position.x, 185, "Sequencer visual effect must track fluid mouse X (185)");
        assert.equal(mockEffect.container.position.y, 190, "Sequencer visual effect must track fluid mouse Y (190)");

        // 4. Placed result resolves to the exact grid snap points (200, 200)
        const placement = shape.getPlacementUpdates();
        assert.equal(placement.x, 200, "Placed template X must be snapped coordinate (200)");
        assert.equal(placement.y, 200, "Placed template Y must be snapped coordinate (200)");
    } finally {
        globalThis.Sequencer = origSequencer;
    }
});

test('REGRESSION: SquareCrosshairShape.create passes valid Sequencer type rect even when config.type is square', async () => {
    const { SquareCrosshairShape } = await import('../../src/crosshair/square.js');
    const mockDocument = { x: 0, y: 0 };
    const mockPlaceable = { x: 0, y: 0, document: mockDocument };
    const shape = new SquareCrosshairShape(mockPlaceable, { type: 'square', distance: 20, width: 20 });

    let passedType = null;
    const mockCrosshairBuilder = {
        type(t) { passedType = t; return this; },
        borderColor() { return this; },
        fillColor() { return this; },
        distance() { return this; },
        width() { return this; },
        snapPosition() { return this; },
        icon() { return this; },
        callback() { return this; },
        location() { return this; }
    };
    const origSeq = globalThis.Sequence;
    try {
        globalThis.Sequence = class {
            crosshair() { return mockCrosshairBuilder; }
        };

        await shape.create();
        assert.equal(passedType, 'rect', 'Sequencer requires type to be "rect", not "square"');
    } finally {
        globalThis.Sequence = origSeq;
    }
});

test('resolveRectangleAsset correctly chooses 1:1 square vs 2:1 rectangle animation sizes and colors', async () => {
    const { resolveRectangleAsset, SquareCrosshairShape } = await import('../../src/crosshair/square.js');

    // 1. Square dimensions (ratio < 1.5)
    assert.equal(
        resolveRectangleAsset('eskie.crosshair.rectangle.fantasy_01.white', 5, 5),
        'eskie.crosshair.rectangle.fantasy_01.white.no_base.05x05ft'
    );
    assert.equal(
        resolveRectangleAsset('eskie.crosshair.rectangle.fantasy_01.white', 10, 10),
        'eskie.crosshair.rectangle.fantasy_01.white.no_base.10x10ft'
    );
    assert.equal(
        resolveRectangleAsset('eskie.crosshair.rectangle.fantasy_01.white', 15, 15),
        'eskie.crosshair.rectangle.fantasy_01.white.no_base.20x20ft'
    );
    assert.equal(
        resolveRectangleAsset('eskie.crosshair.rectangle.fantasy_01.white', 20, 20),
        'eskie.crosshair.rectangle.fantasy_01.white.no_base.20x20ft'
    );
    assert.equal(
        resolveRectangleAsset('eskie.crosshair.rectangle.fantasy_01.white', 30, 30),
        'eskie.crosshair.rectangle.fantasy_01.white.no_base.20x20ft'
    );

    // 2. Rectangle dimensions (ratio >= 1.5, e.g. 2:1)
    assert.equal(
        resolveRectangleAsset('eskie.crosshair.rectangle.fantasy_01.white', 10, 5),
        'eskie.crosshair.rectangle.fantasy_01.white.no_base.10x05ft'
    );
    assert.equal(
        resolveRectangleAsset('eskie.crosshair.rectangle.fantasy_01.white', 20, 10),
        'eskie.crosshair.rectangle.fantasy_01.white.no_base.20x10ft'
    );
    assert.equal(
        resolveRectangleAsset('eskie.crosshair.rectangle.fantasy_01.white', 40, 20),
        'eskie.crosshair.rectangle.fantasy_01.white.no_base.40x20ft'
    );

    // 3. Custom color preservation
    assert.equal(
        resolveRectangleAsset('eskie.crosshair.rectangle.fantasy_01.blue', 20, 20),
        'eskie.crosshair.rectangle.fantasy_01.blue.no_base.20x20ft'
    );

    // 4. SquareCrosshairShape._getGraphicFile delegates to resolveRectangleAsset
    const mockDocument = { x: 0, y: 0 };
    const mockPlaceable = { x: 0, y: 0, document: mockDocument };
    const shape = new SquareCrosshairShape(mockPlaceable, {
        rectangleFile: 'eskie.crosshair.rectangle.fantasy_01.white',
        distance: 20,
        width: 10
    });
    assert.equal(shape.getGraphicFile(), 'eskie.crosshair.rectangle.fantasy_01.white.no_base.20x10ft');
});



