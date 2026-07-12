import { BaseSystemAdapter } from "./base-system-adapter.js";
import { log } from "../../lib/logger.js";

/**
 * System Adapter encapsulating Pathfinder 2e (pf2e) item context resolution and template placement behaviors.
 */
export class Pf2eSystemAdapter extends BaseSystemAdapter {
    /**
     * Initialize Pathfinder 2e system adapter properties.
     */
    constructor() {
        super();
        this.systemId = "pf2e";
        this.supportsActivities = false;
    }

    /**
     * Extract calling item context from Pathfinder 2e template document flags or base context.
     * @param {Document} document - Template or Region document placed on canvas
     * @param {Object} [baseContext={}] - Initial calling context (`{ item, itemName, itemId }`)
     * @returns {{item?: Item|null, itemName?: string, itemId?: string, activity?: Object|null, activityName?: string, activityId?: string}} Refined calling context object
     */
    extractCallingContext(document, baseContext = {}) {
        let itemObj = baseContext.item ?? null;

        // In PF2e, template origins are stored inside document.flags.pf2e.origin (or flags.pf2e.item)
        const pf2eFlags = document?.flags?.pf2e ?? {};
        const originRef = pf2eFlags.origin ?? pf2eFlags.item;

        if (!itemObj && originRef && typeof foundry?.utils?.fromUuidSync === "function") {
            try {
                if (typeof originRef === "string") {
                    itemObj = foundry.utils.fromUuidSync(originRef);
                } else if (typeof originRef === "object" && originRef.uuid) {
                    itemObj = foundry.utils.fromUuidSync(originRef.uuid);
                }
            } catch (e) {
                log.debug("Pf2eSystemAdapter.extractCallingContext | Could not resolve item from UUID origin:", originRef, e);
            }
        }

        return {
            item: itemObj,
            itemName: itemObj?.name ?? baseContext.itemName ?? "",
            itemId: itemObj?.id ?? baseContext.itemId ?? "",
            activity: null,
            activityName: "",
            activityId: ""
        };
    }

    /**
     * Handle delayed single-click programmatic document creation for Pathfinder 2e.
     * Encapsulates the 50ms fallback check, coordinate normalization, PF2e diagnostic dumps, and safe preview dismissal.
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
                log.debug(`Pf2eSystemAdapter.handleProgrammaticPlacement | Native placement hook did not fire after 50ms on PF2e. Programmatically creating ${docName} from preview document.`);
                const createData = foundry.utils.deepClone(doc.toObject());
                delete createData._id;
                if (stillPending.coords.x !== undefined) createData.x = stillPending.coords.x;
                if (stillPending.coords.y !== undefined) createData.y = stillPending.coords.y;
                if (stillPending.coords.direction !== undefined) createData.direction = stillPending.coords.direction;
                if (stillPending.coords.distance !== undefined) createData.distance = stillPending.coords.distance;

                const proto = placeable ? Object.getPrototypeOf(placeable) : null;
                const parentProto = proto ? Object.getPrototypeOf(proto) : null;
                log.debug(`Pf2eSystemAdapter.handleProgrammaticPlacement | [PF2E DIAGNOSTIC DUMP] Prototype & Data for ${docName}:`, {
                    placeableClass: placeable?.constructor?.name,
                    placeableProtoMethods: proto ? Object.getOwnPropertyNames(proto) : [],
                    placeableParentMethods: parentProto ? Object.getOwnPropertyNames(parentProto) : [],
                    docObject: doc.toObject(),
                    docFlags: doc.flags,
                    createData,
                    resolvedCoords: stillPending.coords
                });

                try {
                    await scene.createEmbeddedDocuments(docName, [createData]);
                    crosshairAdapter?.dismissPreview(placeable);
                } catch (err) {
                    log.error(`Pf2eSystemAdapter.handleProgrammaticPlacement | Failed to programmatically create ${docName}:`, err);
                }
            }
        }, 50);
    }
}
