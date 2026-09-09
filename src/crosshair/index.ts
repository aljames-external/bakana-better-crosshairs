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
 * Plays a crosshair effect around a token, selecting a specific crosshair geometry builder or defaulting to circle.
 * @param {string|Token|object} shape - The crosshair type name ('cone', 'circle', 'ray', 'square') or a target Token instance.
 * @param {Token|object} [token=null] - The target Token instance or configuration options when token is omitted.
 * @param {object} [config={}] - Configuration options for the crosshair effect.
 * @returns {Promise<object>} A promise resolving to the crosshair play execution result from the selected builder.
 */
async function play(shape: any, token: any = null, config: any = {}) {
    const isTokenFirst = Boolean(shape?.document || shape?.center || shape?.actor || shape?.id);
    if (isTokenFirst) {
        return crosshair.circle.play(shape, token ?? {});
    }
    const builder = (crosshair as any)[shape] ?? crosshair.circle;
    return builder.play(token, config);
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


