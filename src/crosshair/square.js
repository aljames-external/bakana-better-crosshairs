import { closest } from "../lib/filemanager.js";
import { log } from "../lib/logger.js";
import { crosshairAdapter } from "../adapter/foundry/index.js";
import { BaseCrosshairShape } from "./base.js";
import { RayCrosshairShape } from "./ray.js";

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
     * Check if shape is attached to a token for canonical boolean evaluation.
     * @returns {boolean} True if stickToToken is enabled and token exists
     */
    get isAttached() {
        return Boolean(this.stickToToken && this.token);
    }

    /**
     * Get the default normalized animation anchor coordinates (`{ x: 0, y: 0 }` for grid squares, `{ x: 0, y: 0.5 }` when attached to token).
     * @returns {{x: number, y: number}} Top-left corner anchor or left-middle origin anchor
     */
    get defaultAnimationAnchor() {
        return this.isAttached ? { x: 0, y: 0.5 } : { x: 0, y: 0 };
    }

    /**
     * Get the default normalized Foundry shape anchor coordinates (`{ x: 0, y: 0 }` for grid squares, `{ x: 0, y: 0.5 }` when attached to token).
     * @returns {{x: number, y: number}} Top-left corner anchor or left-middle origin anchor
     */
    get defaultShapeAnchor() {
        return this.isAttached ? { x: 0, y: 0.5 } : { x: 0, y: 0 };
    }

    /**
     * Protected hook to configure square distance and width on the Sequencer crosshair chain.
     * @protected
     * @param {Sequence} crosshairSeq - The Sequencer crosshair builder instance
     * @returns {void}
     */
    _configureCrosshairShape(crosshairSeq) {
        const distance = Math.round(this.config.distance ?? 30);
        const width = Math.round(this.config.width ?? 30);
        log.debug("SquareCrosshairShape._configureCrosshairShape | Configuring square distance and width.", { distance, width });
        crosshairSeq.distance(distance).width(width);
    }

    /**
     * Protected hook to calculate pixel length, width, and scale factor for the square graphic.
     * @protected
     * @returns {{widthPx: number, heightPx: number, factor: number, gridUnits: boolean}} Calculated pixel and scale dimensions
     */
    _getGraphicDimensions() {
        const rawDistance = Math.round(this.config.distance ?? 30);
        const rawWidth = Math.round(this.config.width ?? 30);
        let distance = rawDistance;
        if (rawWidth > 0 && rawDistance > rawWidth) {
            const isSquareDiagonal = rawDistance <= rawWidth * 1.6;
            distance = isSquareDiagonal ? rawWidth : Math.round(Math.sqrt(Math.max(0, rawDistance * rawDistance - rawWidth * rawWidth)));
        }
        const width = rawWidth > 0 ? rawWidth : distance;

        const gridDist = canvas?.dimensions?.distance ?? 5;
        const gridSize = canvas?.dimensions?.size ?? 100;
        const lengthPixels = (distance / gridDist) * gridSize;
        const widthPixels = (width / gridDist) * gridSize;
        const { factor, gridUnits } = crosshairAdapter.getTemplatePixelFactor();
        log.debug("SquareCrosshairShape._getGraphicDimensions | Sizing square graphic.", { distance, width, lengthPixels, widthPixels, factor, gridUnits });
        return { widthPx: lengthPixels, heightPx: widthPixels, factor, gridUnits };
    }

    /**
     * Protected hook to resolve the square graphic asset path or Sequencer key.
     * @protected
     * @returns {string} Resolved file path or key
     */
    _getGraphicFile() {
        const rawFile = String(this.config.file ?? "").trim();
        if (Boolean(rawFile)) {
            return closest(rawFile);
        }
        const defaultKey = "eskie.crosshair.square.thin.white.full";
        return closest(defaultKey) ?? defaultKey;
    }

    /**
     * Create and configure the square sequence. Converts to an equivalent ray object when attached to a token.
     * @returns {Promise<Array<*>>} Sequence and targets array
     */
    async create() {
        if (this.isAttached) {
            log.debug("SquareCrosshairShape.create | Attached square detected. Converting to equivalent ray object.");
            const rayConfig = {
                ...this.config,
                type: "ray",
                t: "ray",
                originalType: "square",
                distance: this.config.distance ?? 30,
                width: this.config.width ?? 30,
                rayFile: this.config.squareFile ?? this.config.file ?? "eskie.crosshair.ray.fantasy_01.white.full"
            };
            const rayShape = new RayCrosshairShape(this.placeable, rayConfig);
            return rayShape.create();
        }
        return super.create();
    }
}

/**
 * Creates and configures a square crosshair sequence.
 *
 * @param {object} placeable - The preview template/region placeable.
 * @param {object} [config={}] - Configuration options for the square crosshair
 * @returns {Promise<Array<*>>} A promise resolving to an array containing the configured square sequence and targets
 */
async function create(placeable, config = {}) {
    const opts = config ?? {};
    log.debug("square.create | Instantiating SquareCrosshairShape.", { config: opts });
    const shape = new SquareCrosshairShape(placeable, opts);
    return shape.create();
}

/**
 * Creates and plays a square crosshair sequence.
 *
 * @param {object} placeable - The preview template/region placeable.
 * @param {object} [config={}] - Configuration options for the square crosshair
 * @returns {Promise<any>} A promise resolving when the sequence finishes playing
 */
async function play(placeable, config = {}) {
    log.debug("square.play | Executing square sequence play.");
    const [seq] = await create(placeable, config);
    return seq.play();
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
    const targetToken = crosshairAdapter.toToken(token);
    const opts = options ?? {};
    const id = opts.id ?? "Square Crosshair";
    log.debug("square.stop | Stopping square crosshair sequence effect.", { id, token: targetToken?.name });
    return BaseCrosshairShape.stop(targetToken, { id, ...opts });
}

export const square = {
    create,
    play,
    stop,
};
