import { closest } from "../lib/filemanager.js";
import { crosshairAdapter } from "../adapter/foundry/index.js";
import { resolveCrosshairPlacement, attachWheelRotation, detachWheelRotation, runConcurrentScript, shouldStickToToken } from "./util.js";

function resolveCircleAsset(pathOrKey, effectSize) {
    const cleanSize = Math.round(effectSize);
    function isEskie(pathOrKey) {
        return pathOrKey.startsWith("eskie.crosshair.circle.fantasy_01");
    }

    if (pathOrKey && !isEskie(pathOrKey)) return closest(pathOrKey);
    if (!pathOrKey) pathOrKey = `eskie.crosshair.circle.fantasy_01.white.full`;

    const radiusIndex = pathOrKey.lastIndexOf(".radius_");
    if (radiusIndex !== -1) {
        pathOrKey = pathOrKey.slice(0, radiusIndex);
    }

    let possibleSizes = [10, 20, 30, 60];
    possibleSizes.sort((a, b) => Math.abs(a - cleanSize) - Math.abs(b - cleanSize));
    let suggestedSize = possibleSizes[0];
    pathOrKey = `eskie.crosshair.circle.fantasy_01.white.full.radius_${suggestedSize}ft`;
    return closest(pathOrKey);
}

async function create(token, config = {}) {
    const radius = Math.round(config.radius ?? 20);
    const file = config.file ?? config.circleFile;

    const {
        id = `Circle Crosshair`,
        showLine = true,
        lineFile = "eskie.crosshair.line.generic_01.white",
        circleFile = resolveCircleAsset(file, radius),
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

        const gridDist = canvas?.dimensions?.distance ?? 5;
        const gridSize = canvas?.dimensions?.size ?? 100;
        const diameterPixels = ((radius * 2) / gridDist) * gridSize;
        const { factor, gridUnits } = crosshairAdapter.getTemplatePixelFactor();

        seq.effect()
            .name(id)
            .file(circleFile)
            .attachTo(crosshair)
            .size({ width: diameterPixels * factor, height: diameterPixels * factor }, { gridUnits })
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
