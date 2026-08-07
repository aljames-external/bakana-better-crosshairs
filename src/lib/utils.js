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

export { notify } from "./notifier.js";
