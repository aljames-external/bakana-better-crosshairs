import { closest } from "../lib/filemanager.js";
import { log } from "../lib/logger.js";
import { crosshairAdapter } from "../adapter/foundry/index.js";
import { resolveCrosshairPlacement, attachWheelRotation, detachWheelRotation, runConcurrentScript, shouldStickToToken } from "./util.js";

/**
 * Creates and configures a ray crosshair sequence and associated graphics.
 *
 * @param {object|null} token - The token the ray originates from or adheres to
 * @param {object} [config={}] - Configuration options for the ray crosshair
 * @returns {Promise<Array>} A promise resolving to a tuple of [ray, targets]
 */
async function create(token, config = {}) {
    const distance = config.distance ?? 30;
    const width = config.width ?? 5;

    const {
        id = config.id ?? `Ray Crosshair`,
        stickToToken = shouldStickToToken(config, false),
        showLine = config.showLine ?? true,
        rayFile = config.rayFile ?? closest(`eskie.crosshair.ray.fantasy_01.white`),
        lineFile = config.lineFile ?? closest(`eskie.crosshair.line.generic_01.white`),
        borderColor = config.borderColor ?? "#ffffff",
        borderAlpha = config.borderAlpha ?? 0,
        fillColor = config.fillColor ?? "#000000",
        fillAlpha = config.fillAlpha ?? 0,
        icon = config.icon,
        context = null
    } = config;

    config.token = token;
    config.stickToToken = stickToToken;

    let targets;

    /**
     * Creates and plays the visual Sequence effect for the ray graphic attached to the crosshair.
     *
     * @param {object} crosshair - The Sequencer crosshair instance to attach the ray graphic to
     * @returns {Promise<Sequence>} A promise resolving to the played sequence effect
     */
    async function rayGraphic(crosshair) {
        const seq = new Sequence().wait(50);
        const gridDist = canvas?.dimensions?.distance ?? 5;
        const gridSize = canvas?.dimensions?.size ?? 100;
        const lengthPixels = (distance / gridDist) * gridSize;
        const widthPixels = Math.max(gridSize, (width / gridDist) * gridSize);
        const { factor, gridUnits } = crosshairAdapter.getTemplatePixelFactor();

        log.debug(`rayGraphic | Sizing ray graphic:`, { distance, width, lengthPixels, widthPixels, factor, gridUnits });

        seq.effect()
            .name(id)
            .file(rayFile)
            .attachTo(crosshair)
            .anchor({ x: 0, y: 0.5 })
            .size({ width: lengthPixels * factor, height: widthPixels * factor }, { gridUnits })
            .opacity(0.8)
            .belowTokens()
            .locally()
            .persist();

        return seq.play();
    }

    attachWheelRotation(null, config);

    let ray = new Sequence()
        .crosshair("position")
            .type("ray")
            .distance(distance)
            .width(width)
            .borderColor(borderColor, { alpha: borderAlpha })
            .fillColor(fillColor, { alpha: fillAlpha });

    if (stickToToken && token) {
        ray.location(token, { lockToEdge: true, lockToEdgeDirection: false });
    }

    if (icon) {
        ray.icon(icon);
    }

    ray
        .callback(Sequencer.Crosshair.CALLBACKS.SHOW, async function(crosshair) {
            if (crosshair?.pivot?.set) crosshair.pivot.set(0, 0);
            attachWheelRotation(crosshair, config);
            await rayGraphic(crosshair);
        })
        .callback(Sequencer.Crosshair.CALLBACKS.PLACED, async (...args) => {
            Sequencer.EffectManager.endEffects({ name: id });
            resolveCrosshairPlacement(args[0], config, ...args);
        })
        .callback(Sequencer.Crosshair.CALLBACKS.CANCEL, () => {
            detachWheelRotation();
            Sequencer.EffectManager.endEffects({ name: id });
            if (context) context.cancel();
        });

    return [ray, targets];
}

/**
 * Creates and plays a ray crosshair sequence while executing any concurrent scripts.
 *
 * @param {object|null} token - The token the ray originates from or adheres to
 * @param {object} [config={}] - Configuration options for the ray crosshair
 * @returns {Promise<Array>} A promise resolving to an array of [scriptResult, rayPlayResult]
 */
async function play(token, config = {}) {
    let [ray] = await create(token, config);
    return ray.play();
}


/**
 * Stops and ends any active ray crosshair visual effects associated with a token.
 *
 * @param {object|null} token - The token object whose ray crosshair effects should be terminated
 * @param {object} [options={}] - Options for stopping the effect
 * @param {string} [options.id="Ray Crosshair"] - The identifier of the effect to end
 * @returns {Promise} A promise resolving when the matching crosshair effects have been terminated
 */
async function stop(token, { id = `Ray Crosshair` } = {}) {
    return Sequencer.EffectManager.endEffects({ name: id, object: token });
}

export const ray = {
    create,
    play,
    stop,
};
