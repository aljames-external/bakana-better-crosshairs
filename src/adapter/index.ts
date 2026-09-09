import { systemAdapter, BaseSystemAdapter } from "./system/index.js";
import { crosshairAdapter, BaseFoundryVTTAdapter } from "./foundry/index.js";
import { canvasAdapter, BaseCanvasAdapter } from "./canvas/index.js";
import { autorecManager } from "../autorec/autorecManager.js";
import { socketlib, handleSocketMessage, waitForTileReplication } from "../integration/socketlib.js";
import { file } from "../lib/filemanager.js";

let hooksInitialized = false;
let onRegisterConnected = false;
let _crosshair = null;

/**
 * Register canvas placement and document creation hooks across the active Foundry generation and Game System.
 * Abstracts hook registration so that it depends on both the version adapter and system adapter.
 * @param {Object} [callbacks={}] - Placement hook callbacks (`{ onDrawPreview, onPreCreate, onCreate }`)
 * @param {Object} [options={}] - Execution options (`{ foundryAdapter, sysAdapter }`)
 * @returns {Array<{event: string, handler: Function, category: string, targetName: string}>} Array of registered hook descriptor objects
 */
function registerPlacementHooks(callbacks = {}, options = {}) {
    const fAdapter = options.foundryAdapter ?? crosshairAdapter;
    const sAdapter = options.sysAdapter ?? systemAdapter;
    const hooks = fAdapter.registerPlacementHooks(callbacks, sAdapter);
    sAdapter.registerItemSheetHooks();
    return hooks;
}

/**
 * Initialize crosshair placement hooks and ready synchronization.
 * @param {Object} [options={}] - Execution options (`{ foundryAdapter, sysAdapter }`)
 * @returns {void}
 */
function initializeHooks(options = {}) {
    if (!onRegisterConnected) {
        onRegisterConnected = true;
        autorecManager.onRegister(() => initializeHooks(options));
    }

    if (hooksInitialized) return;
    hooksInitialized = true;

    registerPlacementHooks({}, options);

    if (game?.ready) {
        autorecManager.initializeReadySync();
    } else {
        Hooks?.once?.("ready", () => autorecManager.initializeReadySync());
    }
}

const adapter = {
    get foundry() { return crosshairAdapter; },
    get crosshair() {
        if (!_crosshair) return crosshairAdapter;
        return new Proxy(_crosshair, {
            get(target, prop) {
                if (prop in target) return target[prop];
                return crosshairAdapter[prop];
            }
        });
    },
    registerCrosshair(subsystem) {
        _crosshair = subsystem;
    },
    get system() { return systemAdapter; },
    get canvas() { return canvasAdapter; },
    get autorec() { return autorecManager; },
    get socket() { return socketlib; },
    get socketlib() { return socketlib; },
    get file() { return file; },


    // Socket message handlers & utilities
    handleSocketMessage,
    waitForTileReplication,

    // Lifecycle and hook registration delegates
    registerPlacementHooks(callbacks = {}, options = {}) {
        return registerPlacementHooks(callbacks, options);
    },
    initializeHooks(options = {}) {
        return initializeHooks(options);
    },
    initialize() {
        systemAdapter.initialize();
        crosshairAdapter.initialize();
        canvasAdapter.initialize();
        initializeHooks();
    },

    // Easy access Foundry & Canvas helpers
    getCenter(target) { return crosshairAdapter.getCenter(target); },
    getTokenDimensions(token) { return crosshairAdapter.getTokenDimensions(token); },
    getTokenRotation(token) { return crosshairAdapter.getTokenRotation(token); },
    getDistance(t1, t2) { return crosshairAdapter.getDistance(t1, t2); },
    getGridSize() { return canvasAdapter.getGridSize(); },
    getSceneDimensions() { return canvasAdapter.getDimensions(); },
    getNearestSquareCenter(t1, t2) { return crosshairAdapter.getNearestSquareCenter(t1, t2); },
    fromUuidSync(uuid, options) { return crosshairAdapter.fromUuidSync(uuid, options); },
    fromUuid(uuid, options) { return crosshairAdapter.fromUuid(uuid, options); },
    mergeObject(original, other, options) { return crosshairAdapter.mergeObject(original, other, options); },
    duplicate(obj) { return crosshairAdapter.duplicate(obj); },
    deepClone(obj) { return crosshairAdapter.deepClone(obj); },
    getProperty(obj, path) { return crosshairAdapter.getProperty(obj, path); },
    setProperty(obj, path, value) { return crosshairAdapter.setProperty(obj, path, value); },
    randomID(length) { return crosshairAdapter.randomID(length); },
    isEmpty(obj) { return crosshairAdapter.isEmpty(obj); },
    isNewerVersion(a, b) { return crosshairAdapter.isNewerVersion(a, b); },
    loadTemplates(paths) { return crosshairAdapter.loadTemplates(paths); }
};

export {
    adapter,
    BaseFoundryVTTAdapter,
    BaseSystemAdapter,
    BaseCanvasAdapter
};
