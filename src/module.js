import { crosshair } from './crosshair/_crosshairs.js';
import { file, closest, absolutePath } from './lib/filemanager.js';
import { log } from './lib/logger.js';
import { autorecManager } from './autorec/autorecManager.js';
import { systemAdapter, initializeSystemAdapter } from './adapter/system/index.js';
import { crosshairAdapter, initializeFoundryAdapter } from './adapter/foundry/index.js';
import { attachWheelRotation, detachWheelRotation, resolveCrosshairPlacement, getTokenEdgePoint, snapCoordinates } from './crosshair/util.js';
import { initializeHooks } from './lib/templates.js';
import { localize } from './lib/utils.js';
import { registerModuleSettings } from './settings.js';
import { MODULE_ID, MODULE_NAME } from './lib/constants.js';

/**
 * Handles module initialization during the Foundry VTT 'init' hook.
 *
 * @returns {void}
 */
Hooks.once('init', () => {
    /**
     * Initializes system and Foundry adapters, templates, global API endpoints, and registers API methods on the module instance.
     *
     * @returns {void}
     */
    function setupModule() {
        registerModuleSettings();
        initializeSystemAdapter();
        initializeFoundryAdapter();
        initializeHooks();

        /**
         * Merges exported module functions and utilities into the global `bbc` namespace object.
         *
         * @param {Record<string, unknown>} exportedFunctions - Object containing functions or utilities to export globally.
         * @returns {void}
         */
        function setupApiCalls(exportedFunctions) {
            globalThis.bbc = foundry.utils.mergeObject(
                globalThis.bbc ?? {},
                exportedFunctions
            );
        }

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
            manager,
            autorecManager,
            systemAdapter,
            crosshairAdapter,
            log,
        };

        setupApiCalls(moduleApi);

        const mod = game.modules.get(MODULE_ID);
        if (mod) mod.api = moduleApi;
    }

    setupModule();
    log.info(`${MODULE_NAME} module ready`);
});

/**
 * Handles module readiness tasks during the Foundry VTT 'ready' hook.
 *
 * @returns {void}
 */
Hooks.once('ready', () => {
    autorecManager.initializeReadySync();
});
