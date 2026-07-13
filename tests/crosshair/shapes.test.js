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
