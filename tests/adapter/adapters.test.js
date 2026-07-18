import '../setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { closest } from '../../src/lib/filemanager.js';
import { initializeFoundryAdapter, crosshairAdapter, BaseFoundryVTTAdapter } from '../../src/adapter/foundry/index.js';
import { initializeSystemAdapter, systemAdapter } from '../../src/adapter/system/index.js';
import { registerPlacementHooks, initializeHooks } from '../../src/adapter/index.js';
import { snapCoordinates, attachWheelRotation, detachWheelRotation, resolveCrosshairPlacement } from '../../src/crosshair/util.js';
import { Token } from '../../src/lib/compat.js';
import { autorecManager } from '../../src/autorec/autorecManager.js';
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
        document: {
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
    assert.equal(regionUpdate.borderColor, '#00ff00');
    assert.equal(regionUpdate.fillColor, '#ffffff');
    assert.equal(regionUpdate.alpha, 0.4);
    assert.equal(regionUpdate.fillAlpha, 0.4);
    assert.equal(regionUpdate.borderAlpha, 0.8);

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

test('resolveAnchorPlacement and resolveCrosshairPlacement in attached mode lock template origin exactly to Sequencer visual without shifting', () => {
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
