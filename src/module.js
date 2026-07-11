import { crosshair } from './crosshair/_crosshairs.js';
import { file, closest, absolutePath } from './lib/filemanager.js';
import { log } from './lib/logger.js';
import { autorecManager } from './autorec/autorecManager.js';
import { systemAdapter, initializeSystemAdapter } from './adapter/system/index.js';
import { crosshairAdapter, initializeFoundryAdapter } from './adapter/foundry/index.js';
import { attachWheelRotation, detachWheelRotation, resolveCrosshairPlacement, getTokenEdgePoint, snapCoordinates } from './crosshair/util.js';
import { initializeHooks } from './lib/templates.js';
import { localize } from './lib/utils.js';
import './settings.js';
import { MODULE_ID, MODULE_NAME } from './lib/constants.js';

Hooks.once('init', async () => {
    function setupModule() {
        initializeSystemAdapter();
        initializeFoundryAdapter();
        initializeHooks();

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

        setupApiCalls({ crosshair });
        setupApiCalls({ util });
        setupApiCalls({ manager });
        setupApiCalls({ autorecManager });
        setupApiCalls({ systemAdapter });
        setupApiCalls({ crosshairAdapter });
        setupApiCalls({ log });

        const moduleApi = {
            crosshair,
            util,
            manager,
            autorecManager,
            systemAdapter,
            crosshairAdapter,
            log,
        };


        const mod = game.modules.get(MODULE_ID);
        if (mod) mod.api = moduleApi;
    }


    setupModule();
    log.info(`${MODULE_NAME} module ready`);
});


Hooks.once('ready', () => {
    autorecManager.initializeReadySync();
});

