import { log } from "../../lib/logger.js";

/**
 * Base System Adapter for system-agnostic decision on whether to replace the default crosshair.
 * Makes no assumptions about placeable document types (template vs region).
 */
export class BaseSystemAdapter {
    constructor() {
        this.systemId = "base";
        this.supportsActivities = false;
    }

    /**
     * Extract or refine calling context for the specific game system.
     * Base implementation returns the standard calling context passed by upstream workflow.
     * @param {Document} document - Template or Region document placed on canvas
     * @param {Object} [baseContext={}] - Initial calling context (`{ item, itemName, itemId, activity, activityName, activityId }`)
     * @returns {{item?: Item|null, itemName?: string, itemId?: string, activity?: Object|null, activityName?: string, activityId?: string}}
     */
    extractCallingContext(document, baseContext = {}) {
        return baseContext;
    }

    /**
     * Evaluate whether a calling context matches a candidate autorec entry.
     * Compares exact canonical item name (`itemName`) or item id (`itemId`).
     * @param {{item?: Item, itemName?: string, itemId?: string}} context - Normalized calling item context
     * @param {Object} entry - Registered autorec entry configuration (`{ itemName, itemId }`)
     * @returns {boolean} True if the calling context matches candidate entry item rules
     */
    isMatch(context, entry) {
        if (!context || !entry) return false;
        if (entry.isDefault) return true;

        const callingName = (context.itemName ?? "").trim().toLowerCase();
        const callingId = (context.itemId ?? "").trim();
        const entryName = (entry.itemName ?? "").trim().toLowerCase();
        const entryId = (entry.itemId ?? "").trim();

        const match = Boolean(
            (entryName && callingName && entryName === callingName) ||
            (entryId && callingId && entryId === callingId)
        );

        if (!match) {
            log.debug(`BaseSystemAdapter.isMatch | Item match FAILED: calling ("${callingName}" / "${callingId}") vs entry ("${entryName}" / "${entryId}")`);
        }
        return match;
    }

}
