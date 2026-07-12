import { closest } from "../lib/filemanager.js";
import { crosshairAdapter } from "../adapter/foundry/index.js";
import { resolveCrosshairPlacement, shouldStickToToken, resolveCrosshairIcon } from "./util.js";

/**
 * Resolves the circle crosshair asset path based on the provided file path or key and the effect size.
 *
 * @param {string} pathOrKey - The asset file path or Sequencer database key.
 * @param {number} effectSize - The target effect size in feet or grid distance.
 * @returns {string} The resolved file path or asset key for the circle crosshair.
 */
function resolveCircleAsset(pathOrKey, effectSize) {
    const cleanSize = Math.round(effectSize);

    /**
     * Checks whether the provided path or key belongs to the Eskie circle fantasy asset collection.
     *
     * @param {string} pathOrKey - The asset file path or Sequencer database key to check.
     * @returns {boolean} True if the asset is an Eskie circle fantasy asset, false otherwise.
     */
    function isEskie(pathOrKey) {
        return pathOrKey.startsWith("eskie.crosshair.circle.fantasy_01");
    }

    if (pathOrKey && !isEskie(pathOrKey)) return closest(pathOrKey);
    if (!pathOrKey) pathOrKey = `eskie.crosshair.circle.fantasy_01.white.full`;

    const radiusIndex = pathOrKey.lastIndexOf(".radius_");
    if (radiusIndex !== -1) {
        pathOrKey = pathOrKey.slice(0, radiusIndex);
    }

    const possibleSizes = [10, 20, 30, 60];
    possibleSizes.sort((a, b) => Math.abs(a - cleanSize) - Math.abs(b - cleanSize));
    const suggestedSize = possibleSizes[0];
    pathOrKey = `eskie.crosshair.circle.fantasy_01.white.full.radius_${suggestedSize}ft`;
    return closest(pathOrKey);
}

/**
 * Creates and configures a circle crosshair Sequence instance along with any associated target data.
 *
 * @param {object|null} token - The token object or document to attach or center the circle crosshair on.
 * @param {object} [config={}] - Configuration options for the circle crosshair.
 * @param {number} [config.radius=20] - The radius of the circle crosshair.
 * @param {string} [config.file] - Explicit file path or Sequencer key for the circle graphic.
 * @param {boolean} [config.stickToToken] - Whether the crosshair should stick to the target token.
 * @param {string} [config.id="Circle Crosshair"] - Identifier for the circle crosshair effect.
 * @param {boolean} [config.showLine=true] - Whether to show a line stretching from the token to the crosshair.
 * @param {string} [config.lineFile="eskie.crosshair.line.generic_01.white"] - File path or key for the line graphic.
 * @param {string} [config.circleFile] - Resolved file path or key for the circle graphic.
 * @param {string} [config.icon] - Icon to display on the crosshair.
 * @param {string} [config.borderColor="#ffffff"] - Border color for the circle.
 * @param {number} [config.borderAlpha=0] - Border alpha transparency.
 * @param {string} [config.fillColor="#000000"] - Fill color for the circle.
 * @param {number} [config.fillAlpha=0] - Fill alpha transparency.
 * @param {object|null} [config.context=null] - Context object for placement callbacks.
 * @returns {Promise<Array>} A promise resolving to an array containing the configured circle Sequence and targets.
 */
async function create(token, config = {}) {
    const radius = Math.round(config.radius ?? 20);
    const file = config.file;
    const stickToToken = shouldStickToToken(config, false);

    const {
        id = `Circle Crosshair`,
        showLine = true,
        lineFile = "eskie.crosshair.line.generic_01.white",
        circleFile = resolveCircleAsset(file, radius),
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

    /**
     * Plays the visual graphic effects for the circle crosshair and optional line from the token.
     *
     * @param {object} crosshair - The placed crosshair object or position coordinates.
     * @returns {Promise<any>} A promise resolving when the graphic sequence finishes playing.
     */
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

    const circle = new Sequence()
        .crosshair("position")
            .type("circle")
            .distance(radius)
            .borderColor(borderColor, { alpha: borderAlpha })
            .fillColor(fillColor, { alpha: fillAlpha });

    if (stickToToken && token) {
        circle.location(token, { lockToEdge: true, lockToEdgeDirection: false });
    }

    if (icon) {
        circle.icon(resolveCrosshairIcon(icon));
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

/**
 * Creates and immediately plays the circle crosshair sequence alongside any concurrent placement scripts.
 *
 * @param {object|null} token - The token object or document associated with the circle crosshair.
 * @param {object} [config={}] - Configuration options for the circle crosshair.
 * @returns {Promise<any>} A promise resolving when the crosshair sequence finishes playing.
 */
async function play(token, config = {}) {
    const [circle] = await create(token, config);
    return circle.play();
}

/**
 * Stops and terminates active circle crosshair visual effects associated with the specified token and effect ID.
 *
 * @param {object|null} token - The token object or document on which to end active effects.
 * @param {object} [options={}] - Options for stopping the crosshair effects.
 * @param {string} [options.id="Circle Crosshair"] - The effect name identifier to terminate.
 * @returns {Promise<any>} A promise resolving when the matching effects have ended.
 */
async function stop(token, { id = `Circle Crosshair` } = {}) {
    return Sequencer.EffectManager.endEffects({ name: id, object: token });
}

export const circle = {
    create,
    play,
    stop,
};
