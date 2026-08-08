import '../setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { closest } from '../../src/lib/filemanager.js';
import { initializeFoundryAdapter, crosshairAdapter, BaseFoundryVTTAdapter } from '../../src/adapter/foundry/index.js';
import { initializeSystemAdapter, systemAdapter } from '../../src/adapter/system/index.js';
import { registerPlacementHooks, initializeHooks } from '../../src/adapter/index.js';
import { snapCoordinates, attachWheelRotation, detachWheelRotation, resolveCrosshairPlacement, alignCrosshairAndEffects, shouldStickToToken } from '../../src/crosshair/util.js';
import { BaseCrosshairShape } from '../../src/crosshair/base.js';
import { Token } from '../../src/lib/compat.js';
import { autorecManager } from '../../src/autorec/autorecManager.js';
import { FoundryVTTV13Adapter } from '../../src/adapter/foundry/foundryvtt-v13-adapter.js';
import { FoundryVTTV14Adapter } from '../../src/adapter/foundry/foundryvtt-v14-adapter.js';
import { Dnd5eSystemAdapter } from '../../src/adapter/system/dnd5e-adapter.js';
import { Pf2eSystemAdapter } from '../../src/adapter/system/pf2e-adapter.js';
import { Pf1SystemAdapter } from '../../src/adapter/system/pf1-adapter.js';

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

    globalThis.game.system.id = "pf1";
    sysAdapter = initializeSystemAdapter();
    assert.ok(sysAdapter instanceof Pf1SystemAdapter);
    assert.equal(sysAdapter.systemId, 'pf1');
    assert.equal(sysAdapter.supportsActivities, false);
    assert.equal(systemAdapter, sysAdapter);

    globalThis.game.system.id = "pf";
    sysAdapter = initializeSystemAdapter();
    assert.ok(sysAdapter instanceof Pf1SystemAdapter);
    assert.equal(sysAdapter.systemId, 'pf');
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
    let destroyCalled = false;
    const mockPlaceable = {
        destroy(opts) { destroyCalled = true; }
    };

    crosshairAdapter.dismissPreview(mockPlaceable);
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
    let destroyCalled = false;

    class GetterOnlyPlaceable {
        get isPreview() { return true; }
        get visible() { return true; }
        get renderable() { return true; }
        destroy(opts) { destroyCalled = true; }
    }

    const customPlaceable = new GetterOnlyPlaceable();
    assert.doesNotThrow(() => {
        crosshairAdapter.dismissPreview(customPlaceable);
    });
    assert.equal(customPlaceable.isPreview, false);
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
    const styling = adapterV13.extractPlacedStylingFlags({
        placedFillColor: '#ff0000',
        placedFillAlpha: 0.5,
        placedBorderColor: '#fc753b',
        placedBorderAlpha: 0.6,
        postPlacementCode: 'console.log("test");'
    });

    assert.equal(styling.placedFillColor, '#ff0000');
    assert.equal(styling.placedFillAlpha, 0.5);
    assert.equal(styling.placedBorderColor, '#fc753b');
    assert.equal(styling.placedBorderAlpha, 0.6);
    assert.equal(styling.flags.bbc.placedBorderAlpha, 0.6);
    assert.equal(styling.flags.bbc.placedBorderColor, '#fc753b');

    // Test handleMeasuredTemplateRefresh syncing bbc flags across PIXI 7 graphicsData and PIXI 8 instructions
    const mockTemplate = {
        isPreview: false,
        document: {
            id: 'placed_tmpl_123',
            flags: {
                bbc: {
                    placedBorderColor: '#fc753b',
                    placedBorderAlpha: 0.6,
                    placedFillColor: '#ff0000',
                    placedFillAlpha: 0.5
                }
            },
            borderColor: '#000000',
            borderAlpha: 1
        },
        template: {
            geometry: {
                graphicsData: [
                    { lineStyle: { width: 2, color: 0x000000, alpha: 1 }, fillStyle: { color: 0xffffff, alpha: 1 } }
                ],
                invalidate: () => {}
            },
            instructions: [
                { action: 'stroke', data: { width: 2, color: 0x000000, alpha: 1 } },
                { action: 'fill', data: { color: 0xffffff, alpha: 1 } }
            ]
        }
    };

    adapterV13.handleMeasuredTemplateRefresh(mockTemplate);
    assert.equal(mockTemplate.document.borderColor, '#fc753b');
    assert.equal(mockTemplate.document.borderAlpha, 0.6);
    assert.equal(mockTemplate.template.geometry.graphicsData[0].lineStyle.color, 0xfc753b);
    assert.equal(mockTemplate.template.geometry.graphicsData[0].lineStyle.alpha, 0.6);
    assert.equal(mockTemplate.template.instructions[0].data.color, 0xfc753b);
    assert.equal(mockTemplate.template.instructions[0].data.alpha, 0.6);
    assert.equal(mockTemplate.template.instructions[1].data.color, 0xff0000);
    assert.equal(mockTemplate.template.instructions[1].data.alpha, 0.5);

    // Verify handleMeasuredTemplateRefresh ignores previews
    const previewTemplate = {
        isPreview: true,
        document: {
            id: null,
            flags: { bbc: { placedBorderColor: '#ff0000', placedFillColor: '#00ff00' } },
            borderColor: '#000000',
            fillColor: '#ffffff'
        }
    };
    adapterV13.handleMeasuredTemplateRefresh(previewTemplate);
    assert.equal(previewTemplate.document.borderColor, '#000000', 'Preview template borderColor should not be overwritten by placed border color');
    assert.equal(previewTemplate.document.fillColor, '#ffffff', 'Preview template fillColor should not be overwritten by placed fill color');
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
    } finally {
        globalThis.Hooks.on = originalOn;
    }
});

test('generatePlacementHooks encapsulates version-specific hook generation and allows system adapter modification', () => {
    const adapterV14 = new FoundryVTTV14Adapter();
    const mockCallbacks = { onDrawPreview: () => {}, onPreCreate: () => {}, onCreate: () => {} };

    // 1. Verify standard generation returns structured hook descriptor objects
    const baseHooks = adapterV14.generatePlacementHooks(mockCallbacks, new Pf2eSystemAdapter());
    assert.ok(Array.isArray(baseHooks));
    const drawTemplateHook = baseHooks.find(h => h.event === 'drawMeasuredTemplate');
    assert.ok(drawTemplateHook);
    assert.equal(drawTemplateHook.category, 'draw');
    assert.equal(drawTemplateHook.targetName, 'MeasuredTemplate');
    assert.equal(typeof drawTemplateHook.handler, 'function');

    // 2. Verify system adapter getCustomDocumentTypes and modifyPlacementHooks can customize hook generation elements
    class CustomSystemAdapter extends Pf2eSystemAdapter {
        getCustomDocumentTypes() {
            return ['CustomPlaceableDoc'];
        }
        modifyPlacementHooks(hooks, callbacks, fAdapter) {
            // Filter out refresh hooks and append a custom hook
            const filtered = hooks.filter(h => h.category !== 'refresh');
            filtered.push({ event: 'customSystemHook', handler: () => {}, category: 'custom', targetName: 'CustomSystem' });
            return filtered;
        }
    }

    const customSys = new CustomSystemAdapter();
    const modifiedHooks = adapterV14.generatePlacementHooks(mockCallbacks, customSys);
    assert.ok(modifiedHooks.some(h => h.event === 'preCreateCustomPlaceableDoc'));
    assert.ok(modifiedHooks.some(h => h.event === 'createCustomPlaceableDoc'));
    assert.ok(modifiedHooks.some(h => h.event === 'customSystemHook'));
    assert.equal(modifiedHooks.some(h => h.category === 'refresh'), false);
});

