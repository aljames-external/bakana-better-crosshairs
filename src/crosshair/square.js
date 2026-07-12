import { closest } from "../lib/filemanager.js";
import { log } from "../lib/logger.js";
import { crosshairAdapter } from "../adapter/foundry/index.js";
import { resolveCrosshairPlacement, attachWheelRotation, detachWheelRotation, shouldStickToToken, resolveCrosshairIcon, alignCrosshairAndEffects } from "./util.js";

/**
 * Creates and configures a square crosshair sequence.
 *
 * @param {object|null} token - The token or object to associate with the crosshair
 * @param {object} [config={}] - Configuration options for the square crosshair
 * @param {number} [config.distance=30] - The distance/length of the square
 * @param {number} [config.width=30] - The width of the square
 * @param {string} [config.id="Square Crosshair"] - Identifier for the square crosshair effect
 * @param {boolean} [config.showLine=true] - Whether to show the center line
 * @param {string} [config.squareFile] - Explicit file path or key for the square graphic
 * @param {string} [config.lineFile] - Explicit file path or key for the line graphic
 * @param {string} [config.borderColor="#ffffff"] - Border color for the square
 * @param {number} [config.borderAlpha=0] - Border alpha transparency
 * @param {string} [config.fillColor="#000000"] - Fill color for the square
 * @param {number} [config.fillAlpha=0] - Fill alpha transparency
 * @param {string} [config.icon] - Icon to display on the crosshair
 * @param {object|null} [config.context=null] - Context object for placement callbacks
 * @returns {Promise<Array<*>>} A promise resolving to an array containing the configured square sequence and targets
 */
async function create(token, config = {}) {
    const distance = config.distance ?? 30;
    const width = config.width ?? 30;
    const stickToToken = shouldStickToToken(config, false);

    const id = config.id ?? "Square Crosshair";
    const showLine = config.showLine ?? true;
    const file = config.file ? closest(config.file) : undefined;
    const squareFile = config.squareFile ? closest(config.squareFile) : (file ?? closest("eskie.crosshair.square.fantasy_01.white"));
    const lineFile = config.lineFile ? closest(config.lineFile) : closest("eskie.crosshair.line.generic_01.white");
    const borderColor = config.borderColor ?? "#ffffff";
    const borderAlpha = config.borderAlpha ?? 0;
    const fillColor = config.fillColor ?? "#000000";
    const fillAlpha = config.fillAlpha ?? 0;
    const icon = config.icon;
    const context = config.context ?? null;

    config.token = token;
    config.stickToToken = Boolean(stickToToken);
    config.distance = distance;
    config.width = width;

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

        log.debug("squareGraphic | Sizing square graphic:", { distance, width, lengthPixels, widthPixels, factor, gridUnits });

        seq.effect()
            .name(id)
            .file(squareFile)
            .attachTo(crosshair)
            .anchor({ x: 0, y: 0 })
            .size({ width: lengthPixels * factor, height: widthPixels * factor }, { gridUnits: Boolean(gridUnits) })
            .opacity(0.8)
            .belowTokens()
            .locally()
            .persist();

        return seq.play();
    }

    attachWheelRotation(null, config);

    const square = new Sequence()
        .crosshair("position")
            .type("rect")
            .distance(distance)
            .width(width)
            .borderColor(borderColor, { alpha: borderAlpha })
            .fillColor(fillColor, { alpha: fillAlpha });

    if (stickToToken && token) {
        square.location(token, { lockToEdge: true, lockToEdgeDirection: false });
    } else if (config.snapToGrid !== false && config.snapToGrid !== "none") {
        square.snapPosition(globalThis.CONST?.GRID_SNAPPING_MODES?.VERTEX ?? 2);
    }

    if (icon) {
        square.icon(resolveCrosshairIcon(icon));
    }

    square
        .callback(Sequencer.Crosshair.CALLBACKS.SHOW, async function(crosshair) {
            if (crosshair?.pivot?.set) crosshair.pivot.set(0, 0);
            attachWheelRotation(crosshair, config);
            await squareGraphic(crosshair);
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

    return [square, targets];
}

/**
 * Creates and plays a square crosshair sequence.
 *
 * @param {object|null} token - The token or object to associate with the crosshair
 * @param {object} [config={}] - Configuration options for the square crosshair
 * @returns {Promise<*>} A promise resolving when the crosshair sequence finishes playing
 */
async function play(token, config = {}) {
    const [square] = await create(token, config);
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
async function stop(token, options = {}) {
    const id = options?.id ?? "Square Crosshair";
    return Sequencer.EffectManager.endEffects({ name: id, object: token });
}

export const square = {
    create,
    play,
    stop,
};
