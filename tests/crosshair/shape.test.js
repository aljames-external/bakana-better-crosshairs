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
