import { adapter } from "../adapter/index.js";
import { cone } from "./cone.js";
import { circle } from "./circle.js";
import { ray } from "./ray.js";
import { square } from "./square.js";
import { CrosshairController, attachCrosshairToToken } from "./crosshairController.js";
import {
    remoteCrosshairManager,
    getPeerCursorPosition,
    getGamemasterCursorPosition,
    diagnoseUserCursor
} from "./remoteCrosshairManager.js";
import {
    attachWheelRotation,
    detachWheelRotation,
    resolveCrosshairPlacement,
    getTokenEdgePoint,
    snapCoordinates,
    shouldStickToToken,
    rotateCrosshairInstance,
    alignCrosshairAndEffects,
    activePlacementTracker
} from "./util.js";

/**
 * Normalizes polymorphic arguments passed to the play entry point into a standard builder, target, and configuration object.
 * @param {string|Token|object} typeOrToken - The crosshair type name ('cone', 'circle', 'ray', 'square') or a target Token instance.
 * @param {Token|object} [tokenOrConfig] - The target Token instance when type is specified first, or configuration options when a Token is passed first.
 * @param {object} [config] - Configuration options for the crosshair effect when a crosshair type is specified first.
 * @returns {{builder: object, target: Token|object, options: object}} The normalized crosshair builder, target token, and configuration object.
 */
function normalizePlayArguments(typeOrToken, tokenOrConfig, config) {
    const isTokenFirst = Boolean(typeOrToken?.document || typeOrToken?.center || typeOrToken?.actor || typeOrToken?.id);
    if (isTokenFirst) {
        return {
            builder: circle,
            target: typeOrToken,
            options: tokenOrConfig ?? {},
        };
    }
    const selectedBuilder = crosshair[typeOrToken];
    const builder = selectedBuilder?.play ? selectedBuilder : crosshair.circle;
    return {
        builder,
        target: tokenOrConfig,
        options: config ?? {},
    };
}

/**
 * Plays a crosshair effect around a token, selecting a specific crosshair geometry builder or defaulting to circle.
 * @param {string|Token|object} typeOrToken - The crosshair type name ('cone', 'circle', 'ray', 'square') or a target Token instance.
 * @param {Token|object} [tokenOrConfig] - The target Token instance when type is specified first, or configuration options when a Token is passed first.
 * @param {object} [config] - Configuration options for the crosshair effect when a crosshair type is specified first.
 * @returns {Promise<object>} A promise resolving to the crosshair play execution result from the selected builder.
 */
async function play(typeOrToken, tokenOrConfig, config) {
    const { builder, target, options } = normalizePlayArguments(typeOrToken, tokenOrConfig, config);
    return builder.play(target, options);
}

export const crosshair = {
    token: {
        cone,
        circle,
        ray,
        square,
        attach: attachCrosshairToToken,
        hide: CrosshairController.hide,
    },
    attachToToken: attachCrosshairToToken,
    hideTokenCrosshair: CrosshairController.hide,
    clear: (options) => remoteCrosshairManager.clear(options),
    clearRemote: (options) => remoteCrosshairManager.clear(options),
    cone,
    circle,
    ray,
    square,
    play,
    remote: remoteCrosshairManager,
    remoteCrosshairManager,
    getPeerCursorPosition,
    getGamemasterCursorPosition,
    diagnoseUserCursor,
    util: {
        attachWheelRotation,
        detachWheelRotation,
        resolveCrosshairPlacement,
        getTokenEdgePoint,
        snapCoordinates,
        shouldStickToToken,
        rotateCrosshairInstance,
        alignCrosshairAndEffects,
        activePlacementTracker
    }
};

adapter.registerCrosshair(crosshair);


