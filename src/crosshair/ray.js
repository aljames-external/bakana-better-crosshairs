import { closest } from "../lib/filemanager.js";
import { log } from "../lib/logger.js";
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
     * Protected hook to configure ray distance and width on the Sequencer crosshair chain.
     * @protected
     * @param {Sequence} crosshairSeq - The Sequencer crosshair builder instance
     * @returns {void}
     */
    _configureCrosshairShape(crosshairSeq) {
        const distance = Math.round(this.config.distance ?? 30);
        const width = Math.round(this.config.width ?? 5);
        log.debug("RayCrosshairShape._configureCrosshairShape | Configuring ray distance and width.", { distance, width });
        crosshairSeq.distance(distance).width(width);
    }

    /**
     * Protected hook to calculate pixel length, width, and scale factor for the ray graphic.
     * @protected
     * @returns {{widthPx: number, heightPx: number, factor: number, gridUnits: boolean}} Calculated pixel and scale dimensions
     */
    _getGraphicDimensions() {
        const distance = Math.round(this.config.distance ?? 30);
        const width = Math.round(this.config.width ?? 5);
        const gridDist = canvas?.dimensions?.distance ?? 5;
        const gridSize = canvas?.dimensions?.size ?? 100;
        const lengthPixels = (distance / gridDist) * gridSize;
        const widthPixels = Math.max(gridSize, (width / gridDist) * gridSize);
        const { factor, gridUnits } = crosshairAdapter.getTemplatePixelFactor();
        log.debug("RayCrosshairShape._getGraphicDimensions | Sizing ray graphic.", { distance, width, lengthPixels, widthPixels, factor, gridUnits });
        return { widthPx: lengthPixels, heightPx: widthPixels, factor, gridUnits };
    }

    /**
     * Protected hook to resolve the ray graphic asset path or Sequencer key.
     * @protected
     * @returns {string} Resolved file path or key
     */
    _getGraphicFile() {
        const rawFile = String(this.config.file ?? "").trim();
        if (Boolean(rawFile)) {
            return closest(rawFile);
        }
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
    const opts = config ?? {};
    log.debug("ray.create | Instantiating RayCrosshairShape.", { config: opts });
    const shape = new RayCrosshairShape(placeable, opts);
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
    log.debug("ray.play | Executing ray sequence play.");
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
    const targetToken = crosshairAdapter.toToken(token);
    const opts = options ?? {};
    const id = opts.id ?? "Ray Crosshair";
    log.debug("ray.stop | Stopping ray crosshair sequence effect.", { id, token: targetToken?.name });
    return BaseCrosshairShape.stop(targetToken, { id, ...opts });
}

export const ray = {
    create,
    play,
    stop,
};

