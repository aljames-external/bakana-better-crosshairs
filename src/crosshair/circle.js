import { closest } from "../lib/filemanager.js";
import { resolveCrosshairPlacement, runConcurrentScript, shouldStickToToken } from "./util.js";

function resolveCircleAsset(pathOrKey, effectSize) {
    const cleanSize = Math.round(effectSize);
    if (!pathOrKey) {
        return closest(`eskie.crosshair.circle.fantasy_01.white.full.radius_${cleanSize}ft`);
    }
    if (pathOrKey.includes("/") || pathOrKey.includes(".radius_")) {
        return closest(pathOrKey);
    }
    return closest(`${pathOrKey}.radius_${cleanSize}ft`);
}

async function create(token, config = {}) {
    const radius = config.radius ?? config.distance ?? 20;
    const effectSize = Math.round(config.effectSize ?? radius);
    const fileArg = config.file || config.animationFile;

    const {
        id = `Circle Crosshair`,
        showLine = true,
        lineFile = "eskie.crosshair.line.generic_01.white",
        circleFile = resolveCircleAsset(fileArg, effectSize),
        stickToToken = shouldStickToToken(config, false),
        icon = config.icon,
        borderColor = "#ffffff",
        borderAlpha = 0,
        fillColor = "#000000",
        fillAlpha = 0,
        context = null
    } = config;

    config.token = token;
    config.stickToToken = stickToToken;

    let targets;

    async function circleGraphic(crosshair) {
        const seq = new Sequence().wait(50);

        if (token && showLine && !stickToToken) {
            seq.effect()
                .name(id)
                .file(lineFile)
                .attachTo(token)
                .stretchTo(crosshair, { attachTo: true })
                .opacity(0.8)
                .locally()
                .persist();
        }

        const gridDist = canvas?.dimensions?.distance || 5;
        const gridSize = canvas?.dimensions?.size || 100;
        const diameterPixels = ((radius * 2) / gridDist) * gridSize;

        seq.effect()
            .name(id)
            .file(circleFile)
            .attachTo(crosshair)
            .size({ width: diameterPixels, height: diameterPixels })
            .opacity(0.8)
            .belowTokens()
            .locally()
            .persist();

        return seq.play();
    }

    let circle = new Sequence()
        .crosshair("position")
            .type("circle")
            .distance(radius)
            .borderColor(borderColor, { alpha: borderAlpha })
            .fillColor(fillColor, { alpha: fillAlpha });

    if (stickToToken && token) {
        circle.location(token, { lockToEdge: true, lockToEdgeDirection: false });
    }

    if (icon) {
        circle.icon(icon);
    }

    circle
        .callback(Sequencer.Crosshair.CALLBACKS.SHOW, async function(crosshair) {
            await circleGraphic(crosshair);
        })
        .callback(Sequencer.Crosshair.CALLBACKS.PLACED, async (...args) => {
            Sequencer.EffectManager.endEffects({ name: id });
            resolveCrosshairPlacement(args[0], config, ...args);
        })
        .callback(Sequencer.Crosshair.CALLBACKS.CANCEL, () => {
            Sequencer.EffectManager.endEffects({ name: id });
            if (context) context.cancel();
        });

    return [circle, targets];
}

async function play(token, config = {}) {
    let [circle] = await create(token, config);
    return Promise.all([
        runConcurrentScript(token, config, circle),
        circle.play()
    ]);
}

async function stop(token, { id = `Circle Crosshair` } = {}) {
    return Sequencer.EffectManager.endEffects({ name: id, object: token });
}

export const circle = {
    create,
    play,
    stop,
};
