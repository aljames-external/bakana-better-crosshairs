import { log } from "../../lib/logger.js";

/**
 * Base System Adapter for system-agnostic decision on whether to replace the default crosshair.
 * Makes no assumptions about placeable document types (template vs region).
 */
export class BaseSystemAdapter {
    /**
     * Initialize base system adapter properties (`systemId` and `supportsActivities`).
     */
    constructor() {
        this.systemId = "base";
        this.supportsActivities = false;
    }

    /**
     * Extract or refine calling context for the specific game system.
     * Base implementation returns the standard calling context passed by upstream workflow.
     * @param {Document} document - Template or Region document placed on canvas
     * @param {Object} [baseContext={}] - Initial calling context (`{ item, itemName, itemId, activity, activityName, activityId }`)
     * @returns {{item?: Item|null, itemName?: string, itemId?: string, activity?: Object|null, activityName?: string, activityId?: string}} Refined calling context object
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

    /**
     * Handle delayed single-click programmatic document creation when native placement listeners are blocked or deferred.
     * Base implementation executes 50ms fallback creation check and delegates preview teardown to crosshairAdapter.
     * @param {Scene} scene - Target Canvas Scene
     * @param {Document} doc - Preview Template or Region document
     * @param {PlaceableObject} placeable - Live canvas preview placeable
     * @param {Object} [coords={}] - Resolved placement coordinates (`{ x, y, direction, distance }`)
     * @param {Object} [options={}] - Execution dependencies (`{ crosshairAdapter, pendingPlacements, placementKey }`)
     * @returns {void} No return value
     */
    handleProgrammaticPlacement(scene, doc, placeable, coords = {}, options = {}) {
        if (!doc || !scene) return;
        const docName = doc.documentName ?? "MeasuredTemplate";
        const { crosshairAdapter, pendingPlacements, placementKey } = options;

        setTimeout(async () => {
            const stillPending = pendingPlacements?.get(placementKey);
            if (stillPending && stillPending.resolved && !stillPending.cancelled && stillPending.coords) {
                log.debug(`BaseSystemAdapter.handleProgrammaticPlacement | Native placement hook did not fire after 50ms. Programmatically creating ${docName} from preview document.`);
                const createData = foundry.utils.deepClone(doc.toObject());
                delete createData._id;
                if (stillPending.coords.x !== undefined) createData.x = stillPending.coords.x;
                if (stillPending.coords.y !== undefined) createData.y = stillPending.coords.y;
                if (stillPending.coords.direction !== undefined) createData.direction = stillPending.coords.direction;
                if (stillPending.coords.distance !== undefined) createData.distance = stillPending.coords.distance;

                try {
                    await scene.createEmbeddedDocuments(docName, [createData]);
                } catch (err) {
                    log.error(`BaseSystemAdapter.handleProgrammaticPlacement | Failed to programmatically create ${docName}:`, err);
                }
            }
            if (placeable && crosshairAdapter && typeof crosshairAdapter.dismissPreview === "function") {
                crosshairAdapter.dismissPreview(placeable);
            }
        }, 50);
    }
}

