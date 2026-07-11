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

    /**
     * Extract normalized calling item and activity context from a DnD5e Document and flags.
     * @param {Document} document - Template or Region document placed on canvas
     * @param {Object} [baseContext={}] - Initial calling context (`{ item, itemName, itemId, activity, activityName, activityId }`)
     * @returns {{item: Item|null, itemName: string, itemId: string, activity: Object|null, activityName: string, activityId: string}}
     */
    extractCallingContext(document, baseContext = {}) {
        let itemObj = baseContext.item ?? null;
        let activityObj = baseContext.activity ?? null;

        if (!itemObj && document?.flags?.dnd5e?.origin && typeof fromUuidSync === "function") {
            try { itemObj = fromUuidSync(document.flags.dnd5e.origin); } catch (e) {}
        }

        if (itemObj && (itemObj.item || (itemObj.parent && itemObj.parent.documentName === "Item"))) {
            activityObj = activityObj ?? itemObj;
            itemObj = itemObj.item ?? itemObj.parent;
        }

        const actIdentifier = document?.flags?.dnd5e?.activity;
        if (!activityObj && actIdentifier) {
            if (typeof fromUuidSync === "function" && typeof actIdentifier === "string" && actIdentifier.includes(".")) {
                try { activityObj = fromUuidSync(actIdentifier); } catch (e) {}
            }
            if (!activityObj && itemObj?.system?.activities) {
                activityObj = itemObj.system.activities.get?.(actIdentifier) ?? null;
            }
        }

        const result = {
            item: itemObj,
            itemName: itemObj?.name ?? baseContext.itemName ?? "",
            itemId: itemObj?.id ?? baseContext.itemId ?? "",
            activity: activityObj,
            activityName: activityObj?.name ?? baseContext.activityName ?? "",
            activityId: activityObj?.id ?? baseContext.activityId ?? ""
        };

        log.debug("Dnd5eSystemAdapter.extractCallingContext | Resolved DnD5e context:", {
            itemName: result.itemName,
            itemId: result.itemId,
            activityName: result.activityName,
            activityId: result.activityId,
            dnd5eFlags: document?.flags?.dnd5e
        });

        return result;
    }

    /**
     * Evaluate whether a calling context matches a candidate autorec entry in DnD5e.
     * Checks item match AND validates calling activity against entry activity filters.
     * @param {{item?: Item, itemName?: string, itemId?: string, activity?: Object, activityName?: string, activityId?: string}} context - Normalized calling context
     * @param {Object} entry - Registered autorec entry configuration
     * @returns {boolean} True if the calling context matches item and activity rules
     */
    isMatch(context, entry) {
        if (!super.isMatch(context, entry)) return false;
        if (entry.isDefault) {
            log.debug("Dnd5eSystemAdapter.isMatch | Candidate entry is canonical default fallback (isDefault: true) -> MATCHED");
            return true;
        }

        const entryFilterId = (entry.activityId ?? "").trim();
        const entryFilterName = (entry.activityName ?? "").trim().toLowerCase();

        // If the entry specifies no activity filter (no ID or Name filter), it applies to any activity on this item
        if (!entryFilterId && !entryFilterName) {
            log.debug(`Dnd5eSystemAdapter.isMatch | Entry "${entry.itemName}" specifies no activity filter -> MATCHED`);
            return true;
        }

        const callingActivityId = (context.activityId ?? "").trim();
        const callingActivityName = (context.activityName ?? "").trim().toLowerCase();

        const match = Boolean(
            (entryFilterId && callingActivityId && entryFilterId === callingActivityId) ||
            (entryFilterName && callingActivityName && entryFilterName === callingActivityName)
        );

        log.debug(`Dnd5eSystemAdapter.isMatch | Activity comparison (${match ? 'MATCHED' : 'FAILED'}): calling activity ("${callingActivityName}" / "${callingActivityId}") vs entry activity filters ("${entryFilterName}" / "${entryFilterId}")`);
        return match;
    }
}

