import { BaseCanvasAdapter } from "./base-canvas-adapter.js";
import { CanvasV13Adapter } from "./canvas-v13-adapter.js";
import { CanvasV14Adapter } from "./canvas-v14-adapter.js";
import { version } from "../../lib/utils.js";
import { MODULE_NAME } from "../../lib/constants.js";
import { log } from "../../lib/logger.js";

export { BaseCanvasAdapter, CanvasV13Adapter, CanvasV14Adapter };

/**
 * Active canvas adapter instance, defaulting to base adapter before initialization.
 * @type {BaseCanvasAdapter|CanvasV13Adapter|CanvasV14Adapter}
 */
export let canvasAdapter = new BaseCanvasAdapter();

/**
 * Initialize the active Foundry VTT canvas adapter (v13 or v14).
 * Evaluates supported generation boundaries using boolean version.clamp.
 * @returns {BaseCanvasAdapter|CanvasV13Adapter|CanvasV14Adapter} The initialized canvas adapter instance.
 */
export function initializeCanvasAdapter() {
    const generation = game?.release?.generation;
    if (generation !== undefined && generation >= 14) {
        canvasAdapter = new CanvasV14Adapter();
    } else if (generation === 13) {
        canvasAdapter = new CanvasV13Adapter();
    } else {
        const ver = game?.version ?? "14";
        if (version.clamp(ver, "14")) {
            canvasAdapter = new CanvasV14Adapter();
        } else if (version.clamp(ver, "13", "14")) {
            canvasAdapter = new CanvasV13Adapter();
        } else {
            canvasAdapter = new BaseCanvasAdapter();
        }
    }

    log.info(`Initialized Canvas Adapter for Foundry VTT generation: v${canvasAdapter.version ?? "base"}`);
    return canvasAdapter;
}

(BaseCanvasAdapter.prototype as any).initialize = initializeCanvasAdapter;

