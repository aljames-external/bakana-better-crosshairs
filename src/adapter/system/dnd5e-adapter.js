import { BaseSystemAdapter } from "./base-system-adapter.js";
import { log } from "../../lib/logger.js";

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

    extractCallingContext(document, baseContext = {}) {
        let itemObj = baseContext.item || null;
        let activityObj = baseContext.activity || null;

        if (!itemObj && document?.flags?.dnd5e?.origin && typeof fromUuidSync === "function") {
            try { itemObj = fromUuidSync(document.flags.dnd5e.origin); } catch (e) {}
        }
        if (!itemObj && document?.flags?.dnd5e?.item && typeof fromUuidSync === "function") {
            try { itemObj = typeof document.flags.dnd5e.item === "string" ? fromUuidSync(document.flags.dnd5e.item) : document.flags.dnd5e.item; } catch (e) {}
        }

        if (itemObj && (itemObj.item || (itemObj.parent && itemObj.parent.documentName === "Item"))) {
            activityObj = activityObj || itemObj;
            itemObj = itemObj.item || itemObj.parent;
        }

        const actIdentifier = document?.flags?.dnd5e?.activity || document?.flags?.dnd5e?.activityUuid || document?.flags?.dnd5e?.activityId;
        if (!activityObj && actIdentifier) {
            if (typeof fromUuidSync === "function" && typeof actIdentifier === "string" && actIdentifier.includes(".")) {
                try { activityObj = fromUuidSync(actIdentifier); } catch (e) {}
            }
            if (!activityObj && itemObj?.system?.activities) {
                activityObj = itemObj.system.activities.get?.(actIdentifier)
                    || (typeof itemObj.system.activities.find === "function" ? itemObj.system.activities.find(a => a.id === actIdentifier || a._id === actIdentifier || a.uuid === actIdentifier || a.name === actIdentifier) : null);
            }
        }

        const result = {
            item: itemObj,
            itemName: itemObj?.name || baseContext.itemName || "",
            itemId: itemObj?.id || baseContext.itemId || "",
            activity: activityObj,
            activityName: activityObj?.name || baseContext.activityName || "",
            activityId: activityObj?.id || activityObj?._id || baseContext.activityId || ""
        };

        log.info("Dnd5eSystemAdapter.extractCallingContext | Resolved DnD5e context:", {
            itemName: result.itemName,
            itemId: result.itemId,
            activityName: result.activityName,
            activityId: result.activityId,
            dnd5eFlags: document?.flags?.dnd5e
        });

        return result;
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

        const entryFilterExact = (entry.activityId || "").trim();
        const entryFilterLower = (entry.activityId || entry.activityName || "").trim().toLowerCase();

        // If the entry specifies no activity filter, it applies to any activity on this item
        if (!entryFilterLower) {
            log.info(`Dnd5eSystemAdapter.shouldReplace | Entry "${entry.itemName}" specifies no activity filter -> MATCHED`);
            return true;
        }

        const callingActivityId = (context?.activityId || context?.activity?.id || context?.activity?._id || "").trim();
        const callingActivityName = (context?.activityName || context?.activity?.name || "").trim().toLowerCase();

        const match = Boolean(
            (entryFilterExact && callingActivityId && entryFilterExact === callingActivityId) ||
            (entryFilterLower && callingActivityName && entryFilterLower === callingActivityName)
        );

        log.info(`Dnd5eSystemAdapter.shouldReplace | Activity comparison (${match ? 'MATCHED' : 'FAILED'}): calling activity ("${callingActivityName}" / "${callingActivityId}") vs entry activity filter ("${entryFilterLower}" / "${entryFilterExact}")`);
        return match;
    }
}

