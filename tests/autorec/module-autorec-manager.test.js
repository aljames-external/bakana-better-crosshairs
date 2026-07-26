import '../setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { autorecManager } from '../../src/autorec/autorecManager.js';
import { ModuleAutorecManager } from '../../src/autorec/moduleAutorecManager.js';
import { AUTOREC_EXCHANGE_VERSION } from '../../src/autorec/autorecExchange.js';

test('ModuleAutorecManager registers macros tagged with module-id', () => {
    const packManager = autorecManager.forModule('eskie-macro-pack');
    const callableManager = autorecManager('eskie-macro-pack');
    assert.ok(packManager instanceof ModuleAutorecManager);
    assert.ok(callableManager instanceof ModuleAutorecManager);
    assert.equal(packManager.moduleId, 'eskie-macro-pack');
    assert.equal(callableManager.moduleId, 'eskie-macro-pack');

    packManager.register('tiger-attunement', {
        circleFile: 'jb2a.tiger.orange',
        enabled: true
    }, { local: true });

    assert.equal(autorecManager.has('tiger-attunement'), true);
    const entry = autorecManager.getEntryByName('tiger-attunement');
    assert.ok(entry);
    assert.equal(entry.sourceModule, 'eskie-macro-pack');
    assert.equal(entry.circleFile, 'jb2a.tiger.orange');

    const packList = packManager.list();
    assert.ok(packList.includes('tiger-attunement'));

    const packEntries = packManager.getAllEntries();
    assert.equal(packEntries.length, 1);
    assert.equal(packEntries[0].itemName, 'tiger-attunement');

    packManager.unregister('tiger-attunement', { local: true });
    assert.equal(autorecManager.has('tiger-attunement'), false);
});

test('ModuleAutorecManager batch registerMany and unregisterMany tag entries with module-id', async () => {
    const packManager = new ModuleAutorecManager('sao-effect-pack');

    await packManager.registerMany([
        { macroId: 'sao-death', config: { circleFile: 'sao.red.circle' }, local: true },
        { macroId: 'sao-resurrection', config: { circleFile: 'sao.gold.circle' }, local: true }
    ], { persist: false });

    const death = autorecManager.getEntryByName('sao-death');
    const res = autorecManager.getEntryByName('sao-resurrection');

    assert.ok(death);
    assert.equal(death.sourceModule, 'sao-effect-pack');
    assert.ok(res);
    assert.equal(res.sourceModule, 'sao-effect-pack');

    await packManager.unregisterMany(['sao-death', 'sao-resurrection'], { local: true });
    assert.equal(autorecManager.has('sao-death'), false);
    assert.equal(autorecManager.has('sao-resurrection'), false);
});

test('ModuleAutorecManager.importAutorecs updates module tag on all imported elements to module-id', async () => {
    const packManager = autorecManager.forModule('custom-spells-pack');

    const jsonPayload = JSON.stringify({
        version: AUTOREC_EXCHANGE_VERSION,
        sourceModule: 'original-exporter-module',
        entries: [
            {
                itemName: 'Chromatic Orb',
                circleFile: 'chromatic.png',
                sourceModule: 'some-old-module'
            },
            {
                itemName: 'Hologram Wall',
                squareFile: 'hologram.png',
                sourceModule: 'another-old-module'
            }
        ]
    });

    const result = await packManager.importAutorecs(jsonPayload, { interactive: false });
    assert.equal(result.mergedCount, 2);

    const orb = autorecManager.getEntryByName('Chromatic Orb');
    const wall = autorecManager.getEntryByName('Hologram Wall');

    assert.ok(orb);
    assert.equal(orb.sourceModule, 'custom-spells-pack', 'All elements imported via module manager should have module tag updated to module-id');

    assert.ok(wall);
    assert.equal(wall.sourceModule, 'custom-spells-pack', 'All elements imported via module manager should have module tag updated to module-id');

    autorecManager.unregister('Chromatic Orb', { local: true });
    autorecManager.unregister('Hologram Wall', { local: true });
});

test('Game settings import (overrideSourceModule: null) preserves existing module-ids in JSON as-is', async () => {
    const jsonPayload = JSON.stringify({
        version: AUTOREC_EXCHANGE_VERSION,
        sourceModule: 'global-backup',
        entries: [
            {
                itemName: 'Grapple Effect',
                lineFile: 'grapple.png',
                sourceModule: 'eskie-macro-pack'
            },
            {
                itemName: 'Rage Aura',
                circleFile: 'rage.png',
                sourceModule: 'barbarian-mod'
            }
        ]
    });

    const result = await autorecManager.importAutorecs(jsonPayload, {
        sourceModule: 'world',
        overrideSourceModule: null,
        interactive: false
    });

    assert.equal(result.mergedCount, 2);

    const grapple = autorecManager.getEntryByName('Grapple Effect');
    const rage = autorecManager.getEntryByName('Rage Aura');

    assert.ok(grapple);
    assert.equal(grapple.sourceModule, 'eskie-macro-pack', 'Game settings import must preserve existing module-id as-is');

    assert.ok(rage);
    assert.equal(rage.sourceModule, 'barbarian-mod', 'Game settings import must preserve existing module-id as-is');

    autorecManager.unregister('Grapple Effect', { local: true });
    autorecManager.unregister('Rage Aura', { local: true });
});

test('ModuleAutorecManager.importAutorecs can accept raw array JSON strings or arrays directly', async () => {
    const packManager = autorecManager('raw-array-pack');

    const rawArrayJson = JSON.stringify([
        {
            itemName: 'Totemic Tiger Slash',
            circleFile: 'tiger-slash.png'
        },
        {
            itemName: 'SAO Death Burst',
            circleFile: 'sao-burst.png'
        }
    ]);

    const result = await packManager.importAutorecs(rawArrayJson, { interactive: false });
    assert.equal(result.mergedCount, 2);

    const slash = autorecManager.getEntryByName('Totemic Tiger Slash');
    const burst = autorecManager.getEntryByName('SAO Death Burst');

    assert.ok(slash);
    assert.equal(slash.sourceModule, 'raw-array-pack');
    assert.ok(burst);
    assert.equal(burst.sourceModule, 'raw-array-pack');

    autorecManager.unregister('Totemic Tiger Slash', { local: true });
    autorecManager.unregister('SAO Death Burst', { local: true });
});
