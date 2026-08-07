import { BaseSystemAdapter } from "./base-system-adapter.js";
import { log } from "../../lib/logger.js";

/**
 * System Adapter encapsulating Pathfinder 1st Edition (pf1 / pf) item context resolution and template placement behaviors.
 */
export class Pf1SystemAdapter extends BaseSystemAdapter {
    /**
     * Initialize Pathfinder 1e system adapter properties.
     * @param {string} [systemId="pf1"] - System identifier ("pf1" or "pf")
     */
    constructor(systemId = "pf1") {
        super();
        this.systemId = systemId;
        this.supportsActivities = false;
    }

    /**
     * Return list of custom PlaceableObject subclass names introduced by Pathfinder 1e.
     * @returns {string[]} Array of custom placeable class names
     */
    getCustomPlaceableClassNames() {
        return ["MeasuredTemplatePF", "MeasuredTemplatePF1"];
    }

    /**
     * Extract calling item context from Pathfinder 1e template document flags or base context.
     * @param {Document|null} doc - Template or Region document placed on canvas
     * @param {Object} [baseContext={}] - Initial calling context (`{ item, itemName, itemId }`)
     * @returns {{item: Item|null, itemName: string, itemId: string, activity: Object|null, activityName: string, activityId: string}} Refined calling context object
     */
    extractCallingContext(doc, baseContext = {}) {
        let itemObj = baseContext?.item ?? null;

        // In PF1e, template origins are stored in document.flags.pf1.origin or document.flags.pf.origin
        const pf1Flags = doc?.flags?.[this.systemId] ?? doc?.flags?.pf1 ?? doc?.flags?.pf ?? {};
        const originRef = pf1Flags.origin ?? pf1Flags.item ?? pf1Flags.itemId ?? null;

        const uuidResolver = typeof fromUuidSync === "function"
            ? fromUuidSync
            : (typeof foundry?.utils?.fromUuidSync === "function" ? foundry.utils.fromUuidSync : null);

        if (!itemObj && originRef && uuidResolver) {
            try {
                if (typeof originRef === "string") {
                    if (originRef.includes(".")) {
                        itemObj = uuidResolver(originRef);
                    }
                } else if (typeof originRef === "object" && typeof originRef.uuid === "string") {
                    itemObj = uuidResolver(originRef.uuid);
                }
            } catch (e) {
                log.warn("Pf1SystemAdapter.extractCallingContext | Could not resolve item from UUID origin:", originRef, e);
            }
        }

        return {
            item: itemObj,
            itemName: itemObj?.name ?? baseContext?.itemName ?? "",
            itemId: itemObj?.id ?? baseContext?.itemId ?? "",
            activity: null,
            activityName: "",
            activityId: ""
        };
    }

    /**
     * Determine the Pathfinder 1e system default for whether a crosshair shape should stick to its source token
     * when no explicit override is configured (stickToToken === "default").
     * Checks the authoritative Pathfinder 1e spell/ability system defaults first (e.g. Burning Hands, Lightning Bolt, Fireball).
     * If not found in the dataset, falls back to standard shape defaults (cones and rays/lines stick to token).
     * @param {string} shapeType - The template or crosshair shape (`"cone"`, `"circle"`, `"ray"`, `"rect"`, `"square"`)
     * @param {object} [config={}] - Optional crosshair configuration or calling context object
     * @returns {boolean} Whether the crosshair shape defaults to sticking to the token in Pathfinder 1e
     */
    getDefaultStickToToken(shapeType, config = {}) {
        const itemDefault = this.getSystemDefault(config);
        if (itemDefault !== null && itemDefault !== undefined) {
            return Boolean(itemDefault);
        }
        return shapeType === "cone" || shapeType === "ray";
    }

    /**
     * Handle delayed single-click programmatic document creation when native placement listeners are blocked or deferred.
     * In PF1e, native template placement pointer events fire cleanly without being blocked.
     * Strictly NOP this method to preserve exact native placement behavior.
     * @param {Scene} scene - Target Canvas Scene
     * @param {Document} doc - Preview Template or Region document
     * @param {PlaceableObject} placeable - Live canvas preview placeable
     * @param {Object} [coords={}] - Resolved placement coordinates (`{ x, y, direction, distance }`)
     * @param {Object} [options={}] - Execution dependencies (`{ crosshairAdapter, pendingPlacements, placementKey }`)
     * @returns {void} No return value
     */
    handleProgrammaticPlacement(scene, doc, placeable, coords = {}, options = {}) {
        return;
    }
}
