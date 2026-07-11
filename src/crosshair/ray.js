import { closest } from "../lib/filemanager.js";
import { log } from "../lib/logger.js";
import { crosshairAdapter } from "../adapter/foundry/index.js";
import { resolveCrosshairPlacement, attachWheelRotation, detachWheelRotation, runConcurrentScript, shouldStickToToken } from "./util.js";

async function create(token, config = {}) {
    const distance = config.distance ?? config.length ?? config.radius ?? 30;
    const width = config.width ?? 5;

    const {
        id = `Ray Crosshair`,
        stickToToken = shouldStickToToken(config, false),
        showLine = config.showLine ?? true,
        rayFile = config.rayFile ?? closest(`eskie.crosshair.ray.fantasy_01.white`),
        lineFile = config.lineFile ?? closest(`eskie.crosshair.line.fantasy_01.white`),
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

async function play(token, config = {}) {
    let [ray] = await create(token, config);
    return Promise.all([
        runConcurrentScript(token, config, ray),
        ray.play()
    ]);
}

async function stop(token, { id = `Ray Crosshair` } = {}) {
    return Sequencer.EffectManager.endEffects({ name: id, object: token });
}

export const ray = {
    create,
    play,
    stop,
};
