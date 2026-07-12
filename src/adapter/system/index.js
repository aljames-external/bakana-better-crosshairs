import { BaseSystemAdapter } from "./base-system-adapter.js";
import { Dnd5eSystemAdapter } from "./dnd5e-adapter.js";
import { Pf2eSystemAdapter } from "./pf2e-adapter.js";

export let systemAdapter = new BaseSystemAdapter();

/**
 * Initialize the active System Adapter for the running game system.
 * Should be called during the 'init' hook.
 *
 * @returns {BaseSystemAdapter|Dnd5eSystemAdapter|Pf2eSystemAdapter} The initialized system adapter instance.
 */
export function initializeSystemAdapter() {
    switch (game.system.id) {
        case "dnd5e":
            systemAdapter = new Dnd5eSystemAdapter();
            break;
        case "pf2e":
            systemAdapter = new Pf2eSystemAdapter();
            break;
        default:
            systemAdapter = new BaseSystemAdapter();
            break;
    }
    return systemAdapter;
}
