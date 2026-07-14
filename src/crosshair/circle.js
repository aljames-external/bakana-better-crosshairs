import { closest } from "../lib/filemanager.js";
import { crosshairAdapter } from "../adapter/foundry/index.js";
import { BaseCrosshairShape } from "./base.js";

/**
 * Resolves the circle crosshair asset path based on the provided file path or key and the effect size.
 *
 * @param {string} pathOrKey - The asset file path or Sequencer database key.
 * @param {number} effectSize - The target effect size in feet or grid distance.
 * @returns {string} The resolved file path or asset key for the circle crosshair.
 */
export function resolveCircleAsset(pathOrKey, effectSize = 40) {
    if (pathOrKey) return closest(pathOrKey);
    if (effectSize <= 10) return closest("eskie.crosshair.circle.thin.01.2x2");
    if (effectSize <= 20) return closest("eskie.crosshair.circle.thin.01.4x4");
    if (effectSize <= 30) return closest("eskie.crosshair.circle.thin.01.6x6");
    return closest("eskie.crosshair.circle.thin.01.8x8");
}

/**
 * Circle crosshair shape class encapsulating circle animation, dimensions, and center anchor point logic.
 */
export class CircleCrosshairShape extends BaseCrosshairShape {
    /**
     * Get the default shape type string for this crosshair.
     * @returns {string} The circle type (`"circle"`)
     */
    get defaultShapeType() {
        return "circle";
    }

    /**
     * Get the default identifier string for this circle sequence effect.
     * @returns {string} Default circle effect identifier (`"Circle Crosshair"`)
     */
    getDefaultId() {
        return "Circle Crosshair";
    }

    /**
     * Get the default normalized animation anchor coordinates (`{ x: 0.5, y: 0.5 }`).
     * @returns {{x: number, y: number}} Center anchor
     */
    get defaultAnimationAnchor() {
        return { x: 0.5, y: 0.5 };
    }

    /**
     * Get the default normalized Foundry shape anchor coordinates (`{ x: 0.5, y: 0.5 }`).
     * @returns {{x: number, y: number}} Center anchor
     */
    get defaultShapeAnchor() {
        return { x: 0.5, y: 0.5 };
    }

    /**
     * Configure circle distance on the Sequencer crosshair chain.
     * @param {Sequence} crosshairSeq - The Sequencer crosshair builder instance
     * @returns {void}
     */
    configureCrosshairShape(crosshairSeq) {
        const radius = Math.round(this.config.radius ?? 20);
        crosshairSeq.distance(radius);
    }

    /**
     * Calculate pixel diameter and scale factor for the circle graphic.
     * @returns {{widthPx: number, heightPx: number, factor: number, gridUnits: boolean}} Calculated pixel and scale dimensions
     */
    getGraphicDimensions() {
        const radius = Math.round(this.config.radius ?? 20);
        const gridDist = canvas?.dimensions?.distance ?? 5;
        const gridSize = canvas?.dimensions?.size ?? 100;
        const diameterPixels = ((radius * 2) / gridDist) * gridSize;
        const { factor, gridUnits } = crosshairAdapter.getTemplatePixelFactor();
        return { widthPx: diameterPixels, heightPx: diameterPixels, factor, gridUnits };
    }

    /**
     * Resolve the circle graphic asset path or Sequencer key.
     * @returns {string} Resolved file path or key
     */
    getGraphicFile() {
        if (this.config.circleFile) return closest(this.config.circleFile);
        const radius = Math.round(this.config.radius ?? 20);
        const file = this.config.file ? closest(this.config.file) : undefined;
        return resolveCircleAsset(file, radius * 2);
    }
}

/**
 * Creates and configures a circle crosshair Sequence instance along with any associated target data.
 *
 * @param {object|null} token - The token object or document to attach or center the circle crosshair on.
 * @param {object} [config={}] - Configuration options for the circle crosshair.
 * @returns {Promise<Array>} A promise resolving to an array containing the configured circle Sequence and targets.
 */
async function create(token, config = {}) {
    const shape = new CircleCrosshairShape(token, config);
    return shape.create();
}

/**
 * Creates and immediately plays the circle crosshair sequence alongside any concurrent placement scripts.
 *
 * @param {object|null} token - The token object or document associated with the circle crosshair.
 * @param {object} [config={}] - Configuration options for the circle crosshair.
 * @returns {Promise<any>} A promise resolving when the crosshair sequence finishes playing.
 */
async function play(token, config = {}) {
    const shape = new CircleCrosshairShape(token, config);
    return shape.play();
}

/**
 * Stops and terminates active circle crosshair visual effects associated with the specified token and effect ID.
 *
 * @param {object|null} token - The target token associated with the circle crosshair effect.
 * @param {object} [options={}] - Configuration options for stopping the sequence effect.
 * @param {string} [options.id="Circle Crosshair"] - Identifier of the circle crosshair effect to terminate.
 * @returns {Promise<void>} A promise resolving once matching Sequencer effects have ended.
 */
async function stop(token, options = {}) {
    const id = options?.id ?? "Circle Crosshair";
    return BaseCrosshairShape.stop(token, { id, ...options });
}

export const circle = {
    create,
    play,
    stop,
    resolveCircleAsset,
};
