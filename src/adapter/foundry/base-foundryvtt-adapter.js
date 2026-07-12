import { systemAdapter } from "../system/index.js";
import { log } from "../../lib/logger.js";
import { clearHighlightLayer } from "../../lib/compat.js";
import { MODULE_ID } from "../../lib/constants.js";
import { DEFAULT_AUTOREC_ENTRY } from "../../autorec/autorecManager.js";
import { CrosshairConfiguration } from "../../autorec/CrosshairConfiguration.js";
/**
 * Base abstract class for Foundry VTT version-specific adapters.
 */
export class BaseFoundryVTTAdapter {
    /**
     * Initialize the base Foundry VTT adapter.
     */
    constructor() {
        this.version = 0;
    }

    /**
     * Return canonical document terminology string ("template" or "region").
     * @abstract
     * @returns {string} The localized or canonical document type term
     */
    get documentTerm() {
        throw new Error("Subclass must implement documentTerm getter");
    }

    /**
     * Return section title header for pre-placement configuration.
     * @abstract
     * @returns {string} Section header text
     */
    get prePlacementTitle() {
        throw new Error("Subclass must implement prePlacementTitle getter");
    }

    /**
     * Return section title header for placement configuration.
     * @abstract
     * @returns {string} Section header text
     */
    get placementSectionTitle() {
        throw new Error("Subclass must implement placementSectionTitle getter");
    }

    /**
     * Return section title header for post-placement configuration.
     * @abstract
     * @returns {string} Section header text
     */
    get postPlacementTitle() {
        throw new Error("Subclass must implement postPlacementTitle getter");
    }

    /**
     * Extract normalized calling item and activity context from a Foundry document.
     * @param {Document} doc - The template or region document
     * @returns {{item: Item|null, itemName: string, itemId: string, activity: Object|null, activityName: string, activityId: string}} Normalized calling context object containing item and activity details
     */
    extractCallingContext(doc) {
        if (!doc) return { item: null, itemName: "", itemId: "", activity: null, activityName: "", activityId: "" };
        const itemObj = doc.item ?? null;
        const activityObj = doc.activity ?? null;

        const baseContext = {
            item: itemObj,
            itemName: itemObj?.name ?? "",
            itemId: itemObj?.id ?? "",
            activity: activityObj,
            activityName: activityObj?.name ?? "",
            activityId: activityObj?.id ?? ""
        };

        const result = systemAdapter.extractCallingContext(doc, baseContext);

        log.debug("BaseFoundryVTTAdapter.extractCallingContext | Result from systemAdapter:", {
            itemName: result.itemName,
            itemId: result.itemId,
            activityName: result.activityName,
            activityId: result.activityId
        });

        return result;
    }

