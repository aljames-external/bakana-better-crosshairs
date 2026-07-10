import { BaseFoundryVTTAdapter } from "./base-foundryvtt-adapter.js";
import { FoundryVTTV12Adapter } from "./foundryvtt-v12-adapter.js";
import { FoundryVTTV14Adapter } from "./foundryvtt-v14-adapter.js";
import { version } from "../../lib/utils.js";
import { MODULE_NAME } from "../../lib/constants.js";

export { BaseFoundryVTTAdapter, FoundryVTTV12Adapter, FoundryVTTV14Adapter, version };

export let crosshairAdapter = new BaseFoundryVTTAdapter();

/**
 * Initialize the active Foundry VTT version adapter (v12 or v14).
 * Evaluates supported generation boundaries using boolean version.clamp.
 * Should be called during the 'init' hook.
 * @returns {FoundryVTTV12Adapter|FoundryVTTV14Adapter}
 */
export function initializeFoundryAdapter() {
    const ver = game.version;

    if (version.clamp(ver, "14")) {
        crosshairAdapter = new FoundryVTTV14Adapter();
    } else if (version.clamp(ver, "12", "14")) {
        crosshairAdapter = new FoundryVTTV12Adapter();
    } else {
        throw new Error(`[${MODULE_NAME}] Unsupported Foundry VTT generation (${ver}). Required: Foundry v12..v14+.`);
    }

    return crosshairAdapter;
}
