import { BaseFoundryVTTAdapter } from "./base-foundryvtt-adapter.js";
import { FoundryVTTV13Adapter } from "./foundryvtt-v13-adapter.js";
import { FoundryVTTV14Adapter } from "./foundryvtt-v14-adapter.js";
import { version } from "../../lib/utils.js";
import { MODULE_NAME } from "../../lib/constants.js";

export { BaseFoundryVTTAdapter, FoundryVTTV13Adapter, FoundryVTTV14Adapter };

/**
 * Active crosshair adapter instance, defaulting to base adapter before initialization.
 * @type {BaseFoundryVTTAdapter|FoundryVTTV13Adapter|FoundryVTTV14Adapter}
 */
export let crosshairAdapter = new BaseFoundryVTTAdapter();

/**
 * Initialize the active Foundry VTT version adapter (v13 or v14).
 * Evaluates supported generation boundaries using boolean version.clamp.
 * @returns {BaseFoundryVTTAdapter|FoundryVTTV13Adapter|FoundryVTTV14Adapter} The initialized Foundry VTT adapter instance.
 */
export function initializeFoundryAdapter() {
    const generation = game?.release?.generation;
    if (generation !== undefined && generation >= 14) {
        crosshairAdapter = new FoundryVTTV14Adapter();
    } else if (generation === 13) {
        crosshairAdapter = new FoundryVTTV13Adapter();
    } else {
        const ver = game?.version;
        if (ver && version.clamp(ver, "14")) {
            crosshairAdapter = new FoundryVTTV14Adapter();
        } else if (ver && version.clamp(ver, "13", "14")) {
            crosshairAdapter = new FoundryVTTV13Adapter();
        } else {
            crosshairAdapter = new BaseFoundryVTTAdapter();
        }
    }

    return crosshairAdapter;
}

(BaseFoundryVTTAdapter.prototype as any).initialize = initializeFoundryAdapter;
