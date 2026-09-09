/**
 * The canonical identifier string for the module.
 * @type {string}
 */
export const MODULE_ID = 'bakana-better-crosshairs';

/**
 * The human-readable display name of the module.
 * @type {string}
 */
export const MODULE_NAME = "Bakana's Better Crosshairs";

/**
 * The three-letter abbreviation (TLA) used for logging or prefixing.
 * @type {string}
 */
export const MODULE_TLA = 'BBC';

/**
 * Cadence interval in milliseconds (5 times per second = 200ms) for broadcasting live crosshair state to peer clients.
 * @type {number}
 */
export const BROADCAST_INTERVAL_MS = 200;

/**
 * Heartbeat cadence in milliseconds (5 seconds) for periodic signals when crosshair is stationary.
 * @type {number}
 */
export const BROADCAST_HEARTBEAT_INTERVAL_MS = 5000;

/**
 * Timeout duration in milliseconds (10 seconds) after which an inactive remote crosshair self-removes.
 * @type {number}
 */
export const REMOTE_CROSSHAIR_TIMEOUT_MS = 10000;

