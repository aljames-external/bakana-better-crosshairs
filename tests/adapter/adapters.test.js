import '../setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeFoundryAdapter, crosshairAdapter } from '../../src/adapter/foundry/index.js';
import { initializeSystemAdapter, systemAdapter } from '../../src/adapter/system/index.js';
import { FoundryVTTV13Adapter } from '../../src/adapter/foundry/foundryvtt-v13-adapter.js';
import { FoundryVTTV14Adapter } from '../../src/adapter/foundry/foundryvtt-v14-adapter.js';
import { Dnd5eSystemAdapter } from '../../src/adapter/system/dnd5e-adapter.js';
import { Pf2eSystemAdapter } from '../../src/adapter/system/pf2e-adapter.js';

test('initializeFoundryAdapter selects proper Foundry VTT generation adapter based on game.version', () => {
    globalThis.game.version = "13.335";
    const adapterV13 = initializeFoundryAdapter();
    assert.ok(adapterV13 instanceof FoundryVTTV13Adapter);
    assert.equal(adapterV13.documentTerm, 'template');
    assert.equal(crosshairAdapter, adapterV13);

    globalThis.game.version = "14.300";
    const adapterV14 = initializeFoundryAdapter();
    assert.ok(adapterV14 instanceof FoundryVTTV14Adapter);
    assert.equal(adapterV14.documentTerm, 'region');
    assert.equal(crosshairAdapter, adapterV14);
});

test('initializeSystemAdapter selects proper System adapter based on game.system.id', () => {
    globalThis.game.system.id = "dnd5e";
    let sysAdapter = initializeSystemAdapter();
    assert.ok(sysAdapter instanceof Dnd5eSystemAdapter);
    assert.equal(sysAdapter.systemId, 'dnd5e');
    assert.equal(sysAdapter.supportsActivities, true);
    assert.equal(systemAdapter, sysAdapter);

    globalThis.game.system.id = "pf2e";
    sysAdapter = initializeSystemAdapter();
    assert.ok(sysAdapter instanceof Pf2eSystemAdapter);
    assert.equal(sysAdapter.systemId, 'pf2e');
    assert.equal(sysAdapter.supportsActivities, false);
    assert.equal(systemAdapter, sysAdapter);
});

test('foundry and system adapters extract properties and calling context consistently', () => {
    const mockDoc = {
        name: 'Fireball',
        type: 'spell',
        flags: { pf2e: { origin: 'Item.12345' } }
    };

    globalThis.foundry.utils.fromUuidSync = (uuid) => {
        if (uuid === 'Item.12345') return { id: '12345', name: 'Fireball PF2e' };
        return null;
    };

    const pf2eAdapter = new Pf2eSystemAdapter();
    const ctx = pf2eAdapter.extractCallingContext(mockDoc, {});
    assert.ok(ctx);
    assert.equal(ctx.itemName, 'Fireball PF2e');
    assert.equal(ctx.itemId, '12345');

    const shapeProps = crosshairAdapter.detectProperties({ document: { t: 'circle', distance: 20 } });
    assert.ok(shapeProps);
});

test('crosshairAdapter.dismissPreview safely detaches stage listeners and destroys placeable', () => {
    let confirmCalled = false;
    let destroyCalled = false;
    const mockPlaceable = {
        _onConfirm() { confirmCalled = true; },
        destroy(opts) { destroyCalled = true; }
    };

    crosshairAdapter.dismissPreview(mockPlaceable);
    assert.equal(confirmCalled, true);
    assert.equal(destroyCalled, true);
});

test('systemAdapter.handleProgrammaticPlacement encapsulates 50ms fallback creation check', async () => {
    const mockDoc = {
        documentName: 'MeasuredTemplate',
        toObject: () => ({ t: 'circle', distance: 15, _id: 'temp' })
    };
    let createdDocData = null;
    const mockScene = {
        createEmbeddedDocuments: async (docName, data) => { createdDocData = data[0]; return data; }
    };

    const pendingMap = new Map([
        ['test_key', { resolved: true, cancelled: false, coords: { x: 250, y: 350, direction: 45, distance: 20 } }]
    ]);

    const pf2eAdapter = new Pf2eSystemAdapter();
    pf2eAdapter.handleProgrammaticPlacement(mockScene, mockDoc, {}, {}, {
        crosshairAdapter,
        pendingPlacements: pendingMap,
        placementKey: 'test_key'
    });

    await new Promise(r => setTimeout(r, 70));
    assert.ok(createdDocData);
    assert.equal(createdDocData.x, 250);
    assert.equal(createdDocData.y, 350);
    assert.equal(createdDocData.direction, 45);
    assert.equal(createdDocData.distance, 20);
    assert.equal(createdDocData._id, undefined);
});
