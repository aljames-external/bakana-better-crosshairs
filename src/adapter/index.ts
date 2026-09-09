import { systemAdapter, BaseSystemAdapter } from "./system/index.js";
import { crosshairAdapter, BaseFoundryVTTAdapter } from "./foundry/index.js";
import { canvasAdapter, BaseCanvasAdapter } from "./canvas/index.js";
import { autorecManager } from "../autorec/autorecManager.js";
import { socketlib, handleSocketMessage, waitForTileReplication } from "../integration/socketlib.js";
import { file } from "../lib/filemanager.js";

let hooksInitialized = false;
let onRegisterConnected = false;
let _crosshair: any = null;

/**
 * Register canvas placement and document creation hooks across the active Foundry generation and Game System.
 * Abstracts hook registration so that it depends on both the version adapter and system adapter.
 * @param {Object} [callbacks={}] - Placement hook callbacks (`{ onDrawPreview, onPreCreate, onCreate }`)
 * @param {Object} [options={}] - Execution options (`{ foundryAdapter, sysAdapter }`)
 * @returns {Array<{event: string, handler: Function, category: string, targetName: string}>} Array of registered hook descriptor objects
 */
function registerPlacementHooks(callbacks: any = {}, options: any = {}) {
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
function initializeHooks(options: any = {}) {
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

const adapter: any = {
    get foundry() { return crosshairAdapter; },
    get crosshair() {
        if (!_crosshair) return crosshairAdapter;
        return new Proxy(_crosshair, {
            get(target, prop) {
                if (prop in target) return target[prop];
                return (crosshairAdapter as any)[prop];
            }
        });
    },
    registerCrosshair(subsystem: any) {
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
    registerPlacementHooks(callbacks: any = {}, options: any = {}) {
        return registerPlacementHooks(callbacks, options);
    },
    initializeHooks(options: any = {}) {
        return initializeHooks(options);
    },
    initialize() {
        (systemAdapter as any).initialize?.();
        (crosshairAdapter as any).initialize?.();
        (canvasAdapter as any).initialize?.();
        initializeHooks();
    },

    // Easy access Foundry & Canvas helpers
    getCenter(target: any) { return (crosshairAdapter as any).getCenter?.(target); },
    getTokenDimensions(token: any) { return (crosshairAdapter as any).getTokenDimensions?.(token); },
    getTokenRotation(token: any) { return (crosshairAdapter as any).getTokenRotation?.(token); },
    getDistance(t1: any, t2: any) { return (crosshairAdapter as any).getDistance?.(t1, t2); },
    getGridSize() { return (canvasAdapter as any).getGridSize?.() ?? (canvasAdapter as any).gridSize; },
    getSceneDimensions() { return (canvasAdapter as any).getDimensions?.() ?? (canvasAdapter as any).dimensions; },
    getNearestSquareCenter(t1: any, t2: any) { return (crosshairAdapter as any).getNearestSquareCenter?.(t1, t2); },
    fromUuidSync(uuid: string, options: any) { return crosshairAdapter.fromUuidSync(uuid, options); },
    fromUuid(uuid: string, options: any) { return (crosshairAdapter as any).fromUuid?.(uuid, options); },
    mergeObject(original: any, other: any, options: any) { return crosshairAdapter.mergeObject(original, other, options); },
    duplicate(obj: any) { return (crosshairAdapter as any).duplicate?.(obj) ?? crosshairAdapter.deepClone(obj); },
    deepClone(obj: any) { return crosshairAdapter.deepClone(obj); },
    getProperty(obj: any, path: string) { return (crosshairAdapter as any).getProperty?.(obj, path) ?? foundry.utils.getProperty(obj, path); },
    setProperty(obj: any, path: string, value: any) { return (crosshairAdapter as any).setProperty?.(obj, path, value) ?? foundry.utils.setProperty(obj, path, value); },
    randomID(length?: number) { return crosshairAdapter.randomID(length); },
    isEmpty(obj: any) { return (crosshairAdapter as any).isEmpty?.(obj) ?? foundry.utils.isEmpty(obj); },
    isNewerVersion(a: string, b: string) { return (crosshairAdapter as any).isNewerVersion?.(a, b) ?? foundry.utils.isNewerVersion(a, b); },
    loadTemplates(paths: any) { return crosshairAdapter.loadTemplates(paths); }
};

export {
    adapter,
    BaseFoundryVTTAdapter,
    BaseSystemAdapter,
    BaseCanvasAdapter
};
