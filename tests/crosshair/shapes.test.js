import '../setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    BaseCrosshairShape,
    CircleCrosshairShape,
    ConeCrosshairShape,
    RayCrosshairShape,
    SquareCrosshairShape
} from '../../src/crosshair/_crosshairs.js';

test('Shape classes initialize with canonical default anchors and types', () => {
    const circle = new CircleCrosshairShape(null, {});
    assert.equal(circle.type, 'circle');
    assert.deepEqual(circle.animationAnchor, { x: 0.5, y: 0.5 });
    assert.deepEqual(circle.shapeAnchor, { x: 0.5, y: 0.5 });
    assert.equal(circle.requiresWheelRotation, false);

    const cone = new ConeCrosshairShape(null, {});
    assert.equal(cone.type, 'cone');
    assert.deepEqual(cone.animationAnchor, { x: 0, y: 0.5 });
    assert.deepEqual(cone.shapeAnchor, { x: 0, y: 0.5 });
    assert.equal(cone.requiresWheelRotation, true);

    const ray = new RayCrosshairShape(null, {});
    assert.equal(ray.type, 'ray');
    assert.deepEqual(ray.animationAnchor, { x: 0, y: 0.5 });
    assert.deepEqual(ray.shapeAnchor, { x: 0, y: 0.5 });
    assert.equal(ray.requiresWheelRotation, true);

    const square = new SquareCrosshairShape(null, {});
    assert.equal(square.type, 'rect');
    assert.deepEqual(square.animationAnchor, { x: 0, y: 0 });
    assert.deepEqual(square.shapeAnchor, { x: 0, y: 0 });
    assert.equal(square.requiresWheelRotation, true);
});

test('Shape classes allow independent animationAnchor and shapeAnchor overrides', () => {
    const config = {
        animationAnchor: { x: 0.1, y: 0.5 },
        shapeAnchor: { x: 0.0, y: 0.5 }
    };
    const cone = new ConeCrosshairShape(null, config);
    assert.deepEqual(cone.animationAnchor, { x: 0.1, y: 0.5 });
    assert.deepEqual(cone.shapeAnchor, { x: 0, y: 0.5 });
});

test('BaseCrosshairShape.getRotatedShapeCoordinates returns exact cursor coords when anchors are identical', () => {
    const base = new BaseCrosshairShape(null, { animationAnchor: { x: 0.5, y: 0.5 }, shapeAnchor: { x: 0.5, y: 0.5 } });
    const coords = base.getRotatedShapeCoordinates(500, 500, 45, { widthPx: 200, heightPx: 200 });
    assert.deepEqual(coords, { x: 500, y: 500 });
});

test('BaseCrosshairShape.getRotatedShapeCoordinates accurately calculates rotated world offsets when anchors differ', () => {
    // Animation anchor is 20 pixels to the right (x=0.2 of 100px width) compared to shape anchor (x=0 of 100px width)
    const base = new BaseCrosshairShape(null, {
        animationAnchor: { x: 0.2, y: 0.5 },
        shapeAnchor: { x: 0.0, y: 0.5 }
    });

    const dim = { widthPx: 100, heightPx: 100 };

    // At 0 degrees, delta is +20px along X
    const at0 = base.getRotatedShapeCoordinates(500, 500, 0, dim);
    assert.equal(Math.round(at0.x), 520);
    assert.equal(Math.round(at0.y), 500);

    // At 90 degrees, delta (+20, 0) rotates to (0, +20)
    const at90 = base.getRotatedShapeCoordinates(500, 500, 90, dim);
    assert.equal(Math.round(at90.x), 500);
    assert.equal(Math.round(at90.y), 520);

    // At 180 degrees, delta (+20, 0) rotates to (-20, 0)
    const at180 = base.getRotatedShapeCoordinates(500, 500, 180, dim);
    assert.equal(Math.round(at180.x), 480);
    assert.equal(Math.round(at180.y), 500);

    // At 270 degrees, delta (+20, 0) rotates to (0, -20)
    const at270 = base.getRotatedShapeCoordinates(500, 500, 270, dim);
    assert.equal(Math.round(at270.x), 500);
    assert.equal(Math.round(at270.y), 480);
});

