import { crosshair } from './crosshair/_crosshairs.js';
import { file, closest, absolutePath } from './lib/filemanager.js';
import { log } from './lib/logger.js';
import { autorecManager } from './autorec/autorecManager.js';
import { systemAdapter, getSystemAdapter } from './adapter/system/index.js';
import { attachWheelRotation, detachWheelRotation, resolveCrosshairPlacement, getTokenEdgePoint, snapCoordinates } from './crosshair/util.js';
import { localize } from './lib/utils.js';
import './settings.js';
import { MODULE_ID } from './lib/constants.js';

Hooks.once('init', async () => {
    function setupModule() {
        function setupApiCalls(exportedFunctions) {
            globalThis.bbc = foundry.utils.mergeObject(
                globalThis.bbc ?? {},
                exportedFunctions
            );
            globalThis.bakanaBetterCrosshairs = globalThis.bbc;
            globalThis.bakana = foundry.utils.mergeObject(
                globalThis.bakana ?? {},
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
        setupApiCalls({ getSystemAdapter });
        setupApiCalls({ log });

        const moduleApi = {
            crosshair,
            util,
            manager,
            autorecManager,
            systemAdapter,
            getSystemAdapter,
            log,
        };
        const mod = game.modules.get(MODULE_ID);
        if (mod) mod.api = moduleApi;
    }


    setupModule();
    log.info("Bakana's Better Crosshairs module ready");
});

Hooks.once('ready', () => {
    autorecManager.initializeReadySync();
});

