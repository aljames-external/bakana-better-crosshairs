import { closest } from "../lib/filemanager.js";
import { crosshairAdapter } from "../adapter/foundry/index.js";
import { BaseCrosshairShape } from "./base.js";

/**
 * Square crosshair shape class encapsulating square/rect animation, dimensions, and top-left/custom anchor point logic.
 */
export class SquareCrosshairShape extends BaseCrosshairShape {
    /**
     * Get the default shape type string for this crosshair.
     * @returns {string} The rect type (`"rect"`)
     */
    get defaultShapeType() {
        return "rect";
    }

    /**
     * Get the default identifier string for this square sequence effect.
     * @returns {string} Default square effect identifier (`"Square Crosshair"`)
     */
    getDefaultId() {
        return "Square Crosshair";
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
     * Configure square distance and width on the Sequencer crosshair chain.
     * @param {Sequence} crosshairSeq - The Sequencer crosshair builder instance
     * @returns {void}
     */
    configureCrosshairShape(crosshairSeq) {
        const distance = Math.round(this.config.distance ?? 20);
        const width = Math.round(this.config.width ?? distance);
        crosshairSeq.distance(distance).width(width);
    }

    /**
     * Calculate pixel length, width, and scale factor for the square graphic.
     * @returns {{widthPx: number, heightPx: number, factor: number, gridUnits: boolean}} Calculated pixel and scale dimensions
     */
    getGraphicDimensions() {
        const distance = Math.round(this.config.distance ?? 20);
        const width = Math.round(this.config.width ?? distance);
        const gridDist = canvas?.dimensions?.distance ?? 5;
        const gridSize = canvas?.dimensions?.size ?? 100;
        const lengthPixels = (distance / gridDist) * gridSize;
        const widthPixels = (width / gridDist) * gridSize;
        const { factor, gridUnits } = crosshairAdapter.getTemplatePixelFactor();
        return { widthPx: lengthPixels, heightPx: widthPixels, factor, gridUnits };
    }

    /**
     * Resolve the square graphic asset path or Sequencer key.
     * @returns {string} Resolved file path or key
     */
    getGraphicFile() {
        if (this.config.squareFile) return closest(this.config.squareFile);
        if (this.config.file) return closest(this.config.file);
        return closest("eskie.crosshair.square.thin.white.full");
    }
}

/**
 * Creates and configures a square crosshair sequence.
 *
 * @param {object|null} token - The token or object to associate with the crosshair
 * @param {object} [config={}] - Configuration options for the square crosshair
 * @returns {Promise<Array<*>>} A promise resolving to an array containing the configured square sequence and targets
 */
async function create(token, config = {}) {
    const shape = new SquareCrosshairShape(token, config);
    return shape.create();
}

/**
 * Creates and plays a square crosshair sequence.
 *
 * @param {object|null} token - The token or object to associate with the crosshair
 * @param {object} [config={}] - Configuration options for the square crosshair
 * @returns {Promise<any>} A promise resolving when the sequence finishes playing
 */
async function play(token, config = {}) {
    const shape = new SquareCrosshairShape(token, config);
    return shape.play();
}

/**
 * Stops and terminates active square crosshair visual effects associated with a token.
 *
 * @param {object|null} token - The target token object
 * @param {object} [options={}] - Options for stopping the effect
 * @param {string} [options.id="Square Crosshair"] - The identifier of the effect to end
 * @returns {Promise<void>} A promise resolving when matching effects have been terminated
 */
async function stop(token, options = {}) {
    const id = options?.id ?? "Square Crosshair";
    return BaseCrosshairShape.stop(token, { id, ...options });
}

export const square = {
    create,
    play,
    stop,
};
