import { closest } from "../lib/filemanager.js";

/**
 * Resolves the circle crosshair asset path based on the provided file path or key and the effect size.
 *
 * @param {string|null} pathOrKey - The asset file path or Sequencer database key.
 * @param {number} [size=10] - The target effect size in feet or grid distance.
 * @returns {string} The resolved file path or asset key for the circle crosshair.
 */
export function resolveCircleAsset(pathOrKey, size = 10) {
    const key = String(pathOrKey ?? "eskie.crosshair.circle.fantasy_01.white").trim() || "eskie.crosshair.circle.fantasy_01.white";
    if (key.startsWith("eskie.crosshair.circle.fantasy_01")) {
        const [eskie, crosshair, shape, genre, COLOR] = key.split(".");
        const color = COLOR ?? "white";
        if (size <= 10) return closest(`eskie.crosshair.circle.fantasy_01.${color}.no_base.radius_10ft`);
        if (size <= 20) return closest(`eskie.crosshair.circle.fantasy_01.${color}.no_base.radius_20ft`);
        if (size <= 30) return closest(`eskie.crosshair.circle.fantasy_01.${color}.no_base.radius_30ft`);
        return closest(`eskie.crosshair.circle.fantasy_01.${color}.no_base.radius_60ft`);
    }
    return closest(key);
}

/**
 * Resolves the rectangle crosshair asset path based on the provided file path or key and effect dimensions.
 *
 * @param {string|null} pathOrKey - The asset file path or Sequencer database key.
 * @param {number} [distance=30] - The target distance/length in feet or grid distance.
 * @param {number} [width=30] - The target width in feet or grid distance.
 * @returns {string} The resolved file path or asset key for the rectangle crosshair.
 */
export function resolveRectangleAsset(pathOrKey, distance = 30, width = 30) {
    const key = String(pathOrKey ?? "eskie.crosshair.rectangle.fantasy_01.white").trim() || "eskie.crosshair.rectangle.fantasy_01.white";
    if (key.startsWith("eskie.crosshair.rectangle.fantasy_01") || key.startsWith("eskie.crosshair.square.fantasy_01")) {
        const [eskie, crosshair, shape, genre, COLOR] = key.split(".");
        const color = COLOR ?? "white";

        const dist = Math.round(Number(distance) || 30);
        const w = Math.round(Number(width) || dist);
        const maxDim = Math.max(dist, w);
        const minDim = Math.max(1, Math.min(dist, w));
        const ratio = maxDim / minDim;

        // If aspect ratio is close to 1:1 (< 1.5), choose from square animations: 05x05ft, 10x10ft, 20x20ft
        if (ratio < 1.5) {
            if (maxDim <= 5) return closest(`eskie.crosshair.rectangle.fantasy_01.${color}.no_base.05x05ft`);
            if (maxDim <= 10) return closest(`eskie.crosshair.rectangle.fantasy_01.${color}.no_base.10x10ft`);
            return closest(`eskie.crosshair.rectangle.fantasy_01.${color}.no_base.20x20ft`);
        }

        // If aspect ratio is rectangular (>= 1.5, closer to 2:1), choose from 2:1 animations: 10x05ft, 20x10ft, 40x20ft
        if (maxDim <= 10) return closest(`eskie.crosshair.rectangle.fantasy_01.${color}.no_base.10x05ft`);
        if (maxDim <= 20) return closest(`eskie.crosshair.rectangle.fantasy_01.${color}.no_base.20x10ft`);
        return closest(`eskie.crosshair.rectangle.fantasy_01.${color}.no_base.40x20ft`);
    }
    return closest(key);
}
