import { BaseSystemAdapter } from "./base-system-adapter.js";
import { Dnd5eSystemAdapter } from "./dnd5e-adapter.js";
import { Pf2eSystemAdapter } from "./pf2e-adapter.js";
import { Pf1SystemAdapter } from "./pf1-adapter.js";
import { log } from "../../lib/logger.js";

export let systemAdapter = new BaseSystemAdapter();

/**
 * Initialize the active System Adapter for the running game system.
 * Should be called during the 'init' hook.
 *
 * @returns {BaseSystemAdapter|Dnd5eSystemAdapter|Pf2eSystemAdapter|Pf1SystemAdapter} The initialized system adapter instance.
 */
export function initializeSystemAdapter() {
    const systemId = typeof game !== "undefined" ? (game?.system?.id ?? "base") : "base";
    switch (systemId) {
        case "dnd5e":
            systemAdapter = new Dnd5eSystemAdapter();
            break;
        case "pf2e":
            systemAdapter = new Pf2eSystemAdapter();
            break;
        case "pf1":
        case "pf":
            systemAdapter = new Pf1SystemAdapter(systemId);
            break;
        default:
            systemAdapter = new BaseSystemAdapter();
            break;
    }

    if (typeof systemAdapter.loadSystemDefaultsData === "function") {
        systemAdapter.loadSystemDefaultsData();
    }

    log.info(`Initialized System Adapter for system: "${systemAdapter.systemId}"`);
    return systemAdapter;
}