    /**
     * Filter and match autorec candidates for a Foundry document (MeasuredTemplate / Region)
     * following strict preference hierarchy: CUSTOM CONFIG > AUTOREC MATCH > AUTOREC DEFAULT > FOUNDRY DEFAULT.
     * @param {Document} doc - The template or region document
     * @param {Map<string, Object>} entries - Registered autorec entries map
     * @returns {Object|null} The matching crosshair configuration entry or null
     */
    matchAutorecEntry(doc, entries) {
        if (!doc || !entries) return null;
        const context = this.extractCallingContext(doc);
        if (!context.itemName && !context.itemId) {
            log.debug("matchAutorecEntry | Could not extract calling item context (missing itemName and itemId) from document:", { doc, context });
            return null;
        }

        const callingItemName = context.itemName.trim().toLowerCase();
        const candidateEntries = [];
        for (const entry of entries.values()) {
            if (entry.isDefault || !entry.enabled) continue;
            if ((entry.itemName ?? "").trim().toLowerCase() === callingItemName) {
                candidateEntries.push(entry);
            }
        }

        candidateEntries.sort((a, b) => {
            if (a.hasActivity && !b.hasActivity) return -1;
            if (!a.hasActivity && b.hasActivity) return 1;
            return 0;
        });

        let baseEntry = null;
        for (const entry of candidateEntries) {
            if (systemAdapter.isMatch(context, entry)) {
                log.debug(`matchAutorecEntry | [MATCH FOUND] Specific global entry "${entry.itemName}" matched calling item "${context.itemName}"`);
                baseEntry = { ...entry, item: context.item, activity: context.activity };
                break;
            }
        }

        if (!baseEntry) {
            const defaultEntry = entries.get("DEFAULT");
            if (defaultEntry && defaultEntry.enabled) {
                baseEntry = { ...defaultEntry, item: context.item, activity: context.activity };
            }
        }

        const itemConfig = context.item?.getFlag(MODULE_ID, "customConfig") ?? null;
        const activityConfig = context.activityId
            ? (context.item?.getFlag(MODULE_ID, "activityConfigs")?.[context.activityId] ?? null)
            : null;

        if (!itemConfig && !activityConfig) {
            return baseEntry ? CrosshairConfiguration.fromSource(baseEntry) : null;
        }

        let baseConfig = CrosshairConfiguration.fromSource({
            ...(baseEntry ?? DEFAULT_AUTOREC_ENTRY),
            item: context.item,
            activity: context.activity
        });

        if (itemConfig) {
            baseConfig = baseConfig.overrideWith(itemConfig);
        }
        if (activityConfig) {
            baseConfig = baseConfig.overrideWith(activityConfig);
        }

        baseConfig.item = context.item;
        baseConfig.activity = context.activity;

        log.debug(`matchAutorecEntry | [CUSTOM CONFIG] Merged custom overrides (item: ${Boolean(itemConfig)}, activity: ${Boolean(activityConfig)}) for "${context.itemName}"`);
        return baseConfig;
    }

    /**
     * Hide a live placeable preview graphic during interactive drawing.
     * Common across Foundry v12..v14+ placement previews.
     * @param {PlaceableObject} placeable - The placeable graphic object to hide
     * @returns {void} No return value
     */
    hidePreview(placeable) {
        if (!placeable) return;
        try { placeable.visible = false; } catch (e) {}
        try { placeable.renderable = false; } catch (e) {}
        try { placeable.alpha = 0; } catch (e) {}
        if (placeable.template) {
            try { placeable.template.visible = false; } catch (e) {}
            try { placeable.template.renderable = false; } catch (e) {}
            try { placeable.template.alpha = 0; } catch (e) {}
        }
        if (placeable.ruler) {
            try { placeable.ruler.visible = false; } catch (e) {}
            try { placeable.ruler.renderable = false; } catch (e) {}
            try { placeable.ruler.text = ""; } catch (e) {}
        }
        if (placeable.controlIcon) {
            try { placeable.controlIcon.visible = false; } catch (e) {}
        }
        if (typeof placeable.highlightGrid === "function") {
            try { placeable.highlightGrid = function () { }; } catch (e) {}
        }
        if (placeable.highlightId && canvas.grid?.clearHighlightLayer) {
            try { clearHighlightLayer(placeable.highlightId); } catch (e) { }
        }

        try {
            placeable.refresh = function () {
                try { this.visible = false; } catch (e) {}
                try { this.renderable = false; } catch (e) {}
                try { this.alpha = 0; } catch (e) {}
                if (this.template) {
                    try { this.template.visible = false; } catch (e) {}
                    try { this.template.renderable = false; } catch (e) {}
                    try { this.template.alpha = 0; } catch (e) {}
                }
                if (this.ruler) {
                    try { this.ruler.visible = false; } catch (e) {}
                    try { this.ruler.renderable = false; } catch (e) {}
                    try { this.ruler.text = ""; } catch (e) {}
                }
                if (this.controlIcon) {
                    try { this.controlIcon.visible = false; } catch (e) {}
                }
                if (this.highlightId && canvas.grid?.clearHighlightLayer) {
                    try { clearHighlightLayer(this.highlightId); } catch (e) { }
                }
                return this;
            };
        } catch (e) {}
    }

