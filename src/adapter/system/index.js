import { BaseSystemAdapter } from "./base-system-adapter.js";
import { Dnd5eSystemAdapter } from "./dnd5e-adapter.js";

export { BaseSystemAdapter, Dnd5eSystemAdapter };

export let systemAdapter = new BaseSystemAdapter();

/**
 * Initialize the active System Adapter for the running game system.
 * Should be called during the 'init' hook.
 * @returns {BaseSystemAdapter|Dnd5eSystemAdapter}
 */
export function initializeSystemAdapter() {
    if (game?.system?.id === "dnd5e") {
        systemAdapter = new Dnd5eSystemAdapter();
    } else {
        systemAdapter = new BaseSystemAdapter();
    }
    return systemAdapter;
}
