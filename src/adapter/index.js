import { systemAdapter, initializeSystemAdapter } from "./system/index.js";
import { crosshairAdapter, initializeFoundryAdapter } from "./foundry/index.js";

/**
 * Register canvas placement and document creation hooks across the active Foundry generation and Game System.
 * Abstracts hook registration so that it depends on both the version adapter and system adapter.
 * @param {Object} callbacks - Placement hook callbacks (`{ onDrawPreview, onPreCreate, onCreate }`)
 * @param {Object} [options={}] - Execution options (`{ foundryAdapter, sysAdapter }`)
 * @returns {Array<{event: string, handler: Function, category: string, targetName: string}>} Array of registered hook descriptor objects
 */
export function registerPlacementHooks(callbacks, options = {}) {
    const fAdapter = options.foundryAdapter ?? crosshairAdapter;
    const sAdapter = options.sysAdapter ?? systemAdapter;
    const hooks = fAdapter.registerPlacementHooks(callbacks, sAdapter);
    sAdapter.registerItemSheetHooks();
    return hooks;
}

export { systemAdapter, initializeSystemAdapter, crosshairAdapter, initializeFoundryAdapter };
