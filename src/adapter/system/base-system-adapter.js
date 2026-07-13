import { log } from "../../lib/logger.js";
import { ItemCrosshairConfigApplication } from "../../autorec/itemConfigMenu.js";

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
     * Return list of custom PlaceableObject subclass names introduced by this game system.
     * @returns {string[]} Array of custom placeable class names
     */
    getCustomPlaceableClassNames() {
        return [];
    }

    /**
     * Return whether mouse wheel rotation of a crosshair requires holding the Control / Command modifier key.
     * Base implementation returns false (normal mouse wheel scrolling rotates crosshair unless overridden by system).
     * @returns {boolean} True if the Control / Command key must be held to rotate the crosshair via mouse wheel.
     */
    requiresWheelModifier() {
        return false;
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
     * Base implementation defaults to NOP to preserve native placement behavior across standard game systems.
     * System subclasses that block pointer events on Click #1 (e.g. Pathfinder 2e) override this method.
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

    /**
     * Open the Item Crosshair Configuration application for a target item.
     * Accessible to any user who owns the item.
     * @param {Document} item - Target Item document
     * @returns {void} No return value
     */
    openItemCrosshairConfig(item) {
        if (!item) return;
        new ItemCrosshairConfigApplication({ item }).render(true);
    }

    /**
     * Add a Better Crosshairs header control to an ApplicationV2 item sheet instance.
     * @param {foundry.applications.api.ApplicationV2} app - Item sheet application instance
     * @param {Array<object>} controls - Array of header control button items
     * @returns {void} No return value
     */
    addItemSheetHeaderControl(app, controls) {
        const item = app.document;
        if (!item || item.documentName !== "Item" || !Boolean(item.isOwner)) return;
        if (controls.some(c => c.label?.startsWith("BBC") || c.icon === "fa-solid fa-crosshairs")) return;

        const customConfig = item.getFlag("bakana-better-crosshairs", "customConfig") ?? null;
        const activityConfigs = item.getFlag("bakana-better-crosshairs", "activityConfigs") ?? null;
        const hasAnyCustom = Boolean(
            customConfig ||
            (activityConfigs && typeof activityConfigs === "object" && Object.keys(activityConfigs).length > 0)
        );

        controls.push({
            label: "BBC",
            icon: hasAnyCustom ? "fa-solid fa-crosshairs bbc-header-icon-custom" : "fa-solid fa-crosshairs",
            onClick: () => this.openItemCrosshairConfig(item)
        });
    }

    /**
     * Register standard universal ApplicationV2 item sheet header hooks (`ApplicationV2` / `ItemSheetV2`).
     * @returns {void} No return value
     */
    registerItemSheetHooks() {
        if (typeof Hooks?.on === "function") {
            const handler = (app, controls) => this.addItemSheetHeaderControl(app, controls);
            Hooks.on("getHeaderControlsApplicationV2", handler);
            Hooks.on("getHeaderControlsItemSheetV2", handler);
        }
    }
}
