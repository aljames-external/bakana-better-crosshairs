import '../setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCrosshairIcon, shouldStickToToken, getTokenEdgePoint, snapCoordinates } from '../../src/crosshair/util.js';
import { BaseSystemAdapter } from '../../src/adapter/system/base-system-adapter.js';
import { Dnd5eSystemAdapter } from '../../src/adapter/system/dnd5e-adapter.js';

test('crosshair.util.resolveCrosshairIcon normalizes and fallbacks icon paths', () => {
    assert.equal(resolveCrosshairIcon('icons/svg/target.svg'), 'icons/svg/target.svg');
    assert.equal(resolveCrosshairIcon(null), '');
    assert.equal(resolveCrosshairIcon({ img: 'path/to/token.png' }), '');
});

test('crosshair.util.shouldStickToToken evaluates configuration flags and delegates defaults to system adapters', () => {
    assert.equal(shouldStickToToken({ stickToToken: true }), true);
    assert.equal(shouldStickToToken({ stickToToken: false }), false);
    assert.equal(shouldStickToToken({ stickToToken: 'true' }), true);
    assert.equal(shouldStickToToken({ stickToToken: '0' }), false);

    const baseSys = new BaseSystemAdapter();
    const dnd5eSys = new Dnd5eSystemAdapter();

    assert.equal(shouldStickToToken({}, "cone", baseSys), true);
    assert.equal(shouldStickToToken({}, "circle", baseSys), false);

    assert.equal(shouldStickToToken({}, "cone", dnd5eSys), true);
    assert.equal(shouldStickToToken({}, "ray", dnd5eSys), true);
    assert.equal(shouldStickToToken({}, "circle", dnd5eSys), false);
    assert.equal(shouldStickToToken({}, "square", dnd5eSys), false);
});

test('crosshair.util.snapCoordinates aligns separate x and y coordinates to grid', () => {
    const snapped = snapCoordinates(123, 456, true);
    assert.deepEqual(snapped, { x: 100, y: 450 });
});
