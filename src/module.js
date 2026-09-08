import { adapter } from './adapter/index.js';
import './crosshair/index.js';
import { log } from './lib/logger.js';
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
        mod.api = Object.assign(mod.api ?? {}, exportedFunctions);
    }
}

/**
 * Initializes system and Foundry adapters, templates, global API endpoints, and registers API methods on the module instance.
 *
 * @returns {void}
 */
export function setupModule() {
    registerModuleSettings();
    adapter.initialize();
    adapter.loadTemplates([
        `modules/${MODULE_ID}/src/autorec/configFieldsPartial.html`,
        `modules/${MODULE_ID}/src/autorec/autorecImportDialog.html`,
        `modules/${MODULE_ID}/src/autorec/autorecExchangeMenu.html`,
        `modules/${MODULE_ID}/src/autorec/autorecMenu.html`,
        `modules/${MODULE_ID}/src/autorec/itemConfigMenu.html`
    ]);

    const moduleApi = {
        adapter,
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
 * Handles localization readiness tasks during the Foundry VTT 'i18nInit' hook.
 *
 * @returns {void}
 */
Hooks.once('i18nInit', () => {
    adapter.system.refreshLocalizedDefaults('i18nInit');
});

/**
 * Handles module readiness tasks during the Foundry VTT 'ready' hook.
 *
 * @returns {void}
 */
Hooks.once('ready', () => {
    adapter.system.refreshLocalizedDefaults('ready');
    adapter.autorec.initializeReadySync();
    adapter.socket.on(adapter.handleSocketMessage);
    Hooks.on('canvasReady', () => {
        adapter.crosshair.remote.clear();
    });
    Hooks.on('userConnected', (user, connected) => {
        if (!connected && user?.id) {
            adapter.crosshair.remote.clearForUser(user.id);
        }
    });
    log.info(`${MODULE_NAME} module ready`);
});


