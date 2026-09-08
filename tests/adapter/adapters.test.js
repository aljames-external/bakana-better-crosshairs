import '../setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { closest } from '../../src/lib/filemanager.js';
import {
    initializeFoundryAdapter,
    crosshairAdapter,
    BaseFoundryVTTAdapter
} from '../../src/adapter/foundry/index.js';
import {
    canvasAdapter,
    initializeCanvasAdapter,
    BaseCanvasAdapter,
    CanvasV13Adapter,
    CanvasV14Adapter
} from '../../src/adapter/canvas/index.js';
import { initializeSystemAdapter, systemAdapter } from '../../src/adapter/system/index.js';
import { adapter } from '../../src/adapter/index.js';
import { snapCoordinates, attachWheelRotation, detachWheelRotation, resolveCrosshairPlacement, alignCrosshairAndEffects, shouldStickToToken, activePlacementTracker } from '../../src/crosshair/util.js';
import { BaseCrosshairShape } from '../../src/crosshair/base.js';
import { autorecManager } from '../../src/autorec/autorecManager.js';
import { FoundryVTTV13Adapter } from '../../src/adapter/foundry/foundryvtt-v13-adapter.js';
import { FoundryVTTV14Adapter } from '../../src/adapter/foundry/foundryvtt-v14-adapter.js';
import { Dnd5eSystemAdapter } from '../../src/adapter/system/dnd5e-adapter.js';
import { Pf2eSystemAdapter } from '../../src/adapter/system/pf2e-adapter.js';
import { Pf1SystemAdapter } from '../../src/adapter/system/pf1-adapter.js';

test('crosshairAdapter.initialize and initializeFoundryAdapter select proper Foundry VTT generation adapter based on game.version', () => {
    globalThis.game.version = "13.335";
    const adapterV13 = crosshairAdapter.initialize();
    assert.ok(adapterV13 instanceof FoundryVTTV13Adapter);
    assert.ok(adapterV13 instanceof BaseFoundryVTTAdapter);
    assert.equal(adapterV13.documentTerm, 'template');
    assert.equal(crosshairAdapter, adapterV13);

    globalThis.game.version = "14.300";
    const adapterV14 = crosshairAdapter.initialize();
    assert.ok(adapterV14 instanceof FoundryVTTV14Adapter);
    assert.ok(adapterV14 instanceof FoundryVTTV13Adapter);
    assert.ok(adapterV14 instanceof BaseFoundryVTTAdapter);
    assert.equal(adapterV14.documentTerm, 'region');
    assert.equal(crosshairAdapter, adapterV14);
});

test('crosshairAdapter.loadTemplates delegates to foundry.applications.handlebars.loadTemplates', async () => {
    const templates = ['modules/bakana-better-crosshairs/test.html'];
    const result = await crosshairAdapter.loadTemplates(templates);
    assert.deepEqual(result, templates);
});

