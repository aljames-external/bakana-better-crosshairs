import { crosshair } from './crosshair/index.js';
import { file, closest, absolutePath } from './lib/filemanager.js';
import { log } from './lib/logger.js';
import { autorecManager } from './autorec/autorecManager.js';
import { ModuleAutorecManager } from './autorec/moduleAutorecManager.js';
import { remoteCrosshairManager, getPeerCursorPosition, diagnoseUserCursor } from './crosshair/remoteCrosshairManager.js';
import { socketlib, handleSocketMessage } from './integration/socketlib.js';
import { systemAdapter, initializeSystemAdapter, crosshairAdapter, initializeFoundryAdapter, initializeHooks } from './adapter/index.js';
import { attachWheelRotation, detachWheelRotation, resolveCrosshairPlacement, getTokenEdgePoint, snapCoordinates } from './crosshair/util.js';
import { localize } from './lib/utils.js';
import { registerModuleSettings } from './settings.js';
import { MODULE_ID, MODULE_NAME } from './lib/constants.js';

/**
 * Merges exported module functions and utilities into the global `bbc` namespace object.
 *
 * @param {Record<string, unknown>} exportedFunctions - Object containing functions or utilities to export globally.
 * @returns {void}
 */
export function setupApiCalls(exportedFunctions) {
    if (!exportedFunctions || typeof exportedFunctions !== "object") return;
    const mod = game?.modules?.get(MODULE_ID);
    if (mod) {
        mod.api = foundry.utils.mergeObject(mod.api ?? {}, exportedFunctions);
    }
}

/**
 * Initializes system and Foundry adapters, templates, global API endpoints, and registers API methods on the module instance.
 *
 * @returns {void}
 */
export function setupModule() {
    registerModuleSettings();
    initializeSystemAdapter();
    initializeFoundryAdapter();
    initializeHooks();
    loadTemplates([
        `modules/${MODULE_ID}/src/autorec/configFieldsPartial.html`,
        `modules/${MODULE_ID}/src/autorec/autorecImportDialog.html`
    ]);

    const manager = autorecManager;

    const util = {
        localize,
        file,
        closest,
        absolutePath,
        attachWheelRotation,
        detachWheelRotation,
        resolveCrosshairPlacement,
        getTokenEdgePoint,
        snapCoordinates,
    };

    const moduleApi = {
        crosshair,
        util,
        autorecManager,
        ModuleAutorecManager,
        remoteCrosshairManager,
        getPeerCursorPosition,
        diagnoseUserCursor,
        systemAdapter,
        crosshairAdapter,
        log,
    };

    setupApiCalls(moduleApi);
}

/**
 * Handles module initialization during the Foundry VTT 'init' hook.
 *
 * @returns {void}
 */
Hooks.once('init', () => {
    setupModule();
    log.info(`Initializing ${MODULE_NAME} module`);
});

/**
 * Handles module readiness tasks during the Foundry VTT 'ready' hook.
 *
 * @returns {void}
 */
Hooks.once('ready', () => {
    autorecManager.initializeReadySync();
    socketlib.on(handleSocketMessage);
    Hooks.on('canvasReady', () => {
        remoteCrosshairManager.clear();
    });
    log.info(`${MODULE_NAME} module ready`);
});


