import { cone } from "./cone.js";
import { circle } from "./circle.js";
import { ray } from "./ray.js";
import { square } from "./square.js";
import { Token } from "../lib/compat.js";

/**
 * Plays a crosshair effect around a token, selecting a specific crosshair geometry builder or defaulting to circle.
 * @param {string|Token|object} typeOrToken - The crosshair type name ('cone', 'circle', 'ray', 'square') or a target Token instance.
 * @param {Token|object} [tokenOrConfig] - The target Token instance when type is specified first, or configuration options when a Token is passed first.
 * @param {object} [config] - Configuration options for the crosshair effect when a crosshair type is specified first.
 * @returns {Promise<object>} A promise resolving to the crosshair play execution result from the selected builder.
 */
async function play(typeOrToken, tokenOrConfig, config) {
    if (typeOrToken instanceof Token || (typeof typeOrToken === "object" && typeOrToken !== null && typeof typeOrToken !== "string")) {
        // Called as play(token, config) -> default to circle
        return circle.play(typeOrToken, tokenOrConfig ?? {});
    }
    const builder = crosshair[typeOrToken] ?? crosshair.circle;
    return builder.play(tokenOrConfig, config ?? {});
}

export const crosshair = {
    token: {
        cone,
        circle,
        ray,
        square,
    },
    cone,
    circle,
    ray,
    square,
    play,
};
