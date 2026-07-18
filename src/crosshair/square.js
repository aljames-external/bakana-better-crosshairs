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
     * Get the default normalized animation anchor coordinates (`{ x: 0, y: 0 }` for grid squares, `{ x: 0, y: 0.5 }` when attached to token).
     * @returns {{x: number, y: number}} Top-left corner anchor or left-middle origin anchor
     */
    get defaultAnimationAnchor() {
        return (this.stickToToken && Boolean(this.token)) ? { x: 0, y: 0.5 } : { x: 0, y: 0 };
    }

    /**
     * Get the default normalized Foundry shape anchor coordinates (`{ x: 0, y: 0 }` for grid squares, `{ x: 0, y: 0.5 }` when attached to token).
     * @returns {{x: number, y: number}} Top-left corner anchor or left-middle origin anchor
     */
    get defaultShapeAnchor() {
        return (this.stickToToken && Boolean(this.token)) ? { x: 0, y: 0.5 } : { x: 0, y: 0 };
    }

    /**
     * Configure square distance and width on the Sequencer crosshair chain.
     * @param {Sequence} crosshairSeq - The Sequencer crosshair builder instance
     * @returns {void}
     */
    configureCrosshairShape(crosshairSeq) {
        const distance = Math.round(this.config.distance);
        const width = Math.round(this.config.width);
        crosshairSeq.distance(distance).width(width);
        log.debug("SquareCrosshairShape | [Square Lifecycle 2/5] Sequencer shape we create:", {
            id: this.id,
            type: this.type,
            distance,
            width,
            animationAnchor: this.animationAnchor,
            shapeAnchor: this.shapeAnchor,
            config: this.config
        });
    }

    /**
     * Calculate pixel length, width, and scale factor for the square graphic.
     * @returns {{widthPx: number, heightPx: number, factor: number, gridUnits: boolean}} Calculated pixel and scale dimensions
     */
    getGraphicDimensions() {
        const rawDistance = Math.round(this.config.distance);
        const rawWidth = Math.round(this.config.width);
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
        return { widthPx: lengthPixels, heightPx: widthPixels, factor, gridUnits };
    }

    /**
     * Resolve the square graphic asset path or Sequencer key.
     * @returns {string} Resolved file path or key
     */
    getGraphicFile() {
        let file = null;
        if (this.config.squareFile) file = closest(this.config.squareFile);
        if (!file && this.config.file) file = closest(this.config.file);
        if (!file) file = closest("eskie.crosshair.square.thin.white.full");
        return file ?? "eskie.crosshair.square.thin.white.full";
    }

    /**
     * Create and configure the square sequence. Converts to an equivalent ray object when attached to a token.
     * @returns {Promise<Array<*>>} Sequence and targets array
     */
    async create() {
        if (this.stickToToken && Boolean(this.token)) {
            log.debug("SquareCrosshairShape.create | Attached square detected. Converting to equivalent ray object.");
            const rayConfig = {
                ...this.config,
                type: "ray",
                t: "ray",
                originalType: "square",
                distance: this.config.distance,
                width: this.config.width,
                rayFile: this.config.squareFile ?? this.config.file ?? closest("eskie.crosshair.ray.fantasy_01.white.full")
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
    const shape = new SquareCrosshairShape(placeable, config);
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
    const id = options?.id ?? "Square Crosshair";
    return BaseCrosshairShape.stop(token, { id, ...options });
}

export const square = {
    create,
    play,
    stop,
};