    /**
     * Safely dismiss a canvas preview placeable by detaching stage interaction listeners, clearing ticker queues, and destroying.
     * Common across Foundry v12..v14+ placement previews and system-overridden canvas previews (e.g. Pathfinder 2e).
     * @param {PlaceableObject} placeable - The placeable graphic object to dismiss and destroy
     * @returns {void} No return value
     */
    dismissPreview(placeable) {
        if (!placeable) return;

        try { Object.defineProperty(placeable, 'isPreview', { get: () => false, configurable: true }); } catch (e) {}
        try { Object.defineProperty(placeable, 'visible', { get: () => false, configurable: true }); } catch (e) {}
        try { Object.defineProperty(placeable, 'renderable', { get: () => false, configurable: true }); } catch (e) {}
        try { placeable.isPreview = false; } catch (e) {}
        try { placeable.visible = false; } catch (e) {}
        try { placeable.renderable = false; } catch (e) {}

        if (placeable.renderFlags && typeof placeable.renderFlags.clear === "function") {
            try { placeable.renderFlags.clear(); } catch (e) {}
        }
        if (typeof canvas?.app?.ticker?.remove === "function") {
            try { canvas.app.ticker.remove(placeable.applyRenderFlags, placeable); } catch (e) {}
            try { canvas.app.ticker.remove(placeable._tick, placeable); } catch (e) {}
        }

        if (typeof placeable._onConfirm === "function") {
            try { placeable._onConfirm({ preventDefault: () => {}, stopPropagation: () => {} }); } catch (e) {}
        }
        if (typeof placeable._finishPreview === "function") {
            try { placeable._finishPreview(); } catch (e) {}
        }
        if (typeof placeable._onCancel === "function") {
            try { placeable._onCancel({ preventDefault: () => {}, stopPropagation: () => {} }); } catch (e) {}
        }
        if (typeof canvas?.templates?._onCancel === "function") {
            try { canvas.templates._onCancel({ preventDefault: () => {}, stopPropagation: () => {} }); } catch (e) {}
        }

        const stages = [canvas?.stage, canvas?.app?.stage, canvas?.templates, canvas?.templates?.preview].filter(Boolean);
        const eventNames = ["pointermove", "mousemove", "pointerdown", "mousedown", "pointerup", "mouseup", "click", "rightclick"];
        for (const stg of stages) {
            if (typeof stg.listeners === "function" && typeof stg.off === "function") {
                for (const evName of eventNames) {
                    try {
                        const lns = stg.listeners(evName);
                        if (Array.isArray(lns)) {
                            for (const fn of lns) {
                                if (fn && (fn.context === placeable || fn._context === placeable || (fn.name && (fn.name.includes("mousemove") || fn.name.includes("pointermove") || fn.name.includes("pointerdown") || fn.name.includes("mousedown") || fn.name.includes("click") || fn.name.includes("preview") || fn.name.includes("template"))))) {
                                    stg.off(evName, fn);
                                }
                            }
                        }
                    } catch (e) {}
                }
            }
        }

        if (canvas?.templates?.preview?.children?.includes(placeable)) {
            try { canvas.templates.preview.removeChild(placeable); } catch (e) {}
        }
        if (typeof placeable.destroy === "function") {
            try { placeable.destroy({ children: true }); } catch (e) {}
        }

        const dummyContainer = {
            position: { x: 0, y: 0, set: () => {} },
            visible: false,
            renderable: false,
            alpha: 0,
            text: "",
            destroy: () => {}
        };
        try { placeable.controlIcon = dummyContainer; } catch (e) {}
        try { placeable.ruler = dummyContainer; } catch (e) {}
        try { placeable.template = dummyContainer; } catch (e) {}
        try { if (!placeable.position) placeable.position = dummyContainer.position; } catch (e) {}
    }

