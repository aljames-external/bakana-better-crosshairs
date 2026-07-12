import '../setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCrosshairIcon, shouldStickToToken, getTokenEdgePoint, snapCoordinates } from '../../src/crosshair/util.js';

test('crosshair.util.resolveCrosshairIcon normalizes and fallbacks icon paths', () => {
    assert.equal(resolveCrosshairIcon('icons/svg/target.svg'), 'icons/svg/target.svg');
    assert.equal(resolveCrosshairIcon(null), '');
    assert.equal(resolveCrosshairIcon({ img: 'path/to/token.png' }), '');
});

test('crosshair.util.shouldStickToToken evaluates configuration flags cleanly', () => {
    assert.equal(shouldStickToToken({ stickToToken: true }), true);
    assert.equal(shouldStickToToken({ stickToToken: false }), false);
    assert.equal(shouldStickToToken({ stickToToken: 'true' }), true);
    assert.equal(shouldStickToToken({ stickToToken: '0' }), false);
});

test('crosshair.util.snapCoordinates aligns separate x and y coordinates to grid', () => {
    const snapped = snapCoordinates(123, 456, true);
    assert.deepEqual(snapped, { x: 100, y: 450 });
});
