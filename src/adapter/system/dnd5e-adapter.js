import { BaseSystemAdapter } from "./base-system-adapter.js";

/**
 * System Adapter for DnD5e.
 * Determines whether an autorec entry should replace the default crosshair based on the calling item AND calling activity.
 */
export class Dnd5eSystemAdapter extends BaseSystemAdapter {
    constructor() {
        super();
        this.systemId = "dnd5e";
        this.supportsActivities = true;
    }

    /**
     * Determine whether an autorec entry should replace the default crosshair in DnD5e.
     * Checks item match AND validates calling activity against entry activity filters.
     * @param {{item?: Item, itemName?: string, itemId?: string, activity?: Object, activityName?: string, activityId?: string}} context
     * @param {Object} entry

     * @returns {boolean}
     */
    shouldReplace(context, entry) {
        if (!super.shouldReplace(context, entry)) return false;

        const entryActivityId = (entry.activityId || "").trim();
        const entryActivityName = (entry.activityName || "").trim().toLowerCase();

        // If the entry specifies no activity filter, it applies to any activity on this item
        if (!entryActivityId && !entryActivityName) return true;

        const callingActivityId = (context?.activityId || context?.activity?.id || context?.activity?._id || "").trim();
        const callingActivityName = (context?.activityName || context?.activity?.name || "").trim().toLowerCase();

        return Boolean(
            (entryActivityId && callingActivityId && entryActivityId === callingActivityId) ||
            (entryActivityName && callingActivityName && entryActivityName === callingActivityName)
        );
    }


}

