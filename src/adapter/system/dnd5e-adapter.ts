import { BaseSystemAdapter } from "./base-system-adapter.js";
import { log } from "../../lib/logger.js";
import { crosshairAdapter } from "../foundry/index.js";

/**
 * System Adapter for DnD5e.
 * Determines whether an autorec entry should replace the default crosshair based on the calling item AND calling activity.
 */
export class Dnd5eSystemAdapter extends BaseSystemAdapter {
    /**
     * Initialize the DnD5e system adapter and declare activity support.
     */
    constructor() {
        super();
        this.systemId = "dnd5e";
        this.supportsActivities = true;
    }

    /**
     * Return list of custom PlaceableObject subclass names introduced by DnD5e.
     * @returns {string[]} Array of custom placeable class names
     */
    getCustomPlaceableClassNames() {
        return ["MeasuredTemplate5e"];
    }

    /**
     * Extract normalized calling item and activity context from a DnD5e Document and flags.
     * @param {Document|null} doc - Template or Region document placed on canvas
     * @param {Object} [baseContext={}] - Initial calling context (`{ item, itemName, itemId, activity, activityName, activityId }`)
     * @returns {{item: Item|null, itemName: string, itemId: string, activity: Object|null, activityName: string, activityId: string}} Normalized calling context containing item and activity references and identifiers
     */
    extractCallingContext(doc, baseContext = {}) {
        let itemObj = baseContext?.item ?? null;
        let activityObj = baseContext?.activity ?? null;

        if (!itemObj && doc?.flags?.dnd5e?.origin) {
            try { itemObj = crosshairAdapter.fromUuidSync(doc.flags.dnd5e.origin); } catch (e) {}
        }

        if (itemObj && (itemObj.item || (itemObj.parent && itemObj.parent.documentName === "Item"))) {
            activityObj = activityObj ?? itemObj;
            itemObj = itemObj.item ?? itemObj.parent;
        }

        const actIdentifier = doc?.flags?.dnd5e?.activity;
        if (!activityObj && actIdentifier) {
            if (uuidResolver && actIdentifier?.includes?.(".")) {
                try { activityObj = uuidResolver(actIdentifier); } catch (e) {}
            }
            if (!activityObj && itemObj?.system?.activities) {
                activityObj = itemObj.system.activities.get?.(actIdentifier) ?? null;
            }
        }

        const result = {
            item: itemObj,
            itemName: itemObj?.name ?? baseContext?.itemName ?? "",
            itemId: itemObj?.id ?? baseContext?.itemId ?? "",
            activity: activityObj,
            activityName: activityObj?.name ?? baseContext?.activityName ?? "",
            activityId: activityObj?.id ?? baseContext?.activityId ?? ""
        };

        log.debug("Dnd5eSystemAdapter.extractCallingContext | Resolved DnD5e context:", {
            itemName: result.itemName,
            itemId: result.itemId,
            activityName: result.activityName,
            activityId: result.activityId,
            dnd5eFlags: doc?.flags?.dnd5e
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

    /**
     * Determine the D&D 5e system default for whether a crosshair shape should stick to its source token
     * when no explicit override is configured (stickToToken === "default").
     * Checks the authoritative D&D 5e spell/ability system defaults first (e.g. Thunderwave, Lightning Bolt, Fireball).
     * If completely unrecognized, defaults to detached (false).
     * @param {string} shapeType - The template or crosshair shape (`"cone"`, `"circle"`, `"ray"`, `"rect"`, `"square"`)
     * @param {object} [config={}] - Optional crosshair configuration or calling context object
     * @returns {boolean} Whether the crosshair shape defaults to sticking to the token in D&D 5e
     */
    getDefaultStickToToken(shapeType, config = {}) {
        const itemDefault = this.getSystemDefault(config);
        if (itemDefault !== null && itemDefault !== undefined) {
            return Boolean(itemDefault);
        }
        return false;
    }

    /**
     * Handle delayed single-click programmatic document creation when native placement listeners are blocked or deferred.
     * In DnD5e, native template placement pointer events fire cleanly on Click #1 without being blocked.
     * Strictly NOP this method to isolate DnD5e from PF2e race workarounds and preserve exact native placement behavior.
     * @param {Scene} scene - Target Canvas Scene
     * @param {Document} doc - Preview Template or Region document
     * @param {PlaceableObject} placeable - Live canvas preview placeable
     * @param {Object} [coords={}] - Resolved placement coordinates (`{ x, y, direction, distance }`)
     * @param {Object} [options={}] - Execution dependencies (`{ crosshairAdapter, pendingPlacements, placementKey }`)
     * @returns {void} No return value
     */
    handleProgrammaticPlacement(scene, doc, placeable, coords = {}, options = {}) {
    }

    /**
     * Return list of DnD5e-specific Hook names for ApplicationV2 item sheet header controls.
     * Protected hook override (Template Method Pattern).
     * @protected
     * @override
     * @returns {string[]} Array of hook names
     */
    _getItemSheetHookNames() {
        return ["getHeaderControlsItemSheet5e", "getHeaderControlsItemSheet5e2"];
    }

    /**
     * Return list of DnD5e-specific Hook names for ApplicationV2 activity sheet header controls.
     * Protected hook override (Template Method Pattern).
     * @protected
     * @override
     * @returns {string[]} Array of hook names
     */
    _getActivitySheetHookNames() {
        return [
            "getHeaderControlsActivitySheet",
            "getHeaderControlsActivitySheet5e",
            "getHeaderControlsAttackSheet",
            "getHeaderControlsCastSheet",
            "getHeaderControlsCheckSheet",
            "getHeaderControlsDamageSheet",
            "getHeaderControlsEnchantSheet",
            "getHeaderControlsForwardSheet",
            "getHeaderControlsHealSheet",
            "getHeaderControlsSaveSheet",
            "getHeaderControlsSummonSheet",
            "getHeaderControlsUtilitySheet"
        ];
    }
}
