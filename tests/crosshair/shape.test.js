import '../setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseCrosshairShape } from '../../src/crosshair/base.js';
import { CircleCrosshairShape } from '../../src/crosshair/circle.js';
import { ConeCrosshairShape } from '../../src/crosshair/cone.js';

import { adapter } from '../../src/adapter/index.js';

test('BaseCrosshairShape stateful lifecycle: constructor, hide, move, rotate, and getPlacementUpdates', async () => {
    adapter.crosshair.initialize();
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
    shape.x = 100;
    shape.y = 200;
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

test('BaseCrosshairShape plays item icon effect smoothly when showItemIcon is true and suppresses when false', async () => {
    const { CircleCrosshairShape } = await import('../../src/crosshair/circle.js');
    const { alignCrosshairAndEffects } = await import('../../src/crosshair/util.js');
    const mockDocument = { x: 0, y: 0 };
    const mockPlaceable = { x: 0, y: 0, document: mockDocument };

    const spawnedEffects = [];
    class MockEffectBuilder {
        constructor() {
            this.props = {};
        }
        name(val) { this.props.name = val; return this; }
        file(val) { this.props.file = val; return this; }
        atLocation(val) { this.props.atLocation = val; return this; }
        attachTo(val) { this.props.attachTo = val; return this; }
        size(val, opts) { this.props.size = val; this.props.sizeOpts = opts; return this; }
        anchor(val) { this.props.anchor = val; return this; }
        opacity(val) { this.props.opacity = val; return this; }
        aboveLighting() { this.props.aboveLighting = true; return this; }
        belowTokens() { this.props.belowTokens = true; return this; }
        rotate(val) { this.props.rotate = val; return this; }
        locally() { this.props.locally = true; return this; }
        persist() { this.props.persist = true; return this; }
    }

    const origSequence = globalThis.Sequence;
    const origSequencer = globalThis.Sequencer;

    try {
        globalThis.Sequence = class {
            wait() { return this; }
            effect() {
                const builder = new MockEffectBuilder();
                spawnedEffects.push(builder.props);
                return builder;
            }
            play() { return Promise.resolve(); }
        };

        // 1. showItemIcon: true with item.img
        const shapeWithIcon = new CircleCrosshairShape(mockPlaceable, {
            id: "test-circle-icon",
            radius: 15,
            item: { img: "icons/magic/fireball.webp" },
            showItemIcon: true
        });

        assert.equal(shapeWithIcon.icon, "icons/magic/fireball.webp");
        await shapeWithIcon.playGraphicEffect();

        const iconEffect = spawnedEffects.find(e => e.name === "test-circle-icon-icon");
        assert.ok(iconEffect, "Should spawn icon effect with name test-circle-icon-icon");
        assert.equal(iconEffect.file, "icons/magic/fireball.webp");
        assert.deepEqual(iconEffect.anchor, { x: 0.5, y: 0.5 });

        // 2. showItemIcon: false with item.img
        spawnedEffects.length = 0;
        const shapeWithoutIcon = new CircleCrosshairShape(mockPlaceable, {
            id: "test-circle-no-icon",
            radius: 15,
            item: { img: "icons/magic/fireball.webp" },
            showItemIcon: false
        });

        assert.equal(shapeWithoutIcon.icon, null);
        await shapeWithoutIcon.playGraphicEffect();

        const omittedIconEffect = spawnedEffects.find(e => e.name === "test-circle-no-icon-icon");
        assert.equal(omittedIconEffect, undefined, "Should not spawn icon effect when showItemIcon is false");

        // 3. alignCrosshairAndEffects updates both main and icon effect in lockstep
        const mainEff = {
            name: "test-sync",
            x: 0,
            y: 0,
            rotation: 0,
            container: { position: { set(x, y) { this.x = x; this.y = y; }, x: 0, y: 0 }, rotation: 0 },
            update(payload) {}
        };
        const iconEff = {
            name: "test-sync-icon",
            x: 0,
            y: 0,
            rotation: 0,
            container: { position: { set(x, y) { this.x = x; this.y = y; }, x: 0, y: 0 }, rotation: 0 },
            update(payload) {}
        };

        globalThis.Sequencer = {
            ...origSequencer,
            EffectManager: {
                getEffects: ({ name }) => {
                    if (name === "test-sync") return [mainEff];
                    if (name === "test-sync-icon") return [iconEff];
                    return [];
                }
            }
        };

        globalThis.canvas.mousePosition = { x: 250, y: 310 };
        alignCrosshairAndEffects(null, { id: "test-sync", currentDirection: 90 }, Math.PI / 2);

        // Both effects follow fluid mouse coordinates together
        assert.equal(mainEff.x, 250);
        assert.equal(mainEff.y, 310);
        assert.equal(mainEff.container.position.x, 250);
        assert.equal(mainEff.container.position.y, 310);
        assert.equal(mainEff.rotation, Math.PI / 2);

        assert.equal(iconEff.x, 250);
        assert.equal(iconEff.y, 310);
        assert.equal(iconEff.container.position.x, 250);
        assert.equal(iconEff.container.position.y, 310);
        assert.equal(iconEff.rotation, 0, "Icon effect must remain upright without rotating");
    } finally {
        globalThis.Sequence = origSequence;
        globalThis.Sequencer = origSequencer;
    }
});

test('BaseCrosshairShape.refreshTemplateHighlights updates document, coordinates, and triggers placeable highlightGrid without clearing', async () => {
    let clearCalled = false;
    const origClear = canvas?.interface?.grid?.clearHighlightLayer;
    if (canvas?.interface?.grid) {
        canvas.interface.grid.clearHighlightLayer = () => { clearCalled = true; };
    }

    try {
        const { CircleCrosshairShape } = await import('../../src/crosshair/circle.js');
        let highlightGridCalled = false;
        let applyRenderFlagsCalled = false;

        const mockDoc = {
            x: 0,
            y: 0,
            direction: 0,
            t: 'circle',
            distance: 20,
            updateSource(d) { Object.assign(this, d); }
        };

        const mockPlaceable = {
            x: 0,
            y: 0,
            direction: 0,
            document: mockDoc,
            renderFlags: { set: () => {} },
            applyRenderFlags() { applyRenderFlagsCalled = true; },
            highlightGrid() { highlightGridCalled = true; }
        };

        const shape = new CircleCrosshairShape(mockPlaceable, { radius: 20 });
        shape.x = 400;
        shape.y = 600;
        shape.direction = 90;

        shape.refreshTemplateHighlights();

        assert.equal(mockDoc.x, 400, 'mockDoc.x should be 400');
        assert.equal(mockDoc.y, 600, 'mockDoc.y should be 600');
        assert.equal(mockPlaceable.x, 400, 'mockPlaceable.x should be 400');
        assert.equal(mockPlaceable.y, 600, 'mockPlaceable.y should be 600');
        assert.equal(highlightGridCalled, true, 'highlightGrid should be called');
        assert.equal(clearCalled, false, 'refreshTemplateHighlights must not clear highlight layer');
    } finally {
        if (canvas?.interface?.grid && origClear) {
            canvas.interface.grid.clearHighlightLayer = origClear;
        }
    }
});

test('BaseCrosshairShape.move triggers refreshTemplateHighlights when direction changes even if position is unchanged', async () => {
    const { ConeCrosshairShape } = await import('../../src/crosshair/cone.js');

    const mockDoc = {
        x: 100,
        y: 100,
        direction: 0,
        t: 'cone',
        distance: 30,
        angle: 53.13,
        updateSource(d) { Object.assign(this, d); }
    };
    const mockPlaceable = {
        x: 100,
        y: 100,
        direction: 0,
        document: mockDoc,
        renderFlags: { set: () => {} },
        applyRenderFlags: () => {},
        highlightGrid: () => {}
    };

    const mockToken = {
        id: 'token-caster-1',
        x: 100,
        y: 100,
        w: 100,
        h: 100,
        center: { x: 150, y: 150 }
    };

    const shape = new ConeCrosshairShape(mockPlaceable, {
        type: 'cone',
        token: mockToken,
        stickToToken: true
    });

    let refreshCalledCount = 0;
    shape.refreshTemplateHighlights = () => {
        refreshCalledCount++;
    };

    // Move to first coordinate
    shape.move(300, 150);
    const initialRefreshCount = refreshCalledCount;
    assert.ok(initialRefreshCount > 0, 'First move must refresh highlights');

    // Move to another coordinate that keeps token edge anchor on the same side but changes direction
    shape.move(300, 180);
    assert.ok(refreshCalledCount > initialRefreshCount, 'Direction change must trigger refreshTemplateHighlights even if position remains on same token edge');
});

test('BaseCrosshairShape dynamically resolves player color when fillPlayerColor or borderPlayerColor is true', () => {
    const origColor = globalThis.game?.user?.color;
    try {
        if (!globalThis.game) globalThis.game = { user: {} };
        if (!globalThis.game.user) globalThis.game.user = {};
        globalThis.game.user.color = '#e91e63';

        const mockPlaceable = {
            x: 0,
            y: 0,
            direction: 0,
            document: { x: 0, y: 0, direction: 0 }
        };

        const shapeStatic = new CircleCrosshairShape(mockPlaceable, {
            fillColor: '#123456',
            borderColor: '#654321',
            fillPlayerColor: false,
            borderPlayerColor: false
        });
        assert.equal(shapeStatic.fillColor, '#123456');
        assert.equal(shapeStatic.borderColor, '#654321');

        const shapeDynamic = new CircleCrosshairShape(mockPlaceable, {
            fillColor: '#123456',
            borderColor: '#654321',
            fillPlayerColor: true,
            borderPlayerColor: true
        });
        assert.equal(shapeDynamic.fillColor, '#e91e63');
        assert.equal(shapeDynamic.borderColor, '#e91e63');
    } finally {
        if (globalThis.game?.user) {
            if (origColor !== undefined) globalThis.game.user.color = origColor;
            else delete globalThis.game.user.color;
        }
    }
});

test('BaseCrosshairShape.create passes initial direction to Sequencer builder when direction is specified', async () => {
    const { RayCrosshairShape } = await import('../../src/crosshair/ray.js');
    const mockDocument = { x: 0, y: 0, direction: 45 };
    const mockPlaceable = { x: 0, y: 0, document: mockDocument };
    const shape = new RayCrosshairShape(mockPlaceable, { direction: 45, distance: 30, width: 5 });

    let passedDirection = null;
    const mockCrosshairBuilder = {
        type() { return this; },
        borderColor() { return this; },
        fillColor() { return this; },
        direction(d) { passedDirection = d; return this; },
        distance() { return this; },
        width() { return this; },
        snapPosition() { return this; },
        location() { return this; },
        callback() { return this; }
    };
    const origSeq = globalThis.Sequence;
    try {
        globalThis.Sequence = class {
            crosshair() { return mockCrosshairBuilder; }
        };

        await shape.create();
        assert.equal(passedDirection, 45, 'Initial direction must be passed to Sequencer crosshair builder');
    } finally {
        globalThis.Sequence = origSeq;
    }
});

test('Detached ray rotation updates Sequencer crosshair document direction, ray, and rotates container rotation to rad', async () => {
    const { RayCrosshairShape } = await import('../../src/crosshair/ray.js');
    const mockDocument = {
        x: 100,
        y: 100,
        direction: 0,
        distance: 30,
        width: 5,
        updateSource(data) { Object.assign(this, data); }
    };
    const mockPlaceable = {
        x: 100,
        y: 100,
        direction: 0,
        document: mockDocument,
        highlightGrid() {}
    };

    const shape = new RayCrosshairShape(mockPlaceable, { distance: 30, width: 5 });

    let refreshed = false;
    const mockSeqDocument = {
        direction: 0,
        updateSource(data) { Object.assign(this, data); }
    };
    const mockSeqCrosshair = {
        x: 100,
        y: 100,
        direction: 0,
        rotation: 0,
        document: mockSeqDocument,
        ray: { distance: 600, dx: 600, dy: 0 },
        refresh() { refreshed = true; }
    };

    shape.sequencerCrosshair = mockSeqCrosshair;

    // Rotate detached ray to 90 degrees
    shape.rotate(90);

    assert.equal(shape.direction, 90, 'Shape direction must update to 90');
    assert.equal(mockSeqCrosshair.direction, 90, 'Sequencer crosshair direction must update to 90');
    assert.equal(mockSeqDocument.direction, 90, 'Sequencer crosshair document.direction must update to 90');
    assert.ok(Math.abs(mockSeqCrosshair.rotation - (90 * Math.PI / 180)) < 1e-6, 'Sequencer crosshair container rotation must rotate to rad on wheel');
    assert.ok(mockSeqCrosshair.ray, 'Sequencer crosshair ray must be present');
    assert.equal(refreshed, true, 'Sequencer crosshair refresh() must be triggered');
    assert.equal(mockDocument.direction, 90, 'Preview document direction must update to 90');
    assert.equal(mockPlaceable.direction, 90, 'Placeable direction must update to 90');
    assert.ok(Math.abs(mockPlaceable.rotation - (90 * Math.PI / 180)) < 1e-6, 'Placeable rotation must update to radians');
    assert.ok(mockPlaceable.ray, 'Placeable ray must be synchronized');
});

test('FoundryVTTV13Adapter.refreshTemplateHighlights synchronizes rotation, direction, and ray on template and document', async () => {
    const { FoundryVTTV13Adapter } = await import('../../src/adapter/foundry/foundryvtt-v13-adapter.js');
    const adapter = new FoundryVTTV13Adapter();

    const mockDoc = {
        x: 100,
        y: 200,
        distance: 30,
        direction: 0,
        updateSource(data) { Object.assign(this, data); }
    };
    const mockTmpl = {
        x: 100,
        y: 200,
        direction: 0,
        rotation: 0,
        document: mockDoc,
        ray: { distance: 600, dx: 600, dy: 0 },
        highlightGrid() {}
    };

    adapter.refreshTemplateHighlights(mockTmpl, 60);

    assert.equal(mockTmpl.direction, 60, 'Template direction must update to 60');
    assert.ok(Math.abs(mockTmpl.rotation - (60 * Math.PI / 180)) < 1e-6, 'Template rotation must update to radians');
    assert.equal(mockDoc.direction, 60, 'Document direction must update to 60');
    assert.ok(mockTmpl.ray, 'Template ray must be present');
});

test('FoundryVTTV13Adapter.refreshTemplateHighlights updates tmpl.ray before invoking _computeShape', async () => {
    const { FoundryVTTV13Adapter } = await import('../../src/adapter/foundry/foundryvtt-v13-adapter.js');
    const adapter = new FoundryVTTV13Adapter();

    let rayAngleDuringCompute = null;
    const mockDoc = {
        x: 0,
        y: 0,
        distance: 30,
        direction: 0,
        rotation: 0,
        t: 'ray',
        updateSource(data) { Object.assign(this, data); }
    };
    const mockTmpl = {
        x: 0,
        y: 0,
        direction: 0,
        rotation: 0,
        document: mockDoc,
        ray: { origin: { x: 0, y: 0 }, angle: 0, distance: 600 },
        _computeShape() {
            rayAngleDuringCompute = this.ray?.angle;
            return { points: [0, 0, 100, 100] };
        },
        highlightGrid() {}
    };

    adapter.refreshTemplateHighlights(mockTmpl, 90);

    const expectedRad = 90 * (Math.PI / 180);
    assert.ok(rayAngleDuringCompute !== null, '_computeShape must be called');
    assert.ok(Math.abs(rayAngleDuringCompute - expectedRad) < 1e-5, `tmpl.ray must have updated angle (${expectedRad}) when _computeShape runs, was ${rayAngleDuringCompute}`);
    assert.ok(mockTmpl.shape, 'tmpl.shape must be assigned from _computeShape');
});

test('BaseCrosshairShape.rotate updates placeable ray and recomputes placeable shape immediately', async () => {
    const { RayCrosshairShape } = await import('../../src/crosshair/ray.js');

    let shapeComputed = false;
    const mockDoc = {
        x: 0,
        y: 0,
        direction: 0,
        t: 'ray',
        distance: 30,
        updateSource(d) { Object.assign(this, d); }
    };

    const mockPlaceable = {
        x: 0,
        y: 0,
        direction: 0,
        document: mockDoc,
        ray: { origin: { x: 0, y: 0 }, angle: 0, distance: 600 },
        _computeShape() {
            shapeComputed = true;
            return { points: [0, 0, 50, 50] };
        },
        renderFlags: { set: () => {} },
        applyRenderFlags() {},
        highlightGrid() {}
    };

    const shape = new RayCrosshairShape(mockPlaceable, { distance: 30 });
    shape.rotate(180, true);

    assert.equal(shapeComputed, true, '_computeShape must be called during shape.rotate');
    assert.ok(Math.abs(mockPlaceable.ray.angle - Math.PI) < 1e-5, 'Placeable ray angle must update to 180 degrees (PI radians)');
});

test('hidePreview keeps native placeable hidden even when placeable.crosshair is attached', () => {
    const mockPlaceable = {
        constructor: { name: 'MeasuredTemplate' },
        visible: true,
        renderable: true,
        alpha: 1,
        template: { visible: true, renderable: true, alpha: 1 },
        shape: { visible: true, renderable: true, alpha: 1 },
        border: { visible: true, renderable: true, alpha: 1 },
        document: {
            t: 'ray',
            direction: 0,
            distance: 30
        },
        refresh() {
            this.visible = true;
            this.renderable = true;
            this.template.visible = true;
        }
    };

    adapter.crosshair.hidePreview(mockPlaceable);
    assert.equal(mockPlaceable.template.visible, false, 'Template must be hidden initially');

    // Simulate BBC attaching crosshair reference to placeable
    mockPlaceable.crosshair = {
        constructor: { name: 'CrosshairsPlaceable' },
        document: { crosshair: { borderAlpha: 0.3 } },
        tag: 'sequencer-crosshair-123'
    };

    // Trigger intercepted refresh on placeable
    mockPlaceable.refresh();

    // Placeable must STILL be hidden because placeable is NOT a Sequencer crosshair
    assert.equal(mockPlaceable.template.visible, false, 'Placeable must remain hidden even after placeable.crosshair is attached');
    assert.equal(mockPlaceable.template.renderable, false);
    assert.equal(mockPlaceable.template.alpha, 0);
});

test('rotateCrosshairInstance synchronizes crosshair.document.direction, ray, and refreshes detached rays and cones', async () => {
    const { CrosshairRotationListener } = await import('../../src/crosshair/rotationListener.js');
    const listener = new CrosshairRotationListener();

    let refreshed = false;
    const mockSeqDocument = {
        direction: 0,
        updateSource(data) { Object.assign(this, data); }
    };
    const mockSeqCrosshair = {
        x: 50,
        y: 50,
        direction: 0,
        rotation: 0,
        type: 'ray',
        document: mockSeqDocument,
        ray: { distance: 600, dx: 600, dy: 0 },
        refresh() { refreshed = true; }
    };

    listener.rotateCrosshairInstance(mockSeqCrosshair, 135, { type: 'ray' });

    assert.equal(mockSeqCrosshair.direction, 135, 'Crosshair direction must update to 135');
    assert.equal(mockSeqDocument.direction, 135, 'Crosshair document direction must update to 135');
    assert.ok(Math.abs(mockSeqCrosshair.rotation - (135 * Math.PI / 180)) < 1e-6, 'Crosshair rotation must rotate to rad on wheel');
    assert.ok(mockSeqCrosshair.ray, 'Crosshair ray must be updated');
    assert.equal(refreshed, true, 'refresh() must be called for detached ray');
});

test('BaseCrosshairShape suppresses geometric border and fill alpha when graphic animation is active and enablePreviewPlacement is false', async () => {
    const { RayCrosshairShape } = await import('../../src/crosshair/ray.js');
    const mockDocument = { x: 0, y: 0, direction: 0 };
    const mockPlaceable = { x: 0, y: 0, document: mockDocument };
    const shape = new RayCrosshairShape(mockPlaceable, { distance: 30, width: 5 });

    assert.equal(shape.borderAlpha, 0, 'borderAlpha must be 0 when graphic is active and preview placement is not enabled');
    assert.equal(shape.fillAlpha, 0, 'fillAlpha must be 0 when graphic is active and preview placement is not enabled');

    let passedBorderOpts = null;
    let passedFillOpts = null;
    const mockCrosshairBuilder = {
        type() { return this; },
        borderColor(c, opts) { passedBorderOpts = opts; return this; },
        fillColor(c, opts) { passedFillOpts = opts; return this; },
        direction() { return this; },
        distance() { return this; },
        width() { return this; },
        snapPosition() { return this; },
        location() { return this; },
        callback() { return this; }
    };
    const origSeq = globalThis.Sequence;
    try {
        globalThis.Sequence = class {
            crosshair() { return mockCrosshairBuilder; }
        };

        await shape.create();
        assert.equal(passedBorderOpts?.alpha, 0, 'Sequencer borderColor alpha must be 0');
        assert.equal(passedFillOpts?.alpha, 0, 'Sequencer fillColor alpha must be 0');
    } finally {
        globalThis.Sequence = origSeq;
    }
});

test('BaseCrosshairShape respects configured border and fill alpha when enablePreviewPlacement is true', async () => {
    const { RayCrosshairShape } = await import('../../src/crosshair/ray.js');
    const mockDocument = { x: 0, y: 0, direction: 0 };
    const mockPlaceable = { x: 0, y: 0, document: mockDocument };
    const shape = new RayCrosshairShape(mockPlaceable, {
        distance: 30,
        width: 5,
        enablePreviewPlacement: true,
        borderAlpha: 0.8,
        fillAlpha: 0.4
    });

    assert.equal(shape.borderAlpha, 0.8, 'borderAlpha must be 0.8 when enablePreviewPlacement is true');
    assert.equal(shape.fillAlpha, 0.4, 'fillAlpha must be 0.4 when enablePreviewPlacement is true');

    let passedBorderOpts = null;
    let passedFillOpts = null;
    const mockCrosshairBuilder = {
        type() { return this; },
        borderColor(c, opts) { passedBorderOpts = opts; return this; },
        fillColor(c, opts) { passedFillOpts = opts; return this; },
        direction() { return this; },
        distance() { return this; },
        width() { return this; },
        snapPosition() { return this; },
        location() { return this; },
        callback() { return this; }
    };
    const origSeq = globalThis.Sequence;
    try {
        globalThis.Sequence = class {
            crosshair() { return mockCrosshairBuilder; }
        };

        await shape.create();
        assert.equal(passedBorderOpts?.alpha, 0.8, 'Sequencer borderColor alpha must be 0.8');
        assert.equal(passedFillOpts?.alpha, 0.4, 'Sequencer fillColor alpha must be 0.4');
    } finally {
        globalThis.Sequence = origSeq;
    }
});

test('BaseCrosshairShape uses DEFAULT_AUTOREC_ENTRY alpha when no graphic file is present', async () => {
    const { DEFAULT_AUTOREC_ENTRY } = await import('../../src/autorec/autorecManager.js');
    const mockDocument = { x: 0, y: 0, direction: 0 };
    const mockPlaceable = { x: 0, y: 0, document: mockDocument };
    const shape = new BaseCrosshairShape(mockPlaceable, { file: '' });

    assert.equal(shape.borderAlpha, DEFAULT_AUTOREC_ENTRY.borderAlpha);
    assert.equal(shape.fillAlpha, DEFAULT_AUTOREC_ENTRY.fillAlpha);

    let passedBorderOpts = null;
    let passedFillOpts = null;
    const mockCrosshairBuilder = {
        type() { return this; },
        borderColor(c, opts) { passedBorderOpts = opts; return this; },
        fillColor(c, opts) { passedFillOpts = opts; return this; },
        direction() { return this; },
        distance() { return this; },
        width() { return this; },
        snapPosition() { return this; },
        location() { return this; },
        callback() { return this; }
    };
    const origSeq = globalThis.Sequence;
    try {
        globalThis.Sequence = class {
            crosshair() { return mockCrosshairBuilder; }
        };

        await shape.create();
        assert.equal(passedBorderOpts?.alpha, DEFAULT_AUTOREC_ENTRY.borderAlpha);
        assert.equal(passedFillOpts?.alpha, DEFAULT_AUTOREC_ENTRY.fillAlpha);
    } finally {
        globalThis.Sequence = origSeq;
    }
});

test('rotateCrosshairInstance and shape.rotate invoke _refreshShape, _refreshTemplate, and applyRenderFlags', async () => {
    const { RayCrosshairShape } = await import('../../src/crosshair/ray.js');
    const { CrosshairRotationListener } = await import('../../src/crosshair/rotationListener.js');
    const listener = new CrosshairRotationListener();

    let shapeRefreshed = false;
    let templateRefreshed = false;
    let renderFlagsApplied = false;
    let renderFlagsSet = false;

    const mockSeqCrosshair = {
        x: 0,
        y: 0,
        direction: 0,
        rotation: 0,
        type: 'ray',
        _refreshShape() { shapeRefreshed = true; },
        _refreshTemplate() { templateRefreshed = true; },
        renderFlags: {
            set(flags) { renderFlagsSet = Boolean(flags.refreshShape && flags.refreshTemplate); }
        },
        applyRenderFlags() { renderFlagsApplied = true; },
        refresh() {}
    };

    listener.rotateCrosshairInstance(mockSeqCrosshair, 45, { type: 'ray' });
    assert.equal(shapeRefreshed, true, '_refreshShape must be called on crosshair');
    assert.equal(templateRefreshed, true, '_refreshTemplate must be called on crosshair');
    assert.equal(renderFlagsSet, true, 'renderFlags.set must be called on crosshair');
    assert.equal(renderFlagsApplied, true, 'applyRenderFlags must be called on crosshair');

    shapeRefreshed = false;
    templateRefreshed = false;
    renderFlagsApplied = false;
    renderFlagsSet = false;

    const mockPlaceable = { x: 0, y: 0, document: { direction: 0 } };
    const shape = new RayCrosshairShape(mockPlaceable, { distance: 30, width: 5 });
    shape.sequencerCrosshair = mockSeqCrosshair;
    shape.rotate(90);

    assert.equal(shapeRefreshed, true, '_refreshShape must be called on sequencerCrosshair via shape.rotate');
    assert.equal(templateRefreshed, true, '_refreshTemplate must be called on sequencerCrosshair via shape.rotate');
    assert.equal(renderFlagsSet, true, 'renderFlags.set must be called on sequencerCrosshair via shape.rotate');
    assert.equal(renderFlagsApplied, true, 'applyRenderFlags must be called on sequencerCrosshair via shape.rotate');
});

test('CrosshairRotationListener activeWheelHandler rotates shape and refreshes highlights immediately without mouse move', async () => {
    const { RayCrosshairShape } = await import('../../src/crosshair/ray.js');
    const { CrosshairRotationListener } = await import('../../src/crosshair/rotationListener.js');
    const listener = new CrosshairRotationListener();

    let highlightRefreshed = false;
    let placeableRayAngle = null;

    const mockDoc = {
        x: 100,
        y: 100,
        direction: 0,
        t: 'ray',
        distance: 30,
        updateSource(d) { Object.assign(this, d); }
    };

    const mockPlaceable = {
        x: 100,
        y: 100,
        direction: 0,
        document: mockDoc,
        ray: { origin: { x: 100, y: 100 }, angle: 0, distance: 600 },
        highlightGrid() {
            highlightRefreshed = true;
            placeableRayAngle = this.ray?.angle;
        },
        renderFlags: { set: () => {} },
        applyRenderFlags() {}
    };

    const shape = new RayCrosshairShape(mockPlaceable, { type: 'ray', distance: 30 });
    shape.x = 100;
    shape.y = 100;
    shape.direction = 0;

    const config = { type: 'ray', currentDirection: 0, direction: 0 };
    listener.attach(shape, config);

    assert.ok(listener.activeWheelHandler, 'activeWheelHandler must be defined');

    // Simulate mouse wheel scroll deltaY > 0 (+5 degrees)
    const mockEvent = {
        deltaY: 100,
        preventDefault() {},
        stopImmediatePropagation() {},
        stopPropagation() {}
    };

    listener.activeWheelHandler(mockEvent);

    assert.equal(config.currentDirection, 5, 'config.currentDirection must rotate by step (5 degrees)');
    assert.equal(shape.direction, 5, 'shape.direction must update to 5 degrees');
    assert.equal(highlightRefreshed, true, 'highlightGrid must be executed immediately on wheel without mouse move');
    assert.ok(placeableRayAngle !== null, 'placeable ray must be set');
    assert.ok(Math.abs(placeableRayAngle - (5 * Math.PI / 180)) < 1e-5, 'placeable ray angle must reflect 5 degrees');

    listener.detach();
    assert.equal(listener.activeWheelHandler, null, 'activeWheelHandler must be detached');
});

test('CrosshairRotationListener.attach registers capture-phase pointerdown listener and triggers cancel on right-click (button 2)', async () => {
    const { CrosshairRotationListener } = await import('../../src/crosshair/rotationListener.js');
    const listener = new CrosshairRotationListener();

    let cancelCalled = false;
    let shapeCancelCalled = false;

    const mockCrosshair = {
        cancel() { cancelCalled = true; }
    };

    const mockShape = {
        sequencerCrosshair: mockCrosshair,
        rotate: () => {},
        move: () => {},
        onCancelCallback() { shapeCancelCalled = true; }
    };

    listener.attach(mockShape, {});

    assert.ok(listener.activePointerDownHandler, 'activePointerDownHandler must be defined on attach');

    // Left click (button 0) should NOT trigger cancel
    listener.activePointerDownHandler({ button: 0 });
    assert.equal(cancelCalled, false, 'Left click must not trigger cancellation');
    assert.equal(shapeCancelCalled, false);

    // Right click (button 2) MUST trigger cancellation
    listener.activePointerDownHandler({ button: 2 });
    assert.equal(cancelCalled, true, 'Right click must trigger crosshair.cancel()');
    assert.equal(shapeCancelCalled, true, 'Right click must trigger shape.onCancelCallback()');

    listener.detach();
    assert.equal(listener.activePointerDownHandler, null, 'activePointerDownHandler must be cleared on detach');
});

test('BaseCrosshairShape.playGraphicEffect places effect at initial location via atLocation for standalone crosshair', async () => {
    const { BaseCrosshairShape } = await import('../../src/crosshair/base.js');

    let attachedTarget = null;
    let locationTarget = null;
    class MockEffectBuilder {
        name() { return this; }
        file() { return this; }
        attachTo(target) { attachedTarget = target; return this; }
        atLocation(target) { locationTarget = target; return this; }
        rotate() { return this; }
        anchor() { return this; }
        size() { return this; }
        opacity() { return this; }
        belowTokens() { return this; }
        aboveLighting() { return this; }
        locally() { return this; }
        persist() { return this; }
    }

    const origSequence = globalThis.Sequence;
    globalThis.Sequence = class {
        wait() { return this; }
        effect() { return new MockEffectBuilder(); }
        play() { return Promise.resolve(); }
    };

    try {
        const mockCrosshairContainer = { x: 200, y: 300 };
        const shape = new BaseCrosshairShape(null, { file: 'test.animation.file', x: 200, y: 300 });
        shape._getGraphicFile = () => 'test.animation.file';

        await shape.playGraphicEffect(mockCrosshairContainer);

        assert.equal(attachedTarget, null, 'Standalone effects must not attachTo crosshair container to prevent double transforms and rotation speed duplication');
        assert.deepEqual(locationTarget, { x: 200, y: 300 }, 'Effect must be placed at initial location');
    } finally {
        globalThis.Sequence = origSequence;
    }
});

test('REGRESSION: BaseCrosshairShape.rotate() does not throw when doc.rotation has only a getter (Foundry V13 MeasuredTemplateDocument)', async () => {
    const { BaseCrosshairShape } = await import('../../src/crosshair/base.js');

    let docDirection = 0;
    const mockDoc = {
        get direction() { return docDirection; },
        set direction(val) { docDirection = val; },
        get rotation() { return docDirection; }, // Getter-only!
        updateSource(d) { if (d.direction !== undefined) docDirection = d.direction; }
    };

    const mockPlaceable = {
        document: mockDoc,
        x: 100,
        y: 100,
        direction: 0,
        refresh() {}
    };

    const shape = new BaseCrosshairShape(mockPlaceable, { type: 'ray' });
    assert.doesNotThrow(() => {
        shape.rotate(45);
    }, 'rotate must not throw TypeError when doc.rotation is a getter-only property');

    assert.equal(shape.direction, 45);
    assert.equal(mockDoc.direction, 45);
});

test('REGRESSION: BaseCrosshairShape.rotate rotates Sequencer effect at 1:1 speed matching template direction', async () => {
    const { BaseCrosshairShape } = await import('../../src/crosshair/base.js');

    let updatedEffectRotation = null;
    const mockEffect = {
        name: 'Ray Crosshair',
        container: { position: { set() {} }, rotation: 0 },
        update(data) {
            if (data.rotation !== undefined) updatedEffectRotation = data.rotation;
        }
    };

    const origGetEffects = globalThis.Sequencer.EffectManager.getEffects;
    try {
        globalThis.Sequencer.EffectManager.getEffects = (query) => {
            if (query.name === 'Ray Crosshair') return [mockEffect];
            return [];
        };

        const mockPlaceable = {
            document: { direction: 0, updateSource(d) { Object.assign(this, d); } },
            x: 100,
            y: 100,
            direction: 0,
            refresh() {}
        };

        const shape = new BaseCrosshairShape(mockPlaceable, { id: 'Ray Crosshair', type: 'ray' });
        shape.rotate(90);

        assert.equal(shape.direction, 90, 'Shape direction must be 90 degrees');
        assert.equal(updatedEffectRotation, 90, 'Sequencer effect rotation must be 90 degrees (1:1 with template direction)');
    } finally {
        globalThis.Sequencer.EffectManager.getEffects = origGetEffects;
    }
});

test('REGRESSION: Attached ray shape.move calculates anchor point and updates direction in a single fluid pass', async () => {
    const { BaseCrosshairShape } = await import('../../src/crosshair/base.js');

    const mockToken = {
        x: 100,
        y: 100,
        w: 100,
        h: 100,
        center: { x: 150, y: 150 },
        document: { x: 100, y: 100, width: 1, height: 1 }
    };

    const mockDoc = {
        x: 150,
        y: 150,
        direction: 0,
        updateSource(d) { Object.assign(this, d); }
    };

    const mockPlaceable = {
        document: mockDoc,
        x: 150,
        y: 150,
        direction: 0,
        refresh() {}
    };

    const shape = new BaseCrosshairShape(mockPlaceable, {
        id: 'Ray Crosshair',
        type: 'ray',
        token: mockToken,
        stickToToken: true
    });

    // Move cursor to the right (x=300, y=150)
    shape.move(300, 150);

    // Right edge of a 100x100 token at (100, 100) is x=200, y=150, facing 0 degrees
    assert.equal(shape.x, 200, 'Shape X must be anchored to right edge of token');
    assert.equal(shape.y, 150, 'Shape Y must be anchored to right edge of token');
    assert.equal(shape.direction, 0, 'Shape direction must point directly right (0 deg)');
});





