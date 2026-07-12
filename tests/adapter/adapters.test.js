import '../setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { closest } from '../../src/lib/filemanager.js';
import { initializeFoundryAdapter, crosshairAdapter } from '../../src/adapter/foundry/index.js';
import { initializeSystemAdapter, systemAdapter } from '../../src/adapter/system/index.js';
import { registerPlacementHooks } from '../../src/adapter/index.js';
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

test('BaseSystemAdapter and Dnd5eSystemAdapter strictly NOP handleProgrammaticPlacement (Rule 2)', async () => {
    let createdCount = 0;
    let dismissCount = 0;
    const mockScene = {
        createEmbeddedDocuments: async (docName, data) => { createdCount++; return data; }
    };
    const mockCrosshairAdapter = {
        dismissPreview: (p) => { dismissCount++; }
    };
    const pendingMap = new Map([
        ['dnd_key', { resolved: true, cancelled: false, coords: { x: 100, y: 100 } }]
    ]);

    const baseAdapter = new (initializeSystemAdapter().constructor.__proto__)(); // BaseSystemAdapter
    baseAdapter.handleProgrammaticPlacement(mockScene, { documentName: 'MeasuredTemplate' }, {}, {}, {
        crosshairAdapter: mockCrosshairAdapter,
        pendingPlacements: pendingMap,
        placementKey: 'dnd_key'
    });

    const dndAdapter = new Dnd5eSystemAdapter();
    dndAdapter.handleProgrammaticPlacement(mockScene, { documentName: 'MeasuredTemplate' }, {}, {}, {
        crosshairAdapter: mockCrosshairAdapter,
        pendingPlacements: pendingMap,
        placementKey: 'dnd_key'
    });

    await new Promise(r => setTimeout(r, 70));
    assert.equal(createdCount, 0, 'BaseSystemAdapter and Dnd5eSystemAdapter must not programmatically create documents');
    assert.equal(dismissCount, 0, 'BaseSystemAdapter and Dnd5eSystemAdapter must not dismiss previews via timeout');
});

test('crosshairAdapter.dismissPreview is resilient against getter-only properties on PlaceableObjects', () => {
    let confirmCalled = false;
    let destroyCalled = false;

    class GetterOnlyPlaceable {
        get isPreview() { return true; }
        get visible() { return true; }
        get renderable() { return true; }
        _onConfirm() { confirmCalled = true; }
        destroy(opts) { destroyCalled = true; }
    }

    const customPlaceable = new GetterOnlyPlaceable();
    assert.doesNotThrow(() => {
        crosshairAdapter.dismissPreview(customPlaceable);
    });
    assert.equal(customPlaceable.isPreview, false);
    assert.equal(confirmCalled, true);
    assert.equal(destroyCalled, true);
});

test('extractPlacedStylingFlags and applyDocumentPlacement extract and set borderAlpha (V13)', () => {
    const config = {
        itemName: 'Electric Arc',
        placedFillColor: '#123456',
        placedFillAlpha: 0.5,
        placedBorderColor: '#abcdef',
        placedBorderAlpha: 0.85
    };
    const adapterV13 = new FoundryVTTV13Adapter();
    const extracted = adapterV13.extractPlacedStylingFlags(config);
    assert.equal(extracted.placedBorderAlpha, 0.85);
    assert.equal(extracted.flags.bbc.placedBorderAlpha, 0.85);

    let updatedData = null;
    const mockDoc = {
        updateSource: (data) => { updatedData = data; }
    };
    adapterV13.applyDocumentPlacement(mockDoc, { x: 50, y: 60 }, config);
    assert.equal(updatedData.fillColor, '#123456');
    assert.equal(updatedData.fillAlpha, 0.5);
    assert.equal(updatedData.borderColor, '#abcdef');
    assert.equal(updatedData.borderAlpha, 0.85);
    assert.equal(updatedData.flags.bbc.placedBorderAlpha, 0.85);
});

test('abstracted registerPlacementHooks combines both Foundry version adapter and System adapter without coupling', () => {
    const registered = [];
    const originalOn = globalThis.Hooks.on;
    try {
        globalThis.Hooks.on = (event, fn) => { registered.push(event); };
        const adapterV14 = new FoundryVTTV14Adapter();
        const pf2eSys = new Pf2eSystemAdapter();

        registerPlacementHooks({ onDrawPreview: () => {}, onPreCreate: () => {}, onCreate: () => {} }, {
            foundryAdapter: adapterV14,
            sysAdapter: pf2eSys
        });
        assert.ok(registered.includes('drawMeasuredTemplate'));
        assert.ok(registered.includes('drawMeasuredTemplatePF2e'));
        assert.ok(registered.includes('drawRegion'));
        assert.ok(registered.includes('drawRegionPF2e'));
        assert.ok(registered.includes('preCreateRegion'));
        assert.ok(registered.includes('preCreateMeasuredTemplate'));
        assert.ok(registered.includes('createRegion'));
        assert.ok(registered.includes('createMeasuredTemplate'));

        registered.length = 0;
        const adapterV13 = new FoundryVTTV13Adapter();
        const dndSys = new Dnd5eSystemAdapter();
        registerPlacementHooks({ onDrawPreview: () => {}, onPreCreate: () => {}, onCreate: () => {} }, {
            foundryAdapter: adapterV13,
            sysAdapter: dndSys
        });
        assert.ok(registered.includes('drawMeasuredTemplate'));
        assert.ok(registered.includes('drawMeasuredTemplate5e'));
        assert.equal(registered.includes('drawRegion'), false, 'V13 adapter does not register Region draw hooks');
        assert.ok(registered.includes('refreshMeasuredTemplate'));
        assert.ok(registered.includes('refreshMeasuredTemplate5e'));
    } finally {
        globalThis.Hooks.on = originalOn;
    }
});

