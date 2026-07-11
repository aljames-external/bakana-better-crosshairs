import { closest } from "../lib/filemanager.js";
import { crosshairAdapter } from "../adapter/foundry/index.js";
import { resolveCrosshairPlacement, attachWheelRotation, detachWheelRotation, runConcurrentScript, shouldStickToToken } from "./util.js";

async function create(token, config = {}) {
    const distance = config.distance ?? 30;
    const angle = config.angle ?? 53.13;

    const {
        id = `Cone Crosshair`,
        coneSize = "thin",
        stickToToken = shouldStickToToken(config, true),
        file,
        coneFile = file ?? closest(`eskie.crosshair.cone.${coneSize}.fantasy_01.white.full`),
        icon = config.icon,
        borderColor = "#ffffff",
        borderAlpha = 0,
        fillColor = "#000000",
        fillAlpha = 0,
        context = null
    } = config;

    config.token = token;
    config.stickToToken = stickToToken;
    config.distance = distance;
    config.angle = angle;

    let targets;

    async function coneGraphic(crosshair) { 
        const gridDist = canvas?.dimensions?.distance ?? 5;
        const gridSize = canvas?.dimensions?.size ?? 100;
        const lengthPixels = (distance / gridDist) * gridSize;
        const angleRad = ((angle ?? 53.13) * Math.PI) / 180;
        const widthPixels = 2 * lengthPixels * Math.tan(angleRad / 2);
        const { factor, gridUnits } = crosshairAdapter.getTemplatePixelFactor();

        new Sequence()
            .wait(50)
            .effect()
            .name(id)
            .file(coneFile)
            .attachTo(crosshair)
            .anchor({ x: 0, y: 0.5 })
            .size({ width: lengthPixels * factor, height: widthPixels * factor }, { gridUnits })
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
            .borderColor(borderColor, {alpha: borderAlpha})
            .fillColor(fillColor, {alpha: fillAlpha});

    if (stickToToken && token) {
        cone.location(token, { lockToEdge: true, lockToEdgeDirection: false });
    } else if (config.snapToGrid !== false && config.snapToGrid !== "none") {
        cone.snapPosition(typeof CONST !== "undefined" && CONST.GRID_SNAPPING_MODES ? CONST.GRID_SNAPPING_MODES.VERTEX : 2);
    }

    if (icon) {
        cone.icon(icon);
    }

    cone
        .callback(Sequencer.Crosshair.CALLBACKS.SHOW, async function(crosshair) {
            attachWheelRotation(crosshair, config);
            await coneGraphic(crosshair);
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

    return [cone, targets];
}

async function play(token, config = {}) {
    let [cone] = await create(token, config);
    return Promise.all([
        runConcurrentScript(token, config, cone),
        cone.play()
    ]);
}

async function stop(token, {id = `Cone Crosshair`} = {}) {
    return Sequencer.EffectManager.endEffects({ name: id, object: token });
}

export const cone = {
    create,
    play,
    stop,
};
