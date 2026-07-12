import '../setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { closest, absolutePath } from '../../src/lib/filemanager.js';

test('filemanager.closest returns exact path if Sequencer database returns entry', () => {
    const validPath = 'jb2a.crosshair.01.white';
    assert.equal(closest(validPath), validPath);
});

test('filemanager.closest returns best fit root category if invalid path matches nothing in database', () => {
    const invalidPath = 'invalid.path.matching.nothing';
    assert.equal(closest(invalidPath), 'invalid');
});

test('filemanager.absolutePath correctly normalizes string file paths', () => {
    assert.equal(absolutePath('modules/test/img.webp'), 'modules/test/img.webp');
    assert.equal(absolutePath(null), undefined);
});