test('systemAdapter.initialize and initializeSystemAdapter select proper System adapter based on game.system.id', () => {
    globalThis.game.system.id = "dnd5e";
    let sysAdapter = systemAdapter.initialize();
    assert.ok(sysAdapter instanceof Dnd5eSystemAdapter);
    assert.equal(sysAdapter.systemId, 'dnd5e');
    assert.equal(sysAdapter.supportsActivities, true);
    assert.equal(systemAdapter, sysAdapter);

    globalThis.game.system.id = "pf2e";
    sysAdapter = systemAdapter.initialize();
    assert.ok(sysAdapter instanceof Pf2eSystemAdapter);
    assert.equal(sysAdapter.systemId, 'pf2e');
    assert.equal(sysAdapter.supportsActivities, false);
    assert.equal(systemAdapter, sysAdapter);

    globalThis.game.system.id = "pf1";
    sysAdapter = systemAdapter.initialize();
    assert.ok(sysAdapter instanceof Pf1SystemAdapter);
    assert.equal(sysAdapter.systemId, 'pf1');
    assert.equal(sysAdapter.supportsActivities, false);
    assert.equal(systemAdapter, sysAdapter);

    globalThis.game.system.id = "pf";
    sysAdapter = systemAdapter.initialize();
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
            borderColor: '#fc753b',
            borderAlpha: 0.6
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

        adapter.registerPlacementHooks({ onDrawPreview: () => {}, onPreCreate: () => {}, onCreate: () => {} }, {
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
        adapter.registerPlacementHooks({ onDrawPreview: () => {}, onPreCreate: () => {}, onCreate: () => {} }, {
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
    assert.throws(() => baseAdapter.generatePlacementHooks({}, systemAdapter), /Subclasses of BaseFoundryVTTAdapter must implement generatePlacementHooks/);
    assert.throws(() => baseAdapter.registerPlacementHooks({}, systemAdapter), /Subclasses of BaseFoundryVTTAdapter must implement generatePlacementHooks/);
    assert.throws(() => baseAdapter.generatePlacementHooks({}, {}), /requires a valid BaseSystemAdapter instance/);
    assert.throws(() => baseAdapter.registerPlacementHooks({}, {}), /requires a valid BaseSystemAdapter instance/);
    assert.rejects(async () => baseAdapter.loadTemplates([]), /Subclasses of BaseFoundryVTTAdapter must implement loadTemplates/);
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

test('hidePreview safely hides PIXI containers immediately, overrides render methods, and intercepts child mutations', () => {
    const mockPlaceable = {
        visible: true,
        renderable: true,
        alpha: 1,
        worldAlpha: 1,
        render: () => {},
        _render: () => {},
        renderAdvanced: () => {},
        addChild(child) {
            this.children = this.children ?? [];
            this.children.push(child);
            return child;
        },
        template: { visible: true, renderable: true, alpha: 1, worldAlpha: 1, render: () => {} },
        mesh: { visible: true, renderable: true, alpha: 1, worldAlpha: 1, render: () => {} },
        shape: { visible: true, renderable: true, alpha: 1, worldAlpha: 1, render: () => {} },
        border: { visible: true, renderable: true, alpha: 1, worldAlpha: 1, render: () => {} },
        ruler: { visible: true, renderable: true, alpha: 1, worldAlpha: 1, text: '20 ft' },
        controlIcon: { visible: true, renderable: true, alpha: 1, worldAlpha: 1 }
    };

    crosshairAdapter.hidePreview(mockPlaceable);

    assert.equal(mockPlaceable.visible, true, 'root placeable visible must be true so Foundry V13 highlightLayer.visible is not suppressed');
    assert.equal(mockPlaceable.isVisible, true, 'root placeable isVisible must be true');
    assert.equal(mockPlaceable.renderable, true);
    assert.equal(mockPlaceable.template.visible, false);
    assert.equal(mockPlaceable.template.alpha, 0);
    assert.equal(mockPlaceable.mesh.visible, false);
    assert.equal(mockPlaceable.shape.visible, false);
    assert.equal(mockPlaceable.border.visible, false);
    assert.equal(mockPlaceable.ruler.visible, false);
    assert.equal(mockPlaceable.controlIcon.visible, false);

    // Verify getter locks prevent reassignment to false on root placeable
    mockPlaceable.visible = false;
    assert.equal(mockPlaceable.visible, true, 'visible getter on root placeable must lock to true');

    // Verify getter locks on child visual containers prevent reassignment to true
    mockPlaceable.template.visible = true;
    mockPlaceable.template.alpha = 1;
    mockPlaceable.template.worldAlpha = 1;
    assert.equal(mockPlaceable.template.visible, false, 'visible getter on child container must lock to false');
    assert.equal(mockPlaceable.template.alpha, 0, 'alpha getter on child container must lock to 0');
    assert.equal(mockPlaceable.template.worldAlpha, 0, 'worldAlpha getter on child container must lock to 0');

    // Verify render override produces zero PIXI draw execution
    let renderCalled = false;
    mockPlaceable.render = () => { renderCalled = true; };
    mockPlaceable.render();
    assert.equal(renderCalled, false, 'render method must remain a no-op getter');

    // Verify dynamic property reassignment is neutralized
    const newTemplateContainer = { visible: true, renderable: true, alpha: 1, worldAlpha: 1 };
    mockPlaceable.template = newTemplateContainer;
    assert.equal(newTemplateContainer.visible, false, 'Newly assigned template container must be neutralized');
    assert.equal(newTemplateContainer.alpha, 0);

    // Verify addChild intercepts and neutralizes newly added display objects
    const dynamicChild = { visible: true, renderable: true, alpha: 1, worldAlpha: 1 };
    mockPlaceable.addChild(dynamicChild);
    assert.equal(dynamicChild.visible, false, 'Newly added child via addChild must be neutralized');
    assert.equal(dynamicChild.alpha, 0);

    // Simulate mouse move triggering refresh and _refresh
    mockPlaceable.refresh();
    assert.equal(mockPlaceable.visible, true, 'root placeable visible must remain true after refresh');
    assert.equal(mockPlaceable.mesh.visible, false);

    if (mockPlaceable._refresh) {
        mockPlaceable._refresh();
    }
    assert.equal(mockPlaceable.visible, true, 'root placeable visible must remain true after _refresh');
    assert.equal(mockPlaceable.shape.visible, false);
});

test('crosshairAdapter.isPreview reliably recognizes both Region and MeasuredTemplate unpersisted previews', () => {
    const origScene = globalThis.canvas?.scene;
    try {
        if (!globalThis.canvas) globalThis.canvas = {};
        globalThis.canvas.scene = {
            templates: new Map([['tmpl_persisted_123', {}]]),
            regions: new Map([['reg_abc123', {}]])
        };

        const adapter = new FoundryVTTV14Adapter();
        const mtPreview = { isPreview: true, document: { id: null } };
        assert.equal(adapter.isPreview(mtPreview), true);

        // V14 preview with ephemeral generated document id (not in scene.templates)
        const v14Preview = { document: { id: 'ephemeral_random_id' } };
        assert.equal(adapter.isPreview(v14Preview), true);

        const regionPreview = { document: { id: undefined } };
        assert.equal(adapter.isPreview(regionPreview), true);

        const persistedRegion = { isPreview: false, document: { id: 'reg_abc123' } };
        assert.equal(adapter.isPreview(persistedRegion), false);

        const editedPersistedRegion = { isPreview: true, document: { id: 'reg_abc123' } };
        assert.equal(adapter.isPreview(editedPersistedRegion), false);

        const persistedTemplate = { document: { id: 'tmpl_persisted_123' } };
        assert.equal(adapter.isPreview(persistedTemplate), false);

        const dismissedPreview = { _bbcDismissed: true, document: { id: 'ephemeral_123' } };
        assert.equal(adapter.isPreview(dismissedPreview), false);
    } finally {
        if (origScene !== undefined) globalThis.canvas.scene = origScene;
        else delete globalThis.canvas.scene;
    }
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

    // Verify Region shape types: line, ray, segment, rectangle, cone
    const mockLineRegionDoc = {
        shapes: {
            contents: [{
                type: 'line',
                distance: 60,
                width: 5,
                x: 100,
                y: 200,
                toObject: () => ({ type: 'line', distance: 60, width: 5, x: 100, y: 200 })
            }]
        }
    };
    const lineProps = adapterV14.detectProperties(mockLineRegionDoc);
    assert.equal(lineProps.type, 'ray');
    assert.equal(lineProps.x, 100);
    assert.equal(lineProps.y, 200);

    const mockRayRegionDoc = {
        shapes: {
            contents: [{
                type: 'ray',
                distance: 100,
                width: 10,
                x: 0,
                y: 0,
                toObject: () => ({ type: 'ray', distance: 100, width: 10, x: 0, y: 0 })
            }]
        }
    };
    const rayProps = adapterV14.detectProperties(mockRayRegionDoc);
    assert.equal(rayProps.type, 'ray');

    // Test _formatRegionShapeUpdate with 60ft by 5ft ray
    const rayCoords = adapterV14.formatPlacementCoordinates(100, 200, 45, {
        type: 'ray',
        distance: 60,
        width: 5,
        gridUnits: true
    });
    const updatedRayShape = adapterV14._formatRegionShapeUpdate({ type: 'line' }, rayCoords);
    assert.equal(updatedRayShape.distance, 1200, 'Ray length in px (60ft * 20px/ft) must be 1200');
    assert.equal(updatedRayShape.length, 1200, 'Ray length in px (60ft * 20px/ft) must be 1200');
    assert.equal(updatedRayShape.width, 100, 'Ray width in px (5ft * 20px/ft) must be 100');
    assert.equal(updatedRayShape.thickness, 100, 'Ray thickness in px (5ft * 20px/ft) must be 100');

    const detectedUpdatedRay = adapterV14.detectProperties({
        shapes: { contents: [updatedRayShape] }
    });
    assert.equal(detectedUpdatedRay.distance, 60, 'Detected distance should be 60ft');
    assert.equal(detectedUpdatedRay.width, 5, 'Detected width should be 5ft');

    const mockConeRegionDoc = {
        shapes: {
            contents: [{
                type: 'cone',
                radius: 30,
                angle: 60,
                x: 0,
                y: 0,
                toObject: () => ({ type: 'cone', radius: 30, angle: 60, x: 0, y: 0 })
            }]
        }
    };
    const coneProps = adapterV14.detectProperties(mockConeRegionDoc);
    assert.equal(coneProps.type, 'cone');
    assert.equal(coneProps.angle, 60);

    // Verify square/rect MeasuredTemplate direction normalization (45 deg diagonal -> 0 deg orientation)
    const mockSquareTemplateDoc = {
        t: 'rect',
        distance: 42.426,
        width: 30,
        direction: 45,
        x: 0,
        y: 0
    };
    const squareTemplateProps = adapterV14.detectProperties(mockSquareTemplateDoc);
    assert.equal(squareTemplateProps.type, 'square');
    assert.equal(squareTemplateProps.direction, 0, 'MeasuredTemplate square direction should normalize to 0 degrees');

    // Verify square/rect Region shape direction normalization
    const mockSquareRegionDoc = {
        shapes: {
            contents: [{
                type: 'rectangle',
                width: 600,
                height: 600,
                rotation: 0,
                x: 0,
                y: 0,
                toObject: () => ({ type: 'rectangle', width: 600, height: 600, rotation: 0, x: 0, y: 0 })
            }]
        }
    };
    const squareRegionProps = adapterV14.detectProperties(mockSquareRegionDoc);
    assert.equal(squareRegionProps.type, 'square');
    assert.equal(squareRegionProps.direction, 0, 'Region square direction should be 0 degrees');

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

    const mockTokenInstance = new crosshairAdapter.Token({ name: 'Hero' });
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
        adapter.initializeHooks({ foundryAdapter: adapterV14, sysAdapter: systemAdapter });
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
            ...origSequencer,
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
    const origMousePos = globalThis.canvas?.mousePosition;
    try {
        if (!globalThis.canvas) globalThis.canvas = {};
        globalThis.canvas.mousePosition = { x: 500, y: 500 };
        attachedConeShape.move(500, 500);

        // Simulate clicking to place attached cone
        attachedConeShape.onPlacedCallback({ x: 500, y: 500 });

        assert.ok(resolvedAttachedCone, 'Attached cone placement must resolve');
        assert.equal(resolvedAttachedCone.x, 200, 'Attached cone X must anchor to token edge (x: 200)');
        assert.equal(resolvedAttachedCone.y, 200, 'Attached cone Y must anchor to token edge (y: 200)');
        const expectedAttachedAngle = (Math.atan2(500 - 200, 500 - 200) * (180 / Math.PI) + 360) % 360; // 45 deg
        assert.equal(Math.round(resolvedAttachedCone.direction * 100) / 100, Math.round(expectedAttachedAngle * 100) / 100, 'Attached cone direction must point towards mouse cursor (45 deg)');
        assert.equal(Math.round(resolvedAttachedCone.rotation * 100) / 100, Math.round(expectedAttachedAngle * 100) / 100, 'Attached cone rotation must match direction');
    } finally {
        if (globalThis.canvas) {
            if (origMousePos !== undefined) globalThis.canvas.mousePosition = origMousePos;
            else delete globalThis.canvas.mousePosition;
        }
    }
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
    const origScene = globalThis.canvas?.scene;
    try {
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
    } finally {
        if (globalThis.canvas) globalThis.canvas.scene = origScene;
    }
});

test('BaseSystemAdapter and Dnd5eSystemAdapter item and activity sheet & context menu integration', async (t) => {
    const dndAdapter = new Dnd5eSystemAdapter();

    // 1. Hook names contracts
    const itemSheetHooks = dndAdapter._getItemSheetHookNames();
    const actSheetHooks = dndAdapter._getActivitySheetHookNames();
    const itemContextHooks = dndAdapter._getItemContextHookNames();
    const actContextHooks = dndAdapter._getActivityContextHookNames();

    assert.ok(itemSheetHooks.includes('getHeaderControlsItemSheet5e2'));
    assert.ok(actSheetHooks.includes('getHeaderControlsActivitySheet5e'));
    assert.ok(actSheetHooks.includes('getHeaderControlsAttackSheet'));
    assert.ok(itemContextHooks.includes('dnd5e.getItemContextOptions'));
    assert.ok(actContextHooks.includes('dnd5e.getActivityContextOptions'));

    // Mock Item document
    let openedConfig = null;
    dndAdapter.openItemCrosshairConfig = (item, options = {}) => {
        openedConfig = { item, options };
    };

    const mockItem = {
        id: 'item-123',
        documentName: 'Item',
        isOwner: true,
        flags: {
            'bakana-better-crosshairs': {
                activityConfigs: {
                    'act-cast': { enabled: true, circleFile: 'jb2a.circle.blue' }
                }
            }
        },
        getFlag(mod, key) {
            return this.flags?.[mod]?.[key] ?? null;
        }
    };

    const mockActivity = {
        id: 'act-cast',
        item: mockItem
    };

    // 2. addItemSheetHeaderControl on item sheet
    const itemControls = [];
    dndAdapter.addItemSheetHeaderControl({ document: mockItem }, itemControls);
    assert.equal(itemControls.length, 1);
    assert.equal(itemControls[0].label, 'BBC');
    assert.ok(itemControls[0].icon.includes('bbc-header-icon-custom'), 'Should have custom icon when activityConfigs is non-empty');
    itemControls[0].onClick();
    assert.equal(openedConfig.item.id, 'item-123');
    assert.deepEqual(openedConfig.options, {});

    // Duplicate prevention
    dndAdapter.addItemSheetHeaderControl({ document: mockItem }, itemControls);
    assert.equal(itemControls.length, 1, 'Should not add duplicate control');

    // 3. addItemSheetHeaderControl forwarding to Activity Sheet
    const forwardedControls = [];
    dndAdapter.addItemSheetHeaderControl({ activity: mockActivity, item: mockItem }, forwardedControls);
    assert.equal(forwardedControls.length, 1);
    assert.equal(forwardedControls[0].label, 'BBC');
    assert.ok(forwardedControls[0].icon.includes('bbc-header-icon-custom'));
    forwardedControls[0].onClick();
    assert.equal(openedConfig.item.id, 'item-123');
    assert.equal(openedConfig.options.selectedScope, 'act-cast');

    // 4. addActivitySheetHeaderControl directly
    const actControls = [];
    const mockActivityNoCustom = { id: 'act-save', item: mockItem };
    dndAdapter.addActivitySheetHeaderControl({ activity: mockActivityNoCustom, item: mockItem }, actControls);
    assert.equal(actControls.length, 1);
    assert.equal(actControls[0].label, 'BBC');
    assert.ok(!actControls[0].icon.includes('bbc-header-icon-custom'), 'Should not have custom badge if activity has no override');
    actControls[0].onClick();
    assert.equal(openedConfig.item.id, 'item-123');
    assert.equal(openedConfig.options.selectedScope, 'act-save');

    // 5. addItemContextOption
    const itemContextOptions = [];
    dndAdapter.addItemContextOption(mockItem, itemContextOptions);
    assert.equal(itemContextOptions.length, 1);
    assert.equal(itemContextOptions[0].name, 'BBC');
    assert.ok(itemContextOptions[0].icon.includes('bbc-header-icon-custom'));
    itemContextOptions[0].callback();
    assert.equal(openedConfig.item.id, 'item-123');

    // Duplicate prevention on item context menu
    dndAdapter.addItemContextOption(mockItem, itemContextOptions);
    assert.equal(itemContextOptions.length, 1);

    // 6. addActivityContextOption
    const actContextOptions = [];
    dndAdapter.addActivityContextOption(mockActivity, actContextOptions);
    assert.equal(actContextOptions.length, 1);
    assert.equal(actContextOptions[0].name, 'BBC');
    assert.ok(actContextOptions[0].icon.includes('bbc-header-icon-custom'));
    actContextOptions[0].callback();
    assert.equal(openedConfig.item.id, 'item-123');
    assert.equal(openedConfig.options.selectedScope, 'act-cast');

    // Duplicate prevention on activity context menu
    dndAdapter.addActivityContextOption(mockActivity, actContextOptions);
    assert.equal(actContextOptions.length, 1);

    // 7. registerItemSheetHooks subscribes all categories
    const registeredEvents = [];
    const origHooksOn = globalThis.Hooks.on;
    globalThis.Hooks.on = (event, fn) => {
        registeredEvents.push(event);
    };

    try {
        dndAdapter.registerItemSheetHooks();
        for (const h of itemSheetHooks) assert.ok(registeredEvents.includes(h), `Item hook ${h} should be registered`);
        for (const h of actSheetHooks) assert.ok(registeredEvents.includes(h), `Activity hook ${h} should be registered`);
        for (const h of itemContextHooks) assert.ok(registeredEvents.includes(h), `Item context hook ${h} should be registered`);
        for (const h of actContextHooks) assert.ok(registeredEvents.includes(h), `Activity context hook ${h} should be registered`);
    } finally {
        globalThis.Hooks.on = origHooksOn;
    }
});

test('FoundryVTTV13Adapter and FoundryVTTV14Adapter apply 30% opacity and game.user.color for system defaults', () => {
    const origColor = globalThis.game?.user?.color;
    try {
        if (!globalThis.game) globalThis.game = { user: {} };
        if (!globalThis.game.user) globalThis.game.user = {};
        globalThis.game.user.color = '#e91e63';

        const adapterV13 = new FoundryVTTV13Adapter();
        const adapterV14 = new FoundryVTTV14Adapter();

        // 1. MeasuredTemplate in V13 with system defaults (no placed overrides)
        let v13TmplUpdate = null;
        const v13TemplateDoc = {
            t: 'circle',
            updateSource: (data) => { v13TmplUpdate = data; }
        };
        adapterV13.applyDocumentPlacement(v13TemplateDoc, { x: 100, y: 200, distance: 20 }, { itemName: 'Fireball' });
        assert.ok(v13TmplUpdate);
        assert.equal(v13TmplUpdate.fillColor, '#e91e63', 'V13 MeasuredTemplate fillColor must default to game.user.color');
        assert.equal(v13TmplUpdate.fillAlpha, 0.3, 'V13 MeasuredTemplate fillAlpha must default to 30% (0.3)');
        assert.equal(v13TmplUpdate.flags.bbc.placedFillColor, '#e91e63');
        assert.equal(v13TmplUpdate.flags.bbc.placedFillAlpha, 0.3);

        // 2. MeasuredTemplate in V14 with system defaults
        let v14TmplUpdate = null;
        const v14TemplateDoc = {
            t: 'cone',
            updateSource: (data) => { v14TmplUpdate = data; }
        };
        adapterV14.applyDocumentPlacement(v14TemplateDoc, { x: 300, y: 400, distance: 30 }, { itemName: 'Cone of Cold' });
        assert.ok(v14TmplUpdate);
        assert.equal(v14TmplUpdate.fillColor, '#e91e63', 'V14 MeasuredTemplate fillColor must default to game.user.color');
        assert.equal(v14TmplUpdate.fillAlpha, 0.3, 'V14 MeasuredTemplate fillAlpha must default to 30% (0.3)');
        assert.equal(v14TmplUpdate.flags.bbc.placedFillColor, '#e91e63');
        assert.equal(v14TmplUpdate.flags.bbc.placedFillAlpha, 0.3);

        // 3. Region in V14 with system defaults
        let v14RegionUpdate = null;
        const v14RegionDoc = {
            shapes: [{ toObject: () => ({ type: 'circle', x: 0, y: 0, radius: 15 }) }],
            updateSource: (data) => { v14RegionUpdate = data; }
        };
        adapterV14.applyDocumentPlacement(v14RegionDoc, { x: 500, y: 600, radius: 25, gridUnits: false }, { itemName: 'Thunderwave' });
        assert.ok(v14RegionUpdate);
        assert.equal(v14RegionUpdate.color, '#e91e63', 'V14 Region color must default to game.user.color');
        assert.equal(v14RegionUpdate.fillColor, undefined, 'V14 Region must not leak fillColor property');
        assert.equal(v14RegionUpdate.fillAlpha, undefined, 'V14 Region must not leak fillAlpha property');
        assert.equal(v14RegionUpdate.flags.bbc.placedFillColor, '#e91e63');
        assert.equal(v14RegionUpdate.flags.bbc.placedFillAlpha, 0.3, 'V14 Region flags.bbc.placedFillAlpha must default to 30% (0.3)');

        // 4. Explicit custom overrides take precedence
        let customUpdate = null;
        const customTemplateDoc = {
            t: 'circle',
            updateSource: (data) => { customUpdate = data; }
        };
        adapterV14.applyDocumentPlacement(customTemplateDoc, { x: 100, y: 200, distance: 20 }, {
            itemName: 'Custom Spell',
            placedFillColor: '#112233',
            placedFillAlpha: 0.8,
            enablePlacedStyling: true
        });
        assert.equal(customUpdate.fillColor, '#112233');
        assert.equal(customUpdate.fillAlpha, 0.8);
        assert.equal(customUpdate.flags.bbc.placedFillColor, '#112233');
        assert.equal(customUpdate.flags.bbc.placedFillAlpha, 0.8);
    } finally {
        if (globalThis.game?.user) {
            if (origColor !== undefined) globalThis.game.user.color = origColor;
            else delete globalThis.game.user.color;
        }
    }
});

test('BaseFoundryVTTAdapter._wrapHighlightGrid synchronizes document, coordinates, ray, and ensures highlightLayer visible', () => {
    let clearHighlightCalled = false;
    const origClear = globalThis.canvas?.interface?.grid?.clearHighlightLayer;
    if (globalThis.canvas?.interface?.grid) {
        globalThis.canvas.interface.grid.clearHighlightLayer = () => { clearHighlightCalled = true; };
    }

    try {
        const adapter = new BaseFoundryVTTAdapter();
        let origHighlightCalled = false;
        let mockDoc = {
            x: 0,
            y: 0,
            direction: 0,
            updateSource(data) { Object.assign(this, data); }
        };
        const mockRay = { origin: { x: 0, y: 0 }, distance: 50 };
        const mockPlaceable = {
            document: mockDoc,
            x: 0,
            y: 0,
            direction: 0,
            ray: mockRay,
            highlightId: 'test-layer-1',
            highlightGrid() { origHighlightCalled = true; }
        };

        adapter.hidePreview(mockPlaceable);

        activePlacementTracker.crosshair = {
            shapeInstance: {
                x: 350,
                y: 450,
                direction: 135
            }
        };

        mockPlaceable.highlightGrid();

        assert.equal(origHighlightCalled, true, 'Original highlightGrid must execute');
        assert.equal(mockDoc.x, 350, 'mockDoc.x must align with crosshair shape x');
        assert.equal(mockDoc.y, 450, 'mockDoc.y must align with crosshair shape y');
        assert.equal(mockDoc.direction, 135, 'mockDoc.direction must align with crosshair shape direction');
        assert.equal(mockPlaceable.x, 350, 'mockPlaceable.x must align with crosshair shape x');
        assert.equal(mockPlaceable.y, 450, 'mockPlaceable.y must align with crosshair shape y');
        assert.equal(mockPlaceable.direction, 135, 'mockPlaceable.direction must align with crosshair shape direction');
        assert.equal(clearHighlightCalled, false, 'highlightGrid must not clear the highlight layer');
    } finally {
        activePlacementTracker.crosshair = null;
        if (globalThis.canvas?.interface?.grid && origClear) {
            globalThis.canvas.interface.grid.clearHighlightLayer = origClear;
        }
    }
});

test('BaseFoundryVTTAdapter.dismissPreview clears and destroys highlight layer on teardown', () => {
    let clearedLayerId = null;
    let destroyedLayerId = null;
    const origClear = globalThis.canvas?.interface?.grid?.clearHighlightLayer;
    const origDestroy = globalThis.canvas?.interface?.grid?.destroyHighlightLayer;
    if (globalThis.canvas?.interface?.grid) {
        globalThis.canvas.interface.grid.clearHighlightLayer = (id) => { clearedLayerId = id; };
        globalThis.canvas.interface.grid.destroyHighlightLayer = (id) => { destroyedLayerId = id; };
    }

    try {
        const adapter = new BaseFoundryVTTAdapter();
        const mockPlaceable = {
            highlightId: 'preview-spell-template-42',
            destroy: () => {}
        };

        adapter.dismissPreview(mockPlaceable);
        assert.equal(clearedLayerId, 'preview-spell-template-42', 'dismissPreview must clear the highlight layer');
        assert.equal(destroyedLayerId, 'preview-spell-template-42', 'dismissPreview must destroy the highlight layer');
    } finally {
        if (globalThis.canvas?.interface?.grid) {
            if (origClear) globalThis.canvas.interface.grid.clearHighlightLayer = origClear;
            if (origDestroy) globalThis.canvas.interface.grid.destroyHighlightLayer = origDestroy;
        }
    }
});

test('FoundryVTTV13Adapter.refreshTemplateHighlights updates document and placeable coordinates and invokes highlightGrid without clearing', () => {
    let clearHighlightCalled = false;
    const origClear = globalThis.canvas?.interface?.grid?.clearHighlightLayer;
    if (globalThis.canvas?.interface?.grid) {
        globalThis.canvas.interface.grid.clearHighlightLayer = () => { clearHighlightCalled = true; };
    }

    try {
        const adapterV13 = new FoundryVTTV13Adapter();
        let highlightGridCalled = false;
        let applyRenderFlagsCalled = false;
        let refreshPosCalled = false;
        let refreshShapeCalled = false;

        const mockDoc = {
            direction: 0,
            x: 100,
            y: 200,
            updateSource(data) { Object.assign(this, data); }
        };
        const mockTmpl = {
            document: mockDoc,
            direction: 0,
            x: 100,
            y: 200,
            renderFlags: { set: () => {} },
            _refreshPosition() { refreshPosCalled = true; },
            _refreshShape() { refreshShapeCalled = true; },
            applyRenderFlags() { applyRenderFlagsCalled = true; },
            highlightGrid() { highlightGridCalled = true; }
        };

        adapterV13.refreshTemplateHighlights(mockTmpl, 180);

        assert.equal(mockTmpl.direction, 180);
        assert.equal(mockDoc.direction, 180);
        assert.equal(mockDoc.x, 100);
        assert.equal(mockDoc.y, 200);
        assert.equal(refreshPosCalled, true, '_refreshPosition must be called');
        assert.equal(refreshShapeCalled, true, '_refreshShape must be called');
        assert.equal(applyRenderFlagsCalled, true, 'applyRenderFlags must be called');
        assert.equal(highlightGridCalled, true, 'highlightGrid must be called');
        assert.equal(clearHighlightCalled, false, 'refreshTemplateHighlights must not clear highlight layer');
    } finally {
        if (globalThis.canvas?.interface?.grid && origClear) {
            globalThis.canvas.interface.grid.clearHighlightLayer = origClear;
        }
    }
});

test('FoundryVTTV14Adapter.refreshTemplateHighlights computes grid cell highlights for Region using testPoint and highlightPosition', () => {
    const origClear = globalThis.canvas?.interface?.grid?.clearHighlightLayer;
    const origAdd = globalThis.canvas?.interface?.grid?.addHighlightLayer;
    const origHighlight = globalThis.canvas?.interface?.grid?.highlightPosition;
    const origOffsetRange = globalThis.canvas?.grid?.getOffsetRange;

    const highlightedCells = [];
    let layerAdded = null;
    let layerCleared = null;

    if (globalThis.canvas?.interface?.grid) {
        globalThis.canvas.interface.grid.addHighlightLayer = (id) => { layerAdded = id; };
        globalThis.canvas.interface.grid.clearHighlightLayer = (id) => { layerCleared = id; };
        globalThis.canvas.interface.grid.highlightPosition = (id, pos) => {
            highlightedCells.push({ id, ...pos });
        };
    }
    if (globalThis.canvas?.grid) {
        globalThis.canvas.grid.getOffsetRange = () => [0, 0, 1, 1];
    }

    try {
        const adapterV14 = new FoundryVTTV14Adapter();
        let applyRenderFlagsCalled = false;

        const mockRegionDoc = {
            id: 'region-42',
            documentName: 'Region',
            color: '#336699',
            shapes: [{ type: 'rectangle' }]
        };
        const mockRegion = {
            document: mockRegionDoc,
            bounds: { x: 0, y: 0, width: 200, height: 200 },
            renderFlags: { set: () => {} },
            applyRenderFlags() { applyRenderFlagsCalled = true; },
            testPoint(pt) {
                // Return true for points within bounds
                return pt.x <= 150 && pt.y <= 150;
            }
        };

        adapterV14.refreshTemplateHighlights(mockRegion, 0);

        assert.equal(layerAdded, 'Region.region-42');
        assert.equal(layerCleared, 'Region.region-42');
        assert.equal(applyRenderFlagsCalled, true);
        assert.ok(highlightedCells.length > 0, 'Must highlight matching grid cells under region');
        assert.equal(highlightedCells[0].id, 'Region.region-42');
    } finally {
        if (globalThis.canvas?.interface?.grid) {
            if (origClear) globalThis.canvas.interface.grid.clearHighlightLayer = origClear;
            if (origAdd) globalThis.canvas.interface.grid.addHighlightLayer = origAdd;
            if (origHighlight) globalThis.canvas.interface.grid.highlightPosition = origHighlight;
        }
        if (globalThis.canvas?.grid && origOffsetRange) {
            globalThis.canvas.grid.getOffsetRange = origOffsetRange;
        }
    }
});

test('FoundryVTTV14Adapter.refreshTemplateHighlights ensures highlightLayer visibility is preserved for MeasuredTemplate', () => {
    let clearHighlightCalled = false;
    const origClear = globalThis.canvas?.interface?.grid?.clearHighlightLayer;
    if (globalThis.canvas?.interface?.grid) {
        globalThis.canvas.interface.grid.clearHighlightLayer = () => { clearHighlightCalled = true; };
    }

    try {
        const adapterV14 = new FoundryVTTV14Adapter();
        let highlightGridCalled = false;
        let applyRenderFlagsCalled = false;

        const mockRay = { origin: { x: 50, y: 50 }, distance: 100 };
        const mockTemplateDoc = {
            documentName: 'MeasuredTemplate',
            direction: 0,
            x: 50,
            y: 50,
            updateSource(data) { Object.assign(this, data); }
        };
        const mockTemplate = {
            document: mockTemplateDoc,
            direction: 0,
            ray: mockRay,
            x: 50,
            y: 50,
            highlightId: 'test-v14-tmpl',
            renderFlags: { set: () => {} },
            applyRenderFlags() { applyRenderFlagsCalled = true; },
            highlightGrid() { highlightGridCalled = true; }
        };

        adapterV14.refreshTemplateHighlights(mockTemplate, 270);

        assert.equal(mockTemplate.direction, 270);
        assert.equal(mockTemplateDoc.direction, 270);
        assert.strictEqual(mockTemplate.ray, mockRay, 'V14 MeasuredTemplate must not overwrite tmpl.ray');
        assert.equal(applyRenderFlagsCalled, true);
        assert.equal(highlightGridCalled, true, 'MeasuredTemplate highlightGrid must be called');
        assert.equal(clearHighlightCalled, false, 'MeasuredTemplate refresh must not clear highlight layer');
    } finally {
        if (globalThis.canvas?.interface?.grid && origClear) {
            globalThis.canvas.interface.grid.clearHighlightLayer = origClear;
        }
    }
});

test('FoundryVTTV13Adapter.refreshTemplateHighlights calculates 45 degree diagonal angle and diagonal distance for rect MeasuredTemplates', () => {
    const adapterV13 = new FoundryVTTV13Adapter();
    const mockDoc = {
        t: 'rect',
        distance: 20,
        width: 20,
        direction: 0,
        x: 100,
        y: 100,
        updateSource(data) { Object.assign(this, data); }
    };
    const mockTmpl = {
        document: mockDoc,
        t: 'rect',
        direction: 0,
        x: 100,
        y: 100,
        ray: { origin: { x: 100, y: 100 }, distance: 100 },
        renderFlags: { set: () => {} },
        _refreshPosition() {},
        _refreshShape() {},
        applyRenderFlags() {},
        highlightGrid() {}
    };

    adapterV13.refreshTemplateHighlights(mockTmpl, 0);

    assert.equal(Math.round(mockDoc.direction), 45);
    assert.equal(Math.round(mockTmpl.direction), 45);
    assert.equal(mockDoc.width, 20);
    assert.equal(mockDoc.distance, 28.28);
    assert.ok(mockTmpl.ray);
    // At 45 degrees on 100px/5ft grid, dx and dy should both be 400px (20ft * 20px/ft)
    assert.equal(Math.round(mockTmpl.ray.B.x - mockTmpl.ray.A.x), 400);
    assert.equal(Math.round(mockTmpl.ray.B.y - mockTmpl.ray.A.y), 400);
});

test('FoundryVTTV14Adapter.refreshTemplateHighlights calculates 45 degree diagonal angle and diagonal distance for rect MeasuredTemplates without mutating ray', () => {
    const adapterV14 = new FoundryVTTV14Adapter();
    const mockRay = { origin: { x: 100, y: 100 }, distance: 100 };
    const mockDoc = {
        documentName: 'MeasuredTemplate',
        t: 'rect',
        distance: 20,
        width: 20,
        direction: 0,
        x: 100,
        y: 100,
        updateSource(data) { Object.assign(this, data); }
    };
    const mockTmpl = {
        document: mockDoc,
        t: 'rect',
        direction: 0,
        x: 100,
        y: 100,
        ray: mockRay,
        renderFlags: { set: () => {} },
        _refreshPosition() {},
        _refreshShape() {},
        applyRenderFlags() {},
        highlightGrid() {}
    };

    adapterV14.refreshTemplateHighlights(mockTmpl, 0);

    assert.equal(Math.round(mockDoc.direction), 45);
    assert.equal(Math.round(mockTmpl.direction), 45);
    assert.equal(mockDoc.width, 20);
    assert.equal(mockDoc.distance, 28.28);
    assert.strictEqual(mockTmpl.ray, mockRay, 'V14 MeasuredTemplate must not overwrite tmpl.ray');
});

test('BaseFoundryVTTAdapter._wrapHighlightGrid updates rect MeasuredTemplate with diagonal direction and distance before calculating highlights', () => {
    const adapter = new BaseFoundryVTTAdapter();
    const mockDoc = {
        t: 'rect',
        distance: 20,
        width: 20,
        direction: 0,
        x: 100,
        y: 100,
        updateSource(data) { Object.assign(this, data); }
    };
    let origHighlightCalled = false;
    const mockTmpl = {
        document: mockDoc,
        t: 'rect',
        direction: 0,
        x: 100,
        y: 100,
        ray: { origin: { x: 100, y: 100 }, distance: 100 },
        crosshair: {
            shapeInstance: {
                x: 100,
                y: 100,
                direction: 0,
                config: { width: 20, distance: 20 }
            }
        },
        highlightGrid() { origHighlightCalled = true; }
    };

    adapter._wrapHighlightGrid(mockTmpl);
    mockTmpl.highlightGrid();

    assert.equal(origHighlightCalled, true);
    assert.equal(Math.round(mockDoc.direction), 45);
    assert.equal(Math.round(mockTmpl.direction), 45);
    assert.equal(mockDoc.width, 20);
    assert.equal(mockDoc.distance, 28.28);
    assert.equal(Math.round(mockTmpl.ray.B.x - mockTmpl.ray.A.x), 400);
    assert.equal(Math.round(mockTmpl.ray.B.y - mockTmpl.ray.A.y), 400);
});

test('FoundryVTTV13Adapter and FoundryVTTV14Adapter applyDocumentPlacement assign 45 degree diagonal direction for square MeasuredTemplates', () => {
    const adapterV13 = new FoundryVTTV13Adapter();
    const adapterV14 = new FoundryVTTV14Adapter();

    const docV13 = { t: 'rect', direction: 0, updateSource(d) { Object.assign(this, d); } };
    adapterV13.applyDocumentPlacement(docV13, { x: 100, y: 100, direction: 0, width: 20, distance: 20, type: 'square' });
    assert.equal(Math.round(docV13.direction), 45);
    assert.equal(docV13.width, 20);
    assert.equal(docV13.distance, 28.28);

    const docV14 = { documentName: 'MeasuredTemplate', t: 'rect', direction: 0, updateSource(d) { Object.assign(this, d); } };
    adapterV14.applyDocumentPlacement(docV14, { x: 100, y: 100, direction: 0, width: 20, distance: 20, type: 'square' });
    assert.equal(Math.round(docV14.direction), 45);
    assert.equal(docV14.width, 20);
    assert.equal(docV14.distance, 28.28);
});

test('BaseFoundryVTTAdapter.dismissPreview clears and destroys Region highlight layers for V14 Region placeables without highlightId', () => {
    const clearedLayers = [];
    const destroyedLayers = [];
    const origClear = globalThis.canvas?.interface?.grid?.clearHighlightLayer;
    const origDestroy = globalThis.canvas?.interface?.grid?.destroyHighlightLayer;
    const origHighlightLayers = globalThis.canvas?.interface?.grid?.highlightLayers;

    const mockHighlightLayers = {
        'Region.preview': { clear: () => {}, destroy: () => {} },
        'Region.reg123': { clear: () => {}, destroy: () => {} }
    };

    if (globalThis.canvas?.interface?.grid) {
        globalThis.canvas.interface.grid.clearHighlightLayer = (id) => { clearedLayers.push(id); };
        globalThis.canvas.interface.grid.destroyHighlightLayer = (id) => { destroyedLayers.push(id); };
        globalThis.canvas.interface.grid.highlightLayers = mockHighlightLayers;
    }

    try {
        const adapter = new FoundryVTTV14Adapter();
        const mockRegionPlaceable = {
            id: 'reg123',
            document: {
                id: 'reg123',
                documentName: 'Region'
            },
            destroy: () => {}
        };

        adapter.dismissPreview(mockRegionPlaceable);

        assert.ok(clearedLayers.includes('Region.reg123'), 'Region.reg123 should be cleared');
        assert.ok(destroyedLayers.includes('Region.reg123'), 'Region.reg123 should be destroyed');
        assert.ok(clearedLayers.includes('Region.preview'), 'Region.preview should be cleared');
        assert.ok(destroyedLayers.includes('Region.preview'), 'Region.preview should be destroyed');
    } finally {
        if (globalThis.canvas?.interface?.grid) {
            if (origClear) globalThis.canvas.interface.grid.clearHighlightLayer = origClear;
            if (origDestroy) globalThis.canvas.interface.grid.destroyHighlightLayer = origDestroy;
            globalThis.canvas.interface.grid.highlightLayers = origHighlightLayers;
        }
    }
});

test('BaseFoundryVTTAdapter and version adapters do not throw on getter-only highlightId during grid highlighting', () => {
    const adapterV13 = new FoundryVTTV13Adapter();
    const adapterV14 = new FoundryVTTV14Adapter();

    let v13HighlightRan = false;
    let v14HighlightRan = false;

    class GetterOnlyMeasuredTemplate {
        get highlightId() { return 'Template.null'; }
        get objectId() { return 'Template.null'; }
        highlightGrid() { v13HighlightRan = true; }
        applyRenderFlags() {}
    }

    const mockTmplV13 = new GetterOnlyMeasuredTemplate();
    mockTmplV13.document = { t: 'circle', distance: 20, updateSource() {} };

    adapterV13._wrapHighlightGrid(mockTmplV13);
    assert.doesNotThrow(() => {
        mockTmplV13.highlightGrid();
    });
    assert.equal(v13HighlightRan, true, 'Wrapped highlightGrid must invoke original highlightGrid without throwing');

    assert.doesNotThrow(() => {
        adapterV13.refreshTemplateHighlights(mockTmplV13, 0);
    });

    const mockTmplV14 = new GetterOnlyMeasuredTemplate();
    mockTmplV14.highlightGrid = () => { v14HighlightRan = true; };
    mockTmplV14.document = { documentName: 'MeasuredTemplate', t: 'circle', distance: 20, updateSource() {} };

    adapterV14._wrapHighlightGrid(mockTmplV14);
    assert.doesNotThrow(() => {
        mockTmplV14.highlightGrid();
    });
    assert.equal(v14HighlightRan, true, 'V14 wrapped highlightGrid must invoke original highlightGrid without throwing');

    assert.doesNotThrow(() => {
        adapterV14.refreshTemplateHighlights(mockTmplV14, 0);
    });
});

test('BaseCrosshairShape.onCancelCallback dismisses preview placeable and clears activePlacementTracker', () => {
    let dismissedPlaceable = null;
    const origDismiss = crosshairAdapter.dismissPreview;
    crosshairAdapter.dismissPreview = (p) => {
        dismissedPlaceable = p;
    };

    try {
        const mockPlaceable = {
            id: 'cancel-crosshair-placeable',
            document: { direction: 0, updateSource: () => {} },
            direction: 0,
            x: 50,
            y: 50,
            destroy: () => {}
        };
        activePlacementTracker.placeable = mockPlaceable;
        activePlacementTracker.crosshair = {};

        const shape = new BaseCrosshairShape(mockPlaceable, { type: 'circle', id: 'cancel-test' });
        shape.onCancelCallback();

        assert.equal(dismissedPlaceable, mockPlaceable, 'dismissPreview must be called on the placeable');
        assert.equal(activePlacementTracker.placeable, null, 'activePlacementTracker.placeable must be reset to null');
        assert.equal(activePlacementTracker.crosshair, null, 'activePlacementTracker.crosshair must be reset to null');
    } finally {
        crosshairAdapter.dismissPreview = origDismiss;
        activePlacementTracker.placeable = null;
        activePlacementTracker.crosshair = null;
    }
});

test('FoundryVTTV14Adapter patches CONST.MEASURED_TEMPLATE_TYPES deprecation getter and provides static enum without warnings', () => {
    const origDesc = Object.getOwnPropertyDescriptor(globalThis.CONST, 'MEASURED_TEMPLATE_TYPES');

    try {
        let warningCount = 0;
        Object.defineProperty(globalThis.CONST, 'MEASURED_TEMPLATE_TYPES', {
            get() {
                warningCount++;
                return {
                    CIRCLE: 'circle',
                    CONE: 'cone',
                    RECTANGLE: 'rect',
                    RAY: 'ray'
                };
            },
            configurable: true,
            enumerable: true
        });

        // Verify initial read triggers warning getter
        const initial = globalThis.CONST.MEASURED_TEMPLATE_TYPES;
        assert.equal(initial.CIRCLE, 'circle');
        assert.equal(warningCount, 1, 'Deprecation getter must have been triggered once before patch');

        // Reset warning counter and re-attach getter
        warningCount = 0;
        Object.defineProperty(globalThis.CONST, 'MEASURED_TEMPLATE_TYPES', {
            get() {
                warningCount++;
                return {
                    CIRCLE: 'circle',
                    CONE: 'cone',
                    RECTANGLE: 'rect',
                    RAY: 'ray'
                };
            },
            configurable: true,
            enumerable: true
        });

        // Instantiating FoundryVTTV14Adapter must patch CONST.MEASURED_TEMPLATE_TYPES without invoking getter
        const adapterV14 = new FoundryVTTV14Adapter();
        assert.equal(warningCount, 0, 'Deprecation getter must NOT be called during adapter instantiation or patching');

        // Reading properties from CONST.MEASURED_TEMPLATE_TYPES must now return values without calling getter
        const types = globalThis.CONST.MEASURED_TEMPLATE_TYPES;
        assert.equal(types.CIRCLE, 'circle');
        assert.equal(types.CONE, 'cone');
        assert.equal(types.RECTANGLE, 'rect');
        assert.equal(types.RAY, 'ray');
        assert.equal(warningCount, 0, 'Subsequent reads to CONST.MEASURED_TEMPLATE_TYPES must not invoke deprecation getter');

        // Idempotency check: calling _patchDeprecations again does not throw or regress
        assert.doesNotThrow(() => {
            adapterV14._patchDeprecations();
        });
        assert.equal(warningCount, 0);

        // Test missing case: when MEASURED_TEMPLATE_TYPES is deleted, _patchDeprecations defines static enum
        delete globalThis.CONST.MEASURED_TEMPLATE_TYPES;
        assert.equal(globalThis.CONST.MEASURED_TEMPLATE_TYPES, undefined);
        adapterV14._patchDeprecations();
        assert.ok(globalThis.CONST.MEASURED_TEMPLATE_TYPES);
        assert.equal(globalThis.CONST.MEASURED_TEMPLATE_TYPES.CIRCLE, 'circle');
        assert.equal(globalThis.CONST.MEASURED_TEMPLATE_TYPES.CONE, 'cone');
        assert.equal(globalThis.CONST.MEASURED_TEMPLATE_TYPES.RECTANGLE, 'rect');
        assert.equal(globalThis.CONST.MEASURED_TEMPLATE_TYPES.RAY, 'ray');
    } finally {
        if (origDesc) {
            Object.defineProperty(globalThis.CONST, 'MEASURED_TEMPLATE_TYPES', origDesc);
        } else {
            delete globalThis.CONST.MEASURED_TEMPLATE_TYPES;
        }
    }
});

test('FoundryVTTV13Adapter preserves legacy NOP rule and does not touch CONST.MEASURED_TEMPLATE_TYPES', () => {
    const origDesc = Object.getOwnPropertyDescriptor(globalThis.CONST, 'MEASURED_TEMPLATE_TYPES');

    try {
        let getterRan = false;
        Object.defineProperty(globalThis.CONST, 'MEASURED_TEMPLATE_TYPES', {
            get() {
                getterRan = true;
                return { CIRCLE: 'circle' };
            },
            configurable: true
        });

        const adapterV13 = new FoundryVTTV13Adapter();
        assert.equal(getterRan, false);

        // The descriptor should still be the getter on V13
        const descAfter = Object.getOwnPropertyDescriptor(globalThis.CONST, 'MEASURED_TEMPLATE_TYPES');
        assert.ok(descAfter?.get, 'V13 adapter must not mutate or patch CONST descriptor');
    } finally {
        if (origDesc) {
            Object.defineProperty(globalThis.CONST, 'MEASURED_TEMPLATE_TYPES', origDesc);
        } else {
            delete globalThis.CONST.MEASURED_TEMPLATE_TYPES;
        }
    }
});

test('FoundryVTTV14Adapter suppresses MEASURED_TEMPLATE_TYPES warnings even when CONST is frozen', () => {
    const origLog = globalThis.foundry.utils.logCompatibilityWarning;
    const origConst = globalThis.CONST;

    try {
        const loggedWarnings = [];
        globalThis.foundry.utils.logCompatibilityWarning = (message, options) => {
            loggedWarnings.push(message);
        };

        // Create a frozen CONST mimicking Foundry V14 runtime
        const mockV14Const = {};
        Object.defineProperty(mockV14Const, 'MEASURED_TEMPLATE_TYPES', {
            get() {
                globalThis.foundry.utils.logCompatibilityWarning('CONST.MEASURED_TEMPLATE_TYPES is deprecated without replacement.', { since: 14, until: 16 });
                return {
                    CIRCLE: 'circle',
                    CONE: 'cone',
                    RECTANGLE: 'rect',
                    RAY: 'ray'
                };
            },
            configurable: false,
            enumerable: false
        });
        Object.freeze(mockV14Const);
        globalThis.CONST = mockV14Const;

        // Verify pre-patch read logs a warning
        assert.equal(globalThis.CONST.MEASURED_TEMPLATE_TYPES.CIRCLE, 'circle');
        assert.equal(loggedWarnings.length, 1);
        assert.ok(loggedWarnings[0].includes('MEASURED_TEMPLATE_TYPES'));

        loggedWarnings.length = 0;

        // Initialize V14 adapter and patch deprecations
        const adapter = new FoundryVTTV14Adapter();
        adapter._patchDeprecations();

        // Verify post-patch read evaluates without logging warning
        assert.equal(globalThis.CONST.MEASURED_TEMPLATE_TYPES.CIRCLE, 'circle');
        assert.equal(globalThis.CONST.MEASURED_TEMPLATE_TYPES.CONE, 'cone');
        assert.equal(loggedWarnings.length, 0, 'MEASURED_TEMPLATE_TYPES warning must be suppressed');

        // Other non-MEASURED_TEMPLATE_TYPES warnings must pass through normally
        globalThis.foundry.utils.logCompatibilityWarning('Some other warning', {});
        assert.equal(loggedWarnings.length, 1);
        assert.equal(loggedWarnings[0], 'Some other warning');
    } finally {
        globalThis.foundry.utils.logCompatibilityWarning = origLog;
        globalThis.CONST = origConst;
    }
});

test('FoundryVTTV14Adapter initializes cleanly when foundry.utils.logCompatibilityWarning is read-only', () => {
    const origLogDesc = Object.getOwnPropertyDescriptor(globalThis.foundry.utils, 'logCompatibilityWarning');
    const origWarn = console.warn;

    try {
        let warnCalled = false;
        console.warn = (...args) => {
            warnCalled = true;
        };

        // Make logCompatibilityWarning strictly read-only and non-configurable
        Object.defineProperty(globalThis.foundry.utils, 'logCompatibilityWarning', {
            value: (msg, opts) => {
                console.warn(new Error(msg));
            },
            writable: false,
            configurable: true
        });

        // Instantiating adapter must NOT throw TypeError
        assert.doesNotThrow(() => {
            const adapter = new FoundryVTTV14Adapter();
            adapter._patchDeprecations();
        });

        // Triggering the read-only logCompatibilityWarning for MEASURED_TEMPLATE_TYPES must be intercepted by console.warn
        warnCalled = false;
        globalThis.foundry.utils.logCompatibilityWarning('CONST.MEASURED_TEMPLATE_TYPES is deprecated without replacement.', {});
        assert.equal(warnCalled, false, 'Warning must be suppressed by console.warn interceptor');

        // Other warnings must pass through
        warnCalled = false;
        globalThis.foundry.utils.logCompatibilityWarning('Other warning', {});
        assert.equal(warnCalled, true, 'Other warnings must pass through');
    } finally {
        if (origLogDesc) {
            Object.defineProperty(globalThis.foundry.utils, 'logCompatibilityWarning', origLogDesc);
        }
        console.warn = origWarn;
    }
});

test('FoundryVTTV14Adapter._computeRotatedRectangleBounds computes exact AABB for 0, 45, and 90 degrees with top-left and center anchors', () => {
    const adapter = new FoundryVTTV14Adapter();

    // 0 degrees, top-left anchor: [100, 300] x [100, 300]
    const b0 = adapter._computeRotatedRectangleBounds({ x: 100, y: 100, width: 200, height: 200, rotation: 0, anchorX: 0, anchorY: 0 });
    assert.equal(b0.x, 100);
    assert.equal(b0.y, 100);
    assert.equal(b0.width, 200);
    assert.equal(b0.height, 200);

    // 45 degrees, top-left anchor: width & height = 200 * sqrt(2) = 282.84
    const b45 = adapter._computeRotatedRectangleBounds({ x: 100, y: 100, width: 200, height: 200, rotation: 45, anchorX: 0, anchorY: 0 });
    assert.ok(Math.abs(b45.x - (-41.421356)) < 0.01, `b45.x (${b45.x}) should be approx -41.42`);
    assert.equal(b45.y, 100);
    assert.ok(Math.abs(b45.width - (200 * Math.SQRT2)) < 0.01, 'b45.width should be approx 282.84');
    assert.ok(Math.abs(b45.height - (200 * Math.SQRT2)) < 0.01, 'b45.height should be approx 282.84');

    // 45 degrees, center anchor (0.5, 0.5): centered around (200, 200)
    const bCenter = adapter._computeRotatedRectangleBounds({ x: 200, y: 200, width: 200, height: 200, rotation: 45, anchorX: 0.5, anchorY: 0.5 });
    assert.ok(Math.abs(bCenter.x - (200 - 100 * Math.SQRT2)) < 0.01);
    assert.ok(Math.abs(bCenter.y - (200 - 100 * Math.SQRT2)) < 0.01);
    assert.ok(Math.abs(bCenter.width - (200 * Math.SQRT2)) < 0.01);
    assert.ok(Math.abs(bCenter.height - (200 * Math.SQRT2)) < 0.01);
});

test('FoundryVTTV14Adapter._testRotatedRectanglePoint tests rotated rectangle points correctly with tolerance', () => {
    const adapter = new FoundryVTTV14Adapter();
    const square45 = { x: 100, y: 100, width: 200, height: 200, rotation: 45, anchorX: 0, anchorY: 0 };

    // Center of square45: (100, 100 + 100 * sqrt(2)) = (100, 241.42)
    const rad45 = (45 * Math.PI) / 180;
    const center = {
        x: 100 + 100 * Math.cos(rad45) - 100 * Math.sin(rad45),
        y: 100 + 100 * Math.sin(rad45) + 100 * Math.cos(rad45)
    };
    assert.equal(adapter._testRotatedRectanglePoint(square45, center), true, 'Center must be inside rotated square');

    // Tip at (100, 100)
    assert.equal(adapter._testRotatedRectanglePoint(square45, { x: 100, y: 100 }), true, 'Origin vertex must be inside');

    // Opposite tip C at (100, 100 + 200 * sqrt(2)) = (100, 382.84)
    assert.equal(adapter._testRotatedRectanglePoint(square45, { x: 100, y: 382 }), true, 'Tip C must be inside');

    // Outside point (unrotated top-right at 290, 110, which is outside the 45-deg diamond)
    assert.equal(adapter._testRotatedRectanglePoint(square45, { x: 290, y: 110 }), false, 'Unrotated top-right corner must be outside 45-deg diamond');

    // Far outside point
    assert.equal(adapter._testRotatedRectanglePoint(square45, { x: 500, y: 500 }), false, 'Far outside point must be false');
});

test('FoundryVTTV14Adapter.refreshTemplateHighlights calculates rotated bounding box and highlights rotated square region cells', () => {
    const origClear = globalThis.canvas?.interface?.grid?.clearHighlightLayer;
    const origAdd = globalThis.canvas?.interface?.grid?.addHighlightLayer;
    const origHighlight = globalThis.canvas?.interface?.grid?.highlightPosition;
    const origOffsetRange = globalThis.canvas?.grid?.getOffsetRange;
    const origCenterPoint = globalThis.canvas?.grid?.getCenterPoint;
    const origTopLeftPoint = globalThis.canvas?.grid?.getTopLeftPoint;

    const highlightedCells = [];
    let receivedBounds = null;

    if (globalThis.canvas?.interface?.grid) {
        globalThis.canvas.interface.grid.addHighlightLayer = () => {};
        globalThis.canvas.interface.grid.clearHighlightLayer = () => {};
        globalThis.canvas.interface.grid.highlightPosition = (id, pos) => {
            highlightedCells.push({ id, ...pos });
        };
    }
    if (globalThis.canvas?.grid) {
        globalThis.canvas.grid.getOffsetRange = (bounds) => {
            receivedBounds = bounds;
            const x0 = Math.floor(bounds.x / 100);
            const y0 = Math.floor(bounds.y / 100);
            const x1 = Math.ceil((bounds.x + bounds.width) / 100);
            const y1 = Math.ceil((bounds.y + bounds.height) / 100);
            return [x0, y0, x1, y1];
        };
        globalThis.canvas.grid.getCenterPoint = (coords) => ({
            x: (coords.i + 0.5) * 100,
            y: (coords.j + 0.5) * 100
        });
        globalThis.canvas.grid.getTopLeftPoint = (coords) => ({
            x: coords.i * 100,
            y: coords.j * 100
        });
    }

    try {
        const adapterV14 = new FoundryVTTV14Adapter();
        let applyRenderFlagsCalled = false;

        const mockRegionDoc = {
            id: 'region-square-rotated',
            documentName: 'Region',
            color: '#00ffcc',
            direction: 0,
            shapes: [{ type: 'rectangle', x: 100, y: 100, width: 200, height: 200, rotation: 0, anchorX: 0, anchorY: 0 }],
            updateSource(data) { Object.assign(this, data); }
        };
        const mockRegion = {
            document: mockRegionDoc,
            bounds: { x: 100, y: 100, width: 200, height: 200 },
            renderFlags: { set: () => {} },
            applyRenderFlags() { applyRenderFlagsCalled = true; }
        };

        // Rotate square region to 45 degrees
        adapterV14.refreshTemplateHighlights(mockRegion, 45);

        assert.equal(applyRenderFlagsCalled, true);
        assert.equal(mockRegionDoc.shapes[0].rotation, 45, 'Shape rotation must update to 45');
        assert.equal(mockRegionDoc.direction, 45, 'Document direction must update to 45');
        assert.equal(mockRegion.direction, 45, 'Placeable direction must update to 45');

        // Verify bounding box passed to getOffsetRange covers rotated extent
        assert.ok(receivedBounds, 'getOffsetRange must receive rotated bounding box');
        assert.ok(receivedBounds.x < 0, `receivedBounds.x (${receivedBounds.x}) must extend past 0 due to 45 deg rotation`);
        assert.ok(receivedBounds.y + receivedBounds.height > 350, `receivedBounds height must extend past 350 due to 45 deg rotation`);

        // Check highlighted cells
        assert.ok(highlightedCells.length > 0, 'Must highlight grid cells for rotated square');
        assert.ok(highlightedCells.every(c => c.id === 'Region.region-square-rotated'));

        // Cell containing the center (around x: 100, y: 241, i.e. i = 0 or 1, j = 2) should be highlighted
        const hasCenterCell = highlightedCells.some(c => c.x === 0 && c.y === 200);
        assert.ok(hasCenterCell, 'Cell at (0, 200) near rotated center must be highlighted');

        // Cell far outside (like i = 5, j = 5) should NOT be highlighted
        const hasOutsideCell = highlightedCells.some(c => c.x >= 500 || c.y >= 500);
        assert.equal(hasOutsideCell, false, 'Far outside cells must not be highlighted');
    } finally {
        if (globalThis.canvas?.interface?.grid) {
            if (origClear) globalThis.canvas.interface.grid.clearHighlightLayer = origClear;
            if (origAdd) globalThis.canvas.interface.grid.addHighlightLayer = origAdd;
            if (origHighlight) globalThis.canvas.interface.grid.highlightPosition = origHighlight;
        }
        if (globalThis.canvas?.grid) {
            if (origOffsetRange) globalThis.canvas.grid.getOffsetRange = origOffsetRange;
            if (origCenterPoint) globalThis.canvas.grid.getCenterPoint = origCenterPoint;
            if (origTopLeftPoint) globalThis.canvas.grid.getTopLeftPoint = origTopLeftPoint;
        }
    }
});

test('FoundryVTTV14Adapter.refreshTemplateHighlights calculates rotated bounding box and highlights rotated MeasuredTemplate rect cells', () => {
    const origClear = globalThis.canvas?.interface?.grid?.clearHighlightLayer;
    const origAdd = globalThis.canvas?.interface?.grid?.addHighlightLayer;
    const origHighlight = globalThis.canvas?.interface?.grid?.highlightPosition;
    const origOffsetRange = globalThis.canvas?.grid?.getOffsetRange;
    const origCenterPoint = globalThis.canvas?.grid?.getCenterPoint;
    const origTopLeftPoint = globalThis.canvas?.grid?.getTopLeftPoint;

    const highlightedCells = [];
    let receivedBounds = null;
    let highlightGridCalled = false;
    let applyRenderFlagsCalled = false;
    let setRenderFlags = null;

    if (globalThis.canvas?.interface?.grid) {
        globalThis.canvas.interface.grid.addHighlightLayer = () => {};
        globalThis.canvas.interface.grid.clearHighlightLayer = () => {};
        globalThis.canvas.interface.grid.highlightPosition = (id, pos) => {
            highlightedCells.push({ id, ...pos });
        };
    }
    if (globalThis.canvas?.grid) {
        globalThis.canvas.grid.getOffsetRange = (bounds) => {
            receivedBounds = bounds;
            const x0 = Math.floor(bounds.x / 100);
            const y0 = Math.floor(bounds.y / 100);
            const x1 = Math.ceil((bounds.x + bounds.width) / 100);
            const y1 = Math.ceil((bounds.y + bounds.height) / 100);
            return [x0, y0, x1, y1];
        };
        globalThis.canvas.grid.getCenterPoint = (coords) => ({
            x: (coords.i + 0.5) * 100,
            y: (coords.j + 0.5) * 100
        });
        globalThis.canvas.grid.getTopLeftPoint = (coords) => ({
            x: coords.i * 100,
            y: coords.j * 100
        });
    }

    try {
        const adapterV14 = new FoundryVTTV14Adapter();

        const mockDoc = {
            id: 'tmpl-rect-rotated',
            documentName: 'MeasuredTemplate',
            t: 'rect',
            distance: 10,
            width: 10,
            direction: 0,
            x: 100,
            y: 100,
            updateSource(data) { Object.assign(this, data); }
        };
        const mockTmpl = {
            document: mockDoc,
            t: 'rect',
            direction: 0,
            x: 100,
            y: 100,
            highlightId: 'Template.tmpl-rect-rotated',
            renderFlags: {
                set: (flags) => { setRenderFlags = flags; }
            },
            applyRenderFlags() { applyRenderFlagsCalled = true; },
            highlightGrid() { highlightGridCalled = true; }
        };

        // Rotate square MeasuredTemplate to 45 degrees
        adapterV14.refreshTemplateHighlights(mockTmpl, 45);

        assert.equal(applyRenderFlagsCalled, true);
        assert.equal(highlightGridCalled, false, 'MeasuredTemplate core highlightGrid must NOT be called for rotated rect');
        assert.equal(mockDoc.direction, 45, 'Document direction must be 45 degrees');
        assert.equal(mockTmpl.direction, 45, 'Placeable direction must be 45 degrees');
        assert.equal(setRenderFlags?.refreshGrid, false, 'refreshGrid flag must be false to avoid unrotated core highlightGrid execution');

        // Verify bounding box passed to getOffsetRange covers rotated geometry
        assert.ok(receivedBounds, 'getOffsetRange must receive rotated bounding box');
        assert.ok(receivedBounds.x < 100, `receivedBounds.x (${receivedBounds.x}) must extend left of origin due to 45 deg rotation`);
        assert.ok(receivedBounds.y + receivedBounds.height > 200, `receivedBounds height must extend past 200 due to 45 deg rotation`);

        // Check highlighted cells
        assert.ok(highlightedCells.length > 0, 'Must highlight grid cells for rotated MeasuredTemplate');
        assert.ok(highlightedCells.every(c => c.id === 'Template.tmpl-rect-rotated'));

        // Cell far outside should NOT be highlighted
        const hasOutsideCell = highlightedCells.some(c => c.x >= 500 || c.y >= 500);
        assert.equal(hasOutsideCell, false, 'Far outside cells must not be highlighted');
    } finally {
        if (globalThis.canvas?.interface?.grid) {
            if (origClear) globalThis.canvas.interface.grid.clearHighlightLayer = origClear;
            if (origAdd) globalThis.canvas.interface.grid.addHighlightLayer = origAdd;
            if (origHighlight) globalThis.canvas.interface.grid.highlightPosition = origHighlight;
        }
        if (globalThis.canvas?.grid) {
            if (origOffsetRange) globalThis.canvas.grid.getOffsetRange = origOffsetRange;
            if (origCenterPoint) globalThis.canvas.grid.getCenterPoint = origCenterPoint;
            if (origTopLeftPoint) globalThis.canvas.grid.getTopLeftPoint = origTopLeftPoint;
        }
    }
});

test('FoundryVTTV14Adapter._wrapHighlightGrid intercepts rotated MeasuredTemplate and delegates to refreshTemplateHighlights', () => {
    const adapterV14 = new FoundryVTTV14Adapter();
    let origHighlightGridCalled = false;
    let refreshTemplateHighlightsCalled = false;
    let refreshDirection = null;

    const mockDoc = {
        id: 'wrap-test-rect',
        documentName: 'MeasuredTemplate',
        t: 'rect',
        distance: 20,
        width: 20,
        direction: 0,
        x: 100,
        y: 100,
        updateSource(data) { Object.assign(this, data); }
    };

    const mockShape = {
        direction: 60,
        x: 100,
        y: 100
    };

    const mockTmpl = {
        document: mockDoc,
        t: 'rect',
        direction: 0,
        x: 100,
        y: 100,
        highlightId: 'Template.wrap-test-rect',
        crosshair: { shapeInstance: mockShape },
        highlightGrid() { origHighlightGridCalled = true; },
        renderFlags: { set: () => {} },
        applyRenderFlags() {}
    };

    const origRefresh = adapterV14.refreshTemplateHighlights.bind(adapterV14);
    adapterV14.refreshTemplateHighlights = (tmpl, dir) => {
        refreshTemplateHighlightsCalled = true;
        refreshDirection = dir;
    };

    adapterV14._wrapHighlightGrid(mockTmpl);
    mockTmpl.highlightGrid();

    assert.equal(refreshTemplateHighlightsCalled, true, 'Wrapped highlightGrid must invoke refreshTemplateHighlights for rotated rect');
    assert.equal(refreshDirection, 60, 'refreshTemplateHighlights must receive shape rotation direction');
    assert.equal(origHighlightGridCalled, false, 'Core highlightGrid must NOT be called for rotated rect');

    // Test unrotated rect: shape.direction = 0
    mockShape.direction = 0;
    origHighlightGridCalled = false;
    refreshTemplateHighlightsCalled = false;

    mockTmpl.highlightGrid();
    assert.equal(origHighlightGridCalled, true, 'Core highlightGrid must be called for unrotated rect');
    assert.equal(refreshTemplateHighlightsCalled, false, 'refreshTemplateHighlights must NOT be called for unrotated rect');

    adapterV14.refreshTemplateHighlights = origRefresh;
});

test('FoundryVTTV14Adapter._wrapHighlightGrid allows execution of refreshTemplateHighlights without recursion block', () => {
    const adapterV14 = new FoundryVTTV14Adapter();
    const highlightedPositions = [];

    const mockHighlightLayer = {
        visible: false,
        renderable: false
    };

    const origInterface = globalThis.canvas?.interface;
    const origGrid = globalThis.canvas?.grid;
    const origDimensions = globalThis.canvas?.dimensions;

    try {
        if (!globalThis.canvas) globalThis.canvas = {};
        globalThis.canvas.interface = {
            grid: {
                addHighlightLayer: () => {},
                clearHighlightLayer: () => {},
                getHighlightLayer: () => mockHighlightLayer,
                highlightPosition: (id, data) => {
                    highlightedPositions.push({ id, ...data });
                }
            }
        };
        globalThis.canvas.grid = {
            sizeX: 100,
            sizeY: 100,
            size: 100,
            getCenterPoint: ({ i, j }) => ({ x: i * 100 + 50, y: j * 100 + 50 }),
            getTopLeftPoint: ({ i, j }) => ({ x: i * 100, y: j * 100 })
        };
        globalThis.canvas.dimensions = {
            size: 100,
            distance: 5
        };

        const mockDoc = {
            id: 'unblocked-rect',
            documentName: 'MeasuredTemplate',
            t: 'rect',
            distance: 10,
            width: 10,
            direction: 0,
            x: 0,
            y: 0,
            updateSource(data) { Object.assign(this, data); }
        };

        const mockShape = {
            direction: 45,
            x: 0,
            y: 0,
            getGraphicDimensions: () => ({ widthPx: 200, heightPx: 200 })
        };

        const mockTmpl = {
            document: mockDoc,
            t: 'rect',
            direction: 0,
            x: 0,
            y: 0,
            highlightId: 'Template.unblocked-rect',
            crosshair: { shapeInstance: mockShape },
            highlightGrid() {},
            _refreshGrid() {},
            renderFlags: { set: () => {} },
            applyRenderFlags() {},
            testPoint: (pt) => {
                return pt.x >= -50 && pt.x <= 250 && pt.y >= -50 && pt.y <= 250;
            }
        };

        adapterV14._wrapHighlightGrid(mockTmpl);

        // Execute wrapped _refreshGrid
        mockTmpl._refreshGrid();

        // Check that highlights were populated and visible
        assert.equal(mockHighlightLayer.visible, true, 'Highlight layer should be set to visible');
        assert.equal(mockHighlightLayer.renderable, true, 'Highlight layer should be set to renderable');
        assert.ok(highlightedPositions.length > 0, 'Highlights should be drawn without being blocked by recursion guard');
        assert.equal(mockTmpl._bbcRefreshingHighlights, false, 'Recursion guard flag should be reset to false after execution');
    } finally {
        if (origInterface !== undefined) globalThis.canvas.interface = origInterface;
        else delete globalThis.canvas.interface;
        if (origGrid !== undefined) globalThis.canvas.grid = origGrid;
        else delete globalThis.canvas.grid;
        if (origDimensions !== undefined) globalThis.canvas.dimensions = origDimensions;
        else delete globalThis.canvas.dimensions;
    }
});

test('FoundryVTTV14Adapter._wrapHighlightGrid executes original highlightGrid during refreshTemplateHighlights for non-rotated templates', () => {
    const adapterV14 = new FoundryVTTV14Adapter();
    let origHighlightCalled = false;

    const mockDoc = {
        id: 'test-ray-v14',
        documentName: 'MeasuredTemplate',
        t: 'ray',
        distance: 30,
        direction: 0,
        x: 100,
        y: 100,
        updateSource(data) { Object.assign(this, data); }
    };

    const mockShape = {
        direction: 90,
        x: 100,
        y: 100
    };

    const mockTmpl = {
        document: mockDoc,
        t: 'ray',
        direction: 0,
        x: 100,
        y: 100,
        ray: { origin: { x: 100, y: 100 }, distance: 600, angle: 0 },
        highlightId: 'Template.test-ray-v14',
        crosshair: { shapeInstance: mockShape },
        highlightGrid() { origHighlightCalled = true; },
        renderFlags: { set: () => {} },
        applyRenderFlags() {}
    };

    adapterV14._wrapHighlightGrid(mockTmpl);

    // Call highlightGrid when _bbcRefreshingHighlights is true (simulating refreshTemplateHighlights execution)
    mockTmpl._bbcRefreshingHighlights = true;
    try {
        mockTmpl.highlightGrid();
    } finally {
        mockTmpl._bbcRefreshingHighlights = false;
    }

    assert.equal(origHighlightCalled, true, 'Original highlightGrid must be called even when _bbcRefreshingHighlights is true for non-rotated templates');
    assert.ok(mockTmpl.ray, 'Ray must be present');
    assert.ok(Math.abs(mockTmpl.ray.angle - (90 * Math.PI / 180)) < 1e-5, 'Ray angle must be updated to 90 degrees');
});

test('FoundryVTTV14Adapter.updatePreviewShape preserves rotated direction and handles unrotated diagonal angle', () => {
    const adapterV14 = new FoundryVTTV14Adapter();

    // 1. Rotated rect: direction = 90
    const rotatedDoc = { documentName: 'MeasuredTemplate', t: 'rect', direction: 0, distance: 20, width: 20 };
    adapterV14.updatePreviewShape(rotatedDoc, { x: 100, y: 100, direction: 90, distance: 20, width: 20 });
    assert.equal(rotatedDoc.direction, 90, 'updatePreviewShape must preserve rotated direction (90)');

    // 2. Rotated rect: direction = 45
    const rotated45Doc = { documentName: 'MeasuredTemplate', t: 'rect', direction: 0, distance: 20, width: 20 };
    adapterV14.updatePreviewShape(rotated45Doc, { x: 100, y: 100, direction: 45, distance: 20, width: 20 });
    assert.equal(rotated45Doc.direction, 45, 'updatePreviewShape must preserve rotated direction (45)');

    // 3. Unrotated rect: direction = 0 -> calculates diagonal angle 45 for 20x20 square
    const unrotatedDoc = { documentName: 'MeasuredTemplate', t: 'rect', direction: 0, distance: 20, width: 20 };
    adapterV14.updatePreviewShape(unrotatedDoc, { x: 100, y: 100, direction: 0, distance: 20, width: 20 });
    assert.equal(Math.round(unrotatedDoc.direction), 45, 'updatePreviewShape must calculate 45 deg diagonal angle when unrotated');
});

test('FoundryVTTV14Adapter._getGridOffsetRange provides left/top/right/bottom and handles NaN gracefully', () => {
    const adapterV14 = new FoundryVTTV14Adapter();
    const origOffsetRange = globalThis.canvas?.grid?.getOffsetRange;

    try {
        let receivedPaddedBounds = null;
        // Mock getOffsetRange that accesses .left and .top like real Foundry BaseGrid
        globalThis.canvas.grid.getOffsetRange = (bounds) => {
            receivedPaddedBounds = bounds;
            const x0 = Math.floor(bounds.left / 100);
            const y0 = Math.floor(bounds.top / 100);
            const x1 = Math.ceil(bounds.right / 100);
            const y1 = Math.ceil(bounds.bottom / 100);
            return [x0, y0, x1, y1];
        };

        const testBounds = { x: 100, y: 100, width: 200, height: 200 };
        const range = adapterV14._getGridOffsetRange(testBounds);

        assert.ok(receivedPaddedBounds.left !== undefined, 'paddedBounds must have left property');
        assert.ok(receivedPaddedBounds.right !== undefined, 'paddedBounds must have right property');
        assert.ok(receivedPaddedBounds.top !== undefined, 'paddedBounds must have top property');
        assert.ok(receivedPaddedBounds.bottom !== undefined, 'paddedBounds must have bottom property');
        assert.deepEqual(range, [0, 0, 4, 4], 'Must compute valid integer range from left/top/right/bottom');

        // Test fallback when getOffsetRange returns NaN
        globalThis.canvas.grid.getOffsetRange = () => [NaN, NaN, NaN, NaN];
        const fallbackRange = adapterV14._getGridOffsetRange(testBounds);
        assert.ok(fallbackRange.every(Number.isFinite), 'Fallback must return finite numbers when getOffsetRange returns NaN');
        assert.deepEqual(fallbackRange, [0, 0, 4, 4]);
    } finally {
        if (origOffsetRange) globalThis.canvas.grid.getOffsetRange = origOffsetRange;
    }
});

test('FoundryVTTV14Adapter highlights rotated MeasuredTemplate when canvas.grid.getOffsetRange requires left/top/right/bottom', () => {
    const origClear = globalThis.canvas?.interface?.grid?.clearHighlightLayer;
    const origAdd = globalThis.canvas?.interface?.grid?.addHighlightLayer;
    const origHighlight = globalThis.canvas?.interface?.grid?.highlightPosition;
    const origOffsetRange = globalThis.canvas?.grid?.getOffsetRange;
    const origCenterPoint = globalThis.canvas?.grid?.getCenterPoint;
    const origTopLeftPoint = globalThis.canvas?.grid?.getTopLeftPoint;

    const highlightedCells = [];

    if (globalThis.canvas?.interface?.grid) {
        globalThis.canvas.interface.grid.addHighlightLayer = () => {};
        globalThis.canvas.interface.grid.clearHighlightLayer = () => {};
        globalThis.canvas.interface.grid.highlightPosition = (id, pos) => {
            highlightedCells.push({ id, ...pos });
        };
    }
    if (globalThis.canvas?.grid) {
        // Strict Foundry V14 BaseGrid simulation: accesses bounds.left/right/top/bottom
        globalThis.canvas.grid.getOffsetRange = (bounds) => {
            const x0 = Math.floor(bounds.left / 100);
            const y0 = Math.floor(bounds.top / 100);
            const x1 = Math.ceil(bounds.right / 100);
            const y1 = Math.ceil(bounds.bottom / 100);
            return [x0, y0, x1, y1];
        };
        globalThis.canvas.grid.getCenterPoint = (coords) => ({
            x: (coords.i + 0.5) * 100,
            y: (coords.j + 0.5) * 100
        });
        globalThis.canvas.grid.getTopLeftPoint = (coords) => ({
            x: coords.i * 100,
            y: coords.j * 100
        });
    }

    try {
        const adapterV14 = new FoundryVTTV14Adapter();

        const mockDoc = {
            id: 'tmpl-rect-strict',
            documentName: 'MeasuredTemplate',
            t: 'rect',
            distance: 10,
            width: 10,
            direction: 0,
            x: 100,
            y: 100,
            updateSource(data) { Object.assign(this, data); }
        };
        const mockTmpl = {
            document: mockDoc,
            t: 'rect',
            direction: 0,
            x: 100,
            y: 100,
            highlightId: 'Template.tmpl-rect-strict',
            renderFlags: { set() {} },
            applyRenderFlags() {},
            highlightGrid() {}
        };

        // Rotate square MeasuredTemplate to 30 degrees
        adapterV14.refreshTemplateHighlights(mockTmpl, 30);

        assert.ok(highlightedCells.length > 0, 'Must highlight grid cells even when getOffsetRange requires .left/.top/.right/.bottom');
        assert.ok(highlightedCells.every(c => c.id === 'Template.tmpl-rect-strict'));
    } finally {
        if (globalThis.canvas?.interface?.grid) {
            if (origClear) globalThis.canvas.interface.grid.clearHighlightLayer = origClear;
            if (origAdd) globalThis.canvas.interface.grid.addHighlightLayer = origAdd;
            if (origHighlight) globalThis.canvas.interface.grid.highlightPosition = origHighlight;
        }
        if (globalThis.canvas?.grid) {
            if (origOffsetRange) globalThis.canvas.grid.getOffsetRange = origOffsetRange;
            if (origCenterPoint) globalThis.canvas.grid.getCenterPoint = origCenterPoint;
            if (origTopLeftPoint) globalThis.canvas.grid.getTopLeftPoint = origTopLeftPoint;
        }
    }
});

test('FoundryVTTV14Adapter._wrapHighlightGrid wraps _refreshGrid and intercepts rotated rect', () => {
    const adapterV14 = new FoundryVTTV14Adapter();
    let refreshGridCalled = false;
    let refreshTemplateHighlightsCalled = false;

    const mockDoc = {
        id: 'wrap-refreshgrid-test',
        documentName: 'MeasuredTemplate',
        t: 'rect',
        distance: 20,
        width: 20,
        direction: 0,
        x: 100,
        y: 100,
        updateSource(data) { Object.assign(this, data); }
    };

    const mockShape = {
        direction: 45,
        x: 100,
        y: 100
    };

    const mockTmpl = {
        document: mockDoc,
        t: 'rect',
        direction: 0,
        x: 100,
        y: 100,
        highlightId: 'Template.wrap-refreshgrid-test',
        crosshair: { shapeInstance: mockShape },
        highlightGrid() {},
        _refreshGrid() { refreshGridCalled = true; },
        renderFlags: { set() {} },
        applyRenderFlags() {}
    };

    const origRefresh = adapterV14.refreshTemplateHighlights.bind(adapterV14);
    adapterV14.refreshTemplateHighlights = () => {
        refreshTemplateHighlightsCalled = true;
    };

    adapterV14._wrapHighlightGrid(mockTmpl);
    mockTmpl._refreshGrid();

    assert.equal(refreshTemplateHighlightsCalled, true, 'Wrapped _refreshGrid must trigger refreshTemplateHighlights when rotated');
    assert.equal(refreshGridCalled, false, 'Core _refreshGrid must NOT be called for rotated rect');

    adapterV14.refreshTemplateHighlights = origRefresh;
});

test('FoundryVTTV14Adapter.refreshTemplateHighlights does not highlight extra unrotated squares when MeasuredTemplate has native testPoint', () => {
    const origClear = globalThis.canvas?.interface?.grid?.clearHighlightLayer;
    const origAdd = globalThis.canvas?.interface?.grid?.addHighlightLayer;
    const origHighlight = globalThis.canvas?.interface?.grid?.highlightPosition;
    const origOffsetRange = globalThis.canvas?.grid?.getOffsetRange;
    const origCenterPoint = globalThis.canvas?.grid?.getCenterPoint;
    const origTopLeftPoint = globalThis.canvas?.grid?.getTopLeftPoint;

    const highlightedCells = [];

    if (globalThis.canvas?.interface?.grid) {
        globalThis.canvas.interface.grid.addHighlightLayer = () => {};
        globalThis.canvas.interface.grid.clearHighlightLayer = () => {};
        globalThis.canvas.interface.grid.highlightPosition = (id, pos) => {
            highlightedCells.push({ id, ...pos });
        };
    }
    if (globalThis.canvas?.grid) {
        globalThis.canvas.grid.getOffsetRange = (bounds) => {
            const x0 = Math.floor(bounds.left / 100);
            const y0 = Math.floor(bounds.top / 100);
            const x1 = Math.ceil(bounds.right / 100);
            const y1 = Math.ceil(bounds.bottom / 100);
            return [x0, y0, x1, y1];
        };
        globalThis.canvas.grid.getCenterPoint = (coords) => ({
            x: (coords.i + 0.5) * 100,
            y: (coords.j + 0.5) * 100
        });
        globalThis.canvas.grid.getTopLeftPoint = (coords) => ({
            x: coords.i * 100,
            y: coords.j * 100
        });
    }

    try {
        const adapterV14 = new FoundryVTTV14Adapter();

        const mockDoc = {
            id: 'tmpl-no-extra-squares',
            documentName: 'MeasuredTemplate',
            t: 'rect',
            distance: 20,
            width: 20,
            direction: 0,
            x: 200,
            y: 200,
            updateSource(data) { Object.assign(this, data); }
        };

        // Simulate core Foundry MeasuredTemplate#testPoint which only tests the unrotated shape:
        // [200, 200] to [600, 600]
        const mockTmpl = {
            document: mockDoc,
            t: 'rect',
            direction: 0,
            x: 200,
            y: 200,
            highlightId: 'Template.tmpl-no-extra-squares',
            renderFlags: { set() {} },
            applyRenderFlags() {},
            highlightGrid() {},
            testPoint(pt) {
                return pt.x >= 200 && pt.x <= 600 && pt.y >= 200 && pt.y <= 600;
            }
        };

        // Rotate square MeasuredTemplate to 45 degrees
        adapterV14.refreshTemplateHighlights(mockTmpl, 45);

        // At 45 degrees, top-right of unrotated box (500, 200) is far outside the 45-degree diamond
        const hasUnrotatedFarCorner = highlightedCells.some(c => c.x === 500 && c.y === 200);
        assert.equal(hasUnrotatedFarCorner, false, 'Must NOT highlight cells belonging exclusively to the unrotated 0-deg template');

        const hasUnrotatedBottomCorner = highlightedCells.some(c => c.x === 500 && c.y === 500);
        assert.equal(hasUnrotatedBottomCorner, false, 'Must NOT highlight bottom-right corner of unrotated template');

        // Diamond tip must be highlighted: x = -100, y = 400 (center is -50, 450, inside 45-deg diamond)
        const hasDiamondTip = highlightedCells.some(c => c.x === -100 && c.y === 400);
        assert.equal(hasDiamondTip, true, 'Must highlight rotated diamond cells');

        // Total count should strictly equal 18 cells, not 26
        assert.equal(highlightedCells.length, 18, 'Rotated 20ft square diamond must highlight exactly 18 cells without 8 extra unrotated squares');
    } finally {
        if (globalThis.canvas?.interface?.grid) {
            if (origClear) globalThis.canvas.interface.grid.clearHighlightLayer = origClear;
            if (origAdd) globalThis.canvas.interface.grid.addHighlightLayer = origAdd;
            if (origHighlight) globalThis.canvas.interface.grid.highlightPosition = origHighlight;
        }
        if (globalThis.canvas?.grid) {
            if (origOffsetRange) globalThis.canvas.grid.getOffsetRange = origOffsetRange;
            if (origCenterPoint) globalThis.canvas.grid.getCenterPoint = origCenterPoint;
            if (origTopLeftPoint) globalThis.canvas.grid.getTopLeftPoint = origTopLeftPoint;
        }
    }
});

test('Foundry adapter absorbs Token, MeasuredTemplate, Region, and Ray references on instances', () => {
    const adapter = new BaseFoundryVTTAdapter();
    const adapterV13 = new FoundryVTTV13Adapter();
    const adapterV14 = new FoundryVTTV14Adapter();

    assert.ok(adapter.Token, 'adapter.Token must be defined');
    assert.equal(adapter.Token, crosshairAdapter.Token);
    assert.equal(adapterV13.Token, crosshairAdapter.Token);
    assert.equal(adapterV14.Token, crosshairAdapter.Token);

    assert.ok(adapter.MeasuredTemplate, 'adapter.MeasuredTemplate must be defined');
    assert.equal(adapter.MeasuredTemplate, crosshairAdapter.MeasuredTemplate);
    assert.equal(adapterV13.MeasuredTemplate, crosshairAdapter.MeasuredTemplate);
    assert.equal(adapterV14.MeasuredTemplate, crosshairAdapter.MeasuredTemplate);

    assert.ok(adapter.Region, 'adapter.Region must be defined');
    assert.equal(adapter.Region, crosshairAdapter.Region);
    assert.equal(adapterV13.Region, crosshairAdapter.Region);
    assert.equal(adapterV14.Region, crosshairAdapter.Region);

    assert.ok(adapter.Ray, 'adapter.Ray must be defined');
    assert.equal(adapter.Ray, crosshairAdapter.Ray);
    assert.equal(adapterV13.Ray, crosshairAdapter.Ray);
    assert.equal(adapterV14.Ray, crosshairAdapter.Ray);
});

test('Foundry adapter provides createRay and createRayFromAngle helpers', () => {
    const adapter = new FoundryVTTV14Adapter();

    const ray1 = adapter.createRay({ x: 10, y: 20 }, { x: 40, y: 60 });
    assert.ok(ray1, 'createRay must instantiate a Ray object');
    assert.equal(ray1.A.x, 10);
    assert.equal(ray1.A.y, 20);
    assert.equal(ray1.B.x, 40);
    assert.equal(ray1.B.y, 60);

    const crosshairRay = crosshairAdapter.createRay({ x: 0, y: 0 }, { x: 100, y: 0 });
    assert.ok(crosshairRay);
    assert.equal(crosshairRay.distance, 100);

    const rayFromAngle = adapter.createRayFromAngle(50, 50, 0, 100);
    assert.ok(rayFromAngle, 'createRayFromAngle must instantiate a Ray object');
    assert.equal(rayFromAngle.A.x, 50);
    assert.equal(rayFromAngle.A.y, 50);
    assert.equal(Math.round(rayFromAngle.B.x), 150);

    const crosshairRayFromAngle = crosshairAdapter.createRayFromAngle(0, 0, Math.PI / 2, 50);
    assert.ok(crosshairRayFromAngle);
    assert.equal(Math.round(crosshairRayFromAngle.B.y), 50);
});

test('Foundry adapter encapsulates addHighlightLayer, clearHighlightLayer, and destroyHighlightLayer across instances and singletons', () => {
    const adapter = new FoundryVTTV14Adapter();
    const addedLayers = [];
    const clearedLayers = [];
    const destroyedLayers = [];

    const origAdd = globalThis.canvas?.interface?.grid?.addHighlightLayer;
    const origClear = globalThis.canvas?.interface?.grid?.clearHighlightLayer;
    const origDestroy = globalThis.canvas?.interface?.grid?.destroyHighlightLayer;

    try {
        globalThis.canvas.interface.grid.addHighlightLayer = (id) => addedLayers.push(id);
        globalThis.canvas.interface.grid.clearHighlightLayer = (id) => clearedLayers.push(id);
        globalThis.canvas.interface.grid.destroyHighlightLayer = (id) => destroyedLayers.push(id);

        // Instance methods
        adapter.addHighlightLayer('layer-inst-1');
        adapter.clearHighlightLayer('layer-inst-1');
        adapter.destroyHighlightLayer('layer-inst-1');
        assert.deepEqual(addedLayers, ['layer-inst-1']);
        assert.deepEqual(clearedLayers, ['layer-inst-1']);
        assert.deepEqual(destroyedLayers, ['layer-inst-1']);

        // crosshairAdapter singleton
        crosshairAdapter.addHighlightLayer('layer-singleton-2');
        crosshairAdapter.clearHighlightLayer('layer-singleton-2');
        crosshairAdapter.destroyHighlightLayer('layer-singleton-2');
        assert.deepEqual(addedLayers, ['layer-inst-1', 'layer-singleton-2']);
        assert.deepEqual(clearedLayers, ['layer-inst-1', 'layer-singleton-2']);
        assert.deepEqual(destroyedLayers, ['layer-inst-1', 'layer-singleton-2']);

        // Empty/invalid input contract handling
        adapter.addHighlightLayer('');
        adapter.addHighlightLayer(null);
        adapter.clearHighlightLayer('');
        adapter.clearHighlightLayer(null);
        adapter.destroyHighlightLayer('');
        adapter.destroyHighlightLayer(null);
        assert.equal(addedLayers.length, 2, 'Invalid highlight layer IDs must be safely ignored');
        assert.equal(clearedLayers.length, 2, 'Invalid highlight layer IDs must be safely ignored');
        assert.equal(destroyedLayers.length, 2, 'Invalid highlight layer IDs must be safely ignored');
    } finally {
        if (origAdd) globalThis.canvas.interface.grid.addHighlightLayer = origAdd;
        if (origClear) globalThis.canvas.interface.grid.clearHighlightLayer = origClear;
        if (origDestroy) globalThis.canvas.interface.grid.destroyHighlightLayer = origDestroy;
    }
});

test('Foundry adapter encapsulates saveDataToFile across instances and singletons', () => {
    const adapter = new FoundryVTTV14Adapter();
    const savedCalls = [];

    const origSave = globalThis.foundry?.utils?.saveDataToFile;
    try {
        globalThis.foundry.utils.saveDataToFile = (data, type, filename) => {
            savedCalls.push({ data, type, filename });
        };

        const res1 = adapter.saveDataToFile('{"name":"Fireball"}', 'text/json', 'export1.json');
        assert.equal(res1, true);
        assert.deepEqual(savedCalls[0], {
            data: '{"name":"Fireball"}',
            type: 'text/json',
            filename: 'export1.json'
        });

        const res2 = crosshairAdapter.saveDataToFile({ a: 1 }, 'application/json', 'nested/export2.json');
        assert.equal(res2, true);
        assert.deepEqual(savedCalls[1], {
            data: '{"a":1}',
            type: 'application/json',
            filename: 'nested_export2.json'
        });

        // Error handling when underlying writer throws
        globalThis.foundry.utils.saveDataToFile = () => { throw new Error('Disk full'); };
        const resErr = adapter.saveDataToFile('data', 'text/plain', 'fail.txt');
        assert.equal(resErr, false, 'saveDataToFile must catch underlying errors and return false');
    } finally {
        if (origSave) globalThis.foundry.utils.saveDataToFile = origSave;
        else delete globalThis.foundry.utils.saveDataToFile;
    }
});

test('Foundry adapter encapsulates mergeObject and deepClone utilities', () => {
    const adapter = new BaseFoundryVTTAdapter();

    const original = { a: 1, nested: { b: 2 } };
    const cloned = adapter.deepClone(original);
    assert.deepEqual(cloned, original);
    assert.notEqual(cloned, original);
    assert.notEqual(cloned.nested, original.nested);

    const staticCloned = crosshairAdapter.deepClone(original);
    assert.deepEqual(staticCloned, original);

    const target = { a: 1, b: 2 };
    const merged = adapter.mergeObject(target, { b: 3, c: 4 });
    assert.deepEqual(merged, { a: 1, b: 3, c: 4 });

    const staticMerged = crosshairAdapter.mergeObject({ x: 10 }, { y: 20 });
    assert.deepEqual(staticMerged, { x: 10, y: 20 });
});

test('canvasAdapter.initialize and initializeCanvasAdapter select CanvasV13Adapter or CanvasV14Adapter based on game.version', () => {
    const origVersion = globalThis.game.version;
    try {
        globalThis.game.version = "13.335";
        const v13 = canvasAdapter.initialize();
        assert.ok(v13 instanceof CanvasV13Adapter);
        assert.equal(canvasAdapter, v13);

        globalThis.game.version = "14.200";
        const v14 = canvasAdapter.initialize();
        assert.ok(v14 instanceof CanvasV14Adapter);
        assert.equal(canvasAdapter, v14);
    } finally {
        globalThis.game.version = origVersion;
        canvasAdapter.initialize();
    }
});

test('Canvas adapter hierarchy exposes canonical canvas and grid getters', () => {
    const origCanvas = globalThis.canvas;
    try {
        globalThis.canvas = {
            scene: { id: "scene1" },
            mousePosition: { x: 150, y: 250 },
            dimensions: { size: 100, distance: 5, units: "ft", rect: { x: 0, y: 0, width: 1000, height: 1000 } },
            grid: { size: 100, sizeX: 100, sizeY: 100, units: "ft", distance: 5, highlightLayers: {} },
            tokens: { controlled: [{ id: "tok1" }] },
            stage: { id: "stage1" },
            app: { ticker: {} },
            controls: {},
            templates: { preview: { children: [] }, placeables: [] },
            regions: { preview: { children: [] }, placeables: [] }
        };

        const adapter = new BaseCanvasAdapter();
        assert.equal(adapter.scene?.id, "scene1");
        assert.deepEqual(adapter.mousePosition, { x: 150, y: 250 });
        assert.equal(adapter.gridSize, 100);
        assert.equal(adapter.gridSizeX, 100);
        assert.equal(adapter.gridSizeY, 100);
        assert.equal(adapter.gridDistance, 5);
        assert.equal(adapter.gridUnits, "ft");
        assert.equal(adapter.pixelsPerDistance, 20);
        assert.deepEqual(adapter.dimensionsRect, { x: 0, y: 0, width: 1000, height: 1000 });
        assert.equal(adapter.controlledTokens.length, 1);
        assert.equal(adapter.controlledTokens[0].id, "tok1");
        assert.ok(adapter.stage);
        assert.ok(adapter.app);
        assert.ok(adapter.controls);
        assert.ok(adapter.templates);
        assert.ok(adapter.regions);
        assert.ok(adapter.highlightLayers);
    } finally {
        globalThis.canvas = origCanvas;
    }
});

test('Canvas adapter hierarchy manages highlight layers and positions across V13 and V14', () => {
    const origCanvas = globalThis.canvas;
    try {
        const mockGrid = {
            highlightLayers: {},
            addHighlightLayer(name) {
                this.highlightLayers[name] = { name, positions: new Set() };
                return this.highlightLayers[name];
            },
            getHighlightLayer(name) {
                return this.highlightLayers[name] ?? null;
            },
            clearHighlightLayer(name) {
                if (this.highlightLayers[name]) {
                    this.highlightLayers[name].positions.clear();
                }
            },
            destroyHighlightLayer(name) {
                delete this.highlightLayers[name];
            },
            highlightPosition(name, options) {
                if (this.highlightLayers[name]) {
                    this.highlightLayers[name].positions.add(`${options.x},${options.y}`);
                }
            }
        };

        globalThis.canvas = {
            grid: mockGrid,
            interface: { grid: mockGrid },
            templates: { deactivate: () => {} },
            regions: { deactivate: () => {} }
        };

        // Test BaseCanvasAdapter
        const base = new BaseCanvasAdapter();
        const hlBase = base.addHighlightLayer("test-base");
        assert.ok(hlBase);
        assert.equal(base.getHighlightLayer("test-base"), hlBase);
        base.highlightPosition("test-base", { x: 10, y: 20 });
        assert.ok(hlBase.positions.has("10,20"));
        base.clearHighlightLayer("test-base");
        assert.equal(hlBase.positions.size, 0);
        base.destroyHighlightLayer("test-base");
        assert.equal(base.getHighlightLayer("test-base"), null);

        // Test CanvasV14Adapter
        const v14 = new CanvasV14Adapter();
        const hlV14 = v14.addHighlightLayer("test-v14");
        assert.ok(hlV14);
        assert.equal(v14.getHighlightLayer("test-v14"), hlV14);
        v14.highlightPosition("test-v14", { x: 50, y: 60 });
        assert.ok(hlV14.positions.has("50,60"));
        v14.clearHighlightLayer("test-v14");
        assert.equal(hlV14.positions.size, 0);
        v14.destroyHighlightLayer("test-v14");
        assert.equal(v14.getHighlightLayer("test-v14"), null);

        // Test canvasAdapter singleton
        const hlSingleton = canvasAdapter.addHighlightLayer("test-singleton");
        assert.ok(hlSingleton);
        assert.equal(canvasAdapter.getHighlightLayer("test-singleton"), hlSingleton);
        canvasAdapter.highlightPosition("test-singleton", { x: 30, y: 40 });
        assert.ok(hlSingleton.positions.has("30,40"));
        canvasAdapter.clearHighlightLayer("test-singleton");
        assert.equal(hlSingleton.positions.size, 0);
        canvasAdapter.destroyHighlightLayer("test-singleton");
        assert.equal(canvasAdapter.getHighlightLayer("test-singleton"), null);
    } finally {
        globalThis.canvas = origCanvas;
    }
});

test('Canvas adapter grid geometry methods provide uniform coordinate operations', () => {
    const adapter = new BaseCanvasAdapter();

    const center = adapter.getCenterPoint({ x: 100, y: 100 });
    assert.ok(Number.isFinite(center.x) && Number.isFinite(center.y));

    const topLeft = adapter.getTopLeftPoint({ x: 100, y: 100 });
    assert.ok(Number.isFinite(topLeft.x) && Number.isFinite(topLeft.y));

    const snapped = adapter.getSnappedPoint({ x: 123, y: 456 }, { mode: 1 });
    assert.ok(Number.isFinite(snapped.x) && Number.isFinite(snapped.y));

    const offsetRange = adapter.getOffsetRange({ x: 0, y: 0, width: 200, height: 200 });
    assert.ok(Array.isArray(offsetRange));

    const dist = adapter.measureDistance({ x: 0, y: 0 }, { x: 300, y: 400 });
    assert.ok(typeof dist === "number" && dist > 0);

    const snappedCoords = adapter.snapCoordinates(123, 456, 1);
    assert.ok(Number.isFinite(snappedCoords.x) && Number.isFinite(snappedCoords.y));
});

test('Foundry adapter encapsulates randomID, fromUuidSync, lineSegmentIntersection, parseColor, and PreciseText', () => {
    const adapter = crosshairAdapter;

    // Token
    assert.equal(adapter.Token, globalThis.foundry.canvas.placeables.Token.implementation);

    // randomID
    const rand16 = adapter.randomID(16);
    assert.equal(typeof rand16, 'string');
    assert.equal(rand16.length, 16);
    assert.equal(adapter.randomID(8).length, 8);

    // fromUuidSync
    const origFromUuid = globalThis.foundry.utils.fromUuidSync;
    try {
        globalThis.foundry.utils.fromUuidSync = (uuid) => ({ uuid, name: 'ResolvedItem' });
        const res = adapter.fromUuidSync('Item.abc123');
        assert.equal(res?.name, 'ResolvedItem');
    } finally {
        globalThis.foundry.utils.fromUuidSync = origFromUuid;
    }

    // lineSegmentIntersection
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 10 };
    const c = { x: 0, y: 10 };
    const d = { x: 10, y: 0 };
    const intersect = adapter.lineSegmentIntersection(a, b, c, d);
    assert.ok(intersect);
    assert.equal(intersect.x, 5);
    assert.equal(intersect.y, 5);

    // parseColor
    const parsedHex = adapter.parseColor('#ff0000');
    assert.ok(parsedHex !== null && parsedHex !== undefined);
    const parsedNum = adapter.parseColor(0x00ff00);
    assert.ok(parsedNum !== null && parsedNum !== undefined);
    const parsedNamed = adapter.parseColor('invalidColor', 0x123456);
    assert.ok(parsedNamed !== null);

    // PreciseText
    assert.equal(adapter.PreciseText, foundry.canvas.containers.PreciseText);
});

test('FoundryVTTV13Adapter._wrapHighlightGrid synchronizes document.x, document.y, and direction with token anchor before highlightGrid runs', () => {
    const adapterV13 = new FoundryVTTV13Adapter();
    let highlightGridRan = false;

    const mockToken = {
        id: 'tok-highlight-test',
        x: 100,
        y: 100,
        w: 100,
        h: 100,
        center: { x: 150, y: 150 }
    };

    const mockDoc = {
        x: 500, // Stale initial mouse position
        y: 500,
        direction: 0,
        distance: 30,
        angle: 53.13,
        t: 'cone',
        updateSource(data) { Object.assign(this, data); }
    };

    const mockPlaceable = {
        document: mockDoc,
        x: 500,
        y: 500,
        direction: 0,
        crosshair: null,
        highlightGrid() {
            highlightGridRan = true;
        }
    };

    const shape = {
        type: 'cone',
        stickToToken: true,
        token: mockToken,
        cursorX: 50,
        cursorY: 150,
        x: 100,
        y: 150,
        direction: 180,
        config: { stickToToken: true }
    };
    mockPlaceable.crosshair = { shapeInstance: shape };

    adapterV13._wrapHighlightGrid(mockPlaceable);
    mockPlaceable.highlightGrid();

    assert.ok(highlightGridRan, 'highlightGrid must run');
    assert.equal(mockDoc.x, 100, 'document.x must be synchronized to token edge (100) before highlightGrid runs, not stale mouse (500)');
    assert.equal(mockDoc.y, 150, 'document.y must be synchronized to token edge (150)');
    assert.equal(mockDoc.direction, 180, 'document.direction must be synchronized to anchor direction (180)');
});

test('FoundryVTTV13Adapter attached cone placement and highlight flow matches token edge anchor', async () => {
    game.version = '13.0.0';
    initializeFoundryAdapter();

    const { ConeCrosshairShape } = await import('../../src/crosshair/cone.js');

    const mockToken = {
        id: 'tok-cone-v13',
        x: 200,
        y: 200,
        w: 100,
        h: 100,
        center: { x: 250, y: 250 }
    };

    const mockDocument = {
        t: 'cone',
        x: 600, // initial click
        y: 600,
        distance: 30,
        angle: 53.13,
        direction: 0,
        updateSource(data) { Object.assign(this, data); }
    };

    const mockPlaceable = {
        document: mockDocument,
        x: 600,
        y: 600,
        direction: 0,
        highlightGrid() {}
    };

    const config = {
        type: 'cone',
        stickToToken: true,
        token: mockToken,
        distance: 30,
        angle: 53.13
    };

    const coneShape = new ConeCrosshairShape(mockPlaceable, config);
    // Move mouse to west (50, 250) -> token west edge is (200, 250)
    coneShape.move(50, 250);

    assert.equal(coneShape.x, 200, 'cone shape origin must be on token west edge');
    assert.equal(coneShape.y, 250);
    assert.equal(coneShape.direction, 180);

    const placement = coneShape.getPlacementUpdates();
    assert.equal(placement.x, 200, 'placement X must be token edge (200), not mouse position (50 or 600)');
    assert.equal(placement.y, 250);
    assert.equal(placement.direction, 180);
    assert.equal(placement.t, 'cone');
});

test('FoundryVTTV13Adapter.refreshTemplateHighlights invalidates shape and render flags during wheel rotation without mouse move', () => {
    const adapterV13 = new FoundryVTTV13Adapter();

    let renderFlagsApplied = false;
    let shapeComputed = false;
    const renderFlagsSet = {};

    const mockDoc = {
        t: 'cone',
        x: 300,
        y: 300,
        distance: 30,
        angle: 53.13,
        direction: 0,
        updateSource(data) { Object.assign(this, data); }
    };

    const mockPlaceable = {
        document: mockDoc,
        x: 300,
        y: 300,
        direction: 0,
        rotation: 0,
        _shape: { some: 'cachedShape' },
        _computeShape() {
            shapeComputed = true;
            return { recomputed: true };
        },
        renderFlags: {
            set(flags) { Object.assign(renderFlagsSet, flags); }
        },
        applyRenderFlags() {
            renderFlagsApplied = true;
        },
        highlightGrid() {}
    };

    adapterV13.refreshTemplateHighlights(mockPlaceable, 90);

    assert.equal(mockPlaceable.direction, 90);
    assert.equal(mockDoc.direction, 90);
    assert.ok(shapeComputed, '_computeShape must be invoked to recalculate PIXI geometry');
    assert.ok(renderFlagsApplied, 'applyRenderFlags must be called synchronously');
    assert.ok(renderFlagsSet.refreshShape, 'refreshShape render flag must be set');
    assert.ok(renderFlagsSet.refreshGrid, 'refreshGrid render flag must be set');
});

test('FoundryVTTV13Adapter ensures isVisible returns true on preview MeasuredTemplates during highlighting even when visible is false', () => {
    const adapterV13 = new FoundryVTTV13Adapter();

    const mockPlaceable = {
        visible: false,
        document: {
            t: 'circle',
            x: 100,
            y: 100,
            distance: 20,
            updateSource(data) { Object.assign(this, data); }
        },
        x: 100,
        y: 100,
        direction: 0,
        highlightGrid() {}
    };

    adapterV13._wrapHighlightGrid(mockPlaceable);
    assert.equal(mockPlaceable.isVisible, true, 'isVisible must return true on wrapped placeable to unblock native Foundry V13 highlightGrid');

    const anotherPlaceable = {
        visible: false,
        document: {
            t: 'circle',
            x: 200,
            y: 200,
            distance: 15,
            updateSource(data) { Object.assign(this, data); }
        },
        x: 200,
        y: 200,
        direction: 0,
        highlightGrid() {}
    };

    adapterV13.refreshTemplateHighlights(anotherPlaceable, 0);
    assert.equal(anotherPlaceable.isVisible, true, 'isVisible must return true after refreshTemplateHighlights runs');
});

test('FoundryVTTV13Adapter._patchRefreshState safely protects MeasuredTemplate._refreshState when highlight layer is undefined', async () => {
    class MockMeasuredTemplate {
        constructor() {
            this.highlightId = 'Template.test12345';
            this.visible = false;
        }

        _refreshState() {
            // Emulate core Foundry V13 MeasuredTemplate._refreshState
            const highlightLayer = globalThis.canvas.interface.grid.getHighlightLayer(this.highlightId);
            highlightLayer.visible = this.visible;
        }
    }

    globalThis.CONFIG.MeasuredTemplate = {
        objectClass: MockMeasuredTemplate
    };

    const adapterV13 = new FoundryVTTV13Adapter();
    adapterV13._patchRefreshState();

    const tmpl = new MockMeasuredTemplate();

    // With canvas.interface.grid.getHighlightLayer returning undefined initially, _refreshState should not throw
    assert.doesNotThrow(() => {
        tmpl._refreshState();
    }, 'Patched _refreshState must not throw Uncaught TypeError: Cannot set properties of undefined (setting visible)');
});

test('CrosshairRangeOverlay.update does not throw when textElement creation fails or is null', async () => {
    const { CrosshairRangeOverlay } = await import('../../src/crosshair/rangeOverlay.js');
    const mockShape = {
        stickToToken: false,
        token: { center: { x: 100, y: 100 } },
        config: { showRange: true },
        sequencerCrosshair: { x: 200, y: 200, parent: {} },
        x: 200,
        y: 200
    };

    const overlay = new CrosshairRangeOverlay(mockShape);
    // When textElement is null, update should safely execute without throwing
    assert.doesNotThrow(() => {
        overlay.update();
    });
});

test('BaseFoundryVTTAdapter.dismissPreview cleans up highlights and placeable without throwing when placeable triggers _refreshState', () => {
    let clearedHighlight = null;
    let destroyedHighlight = null;
    let destroyedPlaceable = false;

    const mockPlaceable = {
        id: 'previewTmpl123',
        highlightId: 'Template.previewTmpl123',
        visible: true,
        destroy() {
            destroyedPlaceable = true;
            // Simulate core placeable triggering _refreshState or accessing highlight layer on destroy
            this._refreshState?.();
        },
        _refreshState() {
            const hl = globalThis.canvas.interface.grid.getHighlightLayer(this.highlightId);
            if (hl) hl.visible = this.visible;
        }
    };

    const origClear = globalThis.canvas.interface.grid.clearHighlightLayer;
    const origDestroy = globalThis.canvas.interface.grid.destroyHighlightLayer;
    try {
        globalThis.canvas.interface.grid.clearHighlightLayer = (id) => { clearedHighlight = id; };
        globalThis.canvas.interface.grid.destroyHighlightLayer = (id) => { destroyedHighlight = id; };

        assert.doesNotThrow(() => {
            crosshairAdapter.dismissPreview(mockPlaceable);
        });

        assert.equal(destroyedPlaceable, true, 'Placeable must be destroyed');
        assert.ok(clearedHighlight !== null, 'Highlight layer must be cleared');
        assert.ok(destroyedHighlight !== null, 'Highlight layer must be destroyed');
    } finally {
        globalThis.canvas.interface.grid.clearHighlightLayer = origClear;
        globalThis.canvas.interface.grid.destroyHighlightLayer = origDestroy;
    }
});

test('FoundryVTTV14Adapter._patchRefreshState safely protects MeasuredTemplate, Region, and CrosshairsPlaceable when zIndex or highlight layer is undefined', async () => {
    class MockMeasuredTemplateV14 {
        constructor() {
            this.highlightId = 'Template.testV14_1';
            this.visible = false;
        }

        _refreshState() {
            // Emulate core Foundry V14 setting zIndex on highlight layer and visual containers
            const highlightLayer = globalThis.canvas.interface.grid.getHighlightLayer(this.highlightId);
            highlightLayer.zIndex = 10;
            highlightLayer.visible = this.visible;
            this.mesh.zIndex = 5;
            this.template.zIndex = 4;
            this.border.zIndex = 3;
            this.shape.zIndex = 2;
            this.controlIcon.zIndex = 1;
            this.ruler.zIndex = 0;
        }
    }

    class MockRegionV14 {
        constructor() {
            this.highlightId = 'Region.testV14_2';
            this.visible = false;
        }

        _refreshState() {
            const highlightLayer = globalThis.canvas.interface.grid.getHighlightLayer(this.highlightId);
            highlightLayer.zIndex = 20;
            highlightLayer.visible = this.visible;
            this.shape.zIndex = 2;
        }
    }

    class MockCrosshairsPlaceableV14 {
        constructor() {
            this.highlightId = 'Template.testCrosshairV14';
            this.visible = false;
        }

        _refreshState() {
            const highlightLayer = globalThis.canvas.interface.grid.getHighlightLayer(this.highlightId);
            highlightLayer.zIndex = 15;
            highlightLayer.visible = this.visible;
            this.mesh.zIndex = 5;
        }
    }

    globalThis.CONFIG.MeasuredTemplate = { objectClass: MockMeasuredTemplateV14 };
    globalThis.CONFIG.Region = { objectClass: MockRegionV14 };
    globalThis.Sequencer = globalThis.Sequencer ?? {};
    globalThis.Sequencer.CrosshairsPlaceable = MockCrosshairsPlaceableV14;

    const adapterV14 = new FoundryVTTV14Adapter();
    adapterV14._patchRefreshState();

    const tmpl = new MockMeasuredTemplateV14();
    const region = new MockRegionV14();
    const crosshair = new MockCrosshairsPlaceableV14();

    assert.doesNotThrow(() => {
        tmpl._refreshState();
    }, 'V14 MeasuredTemplate._refreshState must not throw when zIndex or highlightLayer is set');

    assert.doesNotThrow(() => {
        region._refreshState();
    }, 'V14 Region._refreshState must not throw when zIndex or highlightLayer is set');

    assert.doesNotThrow(() => {
        crosshair._refreshState();
    }, 'V14 CrosshairsPlaceable._refreshState must not throw when zIndex or highlightLayer is set');
});

test('BaseFoundryVTTAdapter.hidePreview provides safe dummy containers with zIndex for undefined watched properties', () => {
    const mockPlaceable = {
        visible: true,
        renderable: true,
        // mesh, shape, border, template, controlIcon, ruler are all undefined initially
    };

    crosshairAdapter.hidePreview(mockPlaceable);

    assert.ok(mockPlaceable.mesh, 'mesh property must return dummy child container when undefined');
    assert.equal(mockPlaceable.mesh.zIndex, 0, 'dummy child container mesh must have zIndex 0');
    assert.equal(mockPlaceable.template.zIndex, 0, 'dummy child container template must have zIndex 0');
    assert.equal(mockPlaceable.border.zIndex, 0, 'dummy child container border must have zIndex 0');
    assert.equal(mockPlaceable.shape.zIndex, 0, 'dummy child container shape must have zIndex 0');
    assert.equal(mockPlaceable.controlIcon.zIndex, 0, 'dummy child container controlIcon must have zIndex 0');
    assert.equal(mockPlaceable.ruler.zIndex, 0, 'dummy child container ruler must have zIndex 0');

    // Setting zIndex on dummy containers must not throw
    assert.doesNotThrow(() => {
        mockPlaceable.mesh.zIndex = 10;
        mockPlaceable.template.zIndex = 8;
        mockPlaceable.border.zIndex = 6;
        mockPlaceable.shape.zIndex = 4;
        mockPlaceable.controlIcon.zIndex = 2;
        mockPlaceable.ruler.zIndex = 1;
    });
});




