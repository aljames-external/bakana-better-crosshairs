import '../setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CrosshairConfiguration } from '../../src/autorec/CrosshairConfiguration.js';

test('CrosshairConfiguration.fromSource initializes with canonical schema defaults', () => {
    const config = CrosshairConfiguration.fromSource({ itemName: 'Fireball', circleFile: 'jb2a.fireball.01' });
    assert.equal(config.itemName, 'Fireball');
    assert.equal(config.circleFile, 'jb2a.fireball.01');
    assert.equal(config.enabled, true);
    assert.equal(config.showLine, true);
});

test('CrosshairConfiguration.overrideWith merges activity or item overrides without mutating original', () => {
    const base = CrosshairConfiguration.fromSource({
        itemName: 'Fireball',
        circleFile: 'jb2a.fireball.01',
        borderColor: '#ff0000',
        stickToToken: "false"
    });

    const overridden = base.overrideWith({
        circleFile: 'jb2a.fireball.blue',
        stickToToken: "true"
    });

    assert.equal(base.circleFile, 'jb2a.fireball.01');
    assert.equal(base.stickToToken, "false");
    assert.equal(overridden.circleFile, 'jb2a.fireball.blue');
    assert.equal(overridden.stickToToken, "true");
});

test('CrosshairConfiguration.toJSON serializes properties cleanly for persistence', () => {
    const config = CrosshairConfiguration.fromSource({ itemName: 'Test Item', id: 'test-item-id' });
    const json = config.toJSON();
    assert.equal(json.itemName, 'Test Item');
    assert.equal(json.id, 'test-item-id');
    assert.equal(typeof json, 'object');
});
