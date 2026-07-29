import { cone, ConeCrosshairShape } from "./cone.js";
import { circle, CircleCrosshairShape } from "./circle.js";
import { ray, RayCrosshairShape } from "./ray.js";
import { square, SquareCrosshairShape } from "./square.js";
import { BaseCrosshairShape } from "./base.js";
import { CrosshairController, attachCrosshairToToken } from "./crosshairController.js";
import { Token } from "../lib/compat.js";

/**
 * Normalizes polymorphic arguments passed to the play entry point into a standard builder, target, and configuration object.
 * @param {string|Token|object} typeOrToken - The crosshair type name ('cone', 'circle', 'ray', 'square') or a target Token instance.
 * @param {Token|object} [tokenOrConfig] - The target Token instance when type is specified first, or configuration options when a Token is passed first.
 * @param {object} [config] - Configuration options for the crosshair effect when a crosshair type is specified first.
 * @returns {{builder: object, target: Token|object, options: object}} The normalized crosshair builder, target token, and configuration object.
 */
function normalizePlayArguments(typeOrToken, tokenOrConfig, config) {
    const isTokenFirst = typeOrToken instanceof Token || (typeof typeOrToken === "object" && typeOrToken !== null);
    if (isTokenFirst) {
        return {
            builder: circle,
            target: typeOrToken,
            options: tokenOrConfig ?? {},
        };
    }
    const selectedBuilder = crosshair[typeOrToken];
    const builder = (selectedBuilder && typeof selectedBuilder.play === "function") ? selectedBuilder : crosshair.circle;
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
    cone,
    circle,
    ray,
    square,
    play,
};

export {
    CrosshairController,
    attachCrosshairToToken,
    BaseCrosshairShape,
    CircleCrosshairShape,
    ConeCrosshairShape,
    RayCrosshairShape,
    SquareCrosshairShape,
};