test('FoundryVTTV14Adapter applyDocumentPlacement and updatePreviewShape handle both Region and MeasuredTemplate in V14', () => {
    const adapterV14 = new FoundryVTTV14Adapter();

    // 1. Test Region placement
    let regionUpdate = null;
    const regionDoc = {
        shapes: [{ toObject: () => ({ type: 'circle', x: 0, y: 0, radius: 15 }) }],
        updateSource: (data) => { regionUpdate = data; }
    };
    adapterV14.applyDocumentPlacement(regionDoc, { x: 100, y: 200, radius: 20, gridUnits: false }, { itemName: 'Test Region', placedFillColor: '#ffffff' });
    assert.ok(regionUpdate.shapes);
    assert.equal(regionUpdate.shapes[0].x, 100);
    assert.equal(regionUpdate.shapes[0].y, 200);
    assert.equal(regionUpdate.shapes[0].radius, 20);
    assert.equal(regionUpdate.color, '#ffffff');

    // 2. Test MeasuredTemplate placement in V14
    let mtUpdate = null;
    const mtDoc = {
        t: 'circle',
        updateSource: (data) => { mtUpdate = data; }
    };
    adapterV14.applyDocumentPlacement(mtDoc, { x: 150, y: 250, direction: 90, distance: 30 }, { itemName: 'Test MT', placedFillColor: '#ff0000', placedBorderColor: '#00ff00', placedFillAlpha: 0.4, placedBorderAlpha: 0.9 });
    assert.equal(mtUpdate.x, 150);
    assert.equal(mtUpdate.y, 250);
    assert.equal(mtUpdate.direction, 90);
    assert.equal(mtUpdate.distance, 30);
    assert.equal(mtUpdate.fillColor, '#ff0000');
    assert.equal(mtUpdate.borderColor, '#00ff00');
    assert.equal(mtUpdate.fillAlpha, 0.4);
    assert.equal(mtUpdate.borderAlpha, 0.9);

    // 3. Test updatePreviewShape on both Region and MeasuredTemplate
    const regionPreview = { shapes: [{ toObject: () => ({ x: 0, y: 0, radius: 5 }) }] };
    adapterV14.updatePreviewShape(regionPreview, { x: 300, y: 400, radius: 10, gridUnits: false });
    assert.equal(regionPreview.shapes[0].x, 300);
    assert.equal(regionPreview.shapes[0].y, 400);

    const mtPreview = { t: 'cone', x: 0, y: 0, direction: 0, distance: 0 };
    adapterV14.updatePreviewShape(mtPreview, { x: 500, y: 600, direction: 45, distance: 40 });
    assert.equal(mtPreview.x, 500);
    assert.equal(mtPreview.y, 600);
    assert.equal(mtPreview.direction, 45);
    assert.equal(mtPreview.distance, 40);
});

test('Pf2eSystemAdapter handleProgrammaticPlacement branches between Region shapes and MeasuredTemplate coordinates', async () => {
    const pf2eAdapter = new Pf2eSystemAdapter();
    let createdDocData = null;
    const mockScene = {
        createEmbeddedDocuments: async (docName, data) => { createdDocData = data[0]; return data; }
    };

    // Test Region programmatic placement
    const regionPendingMap = new Map([
        ['reg_key', { resolved: true, cancelled: false, coords: { x: 120, y: 220, radius: 25, gridUnits: false } }]
    ]);
    const mockRegionDoc = {
        documentName: 'Region',
        toObject: () => ({ shapes: [{ type: 'circle', x: 0, y: 0, radius: 5, toObject: () => ({ type: 'circle', x: 0, y: 0, radius: 5 }) }], _id: 'temp_reg' }),
        flags: {}
    };

    const mockCrosshairAdapter = new FoundryVTTV14Adapter();
    pf2eAdapter.handleProgrammaticPlacement(mockScene, mockRegionDoc, {}, {}, {
        crosshairAdapter: mockCrosshairAdapter,
        pendingPlacements: regionPendingMap,
        placementKey: 'reg_key'
    });

    await new Promise(r => setTimeout(r, 70));
    assert.ok(createdDocData);
    assert.ok(createdDocData.shapes);
    assert.equal(createdDocData.shapes[0].x, 120);
    assert.equal(createdDocData.shapes[0].y, 220);
    assert.equal(createdDocData.shapes[0].radius, 25);
    assert.equal(createdDocData._id, undefined);
});

