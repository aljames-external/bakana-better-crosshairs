import { FoundryVTTV12Adapter } from "./foundryvtt-v12-adapter.js";
import { FoundryVTTV14Adapter } from "./foundryvtt-v14-adapter.js";

export { FoundryVTTV12Adapter, FoundryVTTV14Adapter };

/**
 * Version utility for semantic range verification across Foundry VTT releases.
 */
export const version = {
    /**
     * Check whether a semantic version string is clamped between min and max (inclusive).
     * @param {string} current - The current version string to test
     * @param {string} min - Minimum allowed version string
     * @param {string} [max] - Optional maximum allowed version string
     * @returns {boolean} True if current is between min and max inclusive, false otherwise.
     */
    clamp(current, min, max) {
        if (foundry.utils.isNewerVersion(min, current)) {
            return false;
        }
        if (max !== undefined && max !== null) {
            if (foundry.utils.isNewerVersion(current, max)) {
                return false;
            }
        }
        return true;
    }
};

let activeAdapter = null;

/**
 * Get or instantiate the global singleton Foundry VTT version adapter (v12 or v14).
 * Evaluates supported generation boundaries using boolean version.clamp.
 * @returns {FoundryVTTV12Adapter|FoundryVTTV14Adapter}
 */
export function getFoundryAdapter() {
    if (activeAdapter) return activeAdapter;

    const ver = game.version;

    if (version.clamp(ver, "14")) {
        activeAdapter = new FoundryVTTV14Adapter();
    } else if (version.clamp(ver, "12", "14")) {
        activeAdapter = new FoundryVTTV12Adapter();
    } else {
        throw new Error(`[Bakana's Better Crosshairs] Unsupported Foundry VTT generation (${ver}). Required: Foundry v12..v14+.`);
    }
    return activeAdapter;
}

/**
 * Global singleton crosshair adapter instance proxy that delegates to the active Foundry VTT version adapter.
 * @type {FoundryVTTV12Adapter|FoundryVTTV14Adapter}
 */
export const crosshairAdapter = new Proxy({}, {
    get(target, prop) {
        const adapter = getFoundryAdapter();
        const value = adapter[prop];
        return typeof value === "function" ? value.bind(adapter) : value;
    }
});
