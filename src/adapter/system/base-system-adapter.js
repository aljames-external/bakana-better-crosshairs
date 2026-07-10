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
     * Determine whether an autorec entry should replace the default crosshair
     * based on the calling item context.
     * @param {{item?: Item, itemName?: string, itemId?: string}} context - The calling item context
     * @param {Object} entry - Registered autorec workflow entry

     * @returns {boolean} Whether to replace with this entry
     */
    shouldReplace(context, entry) {
        if (!context || !entry) return false;

        const callingName = (context.itemName || context.item?.name || "").trim().toLowerCase();
        const callingId = (context.itemId || context.item?.id || "").trim();
        const entryName = (entry.itemName || entry.name || "").trim().toLowerCase();
        const entryId = (entry.itemId || "").trim();

        return Boolean(
            (entryName && callingName && entryName === callingName) ||
            (entryId && callingId && entryId === callingId)
        );
    }

}


