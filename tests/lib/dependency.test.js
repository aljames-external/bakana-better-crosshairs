import '../setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { dependency } from '../../src/lib/dependency.js';

test('dependency verification utility correctly inspects active modules and objects', () => {
    assert.equal(dependency.isInstalled({ id: 'bakana-better-crosshairs' }), true);
    assert.equal(dependency.isInstalled({ id: 'sequencer' }), true);
    assert.equal(dependency.isInstalled({ id: 'nonexistent-module' }), false);

    assert.equal(dependency.isActivated({ id: 'bakana-better-crosshairs' }), true);
    assert.equal(dependency.isActivated({ id: 'nonexistent-module' }), false);

    assert.doesNotThrow(() => {
        dependency.someRequired([{ id: 'nonexistent-module' }, { id: 'bakana-better-crosshairs' }]);
    });
    assert.throws(() => {
        dependency.someRequired([{ id: 'nonexistent-module' }]);
    });
});
