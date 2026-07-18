import { closest } from "../lib/filemanager.js";
import { crosshairAdapter } from "../adapter/foundry/index.js";
import { BaseCrosshairShape } from "./base.js";

/**
 * Cone crosshair shape class encapsulating cone animation, dimensions, and tip anchor point logic.
 */
export class ConeCrosshairShape extends BaseCrosshairShape {
    /**
     * Get the default shape type string for this crosshair.
     * @returns {string} The cone type (`"cone"`)
     */
    get defaultShapeType() {
        return "cone";
    }

    /**
     * Get the default identifier string for this cone sequence effect.
     * @returns {string} Default cone effect identifier (`"Cone Crosshair"`)
     */
    getDefaultId() {
        return "Cone Crosshair";
    }

    /**
     * Get the default normalized animation anchor coordinates (`{ x: 0, y: 0.5 }`).
     * @returns {{x: number, y: number}} Tip anchor on left-middle
     */
    get defaultAnimationAnchor() {
        return { x: 0, y: 0.5 };
    }

    /**
     * Get the default normalized Foundry shape anchor coordinates (`{ x: 0, y: 0.5 }`).
     * @returns {{x: number, y: number}} Tip anchor on left-middle
     */
    get defaultShapeAnchor() {
        return { x: 0, y: 0.5 };
    }

    /**
     * Configure cone distance and angle on the Sequencer crosshair chain.
     * @param {Sequence} crosshairSeq - The Sequencer crosshair builder instance
     * @returns {void}
     */
    configureCrosshairShape(crosshairSeq) {
        const distance = Math.round(this.config.distance);
        const angle = this.config.angle;
        crosshairSeq.distance(distance).angle(angle);
    }

    /**
     * Calculate pixel length, width (base spread from angle), and scale factor for the cone graphic.
     * @returns {{widthPx: number, heightPx: number, factor: number, gridUnits: boolean}} Calculated pixel and scale dimensions
     */
    getGraphicDimensions() {
        const distance = Math.round(this.config.distance);
        const angle = this.config.angle;
        const gridDist = canvas?.dimensions?.distance ?? 5;
        const gridSize = canvas?.dimensions?.size ?? 100;
        const lengthPixels = (distance / gridDist) * gridSize;
        const angleRad = (angle * Math.PI) / 180;
        const widthPixels = 2 * lengthPixels * Math.tan(angleRad / 2);
        const { factor, gridUnits } = crosshairAdapter.getTemplatePixelFactor();
        return { widthPx: lengthPixels, heightPx: widthPixels, factor, gridUnits };
    }

    /**
     * Resolve the cone graphic asset path or Sequencer key.
     * @returns {string} Resolved file path or key
     */
    getGraphicFile() {
        if (this.config.coneFile) return closest(this.config.coneFile);
        const coneSize = this.config.coneSize ?? "thin";
        const file = this.config.file ? closest(this.config.file) : undefined;
        return file ?? closest(`eskie.crosshair.cone.${coneSize}.fantasy_01.white.full`);
    }
}

/**
 * Creates a cone crosshair sequence and configures visual effects and placement callbacks.
 *
 * @param {object} placeable - The preview template/region placeable.
 * @param {object} [config={}] - Configuration options for the cone crosshair
 * @returns {Promise<Array>} A promise resolving to an array containing the configured cone sequence and targets [cone, targets]
 */
async function create(placeable, config = {}) {
    const shape = new ConeCrosshairShape(placeable, config);
    return shape.create();
}

/**
 * Creates and immediately plays a cone crosshair sequence.
 *
 * @param {object} placeable - The preview template/region placeable.
 * @param {object} [config={}] - Configuration options for the cone crosshair
 * @returns {Promise<any>} A promise resolving when the crosshair sequence finishes playing
 */
async function play(placeable, config = {}) {
    const [seq] = await create(placeable, config);
    return seq.play();
}

/**
 * Stops and ends any active cone crosshair visual effects associated with a token.
 *
 * @param {object|null} token - The token object whose cone crosshair effects should be terminated
 * @param {object} [options={}] - Options for stopping the effect
 * @param {string} [options.id="Cone Crosshair"] - The identifier of the effect to end
 * @returns {Promise<void>} A promise resolving when the matching crosshair effects have been terminated
 */
async function stop(token, options = {}) {
    const id = options?.id ?? "Cone Crosshair";
    return BaseCrosshairShape.stop(token, { id, ...options });
}

export const cone = {
    create,
    play,
    stop,
};
