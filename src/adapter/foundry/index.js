import { BaseFoundryVTTAdapter } from "./base-foundryvtt-adapter.js";
import { FoundryVTTV14Adapter } from "./foundryvtt-v14-adapter.js";
import { version } from "../../lib/utils.js";
import { MODULE_NAME } from "../../lib/constants.js";

export { BaseFoundryVTTAdapter, FoundryVTTV14Adapter, version };

/**
 * Active crosshair adapter instance, defaulting to base adapter before initialization.
 * @type {BaseFoundryVTTAdapter|FoundryVTTV14Adapter}
 */
export let crosshairAdapter = new BaseFoundryVTTAdapter();

/**
 * Initialize the active Foundry VTT version adapter (v14+).
 * Evaluates supported generation boundaries using boolean version.clamp.
 * Should be called during the 'init' hook.
 * @returns {FoundryVTTV14Adapter} The initialized Foundry VTT adapter instance.
 */
export function initializeFoundryAdapter() {
    const ver = game.version;

    if (version.clamp(ver, "14")) {
        crosshairAdapter = new FoundryVTTV14Adapter();
    } else {
        throw new Error(`[${MODULE_NAME}] Unsupported Foundry VTT generation (${ver}). Required: Foundry v14+.`);
    }

    return crosshairAdapter;
}
