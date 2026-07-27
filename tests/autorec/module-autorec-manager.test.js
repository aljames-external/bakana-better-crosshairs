import '../setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { autorecManager } from '../../src/autorec/autorecManager.js';
import { ModuleAutorecManager } from '../../src/autorec/moduleAutorecManager.js';
import { AUTOREC_EXCHANGE_VERSION } from '../../src/autorec/autorecExchange.js';

test('ModuleAutorecManager.register and .unregister require arrays of elements', async () => {
    assert.throws(
        () => autorecManager('world'),
        /cannot use reserved module-id 'world'/
    );
    assert.throws(
        () => new ModuleAutorecManager('WORLD'),
        /cannot use reserved module-id 'world'/
    );

    const packManager = autorecManager('eskie-content-pack');
    assert.ok(packManager instanceof ModuleAutorecManager);
    assert.equal(packManager.moduleId, 'eskie-content-pack');

    // Passing non-array to register must throw
    await assert.rejects(
        async () => packManager.register({ itemName: 'Single Item' }),
        /requires an array of registration entries/
    );

    // Passing array of entries succeeds
    await packManager.register([
        {
            itemName: 'Tiger Attunement',
            config: { circleFile: 'jb2a.tiger.orange', enabled: true }
        },
        {
            itemName: 'SAO Death Burst',
            config: { circleFile: 'sao.red.circle' }
        }
    ], { persist: false });

    assert.equal(autorecManager.has('Tiger Attunement'), true);
    assert.equal(autorecManager.has('SAO Death Burst'), true);

    const entry = autorecManager.getEntryByName('Tiger Attunement');
    assert.ok(entry);
    assert.equal(entry.sourceModule, 'eskie-content-pack');
    assert.equal(entry.circleFile, 'jb2a.tiger.orange');

    const packList = packManager.list();
    assert.ok(packList.includes('Tiger Attunement'));
    assert.ok(packList.includes('SAO Death Burst'));

    const packEntries = packManager.getAllEntries();
    assert.equal(packEntries.length, 2);

    // Test activityName filter registration
    await packManager.register([
        {
            itemName: 'Longbow',
            activityName: 'Ranged Attack',
            config: { rayFile: 'jb2a.arrow.white' }
        }
    ], { persist: false });

    const longbowEntries = packManager.getAllEntries().filter(e => e.itemName === 'Longbow');
    assert.equal(longbowEntries.length, 1);
    assert.equal(longbowEntries[0].activityName, 'Ranged Attack');
    assert.equal(longbowEntries[0].sourceModule, 'eskie-content-pack');

    // Passing non-array to unregister must throw
    await assert.rejects(
        async () => packManager.unregister('Tiger Attunement'),
        /requires an array of item names/
    );

    // Passing array of string keys succeeds
    await packManager.unregister(['Tiger Attunement', 'SAO Death Burst', 'Longbow | Ranged Attack'], { local: true });
    assert.equal(autorecManager.has('Tiger Attunement'), false);
    assert.equal(autorecManager.has('SAO Death Burst'), false);
});

test('ModuleAutorecManager.import updates module tag on all imported elements to module-id', async () => {
    const packManager = autorecManager('custom-spells-pack');

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

    const result = await packManager.import(jsonPayload, { interactive: false });
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
                sourceModule: 'eskie-content-pack'
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
    assert.equal(grapple.sourceModule, 'eskie-content-pack', 'Game settings import must preserve existing module-id as-is');

    assert.ok(rage);
    assert.equal(rage.sourceModule, 'barbarian-mod', 'Game settings import must preserve existing module-id as-is');

    autorecManager.unregister('Grapple Effect', { local: true });
    autorecManager.unregister('Rage Aura', { local: true });
});

test('ModuleAutorecManager.import and .export work cleanly', async () => {
    const packManager = autorecManager('raw-array-pack');

    const rawArrayJson = JSON.stringify([
        {
            itemName: 'Totemic Tiger Slash',
            file: { circle: 'tiger-slash.png' }
        },
        {
            itemName: 'SAO Death Wave',
            file: { circle: 'sao-wave.png' }
        }
    ]);

    const result = await packManager.import(rawArrayJson, { interactive: false });
    assert.equal(result.mergedCount, 2);

    const slash = autorecManager.getEntryByName('Totemic Tiger Slash');
    const burst = autorecManager.getEntryByName('SAO Death Wave');

    assert.ok(slash);
    assert.equal(slash.sourceModule, 'raw-array-pack');
    assert.ok(burst);
    assert.equal(burst.sourceModule, 'raw-array-pack');

    const exported = packManager.export({ description: 'Export test' });
    assert.equal(exported.module, 'raw-array-pack');
    assert.equal(exported.entries.length, 2);

    autorecManager.unregister('Totemic Tiger Slash', { local: true });
    autorecManager.unregister('SAO Death Wave', { local: true });
});

test('ModuleAutorecManager preserves distinct composite keys for multiple activities on same item name', async () => {
    const packManager = autorecManager('multi-activity-pack');

    await packManager.register([
        {
            itemName: 'Longbow',
            activityName: 'Ranged Attack',
            config: { rayFile: 'jb2a.arrow.white', enabled: true }
        },
        {
            itemName: 'Longbow',
            activityName: 'Melee Strike',
            config: { circleFile: 'jb2a.club.white', enabled: true }
        },
        {
            itemName: 'Longbow',
            config: { circleFile: 'jb2a.bow.fallback', enabled: true }
        }
    ], { persist: false });

    assert.equal(packManager.has('Longbow'), true);
    assert.equal(packManager.has('Longbow', 'Ranged Attack'), true);
    assert.equal(packManager.has('Longbow', 'Melee Strike'), true);

    const rangedEntry = packManager.get('Longbow', 'Ranged Attack');
    const meleeEntry = packManager.get('Longbow', 'Melee Strike');
    const fallbackEntry = packManager.get('Longbow');

    assert.ok(rangedEntry);
    assert.ok(meleeEntry);
    assert.ok(fallbackEntry);
    assert.equal(rangedEntry.rayFile, 'jb2a.arrow.white');
    assert.equal(meleeEntry.circleFile, 'jb2a.club.white');
    assert.equal(fallbackEntry.circleFile, 'jb2a.bow.fallback');

    const allLongbowCandidates = packManager.getEntriesForItem('Longbow');
    assert.equal(allLongbowCandidates.length, 3);
    assert.equal(allLongbowCandidates[0].activityName, 'Ranged Attack');
    assert.equal(allLongbowCandidates[1].activityName, 'Melee Strike');
    assert.equal(Boolean(allLongbowCandidates[2].hasActivity), false);

    await packManager.unregister(['Longbow']);
    assert.equal(packManager.has('Longbow'), false);
    assert.equal(packManager.has('Longbow', 'Ranged Attack'), false);
});