test('hidePreview safely hides PIXI containers immediately and overrides refresh and _refresh methods', () => {
    const mockPlaceable = {
        visible: true,
        renderable: true,
        alpha: 1,
        template: { visible: true, renderable: true, alpha: 1 },
        mesh: { visible: true, renderable: true, alpha: 1 },
        shape: { visible: true, renderable: true, alpha: 1 },
        border: { visible: true, renderable: true, alpha: 1 },
        ruler: { visible: true, renderable: true, text: '20 ft' },
        controlIcon: { visible: true }
    };

    crosshairAdapter.hidePreview(mockPlaceable);

    assert.equal(mockPlaceable.visible, false);
    assert.equal(mockPlaceable.renderable, false);
    assert.equal(mockPlaceable.alpha, 0);
    assert.equal(mockPlaceable.template.visible, false);
    assert.equal(mockPlaceable.mesh.visible, false);
    assert.equal(mockPlaceable.shape.visible, false);
    assert.equal(mockPlaceable.border.visible, false);
    assert.equal(mockPlaceable.ruler.visible, false);
    assert.equal(mockPlaceable.controlIcon.visible, false);

    // Simulate mouse move triggering refresh and _refresh
    mockPlaceable.visible = true;
    mockPlaceable.mesh.visible = true;
    mockPlaceable.refresh();
    assert.equal(mockPlaceable.visible, false);
    assert.equal(mockPlaceable.mesh.visible, false);

    mockPlaceable.visible = true;
    mockPlaceable.shape.visible = true;
    if (typeof mockPlaceable._refresh === 'function') {
        mockPlaceable._refresh();
    }
    assert.equal(mockPlaceable.visible, false);
    assert.equal(mockPlaceable.shape.visible, false);
});

test('crosshairAdapter.isPreview reliably recognizes both Region and MeasuredTemplate unpersisted previews', () => {
    const adapter = new FoundryVTTV14Adapter();
    const mtPreview = { isPreview: true, document: { id: null } };
    assert.equal(adapter.isPreview(mtPreview), true);

    const regionPreview = { document: { id: undefined } };
    assert.equal(adapter.isPreview(regionPreview), true);

    const persistedRegion = { isPreview: false, document: { id: 'reg_abc123' } };
    assert.equal(adapter.isPreview(persistedRegion), false);
});

test('FoundryVTTV14Adapter and Pf2eSystemAdapter handle Collection shapes via .contents and Region behaviors', () => {
    const adapterV14 = new FoundryVTTV14Adapter();
    const pf2eAdapter = new Pf2eSystemAdapter();

    // Collection .contents shape checking
    const mockRegionDoc = {
        shapes: {
            contents: [{
                type: 'circle',
                radius: 30,
                x: 0,
                y: 0,
                toObject: () => ({ type: 'circle', radius: 30, x: 0, y: 0 })
            }]
        }
    };
    const props = adapterV14.detectProperties(mockRegionDoc);
    assert.equal(props.type, 'circle');
    assert.ok(props.radius > 0);

    // Region behaviors item origin check in PF2e
    globalThis.foundry.utils.fromUuidSync = (uuid) => {
        if (uuid === 'Item.RegionBehaviorOrigin') return { id: '999', name: 'Aura of Protection' };
        return null;
    };

    const docWithBehavior = {
        flags: {},
        behaviors: {
            contents: [{
                flags: { pf2e: { origin: 'Item.RegionBehaviorOrigin' } }
            }]
        }
    };
    const ctx = pf2eAdapter.extractCallingContext(docWithBehavior, {});
    assert.equal(ctx.itemName, 'Aura of Protection');
    assert.equal(ctx.itemId, '999');
});

test('closest(path) invokes dependency validation, throwing Error with trailing newline when required module is unactivated', () => {
    // Ensure eskie modules return as unactivated in mock game objects
    const origModulesGet = globalThis.game?.modules?.get;
    if (globalThis.game?.modules) {
        globalThis.game.modules.get = (id) => ({ active: false, version: '1.0.0' });
    }

    try {
        assert.throws(
            () => closest('eskie.crosshair.cone.thin.fantasy_01.white.full'),
            (err) => err instanceof Error && err.message.endsWith('\n') && (err.message.includes('BBC.Dependency.RequiresOne') || err.message.includes('Requires at least one of the following'))
        );
    } finally {
        if (globalThis.game?.modules && origModulesGet) {
            globalThis.game.modules.get = origModulesGet;
        }
    }
});
