import { BaseSystemAdapter } from "./base-system-adapter.js";
import { Dnd5eSystemAdapter } from "./dnd5e-adapter.js";

export { BaseSystemAdapter, Dnd5eSystemAdapter };

let activeSystemAdapter = null;

/**
 * Get or instantiate the active System Adapter based on game.system.id.
 * Only dnd5e returns Dnd5eSystemAdapter (supportsActivities = true).
 * Other systems return BaseSystemAdapter (supportsActivities = false).
 * @returns {BaseSystemAdapter|Dnd5eSystemAdapter}
 */
export function getSystemAdapter() {
    if (activeSystemAdapter) return activeSystemAdapter;

    const sysId = game?.system?.id;
    if (sysId === "dnd5e") {
        activeSystemAdapter = new Dnd5eSystemAdapter();
    } else {
        activeSystemAdapter = new BaseSystemAdapter();
    }
    return activeSystemAdapter;
}

/**
 * Reset the cached System Adapter (useful for testing or system changes).
 */
export function resetSystemAdapter() {
    activeSystemAdapter = null;
}

/**
 * Proxy object delegating to the active System Adapter.
 */
export const systemAdapter = new Proxy({}, {
    get(target, prop) {
        const adapter = getSystemAdapter();
        const value = adapter[prop];
        return typeof value === "function" ? value.bind(adapter) : value;
    }
});
