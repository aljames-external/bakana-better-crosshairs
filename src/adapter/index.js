import { systemAdapter, initializeSystemAdapter } from "./system/index.js";
import { crosshairAdapter, initializeFoundryAdapter } from "./foundry/index.js";
import { autorecManager } from "../autorec/autorecManager.js";

let hooksInitialized = false;
let onRegisterConnected = false;

/**
 * Register canvas placement and document creation hooks across the active Foundry generation and Game System.
 * Abstracts hook registration so that it depends on both the version adapter and system adapter.
 * @param {Object} [callbacks={}] - Placement hook callbacks (`{ onDrawPreview, onPreCreate, onCreate }`)
 * @param {Object} [options={}] - Execution options (`{ foundryAdapter, sysAdapter }`)
 * @returns {Array<{event: string, handler: Function, category: string, targetName: string}>} Array of registered hook descriptor objects
 */
export function registerPlacementHooks(callbacks = {}, options = {}) {
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
export function initializeHooks(options = {}) {
    if (!onRegisterConnected) {
        onRegisterConnected = true;
        autorecManager.onRegister(() => initializeHooks(options));
    }

    if (hooksInitialized) return;
    hooksInitialized = true;

    registerPlacementHooks({}, options);

    if (typeof game !== "undefined" && game.ready) {
        autorecManager.initializeReadySync();
    } else if (typeof Hooks !== "undefined" && typeof Hooks.once === "function") {
        Hooks.once("ready", () => autorecManager.initializeReadySync());
    }
}

export { systemAdapter, initializeSystemAdapter, crosshairAdapter, initializeFoundryAdapter };
