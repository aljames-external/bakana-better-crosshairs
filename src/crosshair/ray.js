import { closest } from "../lib/filemanager.js";
import { crosshairAdapter } from "../adapter/foundry/index.js";
import { BaseCrosshairShape } from "./base.js";

/**
 * Ray crosshair shape class encapsulating ray animation, dimensions, and origin midpoint anchor point logic.
 */
export class RayCrosshairShape extends BaseCrosshairShape {
    /**
     * Get the default shape type string for this crosshair.
     * @returns {string} The ray type (`"ray"`)
     */
    get defaultShapeType() {
        return "ray";
    }

    /**
     * Get the default identifier string for this ray sequence effect.
     * @returns {string} Default ray effect identifier (`"Ray Crosshair"`)
     */
    getDefaultId() {
        return "Ray Crosshair";
    }

    /**
     * Get the default normalized animation anchor coordinates (`{ x: 0, y: 0.5 }`).
     * @returns {{x: number, y: number}} Origin midpoint anchor on left side
     */
    get defaultAnimationAnchor() {
        return { x: 0, y: 0.5 };
    }

    /**
     * Get the default normalized Foundry shape anchor coordinates (`{ x: 0, y: 0.5 }`).
     * @returns {{x: number, y: number}} Origin midpoint anchor on left side
     */
    get defaultShapeAnchor() {
        return { x: 0, y: 0.5 };
    }

    /**
     * Configure ray distance and width on the Sequencer crosshair chain.
     * @param {Sequence} crosshairSeq - The Sequencer crosshair builder instance
     * @returns {void}
     */
    configureCrosshairShape(crosshairSeq) {
        const distance = Math.round(this.config.distance ?? 30);
        const width = Math.round(this.config.width ?? 5);
        crosshairSeq.distance(distance).width(width);
    }

    /**
     * Calculate pixel length, width, and scale factor for the ray graphic.
     * @returns {{widthPx: number, heightPx: number, factor: number, gridUnits: boolean}} Calculated pixel and scale dimensions
     */
    getGraphicDimensions() {
        const distance = Math.round(this.config.distance ?? 30);
        const width = Math.round(this.config.width ?? 5);
        const gridDist = canvas?.dimensions?.distance ?? 5;
        const gridSize = canvas?.dimensions?.size ?? 100;
        const lengthPixels = (distance / gridDist) * gridSize;
        const widthPixels = Math.max(gridSize, (width / gridDist) * gridSize);
        const { factor, gridUnits } = crosshairAdapter.getTemplatePixelFactor();
        return { widthPx: lengthPixels, heightPx: widthPixels, factor, gridUnits };
    }

    /**
     * Resolve the ray graphic asset path or Sequencer key.
     * @returns {string} Resolved file path or key
     */
    getGraphicFile() {
        if (this.config.rayFile) return closest(this.config.rayFile);
        if (this.config.file) return closest(this.config.file);
        return closest("eskie.crosshair.ray.straight.thin.white.01");
    }
}

/**
 * Creates and configures a ray crosshair sequence and associated graphics.
 *
 * @param {object} placeable - The preview template/region placeable.
 * @param {object} [config={}] - Configuration options for the ray crosshair
 * @returns {Promise<Array>} A promise resolving to `[Sequence, targets]` array
 */
async function create(placeable, config = {}) {
    const shape = new RayCrosshairShape(placeable, config);
    return shape.create();
}

/**
 * Creates and plays a ray crosshair sequence.
 *
 * @param {object} placeable - The preview template/region placeable.
 * @param {object} [config={}] - Configuration options for the ray crosshair
 * @returns {Promise<any>} A promise resolving to the result of playing the sequence
 */
async function play(placeable, config = {}) {
    const [seq] = await create(placeable, config);
    return seq.play();
}

/**
 * Stops and ends any active ray crosshair visual effects associated with a token.
 *
 * @param {object|null} token - The token object whose ray crosshair effects should be terminated
 * @param {object} [options={}] - Options for stopping the effect
 * @param {string} [options.id="Ray Crosshair"] - The identifier of the effect to end
 * @returns {Promise<void>} A promise resolving when the matching crosshair effects have been terminated
 */
async function stop(token, options = {}) {
    const id = options?.id ?? "Ray Crosshair";
    return BaseCrosshairShape.stop(token, { id, ...options });
}

export const ray = {
    create,
    play,
    stop,
};