    /**
     * Extract normalized placed fill/border styling values and flags from workflow configuration.
     * Shared across V13 and V14 document updates.
     * @param {Object} [config={}] - Workflow placement configuration options
     * @returns {{placedFillColor?: string, placedFillAlpha?: number, placedBorderColor?: string, placedBorderAlpha?: number, flags: Object}} Extracted placement styling properties and flags
     */
    extractPlacedStylingFlags(config = {}) {
        const placedFillColor = config.placedFillColor;
        const placedFillAlpha = config.placedFillAlpha;
        const placedBorderColor = config.placedBorderColor;
        const placedBorderAlpha = config.placedBorderAlpha;
        const postPlacementCode = config.postPlacementCode ?? "";

        const flags = {
            bbc: {
                itemName: config.itemName ?? "",
                activityName: config.activityName ?? "",
                activityId: config.activityId ?? "",
                postPlacementCode,
                placedFillColor,
                placedFillAlpha,
                placedBorderColor,
                placedBorderAlpha
            }
        };

        return { placedFillColor, placedFillAlpha, placedBorderColor, placedBorderAlpha, flags };
    }

    /**
     * Register Foundry VTT canvas placement hooks for live previewing and document creation.
     * @param {Object} callbacks - Placement hook callbacks (`{ onDrawPreview, onPreCreate, onCreate }`)
     * @returns {void} No return value
     */
    registerPlacementHooks(callbacks) {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement registerPlacementHooks(callbacks).");
    }

    /**
     * Detect geometric properties and dimensions from a MeasuredTemplate or Region Document.
     * @param {Document} doc - MeasuredTemplate or Region document
     * @returns {{type: string, distance: number, width: number, angle: number, x: number, y: number}} Detected geometric properties including type, distance, width, angle, and coordinates
     */
    detectProperties(doc) {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement detectProperties(doc).");
    }

    /**
     * Format placement coordinates into a version-specific schema data structure.
     * @param {number} x - Target x-coordinate
     * @param {number} y - Target y-coordinate
     * @param {number} direction - Target direction angle in degrees
     * @param {Object} [config={}] - Optional placement configuration
     * @returns {{x: number, y: number, direction: number}} Formatted placement coordinates object
     */
    formatPlacementCoordinates(x, y, direction, config = {}) {
        return { x, y, direction };
    }

    /**
     * Mutate a live preview placeable document's shape coordinates during mouse drag.
     * @param {Document} previewDoc - Preview MeasuredTemplate or Region document
     * @param {Object} coords - Destination coordinates payload
     * @returns {void} No return value
     */
    updatePreviewShape(previewDoc, coords) {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement updatePreviewShape(previewDoc, coords).");
    }

    /**
     * Apply placement coordinates and workflow metadata onto a newly created document.
     * @param {Document} doc - MeasuredTemplate or Region document
     * @param {Object} coords - Resolved placement coordinates
     * @param {Object} [config={}] - Workflow placement configuration
     * @returns {void} No return value
     */
    applyDocumentPlacement(doc, coords, config) {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement applyDocumentPlacement(doc, coords, config).");
    }

