import { systemAdapter } from "../system/index.js";
import { log } from "../../lib/logger.js";
import { Token, Ray, clearHighlightLayer } from "../../lib/compat.js";
import { TokenGeometry } from "../../lib/tokenGeometry.js";
import { MODULE_ID } from "../../lib/constants.js";
import { DEFAULT_AUTOREC_ENTRY, autorecManager } from "../../autorec/autorecManager.js";
import { CrosshairConfiguration } from "../../autorec/CrosshairConfiguration.js";
import { notify } from "../../lib/notifier.js";
import { runConcurrentScript, activePlacementTracker, shouldStickToToken } from "../../crosshair/util.js";
import { PendingPlacementSession } from "./pendingPlacementSession.js";
import { PixiGraphicsStyler } from "./pixiGraphicsStyler.js";
/**
 * Base abstract class for Foundry VTT version-specific adapters.
 */
export class BaseFoundryVTTAdapter {
    /**
     * Initialize the base Foundry VTT adapter.
     */
    constructor() {
        this.version = 0;
        this.pendingPlacements = new Map();
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
     * Check whether the active Foundry version supports rotating a specific shape type.
     * Defaults to true, overridden by version adapters (e.g. V13 MeasuredTemplate rects).
     * @param {string} shapeType - The shape type identifier ("circle", "cone", "ray", "rect", "square")
     * @returns {boolean} True if the shape type can be rotated in this Foundry version
     */
    supportsShapeRotation(shapeType) {
        return true;
    }

    /**
     * Extract normalized calling item and activity context from a Foundry document.
     * Enforces single concrete Document input contract.
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
     * Normalizes polymorphic entry input once at public entry boundary.
     * @param {Document|PlaceableObject} target - The template or region document or placeable
     * @param {Map<string, Object>} entries - Registered autorec entries map
     * @returns {Object|null} The matching crosshair configuration entry or null
     */
    matchAutorecEntry(target, entries) {
        if (!target || !entries) return null;
        const doc = target.document ?? target;
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
                const defaultEntry = entries.get("DEFAULT") ?? {};
                const hasSpecificStick = entry.stickToToken !== undefined && entry.stickToToken !== null && entry.stickToToken !== "default";
                const stickToToken = hasSpecificStick ? entry.stickToToken : (defaultEntry.stickToToken ?? "default");
                baseEntry = {
                    ...defaultEntry,
                    ...entry,
                    stickToToken,
                    item: context.item,
                    activity: context.activity
                };
                break;
            }
        }

        if (!baseEntry) {
            const defaultEntry = entries.get("DEFAULT");
            if (defaultEntry?.enabled) {
                const systemDefault = systemAdapter.getSystemDefault(context);
                const systemAttach = typeof systemDefault === "boolean"
                    ? (systemDefault ? "true" : "false")
                    : (systemDefault?.options?.attachMode ?? systemDefault?.stickToToken);
                const stickToToken = (defaultEntry.stickToToken && defaultEntry.stickToToken !== "default")
                    ? defaultEntry.stickToToken
                    : (systemAttach ?? defaultEntry.stickToToken ?? "default");
                baseEntry = {
                    ...defaultEntry,
                    itemName: context.itemName,
                    stickToToken,
                    item: context.item,
                    activity: context.activity
                };
            }
        }

