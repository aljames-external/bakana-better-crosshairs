/**
 * Helper to safely localize a key, falling back to a default string if the key is not found.
 * @param {string} key The translation key
 * @param {string} [fallback] The fallback string if the key is not found (defaults to key)
 * @returns {string} The localized string or fallback
 */
export function localize(key, fallback = key) {
    return game.i18n?.has(key) ? game.i18n.localize(key) : fallback;
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
        const isNewer = foundry.utils.isNewerVersion;

        if (isNewer(min, current)) return false;
        if (max === undefined) return true;
        return !isNewer(current, max);
    }
};