test('BaseCrosshairShape.playGraphicEffect only creates line animation when placing a circle template', async () => {
    const originalSequence = globalThis.Sequence;
    const origModulesGet = globalThis.game?.modules?.get;
    const effectNames = [];
    try {
        if (!globalThis.game) globalThis.game = {};
        if (!globalThis.game.modules) globalThis.game.modules = new Map();
        globalThis.game.modules.get = () => ({ active: true, version: '1.0.0' });

        globalThis.Sequence = class MockSequence {
            wait() { return this; }
            effect() {
                const effectObj = {
                    name: (n) => { effectNames.push(n); return effectObj; },
                    file: () => effectObj,
                    attachTo: () => effectObj,
                    stretchTo: () => { effectNames.push('LINE_STRETCH'); return effectObj; },
                    anchor: () => effectObj,
                    size: () => effectObj,
                    opacity: () => effectObj,
                    belowTokens: () => effectObj,
                    locally: () => effectObj,
                    persist: () => effectObj
                };
                return effectObj;
            }
            async play() { return true; }
        };

        const dummyToken = new globalThis.Token();

        // 1. Circle template with token -> MUST play line animation
        const circleShape = new CircleCrosshairShape(dummyToken, { showLine: true, stickToToken: "false" });
        effectNames.length = 0;
        await circleShape.playGraphicEffect({});
        assert.ok(effectNames.includes('LINE_STRETCH'), 'Circle template should create line stretch effect');

        // 2. Cone template with token -> MUST NOT play line animation
        const coneShape = new ConeCrosshairShape(dummyToken, { showLine: true, stickToToken: "false" });
        effectNames.length = 0;
        await coneShape.playGraphicEffect({});
        assert.equal(effectNames.includes('LINE_STRETCH'), false, 'Cone template should not create line stretch effect');

        // 3. Ray template with token -> MUST NOT play line animation
        const rayShape = new RayCrosshairShape(dummyToken, { showLine: true, stickToToken: "false" });
        effectNames.length = 0;
        await rayShape.playGraphicEffect({});
        assert.equal(effectNames.includes('LINE_STRETCH'), false, 'Ray template should not create line stretch effect');

        // 4. Square template with token -> MUST NOT play line animation
        const squareShape = new SquareCrosshairShape(dummyToken, { showLine: true, stickToToken: "false" });
        effectNames.length = 0;
        await squareShape.playGraphicEffect({});
        assert.equal(effectNames.includes('LINE_STRETCH'), false, 'Square template should not create line stretch effect');
    } finally {
        globalThis.Sequence = originalSequence;
        if (globalThis.game?.modules && origModulesGet) {
            globalThis.game.modules.get = origModulesGet;
        }
    }
});

test('SquareCrosshairShape.getGraphicDimensions normalizes diagonal distance on square/cube templates so width is not 50% too wide', () => {
    // For a 20-foot cube in D&D 5e, distance is 30 (diagonal hypotenuse) and width is 20
    const squareShape = new SquareCrosshairShape(null, { distance: 30, width: 20 });
    const dims = squareShape.getGraphicDimensions();
    assert.equal(dims.widthPx, dims.heightPx, 'Width and height must be identical for a 20x20 square/cube template');
});

test('SquareCrosshairShape anchors branch between left-middle when attached to token and top-left when detached', () => {
    const dummyToken = new globalThis.Token();
    const stickySquare = new SquareCrosshairShape(dummyToken, { stickToToken: "true" });
    assert.deepEqual(stickySquare.animationAnchor, { x: 0, y: 0.5 });
    assert.deepEqual(stickySquare.shapeAnchor, { x: 0, y: 0.5 });

    const detachedSquare = new SquareCrosshairShape(null, { stickToToken: "false" });
    assert.deepEqual(detachedSquare.animationAnchor, { x: 0, y: 0 });
    assert.deepEqual(detachedSquare.shapeAnchor, { x: 0, y: 0 });
});
