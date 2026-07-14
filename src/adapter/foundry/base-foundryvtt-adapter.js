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
        const hideContainers = (obj) => {
            if (!obj) return;
            try { obj.visible = false; } catch (e) {}
            try { obj.renderable = false; } catch (e) {}
            try { obj.alpha = 0; } catch (e) {}
            if (obj.template) {
                try { obj.template.visible = false; } catch (e) {}
                try { obj.template.renderable = false; } catch (e) {}
                try { obj.template.alpha = 0; } catch (e) {}
            }
            if (obj.ruler) {
                try { obj.ruler.visible = false; } catch (e) {}
                try { obj.ruler.renderable = false; } catch (e) {}
                try { obj.ruler.text = ""; } catch (e) {}
            }
            if (obj.controlIcon) {
                try { obj.controlIcon.visible = false; } catch (e) {}
            }
            if (obj.mesh) {
                try { obj.mesh.visible = false; } catch (e) {}
                try { obj.mesh.renderable = false; } catch (e) {}
                try { obj.mesh.alpha = 0; } catch (e) {}
            }
            if (obj.shape) {
                try { obj.shape.visible = false; } catch (e) {}
                try { obj.shape.renderable = false; } catch (e) {}
                try { obj.shape.alpha = 0; } catch (e) {}
            }
            if (obj.border) {
                try { obj.border.visible = false; } catch (e) {}
                try { obj.border.renderable = false; } catch (e) {}
                try { obj.border.alpha = 0; } catch (e) {}
            }
            if (Array.isArray(obj.children)) {
                for (const child of obj.children) {
                    if (!child) continue;
                    try { child.visible = false; } catch (e) {}
                    try { child.renderable = false; } catch (e) {}
                    try { child.alpha = 0; } catch (e) {}
                }
            }
            if (Array.isArray(obj._measurementLines)) {
                for (const line of obj._measurementLines) {
                    if (!line) continue;
                    try { line.visible = false; } catch (e) {}
                    try { line.alpha = 0; } catch (e) {}
                }
            }
            if (Array.isArray(obj._measurementLabels)) {
                for (const label of obj._measurementLabels) {
                    if (!label) continue;
                    try { label.visible = false; } catch (e) {}
                    try { label.alpha = 0; } catch (e) {}
                }
            }

            const hId = obj.highlightId || obj.id || "preview";
            if (typeof canvas !== "undefined") {
                if (canvas.grid?.clearHighlightLayer && typeof canvas.grid.clearHighlightLayer === "function") {
                    try { canvas.grid.clearHighlightLayer(hId); } catch (e) {}
                }
                if (canvas.interface?.grid?.clearHighlightLayer && typeof canvas.interface.grid.clearHighlightLayer === "function") {
                    try { canvas.interface.grid.clearHighlightLayer(hId); } catch (e) {}
                }
                if (canvas.regions?.clearHighlightLayer && typeof canvas.regions.clearHighlightLayer === "function") {
                    try { canvas.regions.clearHighlightLayer(hId); } catch (e) {}
                }
                if (canvas.regions?.highlight?.clear && typeof canvas.regions.highlight.clear === "function") {
                    try { canvas.regions.highlight.clear(); } catch (e) {}
                }
            }
        };

        try { Object.defineProperty(placeable, "visible", { get: () => false, set: () => {}, configurable: true }); } catch (e) {}
        try { Object.defineProperty(placeable, "renderable", { get: () => false, set: () => {}, configurable: true }); } catch (e) {}
        hideContainers(placeable);

        const methodsToIntercept = [
            "refresh", "_refresh",
            "applyRenderFlags", "_applyRenderFlags",
            "_refreshState", "_refreshShape", "_refreshBorder", "_refreshMeasurements", "_updateMeasurements",
            "highlightGrid", "_highlightGrid", "highlight", "_highlight"
        ];

        for (const methodName of methodsToIntercept) {
            if (methodName === "refresh" || methodName === "_refresh" || typeof placeable[methodName] === "function") {
                try {
                    const orig = placeable[methodName];
                    placeable[methodName] = function (...args) {
                        if (typeof orig === "function") {
                            try { orig.apply(this, args); } catch (e) {}
                        }
                        hideContainers(this);
                        return this;
                    };
                } catch (e) {}
            }
        }
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
        if (typeof canvas?.regions?._onCancel === "function") {
            try { canvas.regions._onCancel({ preventDefault: () => {}, stopPropagation: () => {} }); } catch (e) {}
        }

        const stages = [canvas?.stage, canvas?.app?.stage, canvas?.templates, canvas?.templates?.preview, canvas?.regions, canvas?.regions?.preview].filter(Boolean);
        const eventNames = ["pointermove", "mousemove", "pointerdown", "mousedown", "pointerup", "mouseup", "click", "rightclick"];
        for (const stg of stages) {
            if (typeof stg.listeners === "function" && typeof stg.off === "function") {
                for (const evName of eventNames) {
                    try {
                        const lns = stg.listeners(evName);
                        if (Array.isArray(lns)) {
                            for (const fn of lns) {
                                if (fn && (fn.context === placeable || fn._context === placeable || (fn.name && (fn.name.includes("mousemove") || fn.name.includes("pointermove") || fn.name.includes("pointerdown") || fn.name.includes("mousedown") || fn.name.includes("click") || fn.name.includes("preview") || fn.name.includes("template") || fn.name.includes("region"))))) {
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
        if (canvas?.regions?.preview?.children?.includes(placeable)) {
            try { canvas.regions.preview.removeChild(placeable); } catch (e) {}
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
        try { placeable.mesh = dummyContainer; } catch (e) {}
        try { placeable.shape = dummyContainer; } catch (e) {}
        try { placeable.border = dummyContainer; } catch (e) {}
        try { if (!placeable.position) placeable.position = dummyContainer.position; } catch (e) {}
    }

    /**
     * Determine if a placeable object on the canvas represents an unpersisted interactive preview (`MeasuredTemplate` or `Region`).
     * @param {PlaceableObject} placeable - Canvas placeable object
     * @returns {boolean} True if the placeable is a live preview graphic
     */
    isPreview(placeable) {
        if (!placeable) return false;
        return Boolean(placeable.isPreview ?? !placeable.document?.id);
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
     * Return supported base canvas PlaceableObject type names for this Foundry VTT generation.
     * @returns {string[]} Base placeable type names (`e.g. ["MeasuredTemplate"]`)
     */
    get supportedBasePlaceables() {
        return ["MeasuredTemplate"];
    }

    /**
     * Return supported document creation type names (`preCreate`/`create` hook suffixes) for this Foundry VTT generation.
     * @returns {string[]} Document type names (`e.g. ["MeasuredTemplate"]`)
     */
    get supportedDocumentTypes() {
        return ["MeasuredTemplate"];
    }

    /**
     * Register placement hooks (`onDrawPreview`, `onPreCreate`, `onCreate`, and `refresh`) across all placeable and document types.
     * Abstracted to depend cleanly on both the Foundry VTT generation adapter (`supportedBasePlaceables`, `supportedDocumentTypes`)
     * AND the System adapter (`getCustomPlaceableClassNames`).
     * @param {Object} callbacks - Placement hook callbacks (`{ onDrawPreview, onPreCreate, onCreate }`)
     * @param {Object} [sysAdapter=systemAdapter] - Active System Adapter instance
     * @returns {void} No return value
     */
    registerPlacementHooks(callbacks, sysAdapter = systemAdapter) {
        const basePlaceables = this.supportedBasePlaceables;
        const customPlaceables = sysAdapter?.getCustomPlaceableClassNames?.() ?? [];
        const dynamicPlaceables = [];

        if (typeof CONFIG !== "undefined") {
            for (const base of basePlaceables) {
                const customClass = CONFIG[base]?.objectClass?.name;
                if (customClass && typeof customClass === "string" && !basePlaceables.includes(customClass) && !customPlaceables.includes(customClass)) {
                    dynamicPlaceables.push(customClass);
                }
            }
        }

        const drawPlaceables = new Set([...basePlaceables, ...customPlaceables, ...dynamicPlaceables]);
        for (const placeableName of drawPlaceables) {
            Hooks.on(`draw${placeableName}`, (template) => callbacks.onDrawPreview(template));
            Hooks.on(`refresh${placeableName}`, (template) => this.handleMeasuredTemplateRefresh(template));
        }

        for (const docType of this.supportedDocumentTypes) {
            Hooks.on(`preCreate${docType}`, (doc, _data, _options, userId) => callbacks.onPreCreate(doc, _data, _options, userId));
            Hooks.on(`create${docType}`, (doc, _options, userId) => callbacks.onCreate(doc, _options, userId));
        }
    }

    /**
     * Handle refresh hooks for placeables (`MeasuredTemplate` or `Region`), syncing colors/alpha from bbc flags onto PIXI graphics.
     * @param {PlaceableObject} template - Placeable object on canvas
     * @returns {void}
     */
    handleMeasuredTemplateRefresh(template) {
        if (!template?.document) return;
        const bbcFlags = template.document.flags?.bbc ?? {};
        const placedBorderColor = bbcFlags.placedBorderColor ?? template.document.borderColor;
        const placedBorderAlpha = bbcFlags.placedBorderAlpha ?? template.document.borderAlpha;
        const placedFillColor = bbcFlags.placedFillColor ?? template.document.fillColor ?? template.document.color;
        const placedFillAlpha = bbcFlags.placedFillAlpha ?? template.document.fillAlpha ?? template.document.alpha;

        if (bbcFlags.placedBorderColor && template.document.borderColor !== bbcFlags.placedBorderColor) {
            try { template.document.borderColor = bbcFlags.placedBorderColor; } catch (e) {}
        }
        if (bbcFlags.placedBorderAlpha !== undefined && template.document.borderAlpha !== bbcFlags.placedBorderAlpha) {
            try { template.document.borderAlpha = bbcFlags.placedBorderAlpha; } catch (e) {}
        }
        if (bbcFlags.placedFillColor && template.document.fillColor !== bbcFlags.placedFillColor) {
            try { template.document.fillColor = bbcFlags.placedFillColor; } catch (e) {}
        }
        if (bbcFlags.placedFillAlpha !== undefined && template.document.fillAlpha !== bbcFlags.placedFillAlpha) {
            try { template.document.fillAlpha = bbcFlags.placedFillAlpha; } catch (e) {}
        }
        if (bbcFlags.placedFillColor && template.document.color !== bbcFlags.placedFillColor) {
            try { template.document.color = bbcFlags.placedFillColor; } catch (e) {}
        }
        if (bbcFlags.placedFillAlpha !== undefined && template.document.alpha !== bbcFlags.placedFillAlpha) {
            try { template.document.alpha = bbcFlags.placedFillAlpha; } catch (e) {}
        }

        const toColorNum = (col) => {
            if (typeof col === "number" && !isNaN(col)) return col;
            if (typeof col === "string" && col.length) {
                if (typeof foundry?.utils?.Color?.from === "function") {
                    try { return foundry.utils.Color.from(col).valueOf(); } catch(e){}
                }
                try { return parseInt(col.replace(/^#/, ""), 16); } catch(e){}
            }
            return undefined;
        };

        const borderNum = toColorNum(placedBorderColor);
        const borderAlphaNum = typeof placedBorderAlpha === "number" && !isNaN(placedBorderAlpha) ? placedBorderAlpha : undefined;
        const fillNum = toColorNum(placedFillColor);
        const fillAlphaNum = typeof placedFillAlpha === "number" && !isNaN(placedFillAlpha) ? placedFillAlpha : undefined;

        const applyGraphicsData = (gfx) => {
            if (!gfx) return false;
            let dirty = false;
            if (Array.isArray(gfx.geometry?.graphicsData)) {
                for (const gd of gfx.geometry.graphicsData) {
                    if (!gd) continue;
                    if (gd.lineStyle && gd.lineStyle.width > 0) {
                        if (borderNum !== undefined && gd.lineStyle.color !== borderNum) { gd.lineStyle.color = borderNum; dirty = true; }
                        if (borderAlphaNum !== undefined && gd.lineStyle.alpha !== borderAlphaNum) { gd.lineStyle.alpha = borderAlphaNum; dirty = true; }
                    }
                    if (gd.fillStyle && gd.fillStyle.alpha > 0) {
                        if (fillNum !== undefined && gd.fillStyle.color !== fillNum) { gd.fillStyle.color = fillNum; dirty = true; }
                        if (fillAlphaNum !== undefined && gd.fillStyle.alpha !== fillAlphaNum) { gd.fillStyle.alpha = fillAlphaNum; dirty = true; }
                    }
                }
                if (dirty && typeof gfx.geometry.invalidate === "function") gfx.geometry.invalidate();
            }
            const instructions = gfx.instructions ?? gfx.context?.instructions ?? gfx._instructions;
            if (Array.isArray(instructions)) {
                for (const inst of instructions) {
                    if (!inst) continue;
                    if (inst.action === "stroke" || (inst.data && inst.data.width > 0) || (inst.style && inst.style.width > 0)) {
                        const target = inst.data ?? inst.style ?? inst;
                        if (borderNum !== undefined && target.color !== borderNum) { target.color = borderNum; dirty = true; }
                        if (borderAlphaNum !== undefined && target.alpha !== borderAlphaNum) { target.alpha = borderAlphaNum; dirty = true; }
                    }
                    if (inst.action === "fill" || (inst.data && inst.data.color !== undefined && !inst.data.width) || (inst.style && inst.style.color !== undefined && !inst.style.width)) {
                        const target = inst.data ?? inst.style ?? inst;
                        if (fillNum !== undefined && target.color !== fillNum) { target.color = fillNum; dirty = true; }
                        if (fillAlphaNum !== undefined && target.alpha !== fillAlphaNum) { target.alpha = fillAlphaNum; dirty = true; }
                    }
                }
            }
            return dirty;
        };

        const targets = [template.template, template.border, template.shape, template.mesh, ...(Array.isArray(template.children) ? template.children : [])];
        for (const target of targets) {
            applyGraphicsData(target);
        }
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

        const tx = tok.x ?? tok.document?.x ?? 0;
        const ty = tok.y ?? tok.document?.y ?? 0;
        const w = tok.w ?? (tok.document?.width ? tok.document.width * size : (tok.width ? tok.width * size : size));
        const h = tok.h ?? (tok.document?.height ? tok.document.height * size : (tok.height ? tok.height * size : size));
        const centerPoint = tok.center ?? tok.document?.center ?? { x: tx + w / 2, y: ty + h / 2 };

        const points = [tx, ty, tx + w, ty, tx + w, ty + h, tx, ty + h];

        let intersection = null;
        if (typeof foundry?.utils?.lineSegmentIntersection === "function") {
            for (let i = 0; i < points.length; i += 2) {
                const p1 = { x: points[i], y: points[i + 1] };
                const p2Idx = (i + 2) >= points.length ? 0 : (i + 2);
                const p2 = { x: points[p2Idx], y: points[p2Idx + 1] };
                intersection = foundry.utils.lineSegmentIntersection(centerPoint, snappedMouse, p1, p2);
                if (intersection) break;
            }
        }

        if (!intersection) {
            const RayClass = foundry?.canvas?.geometry?.Ray ?? globalThis.Ray;
            if (RayClass) {
                const ray = new RayClass(centerPoint, snappedMouse);
                if (typeof ray.intersectSegment === "function") {
                    for (let i = 0; i < points.length; i += 2) {
                        const p1 = { x: points[i], y: points[i + 1] };
                        const p2Idx = (i + 2) >= points.length ? 0 : (i + 2);
                        const p2 = { x: points[p2Idx], y: points[p2Idx + 1] };
                        intersection = ray.intersectSegment([p1.x, p1.y, p2.x, p2.y]);
                        if (intersection) break;
                    }
                }
            }
        }

        if (!intersection) {
            const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
            intersection = {
                x: clamp(snappedMouse.x, tx, tx + w),
                y: clamp(snappedMouse.y, ty, ty + h)
            };
            if (intersection.x === snappedMouse.x && intersection.y === snappedMouse.y) {
                const dx = snappedMouse.x - centerPoint.x;
                const dy = snappedMouse.y - centerPoint.y;
                if (Math.abs(dx) > Math.abs(dy)) {
                    intersection.x = dx >= 0 ? tx + w : tx;
                } else {
                    intersection.y = dy >= 0 ? ty + h : ty;
                }
            }
        }

        const snappedIntersection = snapPt(intersection, edgeMidpointMode);

        let dragAngle = Math.atan2(snappedMouse.y - centerPoint.y, snappedMouse.x - centerPoint.x) * (180 / Math.PI);
        if (dragAngle < 0) dragAngle += 360;
        const direction = dragAngle % 360;

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
