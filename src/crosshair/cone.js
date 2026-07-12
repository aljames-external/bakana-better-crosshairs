import { closest } from "../lib/filemanager.js";
import { log } from "../lib/logger.js";
import { crosshairAdapter } from "../adapter/foundry/index.js";
import { resolveCrosshairPlacement, attachWheelRotation, detachWheelRotation, shouldStickToToken, resolveCrosshairIcon, alignCrosshairAndEffects } from "./util.js";

/**
 * Creates a cone crosshair sequence and configures visual effects and placement callbacks.
 *
 * @param {object|null} token - The token object to center or attach the cone crosshair to
 * @param {object} [config={}] - Configuration options for the cone crosshair
 * @param {number} [config.distance=30] - The distance/length of the cone
 * @param {number} [config.angle=53.13] - The angle of the cone in degrees
 * @param {string} [config.id="Cone Crosshair"] - Identifier for the cone crosshair effect
 * @param {string} [config.coneSize="thin"] - Size style of the cone asset
 * @param {boolean} [config.stickToToken] - Whether the crosshair should stick to the target token
 * @param {string} [config.file] - Explicit file path or key for the cone graphic
 * @param {string} [config.coneFile] - Resolved file path for the cone graphic
 * @param {string} [config.icon] - Icon to display on the crosshair
 * @param {string} [config.borderColor="#ffffff"] - Border color for the cone
 * @param {number} [config.borderAlpha=0] - Border alpha transparency
 * @param {string} [config.fillColor="#000000"] - Fill color for the cone
 * @param {number} [config.fillAlpha=0] - Fill alpha transparency
 * @param {object|null} [config.context=null] - Context object for placement callbacks
 * @returns {Promise<Array>} A promise resolving to an array containing the configured cone sequence and targets [cone, targets]
 */
async function create(token, config = {}) {
    const distance = config.distance ?? 30;
    const angle = config.angle ?? 53.13;
    const stickToToken = shouldStickToToken(config, true);

    const id = config.id ?? "Cone Crosshair";
    const coneSize = config.coneSize ?? "thin";
    const file = config.file ? closest(config.file) : undefined;
    const coneFile = config.coneFile ? closest(config.coneFile) : (file ?? closest(`eskie.crosshair.cone.${coneSize}.fantasy_01.white.full`));
    const icon = config.icon;
    const borderColor = config.borderColor ?? "#ffffff";
    const borderAlpha = config.borderAlpha ?? 0;
    const fillColor = config.fillColor ?? "#000000";
    const fillAlpha = config.fillAlpha ?? 0;
    const context = config.context ?? null;

    config.token = token;
    config.stickToToken = Boolean(stickToToken);
    config.distance = distance;
    config.angle = angle;

    let targets;

    /**
     * Renders and plays the persistent graphic effect for the cone crosshair.
     *
     * @param {object} crosshair - The Sequencer crosshair instance to attach the effect to
     * @returns {Promise<Sequence>} A promise resolving to the played sequence effect
     */
    async function coneGraphic(crosshair) {
        const gridDist = canvas?.dimensions?.distance ?? 5;
        const gridSize = canvas?.dimensions?.size ?? 100;
        const lengthPixels = (distance / gridDist) * gridSize;
        const angleRad = (angle * Math.PI) / 180;
        const widthPixels = 2 * lengthPixels * Math.tan(angleRad / 2);
        const { factor, gridUnits } = crosshairAdapter.getTemplatePixelFactor();

        log.debug("coneGraphic | Sizing cone graphic:", { distance, angle, lengthPixels, widthPixels, factor, gridUnits });

        return new Sequence()
            .wait(50)
            .effect()
            .name(id)
            .file(coneFile)
            .attachTo(crosshair)
            .anchor({ x: 0, y: 0.5 })
            .size({ width: lengthPixels * factor, height: widthPixels * factor }, { gridUnits: Boolean(gridUnits) })
            .opacity(0.8)
            .belowTokens()
            .locally()
            .persist()
            .play();
    }

    attachWheelRotation(null, config);

    let cone = new Sequence()
        .crosshair("position")
            .type("cone")
            .distance(distance)
            .angle(angle)
            .borderColor(borderColor, { alpha: borderAlpha })
            .fillColor(fillColor, { alpha: fillAlpha });

    if (stickToToken && token) {
        cone.location(token, { lockToEdge: true, lockToEdgeDirection: false });
    } else if (config.snapToGrid !== false && config.snapToGrid !== "none") {
        cone.snapPosition(globalThis.CONST?.GRID_SNAPPING_MODES?.VERTEX ?? 2);
    }

    if (icon) {
        cone.icon(resolveCrosshairIcon(icon));
    }

    cone
        .callback(Sequencer.Crosshair.CALLBACKS.SHOW, async function(crosshair) {
            attachWheelRotation(crosshair, config);
            await coneGraphic(crosshair);
            alignCrosshairAndEffects(crosshair, config, (config.currentDirection ?? config.direction ?? 0) * (Math.PI / 180));
        })
        .callback(Sequencer.Crosshair.CALLBACKS.PLACED, async (...args) => {
            Sequencer.EffectManager.endEffects({ name: id });
            resolveCrosshairPlacement(args[0], config, ...args);
        })
        .callback(Sequencer.Crosshair.CALLBACKS.CANCEL, () => {
            detachWheelRotation();
            Sequencer.EffectManager.endEffects({ name: id });
            context?.cancel?.();
        });

    return [cone, targets];
}

/**
 * Creates and plays a cone crosshair sequence along with any concurrent script.
 *
 * @param {object|null} token - The token object to attach or center the cone crosshair to
 * @param {object} [config={}] - Configuration options for the cone crosshair
 * @returns {Promise<*>} A promise resolving to the played Sequencer crosshair sequence result
 */
async function play(token, config = {}) {
    let [cone] = await create(token, config);
    return cone.play();
}

/**
 * Stops and removes active cone crosshair visual effects for a given token and effect identifier.
 *
 * @param {object|null} token - The token object to end effects for, if applicable
 * @param {object} [options={}] - Optional options for stopping the effect
 * @param {string} [options.id="Cone Crosshair"] - The name identifier of the cone effect to stop
 * @returns {Promise<object>} A promise resolving to the result of ending the effects
 */
async function stop(token, options = {}) {
    const id = options.id ?? "Cone Crosshair";
    return Sequencer.EffectManager.endEffects({ name: id, object: token });
}

export const cone = {
    create,
    play,
    stop,
};
