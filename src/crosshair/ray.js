import { closest } from "../lib/filemanager.js";
import { log } from "../lib/logger.js";
import { crosshairAdapter } from "../adapter/foundry/index.js";
import { resolveCrosshairPlacement, attachWheelRotation, detachWheelRotation, shouldStickToToken, resolveCrosshairIcon, alignCrosshairAndEffects, getGridSnapMode } from "./util.js";

/**
 * Creates and configures a ray crosshair sequence and associated graphics.
 *
 * @param {object|null} token - The token the ray originates from or adheres to
 * @param {object} [config={}] - Configuration options for the ray crosshair
 * @param {number} [config.distance=30] - The distance/length of the ray
 * @param {number} [config.width=5] - The width of the ray
 * @param {string} [config.id="Ray Crosshair"] - Identifier for the ray crosshair effect
 * @param {boolean} [config.showLine=true] - Whether to show the center line
 * @param {string} [config.rayFile] - Explicit file path or key for the ray graphic
 * @param {string} [config.lineFile] - Explicit file path or key for the line graphic
 * @param {string} [config.borderColor="#ffffff"] - Border color for the ray
 * @param {number} [config.borderAlpha=0] - Border alpha transparency
 * @param {string} [config.fillColor="#000000"] - Fill color for the ray
 * @param {number} [config.fillAlpha=0] - Fill alpha transparency
 * @returns {Promise<Array>} A promise resolving to `[Sequence, targets]` array
 */
async function create(token, config = {}) {
    const distance = Math.round(config.distance ?? 30);
    const width = Math.round(config.width ?? 5);
    const stickToToken = shouldStickToToken(config, "ray");

    const {
        id = `Ray Crosshair`,
        rayFile = closest("eskie.crosshair.ray.fantasy_01.white.full"),
        icon = config.icon,
        borderColor = "#ffffff",
        borderAlpha = 0,
        fillColor = "#000000",
        fillAlpha = 0,
        context = null
    } = config;

    config.token = token;
    config.stickToToken = Boolean(stickToToken);

    let targets;

    /**
     * Helper to render the ray graphic effect inside the Sequencer queue.
     *
     * @param {object} crosshair - The Sequencer crosshair instance to attach the effect to
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
            .size({ width: lengthPixels * factor, height: widthPixels * factor }, { gridUnits: Boolean(gridUnits) })
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
    } else if (config.snapToGrid !== false && config.snapToGrid !== "none") {
        const snapMode = getGridSnapMode(config);
        if (snapMode !== 0) ray.snapPosition(snapMode);
    }

    if (icon) {
        ray.icon(resolveCrosshairIcon(icon));
    }

    ray
        .callback(Sequencer.Crosshair.CALLBACKS.SHOW, async function(crosshair) {
            if (crosshair?.pivot?.set) crosshair.pivot.set(0, 0);
            attachWheelRotation(crosshair, config);
            await rayGraphic(crosshair);
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

    return [ray, targets];
}

/**
 * Creates and plays a ray crosshair sequence.
 *
 * @param {object|null} token - The token the ray originates from or adheres to
 * @param {object} [config={}] - Configuration options for the ray crosshair
 * @returns {Promise<object|boolean>} A promise resolving to the result of playing the sequence
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
 * @returns {Promise<void>} A promise resolving when the matching crosshair effects have been terminated
 */
async function stop(token, options = {}) {
    const id = options?.id ?? `Ray Crosshair`;
    return Sequencer.EffectManager.endEffects({ name: id, object: token });
}

export const ray = {
    create,
    play,
    stop,
};
