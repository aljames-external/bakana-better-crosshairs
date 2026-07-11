import { closest } from "../lib/filemanager.js";
import { crosshairAdapter } from "../adapter/foundry/index.js";
import { resolveCrosshairPlacement, attachWheelRotation, detachWheelRotation, runConcurrentScript, shouldStickToToken, resolveCrosshairIcon } from "./util.js";


/**
 * Creates and configures a square crosshair sequence.
 *
 * @param {object|null} token - The token or object to associate with the crosshair
 * @param {object} [config={}] - Configuration options for the square crosshair
 * @returns {Promise<Array<*>>} A promise resolving to an array containing the configured square sequence and targets
 */
async function create(token, config = {}) {
    const distance = config.distance ?? 30;
    const width = config.width ?? 30;
    const stickToToken = shouldStickToToken(config, false);

    const {
        id = `Square Crosshair`,

        showLine = config.showLine ?? true,
        squareFile = config.squareFile ?? closest(`eskie.crosshair.square.fantasy_01.white`),
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
     * Attaches and plays a persistent square graphic sequence effect on the crosshair.
     *
     * @param {object} crosshair - The crosshair placeable or object to attach the effect to
     * @returns {Promise<*>} A promise resolving when the graphic effect sequence plays
     */
    async function squareGraphic(crosshair) {
        const seq = new Sequence().wait(50);

        const gridDist = canvas?.dimensions?.distance ?? 5;
        const gridSize = canvas?.dimensions?.size ?? 100;
        const lengthPixels = (distance / gridDist) * gridSize;
        const widthPixels = ((width ?? distance) / gridDist) * gridSize;
        const { factor, gridUnits } = crosshairAdapter.getTemplatePixelFactor();

        seq.effect()
            .name(id)
            .file(squareFile)
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

    let square = new Sequence()
        .crosshair("position")
            .type("rect")
            .distance(distance)
            .width(width)
            .borderColor(borderColor, { alpha: borderAlpha })
            .fillColor(fillColor, { alpha: fillAlpha });

    if (stickToToken && token) {
        square.location(token, { lockToEdge: true, lockToEdgeDirection: false });
    }

    if (icon) {
        square.icon(resolveCrosshairIcon(icon));
    }


    square
        .callback(Sequencer.Crosshair.CALLBACKS.SHOW, async function(crosshair) {
            if (crosshair?.pivot?.set) crosshair.pivot.set(0, 0);
            attachWheelRotation(crosshair, config);
            await squareGraphic(crosshair);
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

    return [square, targets];
}

/**
 * Creates and plays a square crosshair along with any concurrent scripts.
 *
 * @param {object|null} token - The token or object to associate with the crosshair
 * @param {object} [config={}] - Configuration options for the square crosshair
 * @returns {Promise<Array<*>>} A promise resolving to the results of the concurrent script and crosshair execution
 */
async function play(token, config = {}) {
    let [square] = await create(token, config);
    return square.play();
}


/**
 * Stops and clears any persistent square crosshair effects associated with the given token.
 *
 * @param {object|null} token - The token or object whose square crosshair effects should be ended
 * @param {object} [options={}] - Options for stopping the crosshair effects
 * @param {string} [options.id="Square Crosshair"] - The name or identifier of the effect to stop
 * @returns {Promise<*>} A promise resolving when the effects have been ended
 */
async function stop(token, { id = `Square Crosshair` } = {}) {
    return Sequencer.EffectManager.endEffects({ name: id, object: token });
}

export const square = {
    create,
    play,
    stop,
};
