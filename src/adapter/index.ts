import { systemAdapter, BaseSystemAdapter } from "./system/index.js";
import { crosshairAdapter, BaseFoundryVTTAdapter } from "./foundry/index.js";
import { canvasAdapter, BaseCanvasAdapter } from "./canvas/index.js";
import { autorecManager } from "../autorec/autorecManager.js";
import { socketlib, handleSocketMessage, waitForTileReplication } from "../integration/socketlib.js";
import { file } from "../lib/filemanager.js";

let hooksInitialized = false;
let onRegisterConnected = false;
let _crosshair: any = null;

export interface PlacementHookOptions {
    foundryAdapter?: BaseFoundryVTTAdapter;
    sysAdapter?: BaseSystemAdapter;
}

/**
 * Register canvas placement and document creation hooks across the active Foundry generation and Game System.
 * Abstracts hook registration so that it depends on both the version adapter and system adapter.
 * @param {Object} [callbacks={}] - Placement hook callbacks (`{ onDrawPreview, onPreCreate, onCreate }`)
 * @param {PlacementHookOptions} [options={}] - Execution options (`{ foundryAdapter, sysAdapter }`)
 * @returns {Array<{event: string, handler: Function, category: string, targetName: string}>} Array of registered hook descriptor objects
 */
function registerPlacementHooks(callbacks: Record<string, any> = {}, options: PlacementHookOptions = {}) {
    const fAdapter = options.foundryAdapter ?? crosshairAdapter;
    const sAdapter = options.sysAdapter ?? systemAdapter;
    const hooks = fAdapter.registerPlacementHooks(callbacks, sAdapter);
    sAdapter.registerItemSheetHooks();
    return hooks;
}

/**
 * Initialize crosshair placement hooks and ready synchronization.
 * @param {PlacementHookOptions} [options={}] - Execution options (`{ foundryAdapter, sysAdapter }`)
 * @returns {void}
 */
function initializeHooks(options: PlacementHookOptions = {}) {
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
    registerPlacementHooks(callbacks: Record<string, any> = {}, options: PlacementHookOptions = {}) {
        return registerPlacementHooks(callbacks, options);
    },
    initializeHooks(options: PlacementHookOptions = {}) {
        return initializeHooks(options);
    },
    initialize() {
        systemAdapter.initialize();
        crosshairAdapter.initialize();
        canvasAdapter.initialize();
        initializeHooks();
    },

    // Easy access Foundry & Canvas helpers
    getCenter(target: any): { x: number; y: number } | null { return crosshairAdapter.getCenter(target); },
    getTokenDimensions(token: Token): { widthPx: number; heightPx: number; widthUnits: number; heightUnits: number; radiusPx: number } { return crosshairAdapter.getTokenDimensions(token); },
    getTokenRotation(token: Token | null | undefined): number { return crosshairAdapter.getTokenRotation(token); },
    getDistance(t1: Token, t2: Token): number { return crosshairAdapter.getDistance(t1, t2); },
    getGridSize(): number { return canvasAdapter.gridSize; },
    getSceneDimensions() { return canvasAdapter.dimensionsRect; },
    getNearestSquareCenter(t1: Token, t2: Token): { x: number; y: number } | null { return crosshairAdapter.getNearestSquareCenter(t1, t2); },
    fromUuidSync(uuid: string, options: any = {}) { return crosshairAdapter.fromUuidSync(uuid, options); },
    fromUuid(uuid: string, options: any = {}) { return crosshairAdapter.fromUuid(uuid, options); },
    mergeObject(original: any, other: any = {}, options: any = {}) { return crosshairAdapter.mergeObject(original, other, options); },
    duplicate(obj: any) { return crosshairAdapter.deepClone(obj); },
    deepClone(obj: any) { return crosshairAdapter.deepClone(obj); },
    getProperty(obj: any, path: string) { return crosshairAdapter.getProperty(obj, path); },
    setProperty(obj: any, path: string, value: any) { return crosshairAdapter.setProperty(obj, path, value); },
    randomID(length?: number) { return crosshairAdapter.randomID(length); },
    isEmpty(obj: any) { return crosshairAdapter.isEmpty(obj); },
    isNewerVersion(v1: string | number, v0: string | number, options?: { majorOnly?: boolean }): boolean { return crosshairAdapter.isNewerVersion(v1, v0, options); },
    loadTemplates(paths: string[]): Promise<Function[]> { return crosshairAdapter.loadTemplates(paths); }
};

export {
    adapter,
    BaseFoundryVTTAdapter,
    BaseSystemAdapter,
    BaseCanvasAdapter
};
