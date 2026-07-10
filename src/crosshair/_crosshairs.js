import { cone } from "./cone.js";
import { circle } from "./circle.js";
import { ray } from "./ray.js";
import { Token } from "../lib/compat.js";

async function play(typeOrToken, tokenOrConfig, config) {
    if (typeOrToken instanceof Token || (typeof typeOrToken === "object" && typeOrToken !== null && typeof typeOrToken !== "string")) {
        // Called as play(token, config) -> default to circle
        return circle.play(typeOrToken, tokenOrConfig || {});
    }
    const builder = crosshair[typeOrToken] || crosshair.circle;
    return builder.play(tokenOrConfig, config || {});
}

export const crosshair = {
    token: {
        cone,
        circle,
        ray,
    },
    cone,
    circle,
    ray,
    play,
};
