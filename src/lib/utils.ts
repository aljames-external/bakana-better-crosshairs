/**
 * Helper to safely localize a key, falling back to a default string if the key is not found.
 * @param {string} key - The translation key
 * @param {string} [fallback=key] - The fallback string if the key is not found (defaults to key)
 * @returns {string} The localized string or fallback
 */
export function localize(key, fallback = key) {
    if (typeof key !== "string" || !key) return fallback ?? "";
    return game?.i18n?.has(key) ? game.i18n.localize(key) : fallback;
}

/**
 * Generate a normalized lowercase hyphenated slug from an item/spell name.
 * Normalizes Unicode accents (e.g. é -> e, ñ -> n) and strips special characters.
 * @param {string} str - Raw input string name
 * @returns {string} Normalized lowercase hyphenated slug
 */
export function slugify(str) {
    if (typeof str !== "string" || !str) return "";
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/**
 * Version utility for semantic range verification across Foundry VTT releases.
 */
export const version = {
    /**
     * Check whether a semantic version string is clamped between min and max (inclusive).
     * @param {string} current - The current version string to test
     * @param {string} min - Minimum allowed version string
     * @param {string} [max] - Optional maximum allowed version string
     * @returns {boolean} True if current is between min and max inclusive, false otherwise.
     */
    clamp(current, min, max) {
        if (!current || !min) return false;
        const isNewer = foundry?.utils?.isNewerVersion;
        if (!isNewer) return false;

        if (isNewer(min, current)) return false;
        if (max === undefined || max === null) return true;
        return !isNewer(current, max);
    }
};

/**
 * Resolve the current Foundry user's assigned player color or a fallback hex color.
 * Modern Foundry V12+ / V14 contract compliant (Rule 1 & Rule 4).
 * @param {string} [fallback="#000000"] - Fallback hex color if user color is unavailable
 * @returns {string} Hex color string
 */
export function getUserColor(fallback = "#000000") {
    const rawColor = game?.user?.color;
    if (!rawColor) return fallback;
    const str = rawColor?.css ?? rawColor?.toString?.() ?? String(rawColor);
    return (str && str !== "[object Object]") ? str : fallback;
}

export { notify } from "./logger.js";

