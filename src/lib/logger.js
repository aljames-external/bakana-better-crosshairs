import { MODULE_ID, MODULE_TLA } from "./constants.js";

const VERBOSITY_LEVELS = {
    'error': 1,
    'warn': 2,
    'info': 3,
    'debug': 4
};

let cachedVerbosity = null;

/**
 * Get the current log verbosity level from the game settings.
 * Defaults to 'warn' if the setting is not yet registered or unavailable.
 * @returns {number} The current numeric verbosity level.
 */
function getVerbosityLevel() {
    if (cachedVerbosity !== null) return cachedVerbosity;

    try {
        if (game?.settings) {
            const setting = game.settings.get(MODULE_ID, 'logVerbosity');
            cachedVerbosity = VERBOSITY_LEVELS[setting] ?? VERBOSITY_LEVELS['warn'];
            return cachedVerbosity;
        }
    } catch (e) {
        // Settings not yet registered or game not fully initialized
    }
    return VERBOSITY_LEVELS['warn'];
}

const groupStack = [];

/**
 * Premium logging utility for Bakana's Better Crosshairs.
 * Supports levels: error, warn, info, debug, and console grouping.
 */
export const log = {
    /**
     * Log an error message to the console if the current verbosity level allows.
     * @param {string} message - The error message to log.
     * @param {...*} args - Additional arguments to pass to console.error.
     * @returns {void}
     */
    error(message, ...args) {
        if (getVerbosityLevel() >= VERBOSITY_LEVELS['error']) {
            console.error(`${MODULE_TLA} | ${message}`, ...args);
        }
    },

    /**
     * Log a warning message to the console if the current verbosity level allows.
     * @param {string} message - The warning message to log.
     * @param {...*} args - Additional arguments to pass to console.warn.
     * @returns {void}
     */
    warn(message, ...args) {
        if (getVerbosityLevel() >= VERBOSITY_LEVELS['warn']) {
            console.warn(`${MODULE_TLA} | ${message}`, ...args);
        }
    },

    /**
     * Log a high-level lifecycle or status info message to the console if the current verbosity level allows.
     * @param {string} message - The lifecycle or status message to log.
     * @param {...*} args - Additional arguments to pass to console.log.
     * @returns {void}
     */
    info(message, ...args) {
        if (getVerbosityLevel() >= VERBOSITY_LEVELS['info']) {
            console.log(`${MODULE_TLA} | ${message}`, ...args);
        }
    },

    /**
     * Log a debug trace or diagnostic message to the console if the current verbosity level allows.
     * @param {string} message - The debug message to log.
     * @param {...*} args - Additional arguments to inspect or trace.
     * @returns {void}
     */
    debug(message, ...args) {
        if (getVerbosityLevel() >= VERBOSITY_LEVELS['debug']) {
            const timestamp = game?.time?.serverTime ?? 'Unknown';
            console.log(`%c[${MODULE_TLA} Debug (${timestamp})]`, "color: #38bdf8; font-weight: bold;", message, ...args);
        }
    },

    /**
     * Start a console group if the current verbosity level allows.
     * Optionally accepts a verbosity level string as the first extra argument.
     * @param {string} message - The label for the console group.
     * @param {...*} args - Optional verbosity level ('error'|'warn'|'info'|'debug') and additional arguments for console.group.
     * @returns {void}
     */
    group(message, ...args) {
        let level = 'info';
        let groupArgs = args;
        if (args.length > 0 && VERBOSITY_LEVELS[args[0]] !== undefined) {
            level = args[0];
            groupArgs = args.slice(1);
        }
        if (getVerbosityLevel() >= VERBOSITY_LEVELS[level]) {
            console.group(`${MODULE_TLA} | ${message}`, ...groupArgs);
            groupStack.push(true);
        } else {
            groupStack.push(false);
        }
    },

    /**
     * End the most recently started console group if it was actively logged.
     * @returns {void}
     */
    groupEnd() {
        if (groupStack.pop()) {
            console.groupEnd();
        }
    },

    /**
     * Dynamically update the cached verbosity level.
     * Called by the settings onChange callback.
     * @param {string} level - The new verbosity level key.
     * @returns {void}
     */
    setVerbosity(level) {
        cachedVerbosity = VERBOSITY_LEVELS[level] ?? VERBOSITY_LEVELS['warn'];
    }
};
