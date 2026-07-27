import { closest } from "../lib/filemanager.js";
import { log } from "../lib/logger.js";
import { crosshairAdapter } from "../adapter/foundry/index.js";
import { BaseCrosshairShape } from "./base.js";

/**
 * Resolves the circle crosshair asset path based on the provided file path or key and the effect size.
 *
 * @param {string|null} pathOrKey - The asset file path or Sequencer database key.
 * @param {number} [effectSize=40] - The target effect size in feet or grid distance.
 * @returns {string} The resolved file path or asset key for the circle crosshair.
 */
export function resolveCircleAsset(pathOrKey, size = 10) {
    const key = String(pathOrKey ?? "eskie.crosshair.circle.fantasy_01.white").trim() || "eskie.crosshair.circle.fantasy_01.white";
    if (key.startsWith('eskie.crosshair.circle.fantasy_01')) {
        const [eskie, crosshair, shape, genre, COLOR] = key.split('.');
        const color = COLOR ?? "white";
        if (size <= 10) return closest(`eskie.crosshair.circle.fantasy_01.${color}.no_base.radius_10ft`);
        if (size <= 20) return closest(`eskie.crosshair.circle.fantasy_01.${color}.no_base.radius_20ft`);
        if (size <= 30) return closest(`eskie.crosshair.circle.fantasy_01.${color}.no_base.radius_30ft`);
        return closest(`eskie.crosshair.circle.fantasy_01.${color}.no_base.radius_60ft`);
    }
    return closest(key);
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
     * Protected hook to configure circle distance on the Sequencer crosshair chain.
     * @protected
     * @param {Sequence} crosshairSeq - The Sequencer crosshair builder instance
     * @returns {void}
     */
    _configureCrosshairShape(crosshairSeq) {
        const radius = Math.round(this.config.radius ?? 20);
        log.debug("CircleCrosshairShape._configureCrosshairShape | Configuring circle distance.", { radius });
        crosshairSeq.distance(radius);
    }

    /**
     * Protected hook to calculate pixel diameter and scale factor for the circle graphic.
     * @protected
     * @returns {{widthPx: number, heightPx: number, factor: number, gridUnits: boolean}} Calculated pixel and scale dimensions
     */
    _getGraphicDimensions() {
        const radius = Math.round(this.config.radius ?? 20);
        const gridDist = canvas?.dimensions?.distance ?? 5;
        const gridSize = canvas?.dimensions?.size ?? 100;
        const diameterPixels = ((radius * 2) / gridDist) * gridSize;
        const { factor, gridUnits } = crosshairAdapter.getTemplatePixelFactor();
        log.debug("CircleCrosshairShape._getGraphicDimensions | Sizing circle graphic.", { radius, diameterPixels, factor, gridUnits });
        return { widthPx: diameterPixels, heightPx: diameterPixels, factor, gridUnits };
    }

    /**
     * Protected hook to resolve the circle graphic asset path or Sequencer key.
     * @protected
     * @returns {string} Resolved file path or key
     */
    _getGraphicFile() {
        const rawFile = String(this.config.file ?? "").trim();
        const radius = Math.round(this.config.radius ?? 20);
        return resolveCircleAsset(rawFile, radius);
    }
}

/**
 * Creates and configures a circle crosshair Sequence instance along with any associated target data.
 *
 * @param {object} placeable - The preview template/region placeable.
 * @param {object} [config={}] - Configuration options for the circle crosshair.
 * @returns {Promise<Array>} A promise resolving to an array containing the configured circle Sequence and targets.
 */
async function create(placeable, config = {}) {
    const opts = config ?? {};
    log.debug("circle.create | Instantiating CircleCrosshairShape.", { config: opts });
    const shape = new CircleCrosshairShape(placeable, opts);
    return shape.create();
}

/**
 * Creates and immediately plays the circle crosshair sequence alongside any concurrent placement scripts.
 *
 * @param {object} placeable - The preview template/region placeable.
 * @param {object} [config={}] - Configuration options for the circle crosshair.
 * @returns {Promise<any>} A promise resolving when the crosshair sequence finishes playing.
 */
async function play(placeable, config = {}) {
    log.debug("circle.play | Executing circle sequence play.");
    const [seq] = await create(placeable, config);
    return seq.play();
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
    const targetToken = crosshairAdapter.toToken(token);
    const opts = options ?? {};
    const id = opts.id ?? "Circle Crosshair";
    log.debug("circle.stop | Stopping circle crosshair sequence effect.", { id, token: targetToken?.name });
    return BaseCrosshairShape.stop(targetToken, { id, ...opts });
}

export const circle = {
    create,
    play,
    stop,
    resolveCircleAsset,
};

