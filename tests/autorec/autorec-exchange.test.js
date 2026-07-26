import '../setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { autorecManager } from '../../src/autorec/autorecManager.js';
import { AUTOREC_EXCHANGE_VERSION, validateImportPackage, analyzeImportDiff, buildExportPackage } from '../../src/autorec/autorecExchange.js';

test('buildExportPackage creates a valid versioned export structure with sourceModule', () => {
    autorecManager.register('Fireball', {
        itemName: 'Fireball',
        circleFile: 'test.fireball.file',
        sourceModule: 'eskie-macro-pack'
    }, { local: true });

    const pkg = autorecManager.exportAutorecs({ sourceModule: 'BBC', description: 'Test Export' });
    assert.equal(pkg.version, AUTOREC_EXCHANGE_VERSION);
    assert.equal(pkg.sourceModule, 'BBC');
    assert.ok(Array.isArray(pkg.entries));

    const fireballEntry = pkg.entries.find(e => e.itemName === 'Fireball');
    assert.ok(fireballEntry);
    assert.equal(fireballEntry.sourceModule, 'eskie-macro-pack');
    assert.equal(fireballEntry.circleFile, 'test.fireball.file');

    autorecManager.unregister('Fireball', { local: true });
});

test('validateImportPackage throws errors on invalid version or corrupted items', () => {
    assert.throws(() => {
        validateImportPackage({ entries: [] });
    }, /missing required 'version' field/i);

    assert.throws(() => {
        validateImportPackage({ version: '99.0.0', entries: [] });
    }, /incompatible package version/i);

    assert.throws(() => {
        validateImportPackage({
            version: AUTOREC_EXCHANGE_VERSION,
            entries: [{ circleFile: 'no-name.png' }]
        });
    }, /missing required 'itemName' string/i);
});

test('analyzeImportDiff classifies new workflows, conflict overwrites, and identical items', () => {
    autorecManager.register('Lightning Bolt', {
        itemName: 'Lightning Bolt',
        borderColor: '#ff0000',
        borderAlpha: 0.8,
        sourceModule: 'test-mod'
    }, { local: true });

    autorecManager.register('Shield', {
        itemName: 'Shield',
        borderColor: '#00ff00',
        borderAlpha: 0.5
    }, { local: true });

    const testPkg = {
        version: AUTOREC_EXCHANGE_VERSION,
        sourceModule: 'import-source',
        entries: [
            // Conflict (will cause overwrite): Lightning Bolt has different border color
            {
                itemName: 'Lightning Bolt',
                borderColor: '#0000ff',
                borderAlpha: 0.8,
                sourceModule: 'imported-pack'
            },
            // Identical: Shield matches current parameters
            {
                itemName: 'Shield',
                borderColor: '#00ff00',
                borderAlpha: 0.5,
                sourceModule: 'imported-pack'
            },
            // Brand new workflow
            {
                itemName: 'Cure Wounds',
                borderColor: '#ffffff',
                borderAlpha: 1.0,
                sourceModule: 'imported-pack'
            }
        ]
    };

    const validated = validateImportPackage(testPkg);
    const diff = autorecManager.analyzeImportDiff(validated);

    assert.equal(diff.newEntries.length, 1);
    assert.equal(diff.newEntries[0].itemName, 'Cure Wounds');
    assert.equal(diff.newEntries[0].isNew, true);

    assert.equal(diff.conflictEntries.length, 1);
    assert.equal(diff.conflictEntries[0].itemName, 'Lightning Bolt');
    assert.equal(diff.conflictEntries[0].isConflict, true);
    assert.ok(diff.conflictEntries[0].differences.some(d => d.field === 'borderColor'));

    assert.equal(diff.identicalEntries.length, 1);
    assert.equal(diff.identicalEntries[0].itemName, 'Shield');

    autorecManager.unregister('Lightning Bolt', { local: true });
    autorecManager.unregister('Shield', { local: true });
});

test('importAutorecs in silent mode merges selected workflows into manager', async () => {
    const importPayload = JSON.stringify({
        version: AUTOREC_EXCHANGE_VERSION,
        sourceModule: 'eskie-macro-pack',
        entries: [
            {
                itemName: 'Ice Storm',
                borderColor: '#00ffff',
                sourceModule: 'eskie-macro-pack'
            }
        ]
    });

    const result = await autorecManager.importAutorecs(importPayload, {
        sourceModule: 'eskie-macro-pack',
        interactive: false
    });

    assert.equal(result.mergedCount, 1);
    assert.equal(autorecManager.has('Ice Storm'), true);

    const imported = autorecManager.getEntryByName('Ice Storm');
    assert.equal(imported.borderColor, '#00ffff');
    assert.equal(imported.sourceModule, 'eskie-macro-pack');

    autorecManager.unregister('Ice Storm', { local: true });
});

test('REGRESSION: export then immediate import of Faerie Fire produces zero spurious conflicts for stickToToken and limitRange', () => {
    autorecManager.register('Faerie Fire', {
        itemName: 'Faerie Fire',
        stickToToken: 'default',
        limitRange: false,
        sourceModule: 'world'
    }, { local: true });

    const exportedPkg = autorecManager.exportAutorecs({ sourceModule: 'world' });
    const validated = validateImportPackage(exportedPkg);
    const diff = autorecManager.analyzeImportDiff(validated);

    assert.equal(diff.conflictEntries.length, 0, 'Should have 0 conflict overwrites on exact round-trip');
    assert.equal(diff.identicalEntries.length, 1, 'Should classify exact exported item as identical');

    autorecManager.unregister('Faerie Fire', { local: true });
});

test('REGRESSION: modifying local scope property triggers conflict difference during import diff analysis', () => {
    autorecManager.register('Bless', {
        itemName: 'Bless',
        borderColor: '#ffff00',
        local: true
    }, { local: true });

    const importPkg = {
        version: AUTOREC_EXCHANGE_VERSION,
        sourceModule: 'BBC',
        entries: [
            {
                itemName: 'Bless',
                borderColor: '#ffff00',
                local: false
            }
        ]
    };

    const validated = validateImportPackage(importPkg);
    const diff = autorecManager.analyzeImportDiff(validated);

    assert.equal(diff.conflictEntries.length, 1);
    assert.equal(diff.conflictEntries[0].itemName, 'Bless');
    assert.ok(diff.conflictEntries[0].differences.some(d => d.field === 'local'));

    autorecManager.unregister('Bless', { local: true });
});
