import { systemAdapter } from "../system/index.js";

/**
 * Manages the lifecycle of a pending Foundry template/region placement session,
 * handling deferred document creation, programmatic placement delegation, and cancellation.
 */
export class PendingPlacementSession {
    /**
     * @param {object} adapter - The active Foundry version adapter
     * @param {string} placementKey - The unique key identifying this pending placement
     * @param {object} pending - The pending placement state record in adapter.pendingPlacements
     * @param {Document} doc - Target Foundry Document being placed
     * @param {PlaceableObject} placeable - Target canvas placeable preview object
     */
    constructor(adapter, placementKey, pending, doc, placeable) {
        this.adapter = adapter;
        this.placementKey = placementKey;
        this.pending = pending;
        this.doc = doc;
        this.placeable = placeable;

        this.x = undefined;
        this.y = undefined;
        this.distance = undefined;
        this.direction = undefined;
        this.t = undefined;
        this.radius = undefined;
        this.rotation = undefined;
        this.type = undefined;
        this.cancelled = false;
        this.resolved = false;
    }

    /**
     * Resolve the pending crosshair placement with specified coordinates.
     * @param {object} [coords={}] - Placed coordinates and properties
     * @returns {Promise<void>} Resolves when deferred document placement is processed
     */
    async resolve(coords = {}) {
        Object.assign(this, coords);
        this.resolved = true;

        const pendingItem = this.adapter.pendingPlacements.get(this.placementKey) ?? this.pending;
        if (pendingItem) {
            pendingItem.coords = coords;
            pendingItem.resolved = true;

            if (pendingItem.deferredCreateData && typeof canvas !== "undefined" && canvas.scene) {
                await this.adapter.createDeferredDocument(
                    canvas.scene,
                    pendingItem.deferredCreateData,
                    coords,
                    pendingItem.documentName,
                    pendingItem.config
                );
                if (this.placeable && typeof this.adapter.dismissPreview === "function") {
                    this.adapter.dismissPreview(this.placeable);
                }
            } else if (this.doc && typeof canvas !== "undefined" && canvas.scene) {
                systemAdapter.handleProgrammaticPlacement(canvas.scene, this.doc, this.placeable, coords, {
                    crosshairAdapter: this.adapter,
                    pendingPlacements: this.adapter.pendingPlacements,
                    placementKey: this.placementKey,
                    config: pendingItem.config
                });
            }
        }
    }

    /**
     * Cancel the pending crosshair placement.
     * @returns {void}
     */
    cancel() {
        this.cancelled = true;
        this.resolved = true;
        const pendingItem = this.adapter.pendingPlacements.get(this.placementKey) ?? this.pending;
        if (pendingItem) {
            pendingItem.cancelled = true;
            pendingItem.resolved = true;
        }
        this.adapter.pendingPlacements.delete(this.placementKey);
        if (this.placeable && typeof this.adapter.dismissPreview === "function") {
            this.adapter.dismissPreview(this.placeable);
        }
    }
}
