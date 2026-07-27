/**
 * Consolidated UI notification batcher/coalescer (`src/lib/notifier.js`).
 * Groups multiple UI notifications (`info`, `warn`, `error`) occurring within an execution window
 * into a single unified notification display per severity level to prevent toast clutter.
 */

const BATCH_WINDOW_MS = 50;

const queues = {
    info: [],
    warn: [],
    error: []
};

let flushTimeout = null;

/**
 * Schedule a debounced flush of all queued notifications.
 * @private
 * @returns {void}
 */
function _scheduleFlush() {
    if (flushTimeout !== null) return;
    flushTimeout = setTimeout(() => {
        flushTimeout = null;
        _flushQueues();
    }, BATCH_WINDOW_MS);
}

/**
 * Flush and display grouped notifications for each severity level (`info`, `warn`, `error`).
 * @private
 * @returns {void}
 */
function _flushQueues() {
    if (typeof ui === "undefined" || !ui?.notifications) {
        queues.info.length = 0;
        queues.warn.length = 0;
        queues.error.length = 0;
        return;
    }

    for (const level of ["info", "warn", "error"]) {
        const queue = queues[level];
        if (queue.length === 0) continue;

        const messages = [...queue];
        queue.length = 0;

        if (messages.length === 1) {
            ui.notifications[level](messages[0]);
        } else {
            const header = level === "error"
                ? `Bakana's Better Crosshairs — Errors (${messages.length}):`
                : level === "warn"
                ? `Bakana's Better Crosshairs — Warnings (${messages.length}):`
                : `Bakana's Better Crosshairs (${messages.length}):`;

            const groupedMessage = `${header}\n` + messages.map(m => `• ${m}`).join("\n");
            ui.notifications[level](groupedMessage);
        }
    }
}

/**
 * Common internal helper to enqueue a message for debounced notification dispatch.
 * @param {'info'|'warn'|'error'} level - Notification severity level
 * @param {string} message - Notification message text
 * @private
 * @returns {void}
 */
function _enqueue(level, message) {
    const trimmed = String(message ?? "").trim();
    if (!trimmed) return;
    const queue = queues[level];
    if (queue && !queue.includes(trimmed)) {
        queue.push(trimmed);
        _scheduleFlush();
    }
}

/**
 * Queue an informational UI notification.
 * Multiple info calls within 50ms are grouped into a single notification display.
 * @param {string} message - Notification message text
 * @returns {void}
 */
export function notifyInfo(message) {
    _enqueue("info", message);
}

/**
 * Queue a warning UI notification.
 * Multiple warn calls within 50ms are grouped into a single notification display.
 * @param {string} message - Warning message text
 * @returns {void}
 */
export function notifyWarn(message) {
    _enqueue("warn", message);
}

/**
 * Queue an error UI notification.
 * Multiple error calls within 50ms are grouped into a single notification display.
 * @param {string} message - Error message text
 * @returns {void}
 */
export function notifyError(message) {
    _enqueue("error", message);
}

/**
 * Namespace export for grouped notifications (`notify.info`, `notify.warn`, `notify.error`).
 */
export const notify = {
    info: notifyInfo,
    warn: notifyWarn,
    error: notifyError
};
