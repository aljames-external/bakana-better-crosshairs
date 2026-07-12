import '../setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { localize, version } from '../../src/lib/utils.js';

test('utils.localize formats keys correctly using mock i18n', () => {
    assert.equal(localize('testKey'), 'LOC:testKey');
    assert.equal(localize('BBC.testKey'), 'LOC:BBC.testKey');
});

test('utils.version.clamp limits versions cleanly returning boolean flags', () => {
    assert.equal(version.clamp('13.335', '13', '14'), true);
    assert.equal(version.clamp('12.0', '13', '14'), false);
    assert.equal(version.clamp('15.0', '13', '14'), false);
});