test('BaseFoundryVTTAdapter strictly quarantines hook generation to version subclasses by throwing on abstract invocation', () => {
    const baseAdapter = new BaseFoundryVTTAdapter();
    assert.throws(() => baseAdapter.supportedBasePlaceables, /Subclasses of BaseFoundryVTTAdapter must implement supportedBasePlaceables/);
    assert.throws(() => baseAdapter.supportedDocumentTypes, /Subclasses of BaseFoundryVTTAdapter must implement supportedDocumentTypes/);
    assert.throws(() => baseAdapter.generatePlacementHooks({}, {}), /Subclasses of BaseFoundryVTTAdapter must implement generatePlacementHooks/);
    assert.throws(() => baseAdapter.registerPlacementHooks({}, {}), /Subclasses of BaseFoundryVTTAdapter must implement generatePlacementHooks/);
});

test('FoundryVTTV14Adapter applyDocumentPlacement and updatePreviewShape handle both Region and MeasuredTemplate in V14', () => {
    const adapterV14 = new FoundryVTTV14Adapter();

    // 1. Test Region placement
    let regionUpdate = null;
    const regionDoc = {
        shapes: [{ toObject: () => ({ type: 'circle', x: 0, y: 0, radius: 15 }) }],
        updateSource: (data) => { regionUpdate = data; }
    };
    adapterV14.applyDocumentPlacement(regionDoc, { x: 100, y: 200, radius: 20, gridUnits: false }, { itemName: 'Test Region', placedFillColor: '#ffffff', placedBorderColor: '#00ff00', placedFillAlpha: 0.4, placedBorderAlpha: 0.8 });
    assert.ok(regionUpdate.shapes);
    assert.equal(regionUpdate.shapes[0].x, 100);
    assert.equal(regionUpdate.shapes[0].y, 200);
    assert.equal(regionUpdate.shapes[0].radius, 20);
    assert.equal(regionUpdate.color, '#ffffff');
    assert.equal(regionUpdate.borderColor, undefined);
    assert.equal(regionUpdate.fillColor, undefined);
    assert.equal(regionUpdate.alpha, undefined);
    assert.equal(regionUpdate.flags.bbc.placedBorderColor, '#00ff00');
    assert.equal(regionUpdate.flags.bbc.placedFillColor, '#ffffff');
    assert.equal(regionUpdate.flags.bbc.placedFillAlpha, 0.4);
    assert.equal(regionUpdate.flags.bbc.placedBorderAlpha, 0.8);

    // 2. Test MeasuredTemplate placement
    let templateUpdate = null;
    const templateDoc = {
        t: 'circle',
        updateSource: (data) => { templateUpdate = data; }
    };
    adapterV14.applyDocumentPlacement(templateDoc, { x: 300, y: 400, distance: 30 }, { itemName: 'Test Template', placedFillColor: '#ff0000', placedBorderColor: '#0000ff' });
    assert.equal(templateUpdate.x, 300);
    assert.equal(templateUpdate.y, 400);
    assert.equal(templateUpdate.distance, 30);
    assert.equal(templateUpdate.fillColor, '#ff0000');
    assert.equal(templateUpdate.borderColor, '#0000ff');

    // 3. Test updatePreviewShape
    const shapePreviewDoc = { shapes: [{ toObject: () => ({ _id: 'old_id', type: 'circle', x: 0, y: 0, radius: 10 }) }] };
    adapterV14.updatePreviewShape(shapePreviewDoc, { x: 150, y: 250, radius: 35, gridUnits: false });
    assert.equal(shapePreviewDoc.shapes[0].x, 150);
    assert.equal(shapePreviewDoc.shapes[0].y, 250);
    assert.equal(shapePreviewDoc.shapes[0].radius, 35);
    assert.equal(shapePreviewDoc.shapes[0]._id, undefined); // Rule 9: no _id property on updated shape

    const templatePreviewDoc = { t: 'cone' };
    adapterV14.updatePreviewShape(templatePreviewDoc, { x: 50, y: 60, direction: 45, distance: 20 });
    assert.equal(templatePreviewDoc.x, 50);
    assert.equal(templatePreviewDoc.y, 60);
    assert.equal(templatePreviewDoc.direction, 45);
    assert.equal(templatePreviewDoc.distance, 20);
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

    const editedPersistedRegion = { isPreview: true, document: { id: 'reg_abc123' } };
    assert.equal(adapter.isPreview(editedPersistedRegion), false);
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

test('crosshair.util.attachWheelRotation delegates Control key requirement to systemAdapter.requiresWheelModifier()', () => {
    let addedEvent = null;
    let addedOptions = null;
    let addedHandler = null;
    const origAddEvent = globalThis.window?.addEventListener;
    const origRemoveEvent = globalThis.window?.removeEventListener;
    try {
        if (!globalThis.window) globalThis.window = {};
        globalThis.window.addEventListener = (event, handler, options) => {
            if (event === 'wheel') {
                addedEvent = event;
                addedHandler = handler;
                addedOptions = options;
            }
        };
        globalThis.window.removeEventListener = () => {};

        // 1. Verify PF2e system adapter requires Ctrl key
        const origRequiresWheel = systemAdapter.requiresWheelModifier;
        systemAdapter.requiresWheelModifier = () => true;

        const config = { direction: 0 };
        attachWheelRotation(null, config);

        assert.equal(addedEvent, 'wheel');
        assert.equal(addedOptions.passive, false);
        assert.equal(typeof addedHandler, 'function');

        // Simulate wheel scroll WITHOUT ctrlKey -> should NOT rotate when required by system
        let preventDefaultCalled = false;
        addedHandler({ ctrlKey: false, deltaY: 100, preventDefault: () => { preventDefaultCalled = true; } });
        assert.equal(config.currentDirection, 0);
        assert.equal(preventDefaultCalled, false);

        // Simulate wheel scroll WITH ctrlKey -> should rotate
        addedHandler({ ctrlKey: true, deltaY: 100, preventDefault: () => { preventDefaultCalled = true; } });
        assert.equal(config.currentDirection, 5);
        assert.equal(preventDefaultCalled, true);

        // 2. Verify base/dnd5e system adapter does NOT require Ctrl key
        systemAdapter.requiresWheelModifier = () => false;
        preventDefaultCalled = false;
        addedHandler({ ctrlKey: false, deltaY: 100, preventDefault: () => { preventDefaultCalled = true; } });
        assert.equal(config.currentDirection, 10); // Rotated 5 more degrees without Ctrl key
        assert.equal(preventDefaultCalled, true);

        systemAdapter.requiresWheelModifier = origRequiresWheel;
        detachWheelRotation();
    } finally {
        if (globalThis.window) {
            globalThis.window.addEventListener = origAddEvent;
            globalThis.window.removeEventListener = origRemoveEvent;
        }
    }
});

test('crosshair.util.attachWheelRotation synchronizes container and effect rotation across cones, squares, and circles without fighting internal anchors', () => {
    let wheelHandler = null;
    const origAddEvent = globalThis.window?.addEventListener;
    const origRemoveEvent = globalThis.window?.removeEventListener;
    try {
        if (!globalThis.window) globalThis.window = {};
        globalThis.window.addEventListener = (event, handler) => {
            if (event === 'wheel') wheelHandler = handler;
        };
        globalThis.window.removeEventListener = () => {};

        // 1. Verify Cone rotation sync
        const coneConfig = { type: 'cone', direction: 0 };
        const mockConeCrosshair = { rotation: 0, direction: 0 };
        attachWheelRotation(mockConeCrosshair, coneConfig);
        wheelHandler({ ctrlKey: true, deltaY: 100 });
        assert.equal(mockConeCrosshair.rotation, 5 * (Math.PI / 180));
        assert.equal(mockConeCrosshair.direction, 5);

        // 2. Verify Square rotation sync
        const squareConfig = { type: 'rect', direction: 0 };
        const mockSquareCrosshair = { rotation: 0, direction: 0 };
        attachWheelRotation(mockSquareCrosshair, squareConfig);
        wheelHandler({ ctrlKey: true, deltaY: 100 });
        assert.equal(mockSquareCrosshair.rotation, 0);
        assert.equal(mockSquareCrosshair.direction, 5);

        // 3. Verify Circle rotation sync
        const circleConfig = { type: 'circle', direction: 0 };
        const mockCircleCrosshair = { rotation: 0, direction: 0 };
        attachWheelRotation(mockCircleCrosshair, circleConfig);
        wheelHandler({ ctrlKey: true, deltaY: 100 });
        assert.equal(mockCircleCrosshair.rotation, 5 * (Math.PI / 180));
        assert.equal(mockCircleCrosshair.direction, 5);

        detachWheelRotation();
    } finally {
        if (globalThis.window) {
            globalThis.window.addEventListener = origAddEvent;
            globalThis.window.removeEventListener = origRemoveEvent;
        }
    }
});

test('resolveAnchorPlacement and resolveCrosshairPlacement in attached mode lock template origin exactly to Sequencer visual without shifting', async () => {
    const adapterV14 = new FoundryVTTV14Adapter();
    const mockToken = {
        x: 100,
        y: 100,
        w: 100,
        h: 100,
        center: { x: 150, y: 150 }
    };

    // 1. Verify resolveAnchorPlacement uses exact ray to edge without artificial grid midpoint/center snapping jumps
    const anchorResult = adapterV14.resolveAnchorPlacement(mockToken, { x: 150, y: 50 });
    assert.equal(anchorResult.x, 150);
    assert.equal(anchorResult.y, 100);
    assert.equal(anchorResult.direction, 270);

    // Verify resolveAnchorPlacement measures angle directly from edge attachment point to target mouse coordinates
    const nonCardinalAnchor = adapterV14.resolveAnchorPlacement(mockToken, { x: 50, y: 160 });
    assert.equal(nonCardinalAnchor.x, 100);
    assert.equal(nonCardinalAnchor.y, 155);
    const expectedAngle = (Math.atan2(160 - 155, 50 - 100) * (180 / Math.PI) + 360) % 360;
    assert.equal(Math.round(nonCardinalAnchor.direction * 100) / 100, Math.round(expectedAngle * 100) / 100);

    // Verify resolveAnchorPlacement projects rays through cursor when cursor is inside token boundaries near corners
    const insideCornerAnchor = adapterV14.resolveAnchorPlacement(mockToken, { x: 110, y: 190 });
    assert.equal(insideCornerAnchor.x, 100);
    assert.equal(insideCornerAnchor.y, 200);
    const expectedInsideAngle = (Math.atan2(190 - 200, 110 - 100) * (180 / Math.PI) + 360) % 360;
    assert.equal(Math.round(insideCornerAnchor.direction * 100) / 100, Math.round(expectedInsideAngle * 100) / 100);

    // 2. Verify resolveCrosshairPlacement in attached mode uses exact visual coordinates from Sequencer when provided
    let resolvedPlacement = null;
    const config = {
        type: 'cone',
        stickToToken: true,
        token: mockToken,
        context: { resolve: (res) => { resolvedPlacement = res; } }
    };
    const mockSequencerVisual = { x: 150, y: 100, direction: 270 };
    resolveCrosshairPlacement(mockSequencerVisual, config);

    assert.ok(resolvedPlacement);
    assert.equal(resolvedPlacement.x, 150);
    assert.equal(resolvedPlacement.y, 100);
    assert.equal(resolvedPlacement.direction, 270);

    // 3. REGRESSION: Attached directional shape moves to non-cardinal position and resolves placement directly to edge point (100, 155), NOT corner (100, 200)
    const { ConeCrosshairShape } = await import('../../src/crosshair/cone.js');
    let resolvedNonCardinal = null;
    const nonCardinalConfig = {
        type: 'cone',
        stickToToken: true,
        token: mockToken,
        distance: 30,
        angle: 53.13,
        context: { resolve: (res) => { resolvedNonCardinal = res; } }
    };
    const mockPlaceable = { document: { x: 100, y: 100 }, x: 100, y: 100 };
    const shape = new ConeCrosshairShape(mockPlaceable, nonCardinalConfig);
    shape.sequencerCrosshair = { x: 100, y: 200 }; // Simulate sequencer crosshair placeable sitting at a corner
    shape.move(50, 160); // Mouse at (50, 160) -> edge anchor is (100, 155)

    const updates = shape.getPlacementUpdates();
    assert.equal(updates.x, 100, 'Placement update X must match edge anchor (100)');
    assert.equal(updates.y, 155, 'Placement update Y must match edge anchor (155), not corner (200)');

    shape.onPlacedCallback();
    assert.ok(resolvedNonCardinal, 'Placement must resolve');
    assert.equal(resolvedNonCardinal.x, 100, 'Resolved X must match edge anchor (100)');
    assert.equal(resolvedNonCardinal.y, 155, 'Resolved Y must match edge anchor (155), not corner (200)');
});

test('foundry adapter layer encapsulates isOwner and toToken helper methods', () => {
    const adapterV14 = new FoundryVTTV14Adapter();
    assert.equal(adapterV14.isOwner({ id: null }), true, 'Preview template with no ID belongs to local user');
    assert.equal(adapterV14.isOwner({ id: 'doc1', author: { id: globalThis.game.user.id } }), true);
    assert.equal(adapterV14.isOwner({ id: 'doc2', author: { id: 'user_remote' } }), false);

    const mockTokenInstance = new Token({ name: 'Hero' });
    const mockTokenObject = { object: mockTokenInstance };
    assert.equal(adapterV14.toToken(mockTokenInstance), mockTokenInstance);
    assert.equal(adapterV14.toToken(mockTokenObject), mockTokenInstance);
    assert.equal(adapterV14.toToken(null), null);
});

test('foundry adapter layer handlePreCreate manages pending placement lifecycle, cancellation, resolution, and deferral', () => {
    const adapterV14 = new FoundryVTTV14Adapter();
    const origUserId = globalThis.game.user.id;
    globalThis.game.user.id = 'user_test';
    autorecManager.register('Fireball', { itemName: 'Fireball', enabled: true, local: true });
    autorecManager.register('Lightning', { itemName: 'Lightning', enabled: true, local: true });
    autorecManager.register('ConeOfCold', { itemName: 'ConeOfCold', enabled: true, local: true });

    try {
        // 1. Skip remote user
        const remoteRes = adapterV14.handlePreCreate({ documentName: 'Region', id: 'r1' }, {}, {}, 'remote_user');
        assert.equal(remoteRes, true);

        // 2. Abort if cancelled
        adapterV14.pendingPlacements.set('Fireball_user_test', { itemName: 'Fireball', cancelled: true, resolved: true });
        const abortRes = adapterV14.handlePreCreate({ documentName: 'Region', id: 'r2', item: { name: 'Fireball', getFlag: () => null } }, {}, {}, 'user_test');
        assert.equal(abortRes, false);
        assert.equal(adapterV14.pendingPlacements.has('Fireball_user_test'), false);

        // 3. Apply if resolved
        let updatedSource = null;
        adapterV14.pendingPlacements.set('Lightning_user_test', {
            itemName: 'Lightning',
            cancelled: false,
            resolved: true,
            coords: { x: 100, y: 200, radius: 15 }
        });
        const applyRes = adapterV14.handlePreCreate({
            documentName: 'Region',
            id: 'r3',
            item: { name: 'Lightning', getFlag: () => null },
            shapes: [{ type: 'circle', x: 0, y: 0, radius: 5 }],
            updateSource: (data) => { updatedSource = data; }
        }, {}, {}, 'user_test');
        assert.equal(applyRes, true);
        assert.ok(updatedSource);
        assert.equal(updatedSource.shapes[0].x, 100);
        assert.equal(adapterV14.pendingPlacements.has('Lightning_user_test'), false);

        // 4. Defer if sequence is still interactive
        const pendingObj = { itemName: 'ConeOfCold', cancelled: false, resolved: false, coords: null };
        adapterV14.pendingPlacements.set('ConeOfCold_user_test', pendingObj);
        const deferRes = adapterV14.handlePreCreate({
            documentName: 'Region',
            id: 'r4',
            item: { name: 'ConeOfCold', getFlag: () => null },
            toObject: () => ({ name: 'ConeOfCold Doc' })
        }, {}, {}, 'user_test');
        assert.equal(deferRes, false);
        assert.equal(pendingObj.deferredCreateData.name, 'ConeOfCold Doc');
    } finally {
        globalThis.game.user.id = origUserId;
        autorecManager.unregister('Fireball');
        autorecManager.unregister('Lightning');
        autorecManager.unregister('ConeOfCold');
    }
});

test('initializeHooks registers placement hooks using default handlers from active foundry adapter', () => {
    let preCreateHandler = null;
    const origOn = globalThis.Hooks.on;
    try {
        globalThis.Hooks.on = (event, fn) => {
            if (event === 'preCreateRegion') preCreateHandler = fn;
        };
        const adapterV14 = new FoundryVTTV14Adapter();
        initializeHooks({ foundryAdapter: adapterV14, sysAdapter: systemAdapter });
        assert.ok(preCreateHandler, 'preCreateRegion hook should be registered');
    } finally {
        globalThis.Hooks.on = origOn;
    }
});

test('createDeferredDocument delegates document creation appropriately in V13 MeasuredTemplate vs V14 Region subclasses', async () => {
    let createdDocName = null;
    let createdDocPayload = null;
    const mockScene = {
        name: "Test Scene",
        createEmbeddedDocuments: async (docName, data) => {
            createdDocName = docName;
            createdDocPayload = data[0];
            return data;
        }
    };

    const adapterV13 = new FoundryVTTV13Adapter();
    await adapterV13.createDeferredDocument(mockScene, { _id: "temp1", t: "circle", distance: 15 }, { x: 100, y: 200, distance: 20 });
    assert.equal(createdDocName, "MeasuredTemplate");
    assert.equal(createdDocPayload.x, 100);
    assert.equal(createdDocPayload.y, 200);
    assert.equal(createdDocPayload.distance, 20);
    assert.equal(createdDocPayload._id, undefined);

    const adapterV14 = new FoundryVTTV14Adapter();
    await adapterV14.createDeferredDocument(mockScene, { _id: "temp2", shapes: [{ type: "circle", x: 0, y: 0, radius: 10 }] }, { x: 300, y: 400, radius: 25, gridUnits: false });
    assert.equal(createdDocName, "Region");
    assert.equal(createdDocPayload.shapes[0].x, 300);
    assert.equal(createdDocPayload.shapes[0].y, 400);
    assert.equal(createdDocPayload.shapes[0].radius, 25);
    assert.equal(createdDocPayload._id, undefined);
});

test('REGRESSION: BaseCrosshairShape.rotate() does not throw ReferenceError and sets sequencerCrosshair direction properties to 0 in attached mode', () => {
    const mockDocument = {
        direction: 0,
        updateSource: () => {}
    };
    const mockPlaceable = {
        document: mockDocument,
        direction: 0
    };
    const mockToken = {
        center: { x: 100, y: 100 }
    };
    const config = {
        stickToToken: true,
        token: mockToken,
        id: "test-effect"
    };

    const shape = new BaseCrosshairShape(mockPlaceable, config);
    const mockSequencerCrosshair = {
        direction: 180,
        rotation: Math.PI,
        config: { direction: 180, rotation: Math.PI },
        data: { direction: 180, rotation: Math.PI }
    };
    shape.sequencerCrosshair = mockSequencerCrosshair;

    // Trigger rotate which should not throw ReferenceError and should set sequencer properties to 0 because stickToToken is true
    shape.rotate(180);

    assert.equal(shape.direction, 180);
    assert.equal(mockSequencerCrosshair.direction, 0);
    assert.equal(mockSequencerCrosshair.rotation, 0);
    assert.equal(mockSequencerCrosshair.config.direction, 0);
    assert.equal(mockSequencerCrosshair.config.rotation, 0);
    assert.equal(mockSequencerCrosshair.data.direction, 0);
    assert.equal(mockSequencerCrosshair.data.rotation, 0);
});

test('REGRESSION: alignCrosshairAndEffects resolves token attachment and keeps directions at 0', () => {
    const mockToken = { center: { x: 100, y: 100 } };
    const config = {
        id: "test-effect",
        stickToToken: true,
        token: mockToken,
        currentDirection: 180
    };
    const mockSequencerCrosshair = {
        direction: 180,
        rotation: Math.PI,
        config: { direction: 180, rotation: Math.PI },
        data: { direction: 180, rotation: Math.PI }
    };

    alignCrosshairAndEffects(mockSequencerCrosshair, config, Math.PI);

    assert.equal(mockSequencerCrosshair.direction, 0);
    assert.equal(mockSequencerCrosshair.rotation, 0);
    assert.equal(mockSequencerCrosshair.config.direction, 0);
    assert.equal(mockSequencerCrosshair.config.rotation, 0);
    assert.equal(mockSequencerCrosshair.data.direction, 0);
    assert.equal(mockSequencerCrosshair.data.rotation, 0);
});

test('REGRESSION: BaseCrosshairShape.move() synchronizes coordinates to token center in attached circle mode', () => {
    const mockDocument = { direction: 0, updateSource: () => {} };
    const mockPlaceable = { document: mockDocument, direction: 0 };
    const mockToken = { center: { x: 500, y: 500 }, width: 1, height: 1 };
    const config = {
        stickToToken: true,
        token: mockToken,
        type: 'circle'
    };

    const shape = new BaseCrosshairShape(mockPlaceable, config);
    const mockSequencerCrosshair = { x: 550, y: 500 };
    shape.sequencerCrosshair = mockSequencerCrosshair;

    shape.move(600, 500);

    assert.equal(shape.x, 500, 'shape X must be token center X (500)');
    assert.equal(shape.y, 500, 'shape Y must be token center Y (500)');
    assert.equal(mockSequencerCrosshair.x, 500, 'sequencerCrosshair X must be token center X (500)');
    assert.equal(mockSequencerCrosshair.y, 500, 'sequencerCrosshair Y must be token center Y (500)');
});

test('REGRESSION: FoundryVTTV14Adapter.refreshTemplateHighlights does not overwrite tmpl.ray', () => {
    const adapter = new FoundryVTTV14Adapter();
    const mockRay = {
        origin: { x: 50, y: 50 },
        distance: 100
    };
    const mockDoc = {
        documentName: "MeasuredTemplate",
        direction: 0,
        updateSource: () => {}
    };
    const mockTmpl = {
        document: mockDoc,
        direction: 0,
        ray: mockRay,
        x: 50,
        y: 50,
        renderFlags: { set: () => {} }
    };

    adapter.refreshTemplateHighlights(mockTmpl, 90);

    // Assert that mockRay reference remains unchanged (not overwritten by new Ray)
    assert.strictEqual(mockTmpl.ray, mockRay);
});

test('REGRESSION: BaseCrosshairShape.playGraphicEffect() does not throw ReferenceError: isSticky is not defined for rectangle shapes', async () => {
    let playCalled = false;
    globalThis.Sequence = class {
        wait() { return this; }
        effect() { return this; }
        name() { return this; }
        file() { return this; }
        attachTo() { return this; }
        anchor() { return this; }
        size() { return this; }
        opacity() { return this; }
        belowTokens() { return this; }
        locally() { return this; }
        persist() { return this; }
        play() {
            playCalled = true;
            return Promise.resolve();
        }
    };

    const mockDocument = {
        direction: 0,
        updateSource: () => {}
    };
    const mockPlaceable = {
        document: mockDocument,
        direction: 0,
        x: 10,
        y: 20
    };
    const config = {
        type: 'rect',
        stickToToken: false,
        id: "rect-effect"
    };

    const shape = new BaseCrosshairShape(mockPlaceable, config);
    // Explicitly set type to rect
    shape.type = "rect";

    await shape.playGraphicEffect({});
    assert.ok(playCalled, 'playGraphicEffect should execute cleanly and call Sequence.play() without throwing errors');
});

test('REGRESSION: BaseCrosshairShape.onCancelCallback() unconditionally detaches wheel/pointer listeners for all shapes including circles', () => {
    let addEventListenerCalled = false;
    let removeEventListenerCalled = false;
    const origAdd = globalThis.window?.addEventListener;
    const origRemove = globalThis.window?.removeEventListener;

    try {
        if (!globalThis.window) globalThis.window = {};
        globalThis.window.addEventListener = (event, handler) => {
            addEventListenerCalled = true;
        };
        globalThis.window.removeEventListener = (event, handler) => {
            removeEventListenerCalled = true;
        };

        const mockDocument = {
            direction: 0,
            updateSource: () => {}
        };
        const mockPlaceable = {
            document: mockDocument,
            direction: 0,
            x: 10,
            y: 20
        };
        const config = {
            type: 'circle',
            stickToToken: true,
            token: { center: { x: 10, y: 20 } },
            id: "circle-effect"
        };

        const shape = new BaseCrosshairShape(mockPlaceable, config);
        // Explicitly trigger onShow to attach the event listeners
        shape.onShowCallback({});
        assert.ok(addEventListenerCalled, 'addEventListener should be called when circle is attached to token');

        // Now trigger onCancelCallback
        shape.onCancelCallback();
        assert.ok(removeEventListenerCalled, 'removeEventListener should be unconditionally called to detach wheel/pointer listeners when circle is canceled');
    } finally {
        if (globalThis.window) {
            globalThis.window.addEventListener = origAdd;
            globalThis.window.removeEventListener = origRemove;
        }
    }
});

test('REGRESSION: resolveCrosshairPlacement resolves exact shape instance coordinates (edge/snapped) rather than raw click coordinates', () => {
    initializeFoundryAdapter();
    let resolvedPlacement = null;
    const mockDocument = { direction: 0, updateSource: () => {} };
    const mockPlaceable = { document: mockDocument, direction: 0, x: 10, y: 20 };
    const config = {
        type: 'cone',
        stickToToken: true,
        token: { center: { x: 100, y: 100 } },
        context: { resolve: (res) => { resolvedPlacement = res; } }
    };

    const shape = new BaseCrosshairShape(mockPlaceable, config);
    // Move shape to token edge (e.g. 150, 100)
    shape.x = 150;
    shape.y = 100;
    shape.direction = 180;
    shape.sequencerCrosshair = { x: 150, y: 100, direction: 180 };

    // Simulate clicking at raw mouse click position (300, 300) which is far from shape edge position
    const rawClickCoord = { x: 300, y: 300 };
    shape.onPlacedCallback(rawClickCoord);

    assert.ok(resolvedPlacement, 'placement should be resolved');
    assert.equal(resolvedPlacement.x, 150, 'placement X should be shape.x (150) where sequencer visual indicated, not clickX (300)');
    assert.equal(resolvedPlacement.y, 100, 'placement Y should be shape.y (100) where sequencer visual indicated, not clickY (300)');
    assert.equal(resolvedPlacement.direction, 180);
});

test('REGRESSION: alignCrosshairAndEffects updates visual effect rotation for cones and rays in detached mode', () => {
    let mockEffectRotation = null;
    const mockEffect = {
        container: { rotation: 0 },
        spriteContainer: { rotation: 1 },
        rotation: 0,
        update: ({ rotation }) => { mockEffectRotation = rotation; }
    };

    const origSequencer = globalThis.Sequencer;
    try {
        globalThis.Sequencer = {
            EffectManager: {
                getEffects: () => [mockEffect]
            }
        };

        const config = {
            id: "test-cone",
            type: "cone",
            stickToToken: false,
            currentDirection: 45
        };

        alignCrosshairAndEffects({}, config, 45 * (Math.PI / 180));

        const expectedRad = 45 * (Math.PI / 180);
        assert.equal(mockEffect.container.rotation, expectedRad);
        assert.equal(mockEffect.spriteContainer.rotation, 0, 'spriteContainer rotation must be 0 to prevent compounding double rotation');
        assert.equal(mockEffect.rotation, expectedRad);
        assert.equal(mockEffectRotation, 45, 'eff.update({ rotation }) must receive degrees for Sequencer API');
    } finally {
        globalThis.Sequencer = origSequencer;
    }
});

test('REGRESSION: getPlacementUpdates uses shape visual attachment coordinates for directional attached shapes', () => {
    const mockDocument = { direction: 0, updateSource: () => {} };
    const mockPlaceable = { document: mockDocument, direction: 0, x: 10, y: 20 };
    const config = {
        type: 'cone',
        stickToToken: true,
        token: { center: { x: 100, y: 100 } }
    };

    const shape = new BaseCrosshairShape(mockPlaceable, config);
    shape.x = 120;
    shape.y = 150;
    shape.direction = 60;

    // Simulate sequencerCrosshair sitting at a corner point (100, 100)
    shape.sequencerCrosshair = { x: 100, y: 100, direction: 0 };

    const updates = shape.getPlacementUpdates();
    assert.equal(updates.x, 120, 'placement X must match shape visual position (120) where animation appeared');
    assert.equal(updates.y, 150, 'placement Y must match shape visual position (150) where animation appeared');
    assert.equal(updates.direction, 60, 'placement direction must match shape direction (60)');
});

test('REGRESSION: getPlacementUpdates centers attached circle templates at token center rather than tile perimeter', () => {
    const mockDocument = { direction: 0, updateSource: () => {} };
    const mockPlaceable = { document: mockDocument, direction: 0, x: 10, y: 20 };
    const config = {
        type: 'circle',
        stickToToken: true,
        token: { center: { x: 100, y: 100 } }
    };

    const shape = new BaseCrosshairShape(mockPlaceable, config);
    shape.sequencerCrosshair = { x: 150, y: 100 };

    const updates = shape.getPlacementUpdates();
    assert.equal(updates.x, 100, 'attached circle placement X must be token center X (100)');
    assert.equal(updates.y, 100, 'attached circle placement Y must be token center Y (100)');
    assert.equal(updates.direction, 0);
});

test('REGRESSION: FoundryVTTV14Adapter strips MeasuredTemplate schema properties from Region updateData payload', () => {
    const adapterV14 = new FoundryVTTV14Adapter();
    let updatedPayload = null;
    const mockRegionDoc = {
        documentName: 'Region',
        shapes: [{ type: 'rectangle', x: 0, y: 0, width: 400, height: 400 }],
        updateSource(data) { updatedPayload = data; }
    };

    const config = {
        itemName: 'Arcane Burst',
        placedFillColor: '#0099ff',
        placedBorderColor: '#fc753b',
        placedFillAlpha: 0.25,
        placedBorderAlpha: 0.6
    };

    const creationData = { flags: {}, shapes: [{ type: 'rectangle', x: 0, y: 0, width: 400, height: 400 }] };
    adapterV14.applyDocumentPlacement(mockRegionDoc, { x: 4050, y: 7050, distance: 20, width: 20, gridUnits: true, type: 'square' }, config, creationData);

    assert.ok(updatedPayload);
    assert.equal(updatedPayload.color, '#0099ff');
    assert.equal(updatedPayload.fillColor, undefined, 'Region payload must not leak MeasuredTemplate fillColor');
    assert.equal(updatedPayload.borderColor, undefined, 'Region payload must not leak MeasuredTemplate borderColor');
    assert.equal(updatedPayload.alpha, undefined, 'Region payload must not leak MeasuredTemplate alpha');
    assert.equal(updatedPayload.fillAlpha, undefined, 'Region payload must not leak MeasuredTemplate fillAlpha');
    assert.equal(updatedPayload.borderAlpha, undefined, 'Region payload must not leak MeasuredTemplate borderAlpha');

    assert.equal(creationData.fillColor, undefined);
    assert.equal(creationData.borderColor, undefined);
    assert.equal(creationData.flags.bbc.placedFillColor, '#0099ff');
    assert.equal(creationData.flags.bbc.placedBorderColor, '#fc753b');
});

test('REGRESSION: FoundryVTTV14Adapter._formatRegionShapeUpdate strips stale _source property from shape payload', () => {
    const adapterV14 = new FoundryVTTV14Adapter();
    const staleShapeInstance = {
        type: 'rectangle',
        x: 4050,
        y: 7050,
        width: 400,
        height: 400,
        _source: { type: 'rectangle', x: 4050, y: 7050, width: 565.6000000000004, height: 0 },
        toObject() {
            return { type: 'rectangle', x: 4050, y: 7050, width: 400, height: 400, _source: this._source };
        }
    };

    const formatted = adapterV14._formatRegionShapeUpdate(staleShapeInstance, { x: 4050, y: 7050, distance: 20, width: 20, gridUnits: true, type: 'square' });
    assert.equal(formatted.width, 400);
    assert.equal(formatted.height, 400);
    assert.equal(formatted._source, undefined, '_formatRegionShapeUpdate must strip shape._source to prevent DataModel source corruption');
});

test('REGRESSION: FoundryVTTV14Adapter._formatRegionShapeUpdate converts diagonal distance (565.6px) to exact square side dimensions (400px x 400px)', () => {
    const adapterV14 = new FoundryVTTV14Adapter();
    const baseShape = { type: 'rectangle', x: 4050, y: 7050, width: 400, height: 400 };

    // Pass diagonal distance payload (28.284271247461902 ft, which is 565.6000000000004 px on 100px/5ft grid)
    const diagonalCoords = {
        x: 4050,
        y: 7050,
        distance: 28.284271247461902,
        gridUnits: true,
        type: 'square',
        t: 'rect'
    };

    const formatted = adapterV14._formatRegionShapeUpdate(baseShape, diagonalCoords);
    assert.equal(formatted.type, 'rectangle');
    assert.equal(formatted.width, 400, 'square side length must be derived as 400px from 28.284ft diagonal distance');
    assert.equal(formatted.height, 400, 'square height must match side length 400px');
    assert.equal(formatted._source, undefined);
});

test('REGRESSION: BaseCrosshairShape.rotate in detached mode updates Region preview shape rotation', () => {
    const mockDocument = {
        documentName: 'Region',
        shapes: [{ type: 'rectangle', x: 100, y: 100, width: 400, height: 400, rotation: 0 }],
        direction: 0,
        updateSource(data) { Object.assign(this, data); }
    };
    const mockPlaceable = {
        document: mockDocument,
        direction: 0,
        x: 100,
        y: 100
    };

    const config = {
        type: 'square',
        stickToToken: false,
        distance: 20,
        width: 20
    };

    const shape = new BaseCrosshairShape(mockPlaceable, config);
    shape.rotate(45);

    assert.equal(shape.direction, 45);
    assert.equal(mockDocument.shapes[0].rotation, 45, 'rotate() in detached mode must update Region shape rotation on preview document');
});

test('REGRESSION: BaseCrosshairShape.rotate preserves cone document interior angle property', () => {
    const mockDocument = {
        documentName: 'MeasuredTemplate',
        t: 'cone',
        direction: 0,
        angle: 53.13,
        updateSource(data) { Object.assign(this, data); }
    };
    const mockPlaceable = {
        document: mockDocument,
        direction: 0,
        x: 100,
        y: 100
    };

    const config = {
        type: 'cone',
        stickToToken: false,
        distance: 15,
        angle: 53.13
    };

    const shape = new BaseCrosshairShape(mockPlaceable, config);
    shape.rotate(180);

    assert.equal(shape.direction, 180);
    assert.equal(mockDocument.direction, 180, 'direction must update to 180');
    assert.equal(mockDocument.angle, 53.13, 'interior cone angle must remain 53.13 and not be overwritten with rotation direction');
});

test('REGRESSION: _safeSetRenderFlags gracefully handles unsupported RenderFlag options (e.g. refreshShape on MeasuredTemplatePF2e)', () => {
    const adapter = new FoundryVTTV14Adapter();
    const setCalls = [];
    const mockTmpl = {
        document: { documentName: "MeasuredTemplate", direction: 0 },
        direction: 0,
        renderFlags: {
            set(flags) {
                if (flags.refreshShape) {
                    throw new Error("refreshShape is not defined as a supported RenderFlag option");
                }
                setCalls.push(flags);
            }
        }
    };

    assert.doesNotThrow(() => {
        adapter.refreshTemplateHighlights(mockTmpl, 90);
    });

    assert.ok(setCalls.length > 0, "Supported render flags were set successfully");
});

test('REGRESSION: Pf2eSystemAdapter and Dnd5eSystemAdapter expose refreshTemplateHighlights stubs without breaking system adapters', () => {
    const pf2eAdapter = new Pf2eSystemAdapter();
    const dnd5eAdapter = new Dnd5eSystemAdapter();

    assert.strictEqual(typeof pf2eAdapter.refreshTemplateHighlights, 'function');
    assert.strictEqual(typeof dnd5eAdapter.refreshTemplateHighlights, 'function');

    assert.doesNotThrow(() => {
        pf2eAdapter.refreshTemplateHighlights({}, 90);
        dnd5eAdapter.refreshTemplateHighlights({}, 90);
    });
});

test('REGRESSION: FoundryVTTV13Adapter preserves cone template type (t) and angle across detection, formatting, and placement updates', () => {
    const adapterV13 = new FoundryVTTV13Adapter();

    // 1. Detection
    const coneDoc = { t: 'cone', distance: 15, angle: 53.13, x: 10, y: 20 };
    const detected = adapterV13.detectProperties(coneDoc);
    assert.equal(detected.type, 'cone');
    assert.equal(detected.t, 'cone');
    assert.equal(detected.angle, 53.13);

    // 2. Formatting
    const formatted = adapterV13.formatPlacementCoordinates(100, 200, 45, { ...detected, type: 'cone' });
    assert.equal(formatted.t, 'cone');
    assert.equal(formatted.type, 'cone');
    assert.equal(formatted.angle, 53.13);

    // 3. Document Placement Update
    let updatedPayload = null;
    const targetDoc = {
        t: 'cone',
        angle: 53.13,
        updateSource: (data) => { updatedPayload = data; }
    };

    adapterV13.applyDocumentPlacement(targetDoc, formatted, { itemName: 'Burning Hands' });
    assert.ok(updatedPayload);
    assert.equal(updatedPayload.t, 'cone', 't must be cone and not fall back to circle');
    assert.equal(updatedPayload.angle, 53.13, 'angle must be preserved');
    assert.equal(updatedPayload.x, 100);
    assert.equal(updatedPayload.y, 200);
    assert.equal(updatedPayload.direction, 45);
});

test('REGRESSION: FoundryVTTV13Adapter normalizes rect diagonal distance and calculates token attachment offsets', () => {
    const adapterV13 = new FoundryVTTV13Adapter();

    // 1. Verify diagonal distance (28.284) is normalized and does not compound exponentially
    let updatedPayload = null;
    const targetDoc = {
        t: 'rect',
        distance: 28.284271247461902,
        width: 20,
        updateSource: (data) => { updatedPayload = data; }
    };

    const coords = { x: 1000, y: 1000, direction: 90, distance: 28.284271247461902, width: 20, type: 'square' };
    adapterV13.applyDocumentPlacement(targetDoc, coords, { originalType: 'square' });

    assert.ok(updatedPayload);
    assert.equal(updatedPayload.t, 'rect');
    assert.equal(updatedPayload.width, 20);
    assert.equal(updatedPayload.distance, 28.28, 'Distance must remain 28.28 (sqrt(20^2+20^2)) and not compound to 34.64+');

    // 2. Verify attached rect template calculates edge offset correctly based on direction angle
    let attachedPayload = null;
    const attachedDoc = {
        t: 'rect',
        updateSource: (data) => { attachedPayload = data; }
    };

    // At 90 deg rotation, sin(90)=1, cos(90)=0 -> x offset = 20ft * 20px/ft / 2 = 200px
    const attachedCoords = { x: 1000, y: 1000, direction: 90, distance: 20, width: 20, sticky: true, token: { name: 'Token' } };
    adapterV13.applyDocumentPlacement(attachedDoc, attachedCoords, { originalType: 'square', token: { name: 'Token' } });

    assert.ok(attachedPayload);
    assert.equal(attachedPayload.x, 1200);
    assert.equal(attachedPayload.y, 1000);

    // 3. Verify formatPlacementCoordinates converts raw crosshair 0 deg rotation into 45 deg diagonal direction for MeasuredTemplate rect
    const squareFormatted = adapterV13.formatPlacementCoordinates(3000, 1600, 0, { type: 'square', distance: 15, width: 15 });
    assert.equal(squareFormatted.direction, 45, 'Unrotated square MeasuredTemplate must have direction = 45 (diagonal angle)');
    assert.equal(squareFormatted.t, 'rect');
});

test('REGRESSION: supportsShapeRotation accurately distinguishes shape rotation capabilities in V13 vs V14', () => {
    const adapterV13 = new FoundryVTTV13Adapter();
    const adapterV14 = new FoundryVTTV14Adapter();

    assert.equal(adapterV13.supportsShapeRotation('rect'), false, 'V13 MeasuredTemplate rect cannot rotate');
    assert.equal(adapterV13.supportsShapeRotation('square'), false, 'V13 MeasuredTemplate square cannot rotate');
    assert.equal(adapterV13.supportsShapeRotation('cone'), true, 'V13 MeasuredTemplate cone can rotate');

    assert.equal(adapterV14.supportsShapeRotation('rect'), true, 'V14 Region rect can rotate');
    assert.equal(adapterV14.supportsShapeRotation('square'), true, 'V14 Region square can rotate');

    game.version = '13.0.0';
    initializeFoundryAdapter();
    assert.equal(shouldStickToToken({ stickToToken: true }, 'square'), false, 'shouldStickToToken must return false for non-rotatable shapes in V13');

    game.version = '14.0.0';
    initializeFoundryAdapter();
    assert.equal(shouldStickToToken({ stickToToken: true }, 'square'), true, 'shouldStickToToken returns true for rotatable shapes in V14');
});

test('REGRESSION: detached crosshair placement preserves user rotation angle exactly upon placement without resetting or recalculating', async () => {
    game.version = '14.0.0';
    initializeFoundryAdapter();

    const { ConeCrosshairShape } = await import('../../src/crosshair/cone.js');
    const { RayCrosshairShape } = await import('../../src/crosshair/ray.js');

    const mockCasterToken = {
        id: 'tok-caster-1',
        x: 100,
        y: 100,
        w: 100,
        h: 100,
        center: { x: 150, y: 150 }
    };
    const mockDocument = { direction: 0, updateSource: () => {} };
    const mockPlaceable = { document: mockDocument, direction: 0, x: 500, y: 500 };

    // 1. Detached cone crosshair rotated via mousewheel to 125 deg
    let resolvedCone = null;
    const coneConfig = {
        type: 'cone',
        stickToToken: false,
        token: mockCasterToken,
        distance: 30,
        angle: 53.13,
        currentDirection: 125,
        context: { resolve: (res) => { resolvedCone = res; } }
    };

    const coneShape = new ConeCrosshairShape(mockPlaceable, coneConfig);
    coneShape.x = 500;
    coneShape.y = 500;
    coneShape.direction = 125;

    // Simulate clicking to place detached cone
    coneShape.onPlacedCallback({ x: 500, y: 500 });

    assert.ok(resolvedCone, 'Detached cone placement must resolve');
    assert.equal(resolvedCone.x, 500, 'Detached cone X must match placed coordinate');
    assert.equal(resolvedCone.y, 500, 'Detached cone Y must match placed coordinate');
    assert.equal(resolvedCone.direction, 125, 'Detached cone direction must preserve user rotation (125 deg) without resetting to 0');
    assert.equal(resolvedCone.rotation, 125, 'Detached cone rotation must preserve user rotation (125 deg)');

    // 2. Detached ray crosshair rotated via mousewheel to 210 deg
    let resolvedRay = null;
    const rayConfig = {
        type: 'ray',
        stickToToken: false,
        token: mockCasterToken,
        distance: 60,
        width: 5,
        currentDirection: 210,
        context: { resolve: (res) => { resolvedRay = res; } }
    };

    const rayShape = new RayCrosshairShape(mockPlaceable, rayConfig);
    rayShape.x = 800;
    rayShape.y = 600;
    rayShape.direction = 210;

    // Simulate clicking to place detached ray
    rayShape.onPlacedCallback({ x: 800, y: 600 });

    assert.ok(resolvedRay, 'Detached ray placement must resolve');
    assert.equal(resolvedRay.x, 800, 'Detached ray X must match placed coordinate');
    assert.equal(resolvedRay.y, 600, 'Detached ray Y must match placed coordinate');
    assert.equal(resolvedRay.direction, 210, 'Detached ray direction must preserve user rotation (210 deg) without resetting to 0');
    assert.equal(resolvedRay.rotation, 210, 'Detached ray rotation must preserve user rotation (210 deg)');

    // 3. Attached cone crosshair aimed at mouse position (500, 500)
    let resolvedAttachedCone = null;
    const attachedConeConfig = {
        type: 'cone',
        stickToToken: true,
        token: mockCasterToken,
        distance: 30,
        angle: 53.13,
        context: { resolve: (res) => { resolvedAttachedCone = res; } }
    };

    const attachedConeShape = new ConeCrosshairShape(mockPlaceable, attachedConeConfig);
    // Token center is (150, 150), mouse position at (500, 500)
    globalThis.canvas = { mousePosition: { x: 500, y: 500 } };
    attachedConeShape.move(500, 500);

    // Simulate clicking to place attached cone
    attachedConeShape.onPlacedCallback({ x: 500, y: 500 });

    assert.ok(resolvedAttachedCone, 'Attached cone placement must resolve');
    assert.equal(resolvedAttachedCone.x, 200, 'Attached cone X must anchor to token edge (x: 200)');
    assert.equal(resolvedAttachedCone.y, 200, 'Attached cone Y must anchor to token edge (y: 200)');
    const expectedAttachedAngle = (Math.atan2(500 - 200, 500 - 200) * (180 / Math.PI) + 360) % 360; // 45 deg
    assert.equal(Math.round(resolvedAttachedCone.direction * 100) / 100, Math.round(expectedAttachedAngle * 100) / 100, 'Attached cone direction must point towards mouse cursor (45 deg)');
    assert.equal(Math.round(resolvedAttachedCone.rotation * 100) / 100, Math.round(expectedAttachedAngle * 100) / 100, 'Attached cone rotation must match direction');
});

test('REGRESSION: FoundryVTTV14Adapter.createDeferredDocument strips shape IDs and creates valid Region cone shapes with angle and rotation', async () => {
    game.version = '14.0.0';
    initializeFoundryAdapter();
    const adapterV14 = new FoundryVTTV14Adapter();

    let createdDocName = null;
    let createdPayloads = null;
    const mockScene = {
        createEmbeddedDocuments: async (docName, payloads) => {
            createdDocName = docName;
            createdPayloads = payloads;
            return payloads.map((p, idx) => ({ id: `created-region-${idx}`, ...p }));
        }
    };

    const deferredData = {
        _id: 'preview-region-id',
        id: 'preview-region-id',
        name: 'Burning Hands Region',
        shapes: [
            {
                _id: 'preview-shape-id',
                id: 'preview-shape-id',
                type: 'cone',
                radius: 600,
                angle: 53.13,
                x: 100,
                y: 100,
                rotation: 0
            }
        ]
    };

    const coords = {
        x: 250,
        y: 350,
        direction: 135,
        rotation: 135,
        radius: 30,
        angle: 53.13,
        type: 'cone',
        gridUnits: true
    };

    await adapterV14.createDeferredDocument(mockScene, deferredData, coords, 'Region', { stickToToken: true });

    assert.equal(createdDocName, 'Region', 'Must create Region embedded document in V14');
    assert.ok(Array.isArray(createdPayloads) && createdPayloads.length === 1);
    const createdRegion = createdPayloads[0];

    assert.equal(createdRegion.id, undefined, 'Top-level document id must be stripped for creation');
    assert.equal(createdRegion._id, undefined, 'Top-level document _id must be stripped for creation');
    assert.ok(Array.isArray(createdRegion.shapes) && createdRegion.shapes.length === 1);

    const shape = createdRegion.shapes[0];
    assert.equal(shape.id, undefined, 'Embedded shape id must be stripped to prevent V14 insertion errors');
    assert.equal(shape._id, undefined, 'Embedded shape _id must be stripped to prevent V14 insertion errors');
    assert.equal(shape.type, 'cone', 'Shape type must be preserved as cone');
    assert.equal(shape.x, 250, 'Shape X must match placed coordinate');
    assert.equal(shape.y, 350, 'Shape Y must match placed coordinate');
    assert.equal(shape.rotation, 135, 'Shape rotation must match placed direction (135 deg)');
    assert.equal(shape.angle, 53.13, 'Shape angle must match cone interior angle (53.13 deg)');
    assert.equal(shape.radius, 600, 'Shape radius in pixels must convert grid units (30ft -> 600px at 100px/5ft)');
});

test('REGRESSION: full attached and detached placement lifecycle preserves exact coordinates and creates deferred Region documents', async () => {
    game.version = '14.0.0';
    initializeFoundryAdapter();
    const adapterV14 = new FoundryVTTV14Adapter();

    let createdDocName = null;
    let createdPayloads = null;
    const mockScene = {
        createEmbeddedDocuments: async (docName, payloads) => {
            createdDocName = docName;
            createdPayloads = payloads;
            return payloads;
        }
    };
    globalThis.canvas.scene = mockScene;

    const mockRegionDoc = {
        id: 'region-lifecycle-test',
        documentName: 'Region',
        shapes: [
            {
                type: 'cone',
                radius: 600,
                angle: 53.13,
                x: 100,
                y: 100,
                rotation: 0
            }
        ],
        toObject: function() {
            return {
                id: this.id,
                documentName: this.documentName,
                shapes: foundry.utils.deepClone(this.shapes)
            };
        }
    };

    const mockPlaceable = {
        document: mockRegionDoc,
        x: 100,
        y: 100,
        destroy: () => {}
    };

    // 1. Simulate handlePreCreate deferral
    const pendingPlacementKey = `Cone of Cold_${game.user.id}`;
    const pending = {
        itemName: 'Cone of Cold',
        resolved: false,
        cancelled: false,
        coords: null,
        config: { stickToToken: true },
        placeable: mockPlaceable
    };
    adapterV14.pendingPlacements.set(pendingPlacementKey, pending);

    const preCreateResult = adapterV14.handlePreCreate(mockRegionDoc, {}, {}, game.user.id);
    assert.equal(preCreateResult, false, 'PreCreate must defer document creation while interactive placement is pending');
    assert.ok(pending.deferredCreateData, 'Deferred create data must be captured');

    // 2. Resolve placement with coordinates from Sequencer
    const placedCoords = {
        x: 200,
        y: 150,
        direction: 90,
        rotation: 90,
        radius: 30,
        angle: 53.13,
        type: 'cone',
        gridUnits: true
    };

    await adapterV14.createDeferredDocument(mockScene, pending.deferredCreateData, placedCoords, pending.documentName, pending.config);

    assert.equal(createdDocName, 'Region');
    assert.ok(createdPayloads);
    const placedRegion = createdPayloads[0];
    assert.equal(placedRegion.shapes[0].x, 200);
    assert.equal(placedRegion.shapes[0].y, 150);
    assert.equal(placedRegion.shapes[0].rotation, 90);
    assert.equal(placedRegion.shapes[0].type, 'cone');
});