        const itemConfig = typeof context.item?.getFlag === "function" ? context.item.getFlag(MODULE_ID, "customConfig") : null;
        const activityConfig = Boolean(context.activityId) && typeof context.item?.getFlag === "function"
            ? (context.item.getFlag(MODULE_ID, "activityConfigs")?.[context.activityId] ?? null)
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
        try {
            placeable.interactive = false;
            placeable.interactiveChildren = false;
            if ("eventMode" in placeable) placeable.eventMode = "none";
        } catch (e) {}
        const hideContainers = (obj) => {
            if (!obj) return;
            const isSeqCrosshair = obj.constructor?.name === "CrosshairsPlaceable" || Boolean(obj.crosshair) || Boolean(obj.tag && String(obj.tag).includes("sequencer-crosshair"));
            if (isSeqCrosshair) return;

            obj.visible = false;
            obj.renderable = false;
            obj.alpha = 0;
            if (obj.template) {
                obj.template.visible = false;
                obj.template.renderable = false;
                obj.template.alpha = 0;
            }
            if (obj.ruler) {
                obj.ruler.visible = false;
                obj.ruler.renderable = false;
                try { obj.ruler.text = ""; } catch (e) {}
            }
            if (obj.controlIcon) {
                obj.controlIcon.visible = false;
            }
            if (obj.mesh) {
                obj.mesh.visible = false;
                obj.mesh.renderable = false;
                obj.mesh.alpha = 0;
            }
            if (obj.shape) {
                obj.shape.visible = false;
                obj.shape.renderable = false;
                obj.shape.alpha = 0;
            }
            if (obj.border) {
                obj.border.visible = false;
                obj.border.renderable = false;
                obj.border.alpha = 0;
            }
            if (Array.isArray(obj.children)) {
                for (const child of obj.children) {
                    if (child) {
                        child.visible = false;
                        child.renderable = false;
                        child.alpha = 0;
                    }
                }
            }

            const hId = obj.highlightId ?? obj.id ?? "preview";
            clearHighlightLayer(hId);
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
     * Safely apply render flags onto a PlaceableObject's renderFlags manager.
     * Prevents system or placeable errors if specific flags (such as refreshShape) are not defined as supported RenderFlag options on that placeable.
     * @param {PlaceableObject} tmpl - Placeable graphic object containing renderFlags
     * @param {Object} flags - Key-value pair object of desired render flags (`{ [flagName]: boolean }`)
     * @returns {void}
     */
    _safeSetRenderFlags(tmpl, flags) {
        if (!tmpl?.renderFlags || typeof tmpl.renderFlags.set !== "function" || !flags || typeof flags !== "object") return;

        try {
            tmpl.renderFlags.set(flags);
        } catch (err) {
            for (const [flagName, val] of Object.entries(flags)) {
                try {
                    tmpl.renderFlags.set({ [flagName]: val });
                } catch (e) {
                }
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

        if (placeable.renderFlags && typeof placeable.renderFlags.clear === "function") {
            try { placeable.renderFlags.clear(); } catch (e) {}
        }
        if (typeof canvas?.app?.ticker?.remove === "function") {
            try { canvas.app.ticker.remove(placeable.applyRenderFlags, placeable); } catch (e) {}
        }

        try {
            if (typeof canvas?.templates?.deactivate === "function") canvas.templates.deactivate();
            if (typeof canvas?.regions?.deactivate === "function") canvas.regions.deactivate();
        } catch (e) {}

        const stages = [canvas?.stage, canvas?.app?.stage, canvas?.templates, canvas?.templates?.preview, canvas?.regions, canvas?.regions?.preview].filter(Boolean);
        const eventNames = ["pointermove", "mousemove", "pointerdown", "mousedown", "pointerup", "mouseup", "click", "rightclick"];
        for (const stg of stages) {
            if (typeof stg.listeners === "function" && typeof stg.off === "function") {
                for (const evName of eventNames) {
                    try {
                        const lns = stg.listeners(evName);
                        if (Array.isArray(lns)) {
                            for (const fn of lns) {
                                if (fn && (fn.context === placeable || (fn.name && (fn.name.includes("mousemove") || fn.name.includes("pointermove") || fn.name.includes("pointerdown") || fn.name.includes("mousedown") || fn.name.includes("click") || fn.name.includes("preview") || fn.name.includes("template") || fn.name.includes("region"))))) {
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
        try {
            if (typeof placeable.destroy === "function") {
                placeable.destroy({ children: true });
            }
        } catch (e) {}

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
        if (placeable.document?.id) return false;
        return Boolean(placeable.isPreview ?? true);
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
     * @abstract
     * @returns {string[]} Base placeable type names (`e.g. ["MeasuredTemplate"]`)
     */
    get supportedBasePlaceables() {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement supportedBasePlaceables getter.");
    }

    /**
     * Return supported document creation type names (`preCreate`/`create` hook suffixes) for this Foundry VTT generation.
     * @abstract
     * @returns {string[]} Document type names (`e.g. ["MeasuredTemplate"]`)
     */
    get supportedDocumentTypes() {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement supportedDocumentTypes getter.");
    }

    /**
     * Generate structured placement hook descriptors across all supported placeable and document types.
     * Abstract method quarantined into version-specific subclasses (`FoundryVTTV13Adapter`, `FoundryVTTV14Adapter`).
     * @abstract
     * @param {Object} callbacks - Placement hook callbacks (`{ onDrawPreview, onPreCreate, onCreate }`)
     * @param {Object} [sysAdapter=systemAdapter] - Active System Adapter instance
     * @returns {Array<{event: string, handler: Function, category: string, targetName: string}>} Array of generated hook descriptor objects
     */
    generatePlacementHooks(callbacks, sysAdapter = systemAdapter) {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement generatePlacementHooks(callbacks, sysAdapter).");
    }

    /**
     * Register placement hooks across all placeable and document types for the active version.
     * Delegates to the version-specific `generatePlacementHooks` subclass implementation to get structured hook descriptors,
     * allowing system adapter customization, and then registers each hook using `Hooks.on`.
     * @param {Object} callbacks - Placement hook callbacks (`{ onDrawPreview, onPreCreate, onCreate }`)
     * @param {Object} [sysAdapter=systemAdapter] - Active System Adapter instance
     * @returns {Array<{event: string, handler: Function, category: string, targetName: string}>} Array of registered hook descriptor objects
     */
    registerPlacementHooks(callbacks, sysAdapter = systemAdapter) {
        const hooks = this.generatePlacementHooks(callbacks, sysAdapter);
        for (const hook of hooks) {
            if (hook?.event && typeof hook.handler === "function") {
                Hooks.on(hook.event, hook.handler);
            }
        }
        return hooks;
    }

    /**
     * Handle refresh hooks for placeables (`MeasuredTemplate` or `Region`), syncing colors/alpha from bbc flags onto PIXI graphics.
     * @param {PlaceableObject} template - Placeable object on canvas
     * @returns {void}
     */
    handleMeasuredTemplateRefresh(template) {
        PixiGraphicsStyler.applyPlacedStyling(template, this.isPreview(template));
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
        return { x, y, direction, type: config.originalType ?? config.type, originalType: config.originalType };
    }

    /**
     * Create an unpersisted preview placeable object for template/region canvas rendering.
     * @param {Object} [config={}] - Placement configuration
     * @returns {PlaceableObject|null} Created placeable or null
     */
    createUnpersistedPreviewPlaceable(config = {}) {
        if (!canvas?.scene) return null;
        try {
            const docClass = CONFIG?.MeasuredTemplate?.documentClass;
            const objClass = CONFIG?.MeasuredTemplate?.objectClass;
            if (!docClass || !objClass) return null;

            const shapeType = config.type ?? config.t ?? "circle";
            const isRect = shapeType === "rect" || shapeType === "square";
            const data = {
                t: isRect ? "rect" : (shapeType === "cone" ? "cone" : (shapeType === "ray" ? "ray" : "circle")),
                user: game?.user?.id,
                x: config.x ?? 0,
                y: config.y ?? 0,
                distance: config.distance ?? 5,
                width: config.width ?? (isRect ? (config.distance ?? 5) : 5),
                angle: config.angle ?? 53.13,
                direction: config.direction ?? 0,
                fillColor: config.fillColor ?? "#000000",
                borderColor: config.borderColor ?? "#ffffff"
            };

            const doc = new docClass(data, { parent: canvas.scene });
            const placeable = new objClass(doc);
            this.hidePreview(placeable);
            return placeable;
        } catch (e) {
            log.debug("createUnpersistedPreviewPlaceable | Exception creating preview placeable:", e);
            return null;
        }
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
     * Refresh the rendering and grid highlights of a preview template or region.
     * Prevents the native template borders/shapes from flashing visible on rendering cycles.
     * @param {PlaceableObject} tmpl - The placeable template or region preview
     * @param {number} direction - The current direction/rotation in degrees
     * @returns {void}
     */
    refreshTemplateHighlights(tmpl, direction) {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement refreshTemplateHighlights(tmpl, direction).");
    }

    /**
     * Resume deferred document creation when an interactive Sequencer crosshair placement resolves.
     * @param {Scene} scene - Target Canvas Scene
     * @param {Object} deferredData - Initial raw document creation data (`doc.toObject()`)
     * @param {Object} coords - Resolved placement coordinates from Sequencer
     * @returns {Promise<void>} Resolves when deferred document creation completes
     */
    async createDeferredDocument(scene, deferredData, coords, documentName, config = {}) {
        if (!scene || !deferredData || !coords) return;
        const cloned = foundry.utils.deepClone(deferredData);
        const { id, _id, _source, ...data } = cloned;

        const docName = this._getDeferredDocumentName(data, documentName);
        await this._applyDeferredCoordinates(data, coords, docName);
        this.applyDocumentPlacement(data, coords, config, data);

        if (Array.isArray(data.shapes)) {
            data.shapes = data.shapes.map(s => {
                const shapeObj = typeof s?.toObject === "function" ? s.toObject() : s;
                const { id: sId, _id: sUnderscoreId, _source: sSource, ...cleanShape } = shapeObj;
                return cleanShape;
            });
        }

        log.debug(`Adapter.createDeferredDocument | Deferred ${docName} payload:`, {
            docName,
            resolvedCoords: coords,
            deferredCreatePayload: data
        });

        try {
            await scene.createEmbeddedDocuments(docName, [data]);
        } catch (err) {
            log.error(`Adapter.createDeferredDocument | Failed to create deferred ${docName} document:`, err);
        }
    }

    _getDeferredDocumentName(data, documentName) {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement _getDeferredDocumentName(data, documentName).");
    }

    _applyDeferredCoordinates(data, coords, docName) {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement _applyDeferredCoordinates(data, coords, docName).");
    }

    snapCoordinates(x, y, mode = "all") {
        if (!canvas?.grid || mode === false || mode === "none" || mode === 0 || mode === "0") return { x, y };

        const size = canvas.grid.size ?? 100;

        if (mode !== "center" && mode !== "corner" && mode !== "corners") {
            const numMode = typeof mode === "number" ? mode : this._getGridSnapMode(mode);
            if (numMode !== 0) {
                const snapped = this._snapPoint(x, y, numMode);
                if (snapped) return snapped;
            }
        }

        if (mode === "center" || mode === 1) {
            const center = this._getGridCenterPoint(x, y);
            if (center) return center;
        }

        if (mode === "corner" || mode === "corners" || mode === 2) {
            const sx = Math.round(x / size) * size;
            const sy = Math.round(y / size) * size;
            return { x: sx, y: sy };
        }

        if (mode === "all" || mode === true || mode === "default" || mode === "edges" || mode === "edge" || typeof mode === "number") {
            const snapped = this._snapPoint(x, y, 1);
            if (snapped) return snapped;

            // Fallback: manual half-grid snap
            const half = size / 2;
            const sx = Math.round(x / half) * half;
            const sy = Math.round(y / half) * half;
            return { x: sx, y: sy };
        }

        return { x, y };
    }

    _getGridSnapMode(snapToGrid) {
        if (snapToGrid === false || snapToGrid === "none" || snapToGrid === 0 || snapToGrid === "0") return 0;
        if (typeof snapToGrid === "number") return snapToGrid;
        if (snapToGrid === "center") return CONST?.GRID_SNAPPING_MODES?.CENTER ?? 1;
        if (snapToGrid === "corner" || snapToGrid === "vertex" || snapToGrid === "corners") return CONST?.GRID_SNAPPING_MODES?.VERTEX ?? 2;
        if (snapToGrid === "side" || snapToGrid === "edge" || snapToGrid === "edges") return CONST?.GRID_SNAPPING_MODES?.SIDE_MIDPOINT ?? CONST?.GRID_SNAPPING_MODES?.SIDE ?? 4;
        return (CONST?.GRID_SNAPPING_MODES?.CENTER ?? 1) |
               (CONST?.GRID_SNAPPING_MODES?.VERTEX ?? 2) |
               (CONST?.GRID_SNAPPING_MODES?.SIDE_MIDPOINT ?? CONST?.GRID_SNAPPING_MODES?.SIDE ?? 4);
    }

    _snapPoint(x, y, numMode) {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement _snapPoint(x, y, numMode).");
    }

    _getGridCenterPoint(x, y) {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement _getGridCenterPoint(x, y).");
    }

    /**
     * Resolve placement anchor coordinates {x, y, direction} on a token's edge toward a click coordinate.
     * Takes only a normalized Token object and {x, y} click coordinates.
     * Implements 1-to-1 the exact algorithm from Sequencer 4.2.2 (#handleLockedEdge in CrosshairsPlaceable.js).
     * @param {Token} tok - The source token object to anchor placement against
     * @param {{x?: number, y?: number}} [clickCoords={}] - Optional mouse click coordinates
     * @returns {{x: number, y: number, direction: number}} Resolved anchor placement coordinates and facing direction
     */
    resolveAnchorPlacement(targetTok, clickCoords = {}) {
        const tok = this.toToken(targetTok);
        return TokenGeometry.resolveAnchorPlacement(tok, clickCoords);
    }

    /**
     * Return template pixel multiplier factor and gridUnits mode for Sequencer effects.
     * @returns {{factor: number, gridUnits: boolean}} Template pixel scaling factor and grid units flag
     */
    getTemplatePixelFactor() {
        return { factor: 1, gridUnits: false };
    }

    /**
     * Check if the current user is the author or owner of the document or preview.
     * Normalizes polymorphic entry input once at public entry boundary.
     * @param {Document|PlaceableObject} target - Template or Region document or placeable
     * @returns {boolean} True if the current user owns or authored the document
     */
    isOwner(target) {
        if (!target) return true;
        const doc = target.document ?? target;
        if (!doc.id) return true; // Preview templates on canvas are always local to the drawing client
        const authorVal = doc.author ?? doc.user;
        const userId = typeof authorVal === "string" ? authorVal : (authorVal?.id ?? game?.user?.id);
        return userId === game?.user?.id;
    }

    /**
     * Normalize an item or placeable object into a canonical Token instance.
     * Normalizes single concrete input type before passing down to placement helpers.
     * @param {Token|Item|Actor|Object|null} target - Candidate object to normalize
     * @returns {Token|null} Canonical Token object or null
     */
    toToken(target) {
        if (!target) return null;
        if (target instanceof Token) return target;
        if (target.object instanceof Token) return target.object;
        return target;
    }

    /**
     * Handle preview drawing (v13 drawMeasuredTemplate / v14 drawRegion).
     * @param {PlaceableObject} placeable - Canvas PlaceableObject representing the preview template or region
     * @returns {Promise<void>} Resolves when preview handling is complete
     */
    async handleDrawPreview(placeable) {
        if (!placeable || !placeable.document) return;
        const doc = placeable.document;
        const isPreview = this.isPreview(placeable);

        //     docId: doc.id,
        //     isPreview,
        //     isOwner: this.isOwner(doc),
        //     placeable
        // });

        if (!isPreview || !this.isOwner(doc)) {
            return;
        }

        const entry = autorecManager.getEntryForDocument(doc);
        if (!entry) {
            return;
        }

        //     placeableClass: placeable?.constructor?.name,
        //     docData: typeof doc.toObject === "function" ? doc.toObject() : doc,
        //     docFlags: doc.flags
        // });

        // 1. Immediately hide the Foundry template/region preview graphic completely so custom Sequencer visuals take over
        this.hidePreview(placeable);

        // 2. Resolve token and item context deterministically through version adapter
        const callingContext = this.extractCallingContext(doc);
        const item = entry.item ?? callingContext.item;
        const rawToken = item?.parent?.getActiveTokens?.()[0] ?? canvas?.tokens?.controlled?.[0];
        const token = this.toToken(rawToken);
        const actor = token?.actor ?? item?.actor;


        const placementKey = `${entry.itemName}_${game?.user?.id}`;
        const entryConfig = typeof entry.handler === "object" && entry.handler !== null ? entry.handler : entry;
        const pending = {
            itemName: entry.itemName,
            resolved: false,
            cancelled: false,
            coords: null,
            config: entryConfig,
            placeable: placeable
        };
        this.pendingPlacements.set(placementKey, pending);

        const context = new PendingPlacementSession(this, placementKey, pending, doc, placeable);

        try {
            // 3. Auto-detect template properties and assemble sequence config
            const detected = this.detectProperties(doc);
            const autoConfig = {
                ...detected,
                context,
                icon: doc.item?.img ?? doc.flags?.['midi-qol']?.itemImg,
                item,
                actor,
                token,
                scope: { item, actor, token, doc }
            };

            const mergedConfig = {
                ...autoConfig,
                ...entryConfig,
                context: autoConfig.context,
                scope: autoConfig.scope
            };

            if (mergedConfig.concurrentCode) {
                await runConcurrentScript(token, mergedConfig, null);
            }

            if (typeof entry.handler === "function") {
                await entry.handler(token, mergedConfig);
            } else {
                const explicitType = entryConfig.type;
                const isKnownType = ["circle", "cone", "ray", "square", "rect"].includes(String(explicitType ?? "").toLowerCase());
                const crosshairType = isKnownType
                    ? (String(explicitType).toLowerCase() === "rect" ? "square" : String(explicitType).toLowerCase())
                    : (detected.type ?? "circle");
                const { crosshair } = await import("../../crosshair/index.js");
                const builder = crosshair[crosshairType] ?? crosshair.circle;

                const shapeFileKey = `${crosshairType}File`;
                const shapeSpecificFile = entryConfig[shapeFileKey]
                    ?? (typeof entryConfig.file === "string" && entryConfig.file.includes(crosshairType) ? entryConfig.file : null);

                const finalConfig = {
                    ...mergedConfig,
                    type: crosshairType,
                    file: shapeSpecificFile ?? mergedConfig.file
                };

                const initialDims = {
                    distance: finalConfig.distance ?? detected.distance,
                    width: finalConfig.width ?? detected.width,
                    radius: finalConfig.radius ?? detected.radius,
                    gridUnits: Boolean(finalConfig.gridUnits ?? true)
                };
                activePlacementTracker.dimensions = initialDims;
                activePlacementTracker.placeable = placeable;
                activePlacementTracker.config = finalConfig;
                activePlacementTracker.sticky = Boolean(finalConfig.stickToToken);

                await builder.play(placeable, finalConfig);
            }

        } catch (err) {
            const msg = typeof err === "string" ? err : (err?.message ?? "Failed to play Sequencer crosshair effect");
            log.error(`BaseFoundryVTTAdapter.handleDrawPreview | Error running sequencer sequence for "${entry.itemName}":`, err);
            notify.error(msg);
            pending.cancelled = true;
            pending.resolved = true;
        }
    }

    /**
     * Handle document preCreate (v13 preCreateMeasuredTemplate / v14 preCreateRegion).
     * Normalizes polymorphic entry input once at public entry boundary.
     * @param {Document|PlaceableObject} target - Template or Region document or placeable being created
     * @param {Object} _data - Initial document creation data
     * @param {Object} _options - Document creation options
     * @param {string} userId - ID of the user creating the document
     * @returns {boolean} True to proceed with normal creation, false to abort or defer
     */
    handlePreCreate(target, _data, _options, userId) {
        if (!target) return true;
        const doc = target.document ?? target;

        if (userId !== game?.user?.id) {
            return true;
        }

        let entry = autorecManager.getEntryForDocument(doc);
        let placementKey = null;
        let pending = null;

        if (entry) {
            placementKey = `${entry.itemName}_${game?.user?.id}`;
            pending = this.pendingPlacements.get(placementKey);
        } else {
            // Fallback: match any active uncancelled pending placement for the local user
            for (const [key, val] of this.pendingPlacements.entries()) {
                if (key.endsWith(`_${game?.user?.id}`) && !val.cancelled) {
                    pending = val;
                    placementKey = key;
                    entry = { itemName: val.itemName, handler: val.config };
                    break;
                }
            }
        }


        if (!entry || !pending) {
            return true;
        }

        // If the sequencer sequence was right-click cancelled, abort placement
        if (pending.cancelled) {
            this.pendingPlacements.delete(placementKey);
            return false;
        }

        // If placement sequence has resolved with coordinates, apply placement onto document payload
        if (pending.resolved && pending.coords) {
            this.applyDocumentPlacement(doc, pending.coords, pending.config, _data);
            if (pending.placeable && typeof this.dismissPreview === "function") {
                this.dismissPreview(pending.placeable);
            }
            this.pendingPlacements.delete(placementKey);
            return true;
        }

        // If sequence is still interactive/running, defer creation until sequence resolves
        pending.deferredCreateData = typeof doc.toObject === "function" ? doc.toObject() : doc;
        pending.documentName = doc.documentName;
        return false;
    }

    /**
     * Handle document post-creation hook (v13 createMeasuredTemplate / v14 createRegion).
     * Executes user-configured post-placement Javascript inside a try/catch block with standard context variables.
     * Normalizes polymorphic entry input once at public entry boundary.
     * @param {Document|PlaceableObject} target - Template or Region document or placeable that was created
     * @param {Object} _options - Document creation options
     * @param {string} userId - ID of the user creating the document
     * @returns {Promise<void>} Resolves when post-placement execution completes
     */
    async handleCreateDocument(target, _options, userId) {
        if (!target || userId !== game?.user?.id) return;
        const doc = target.document ?? target;

        const flagsConfig = doc.flags?.bbc;
        const entry = autorecManager.getEntryForDocument(doc);
        const config = {
            ...entry,
            ...flagsConfig
        };

        const code = config.postPlacementCode;
        if (!code || typeof code !== "string" || !code.trim()) return;

        const callingContext = this.extractCallingContext(doc);
        const item = config.item ?? callingContext.item;
        const rawToken = item?.parent?.getActiveTokens?.()[0] ?? canvas?.tokens?.controlled?.[0];
        const token = this.toToken(rawToken);
        const actor = token?.actor ?? item?.actor;
        const scope = { doc, token, actor, item, config };

        try {
            const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
            const fn = new AsyncFunction(
                "doc",
                "token",
                "actor",
                "item",
                "scope",
                "config",
                "canvas",
                "game",
                code
            );
            await fn(doc, token, actor, item, scope, config, typeof canvas !== "undefined" ? canvas : undefined, typeof game !== "undefined" ? game : undefined);
        } catch (e) {
            log.error(`BaseFoundryVTTAdapter.handleCreateDocument | Error executing post-placement script for ${doc.documentName}:`, e);
        }
    }
}
