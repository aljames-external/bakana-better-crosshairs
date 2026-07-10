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
     * Extract or refine calling context for the specific system.
     * @param {Document} document
     * @param {Object} baseContext
     * @returns {Object}
     */
    extractCallingContext(document, baseContext = {}) {
        return baseContext;
    }

    /**
     * Evaluate whether a calling context matches a candidate autorec entry.
     * Base implementation compares item name or item id.
     * @param {{item?: Item, itemName?: string, itemId?: string}} context - Normalized calling item context
     * @param {Object} entry - Registered autorec entry
     * @returns {boolean}
     */
    isMatch(context, entry) {
        if (!context || !entry) return false;
        const callingName = (context.itemName ?? context.item?.name ?? "").trim().toLowerCase();
        const callingId = (context.itemId ?? context.item?.id ?? "").trim();
        const entryName = (entry.itemName ?? entry.name ?? "").trim().toLowerCase();
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
