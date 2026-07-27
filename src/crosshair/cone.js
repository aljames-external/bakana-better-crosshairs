import { closest } from "../lib/filemanager.js";
import { log } from "../lib/logger.js";
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
     * Protected hook to configure cone distance and angle on the Sequencer crosshair chain.
     * @protected
     * @param {Sequence} crosshairSeq - The Sequencer crosshair builder instance
     * @returns {void}
     */
    _configureCrosshairShape(crosshairSeq) {
        const distance = Math.round(this.config.distance ?? 30);
        const angle = this.config.angle ?? 53.13;
        log.debug("ConeCrosshairShape._configureCrosshairShape | Configuring cone distance and angle.", { distance, angle });
        crosshairSeq.distance(distance).angle(angle);
    }

    /**
     * Protected hook to calculate pixel length, width (base spread from angle), and scale factor for the cone graphic.
     * @protected
     * @returns {{widthPx: number, heightPx: number, factor: number, gridUnits: boolean}} Calculated pixel and scale dimensions
     */
    _getGraphicDimensions() {
        const distance = Math.round(this.config.distance ?? 30);
        const angle = this.config.angle ?? 53.13;
        const gridDist = canvas?.dimensions?.distance ?? 5;
        const gridSize = canvas?.dimensions?.size ?? 100;
        const lengthPixels = (distance / gridDist) * gridSize;
        const angleRad = (angle * Math.PI) / 180;
        const widthPixels = 2 * lengthPixels * Math.tan(angleRad / 2);
        const { factor, gridUnits } = crosshairAdapter.getTemplatePixelFactor();
        log.debug("ConeCrosshairShape._getGraphicDimensions | Sizing cone graphic.", { distance, angle, lengthPixels, widthPixels, factor, gridUnits });
        return { widthPx: lengthPixels, heightPx: widthPixels, factor, gridUnits };
    }

    /**
     * Protected hook to resolve the cone graphic asset path or Sequencer key.
     * @protected
     * @returns {string} Resolved file path or key
     */
    _getGraphicFile() {
        const rawFile = String(this.config.file ?? "").trim();
        if (Boolean(rawFile)) {
            return closest(rawFile);
        }
        const coneSize = this.config.coneSize ?? "thin";
        return closest(`eskie.crosshair.cone.${coneSize}.fantasy_01.white.full`);
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
    const opts = config ?? {};
    log.debug("cone.create | Instantiating ConeCrosshairShape.", { config: opts });
    const shape = new ConeCrosshairShape(placeable, opts);
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
    log.debug("cone.play | Executing cone sequence play.");
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
    const targetToken = crosshairAdapter.toToken(token);
    const opts = options ?? {};
    const id = opts.id ?? "Cone Crosshair";
    log.debug("cone.stop | Stopping cone crosshair sequence effect.", { id, token: targetToken?.name });
    return BaseCrosshairShape.stop(targetToken, { id, ...opts });
}

export const cone = {
    create,
    play,
    stop,
};