    /**
     * Resolve placement anchor coordinates {x, y, direction} on a token's edge toward a click coordinate.
     * Takes only a normalized Token object and {x, y} click coordinates.
     * Implements 1-to-1 the exact algorithm from Sequencer 4.2.2 (#handleLockedEdge in CrosshairsPlaceable.js).
     * @param {Token} tok - The source token object to anchor placement against
     * @param {{x?: number, y?: number}} [clickCoords={}] - Optional mouse click coordinates
     * @returns {{x: number, y: number, direction: number}} Resolved anchor placement coordinates and facing direction
     */
    resolveAnchorPlacement(tok, clickCoords = {}) {
        const rawClickX = clickCoords.x ?? 0;
        const rawClickY = clickCoords.y ?? 0;
        if (!tok) return { x: rawClickX, y: rawClickY, direction: 0 };

        const centerMode = typeof CONST !== "undefined" && CONST.GRID_SNAPPING_MODES ? CONST.GRID_SNAPPING_MODES.CENTER : 1;
        const edgeMidpointMode = typeof CONST !== "undefined" && CONST.GRID_SNAPPING_MODES ? CONST.GRID_SNAPPING_MODES.EDGE_MIDPOINT : 16;
        const size = canvas?.grid?.size ?? 100;

        /**
         * Helper to snap a point using the canvas grid if available.
         * @param {{x: number, y: number}} pt - Point coordinates to snap
         * @param {number} mode - Snapping mode constant
         * @returns {{x: number, y: number}} The snapped or original point coordinates
         */
        const snapPt = (pt, mode) => {
            if (canvas?.grid?.getSnappedPoint) {
                try { return canvas.grid.getSnappedPoint(pt, { mode, resolution: size }); } catch (e) { }
            }
            return pt;
        };

        const snappedMouse = snapPt({ x: rawClickX, y: rawClickY }, centerMode);

        const tx = tok.x ?? 0;
        const ty = tok.y ?? 0;
        const w = tok.w ?? size;
        const h = tok.h ?? size;

        const points = [tx, ty, tx + w, ty, tx + w, ty + h, tx, ty + h];
        const centerPoint = tok.center;

        const RayClass = foundry?.canvas?.geometry?.Ray ?? globalThis.Ray;
        if (!RayClass) {
            return { x: centerPoint.x, y: centerPoint.y, direction: 0 };
        }

        const ray = new RayClass(centerPoint, snappedMouse);
        let intersection = null;
        for (let i = 0; i < points.length; i += 2) {
            const p1 = { x: points[i], y: points[i + 1] };
            const p2Idx = (i + 2) >= points.length ? 0 : (i + 2);
            const p2 = { x: points[p2Idx], y: points[p2Idx + 1] };
            intersection = ray.intersectSegment([p1.x, p1.y, p2.x, p2.y]);
            if (intersection) break;
        }

        if (!intersection) {
            const angleRad = Math.atan2(snappedMouse.y - centerPoint.y, snappedMouse.x - centerPoint.x);
            let dir = angleRad * (180 / Math.PI);
            if (dir < 0) dir += 360;
            return { x: centerPoint.x, y: centerPoint.y, direction: dir };
        }

        let snappedIntersection = snapPt(intersection, edgeMidpointMode);

        const isSquareGrid = canvas?.scene?.grid?.type === (typeof CONST !== "undefined" ? CONST.GRID_TYPES?.SQUARE : 1);
        if (isSquareGrid) {
            const left = snappedMouse.x < points[0];
            const above = snappedMouse.y < points[1];
            const right = snappedMouse.x > points[2];
            const below = snappedMouse.y > points[5];
            if ((left || right) && (below || above)) {
                snappedIntersection.x = left ? points[0] - size : (right ? points[2] + size : snappedIntersection.x);
                snappedIntersection.y = above ? points[1] - size : (right ? points[5] + size : snappedIntersection.y);
                if (above && left) {
                    snappedIntersection.x = points[0];
                    snappedIntersection.y = points[1];
                } else if (above && right) {
                    snappedIntersection.x = points[2];
                    snappedIntersection.y = points[3];
                } else if (below && right) {
                    snappedIntersection.x = points[4];
                    snappedIntersection.y = points[5];
                } else if (below && left) {
                    snappedIntersection.x = points[6];
                    snappedIntersection.y = points[7];
                }
            }
        }

        const dragAngle = (new RayClass(snappedIntersection, snappedMouse)).angle;
        let direction = dragAngle * (180 / Math.PI);
        if (direction < 0) direction += 360;

        return {
            x: snappedIntersection.x,
            y: snappedIntersection.y,
            direction
        };
    }

    /**
     * Return template pixel multiplier factor and gridUnits mode for Sequencer effects.
     * @returns {{factor: number, gridUnits: boolean}} Template pixel scaling factor and grid units flag
     */
    getTemplatePixelFactor() {
        return { factor: 1, gridUnits: false };
    }
}
