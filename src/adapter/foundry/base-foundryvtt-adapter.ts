import { systemAdapter, BaseSystemAdapter } from "../system/index.js";
import { log, notify } from "../../lib/logger.js";
import { TokenGeometry } from "../../lib/tokenGeometry.js";
import { MODULE_ID } from "../../lib/constants.js";
import { DEFAULT_AUTOREC_ENTRY, autorecManager } from "../../autorec/autorecManager.js";
import { CrosshairConfiguration } from "../../autorec/CrosshairConfiguration.js";
import { getUserColor } from "../../lib/utils.js";
import { runConcurrentScript, activePlacementTracker, shouldStickToToken } from "../../crosshair/util.js";
import { PendingPlacementSession } from "./pendingPlacementSession.js";
import { PixiGraphicsStyler } from "./pixiGraphicsStyler.js";
import { ScriptRunner } from "../../lib/scriptRunner.js";
import { PersistedAnimationManager } from "../../crosshair/persistedAnimationManager.js";
import { canvasAdapter } from "../canvas/index.js";
/**
 * Base abstract class for Foundry VTT version-specific adapters.
 */
export class BaseFoundryVTTAdapter {
    version: number;
    pendingPlacements: Map<string, PendingPlacementSession>;

    /**
     * Initialize the base Foundry VTT adapter.
     */
    constructor() {
        this.version = 0;
        this.pendingPlacements = new Map();
        this._patchDeprecations();
    }

    /**
     * Replaced at runtime by initializeFoundryAdapter on prototype.
     */
    initialize(): any {
        return this;
    }

    /**
     * Hook for version-specific adapter deprecation patching. Default NOP.
     * @protected
     * @returns {void}
     */
    _patchDeprecations() {}

    /**
     * Reference to the Foundry VTT Token placeable class.
     * @type {typeof foundry.canvas.placeables.Token}
     */
    get Token() {
        return foundry.canvas.placeables.Token.implementation;
    }

    /**
     * Reference to the Foundry VTT MeasuredTemplate placeable class.
     * @type {typeof foundry.canvas.placeables.MeasuredTemplate}
     */
    get MeasuredTemplate() {
        return foundry.canvas.placeables.MeasuredTemplate;
    }

    /**
     * Reference to the Foundry VTT Region placeable class.
     * @type {typeof foundry.canvas.placeables.Region}
     */
    get Region() {
        return foundry.canvas.placeables.Region;
    }

    /**
     * Reference to the Foundry VTT Ray geometry class.
     * @type {typeof foundry.canvas.geometry.Ray}
     */
    get Ray() {
        return foundry.canvas.geometry.Ray;
    }

    /**
     * Reference to Foundry's canvas PreciseText container.
     * @type {typeof foundry.canvas.containers.PreciseText}
     */
    get PreciseText() {
        return foundry.canvas.containers.PreciseText;
    }

    /**
     * Construct a Ray instance between two coordinate points.
     * @param {{x: number, y: number}} origin - Ray origin point
     * @param {{x: number, y: number}} target - Ray target point
     * @returns {Ray|null} Instantiated Ray object or null
     */
    createRay(origin: any, target: any) {
        const RayClass = this.Ray;
        return RayClass ? new RayClass(origin, target) : null;
    }

    /**
     * Construct a Ray instance from origin coordinates, angle in radians, and distance.
     * @param {number} x - Origin X
     * @param {number} y - Origin Y
     * @param {number} rad - Angle in radians
     * @param {number} dist - Ray distance
     * @returns {Ray|null} Instantiated Ray object or null
     */
    createRayFromAngle(x: any, y: any, rad: any, dist: any) {
        const RayClass = this.Ray;
        return RayClass?.fromAngle ? RayClass.fromAngle(x, y, rad, dist) : null;
    }

    /**
     * Active canvas adapter instance.
     * @type {BaseCanvasAdapter}
     */
    get canvasAdapter() {
        return canvasAdapter;
    }

    /**
     * Adds the specified grid highlight layer across Foundry canvas versions.
     * @param {string} id - The identifier of the highlight layer to add.
     * @returns {void}
     */
    addHighlightLayer(id: any) {
        return this.canvasAdapter.addHighlightLayer(id);
    }

    /**
     * Retrieves the specified grid highlight layer across Foundry canvas versions.
     * @param {string} id - The identifier of the highlight layer to get.
     * @returns {Object|null} The highlight layer or null
     */
    getHighlightLayer(id: any) {
        return this.canvasAdapter.getHighlightLayer(id);
    }

    /**
     * Clears the specified grid highlight layer across Foundry canvas versions.
     * @param {string} id - The identifier of the highlight layer to clear.
     * @returns {void}
     */
    clearHighlightLayer(id: any) {
        return this.canvasAdapter.clearHighlightLayer(id);
    }

    /**
     * Destroys the specified grid highlight layer across Foundry canvas versions.
     * @param {string} id - The identifier of the highlight layer to destroy.
     * @returns {void}
     */
    destroyHighlightLayer(id: any) {
        return this.canvasAdapter.destroyHighlightLayer(id);
    }

    /**
     * Highlights a grid position on the canvas across Foundry versions.
     * @param {string} id - Identifier of the highlight layer
     * @param {Object} [options={}] - Highlight parameters (x, y, color, border, shape)
     * @returns {void}
     */
    highlightPosition(id: string, options: any = {}): void {
        return this.canvasAdapter.highlightPosition(id, options);
    }

    /**
     * Safely clears region layer highlights across versions.
     * @returns {void}
     */
    clearRegionsHighlight() {
        return this.canvasAdapter.clearRegionsHighlight();
    }

    /**
     * Deactivates templates and regions placeable layers if active.
     * @returns {void}
     */
    deactivatePlaceablesLayers() {
        return this.canvasAdapter.deactivatePlaceablesLayers();
    }

    /**
     * Safely saves text or JSON string data to a file across Foundry VTT API versions.
     * Checks namespaced foundry.utils.saveDataToFile first to prevent global accessor deprecation warnings.
     * @param {string|Object} data - String payload or object to save
     * @param {string} [type="application/json"] - MIME type (e.g. "text/json")
     * @param {string} [filename="export.json"] - Output filename
     * @returns {boolean} True if native Foundry save helper handled the request
     */
    saveDataToFile(data: any, type = "application/json", filename = "export.json") {
        const rawFilename = filename ?? "export.json";
        const trimmedFilename = String(rawFilename).replace(/[/\\]/g, "_").trim();
        const cleanFilename = trimmedFilename.length > 0 ? trimmedFilename : "export.json";
        const rawType = type ?? "application/json";
        const trimmedType = String(rawType).trim();
        const cleanType = trimmedType.length > 0 ? trimmedType : "application/json";
        const cleanData = typeof data === "string" ? data : JSON.stringify(data ?? {});

        try {
            foundry.utils.saveDataToFile(cleanData, cleanType, cleanFilename);
            log.debug(`BaseFoundryVTTAdapter.saveDataToFile | File "${cleanFilename}" saved via foundry.utils.saveDataToFile.`);
            return true;
        } catch (err) {
            log.warn(`BaseFoundryVTTAdapter.saveDataToFile | Error calling foundry.utils.saveDataToFile for "${cleanFilename}".`, err);
            return false;
        }
    }

    /**
     * Reference to Foundry's mergeObject utility.
     * @param {Object} original - Target object
     * @param {Object} other - Source object
     * @param {Object} [options={}] - Merge options
     * @returns {Object} Merged object
     */
    mergeObject(original: any, other: any = {}, options: any = {}): any {
        return foundry.utils.mergeObject(original, other, options);
    }

    /**
     * Reference to Foundry's deepClone utility.
     * @param {*} obj - Source object to clone
     * @returns {*} Cloned object
     */
    deepClone(obj: any) {
        return foundry.utils.deepClone(obj);
    }

    /**
     * Synchronously resolves a document from a UUID in Foundry V13+ baseline.
     * @param {string} uuid - The document UUID
     * @returns {Document|null} The resolved document or null
     */
    fromUuidSync(uuid: string, options: any = {}): any {
        return foundry.utils.fromUuidSync(uuid, options);
    }

    /**
     * Generates a random alphanumeric identifier across Foundry versions.
     * @param {number} [length=16] - Identifier length
     * @returns {string} Generated identifier
     */
    randomID(length = 16) {
        return foundry.utils.randomID(length);
    }

    /**
     * Preload Handlebars templates across Foundry generations.
     * @abstract
     * @param {string[]} paths - Array of template paths to preload
     * @returns {Promise<Function[]>}
     */
    async loadTemplates(paths: any): Promise<any> {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement loadTemplates(paths).");
    }

    /**
     * Calculates the intersection point of two line segments across Foundry versions.
     * @param {Point} a - First endpoint of segment 1
     * @param {Point} b - Second endpoint of segment 1
     * @param {Point} c - First endpoint of segment 2
     * @param {Point} d - Second endpoint of segment 2
     * @returns {Point|null} Intersection point or null
     */
    lineSegmentIntersection(a: any, b: any, c: any, d: any) {
        return foundry.utils.lineSegmentIntersection(a, b, c, d);
    }

    /**
     * Reference to Foundry's Color utility class.
     * @type {typeof foundry.utils.Color}
     */
    get Color() {
        return foundry.utils.Color;
    }

    /**
     * Safely parses or converts a color value to a Color representation or numeric value.
     * @param {string|number|Color} col - Color input
     * @param {number|null} [fallback=null] - Fallback value
     * @returns {Color|number|null} Color instance, numeric value, or fallback
     */
    parseColor(col: any, fallback: any = null): any {
        if (col === null || col === undefined || col === "") return fallback;
        if (typeof col === "number" && !Number.isNaN(col)) return col;
        const ColorClass = this.Color;
        if (ColorClass?.from) {
            try {
                const c = ColorClass.from(col);
                if (c) return c;
            } catch (e) {}
        }
        if (typeof col === "string" && col.length) {
            try {
                const parsed = parseInt(col.replace(/^#/, ""), 16);
                if (!Number.isNaN(parsed)) return parsed;
            } catch (e) {}
        }
        return fallback;
    }

    /**
     * Reference to the active canvas scene.
     * @type {Scene|null}
     */
    get scene() {
        return this.canvasAdapter.scene;
    }

    /**
     * Current canvas mouse position.
     * @type {{x: number, y: number}|null}
     */
    get mousePosition() {
        return this.canvasAdapter.mousePosition;
    }

    /**
     * Canvas grid size in pixels.
     * @type {number}
     */
    get gridSize() {
        return this.canvasAdapter.gridSize;
    }

    /**
     * Canvas grid horizontal size in pixels.
     * @type {number}
     */
    get gridSizeX() {
        return this.canvasAdapter.gridSizeX;
    }

    /**
     * Canvas grid vertical size in pixels.
     * @type {number}
     */
    get gridSizeY() {
        return this.canvasAdapter.gridSizeY;
    }

    /**
     * Canvas grid distance per cell.
     * @type {number}
     */
    get gridDistance() {
        return this.canvasAdapter.gridDistance;
    }

    /**
     * Canvas grid units string.
     * @type {string}
     */
    get gridUnits() {
        return this.canvasAdapter.gridUnits;
    }

    /**
     * Pixels per distance unit (e.g. pixels per foot).
     * @type {number}
     */
    get pixelsPerDistance() {
        return this.canvasAdapter.pixelsPerDistance;
    }

    /**
     * Canvas dimensions rectangle.
     * @type {Rectangle|null}
     */
    get dimensionsRect() {
        return this.canvasAdapter.dimensionsRect;
    }

    /**
     * Tokens currently controlled by the active user on canvas.
     * @type {Array<Token>}
     */
    get controlledTokens() {
        return this.canvasAdapter.controlledTokens;
    }

    /**
     * Reference to the primary canvas stage.
     * @type {PIXI.Container|null}
     */
    get stage() {
        return this.canvasAdapter.stage;
    }

    /**
     * Reference to the Foundry canvas Pixi application.
     * @type {PIXI.Application|null}
     */
    get app() {
        return this.canvasAdapter.app;
    }

    /**
     * Reference to canvas controls layer.
     * @type {ControlsLayer|null}
     */
    get controls() {
        return this.canvasAdapter.controls;
    }

    /**
     * Reference to canvas MeasuredTemplate layer.
     * @type {PlaceablesLayer|null}
     */
    get templates() {
        return this.canvasAdapter.templates;
    }

    /**
     * Reference to canvas Region layer.
     * @type {PlaceablesLayer|null}
     */
    get regions() {
        return this.canvasAdapter.regions;
    }

    /**
     * Active canvas grid highlight layers collection.
     * @type {Object}
     */
    get highlightLayers() {
        return this.canvasAdapter.highlightLayers;
    }

    /**
     * Get the center point of a grid space enclosing the given coordinates across Foundry versions.
     * @param {{x?: number, y?: number, i?: number, j?: number}} coords - Coordinates object
     * @returns {{x: number, y: number}} The center coordinates
     */
    getCenterPoint(coords: any) {
        return this.canvasAdapter.getCenterPoint(coords);
    }

    /**
     * Get the top-left point of a grid space enclosing the given coordinates across Foundry versions.
     * @param {{x?: number, y?: number, i?: number, j?: number}} coords - Coordinates object
     * @returns {{x: number, y: number}} The top-left coordinates
     */
    getTopLeftPoint(coords: any) {
        return this.canvasAdapter.getTopLeftPoint(coords);
    }

    /**
     * Get snapped point coordinates on the grid.
     * @param {{x: number, y: number}} point - Target point
     * @param {Object} [options={}] - Snapping options ({ mode })
     * @returns {{x: number, y: number}|null} Snapped point or null
     */
    getSnappedPoint(point: any, options: any = {}): any {
        return this.canvasAdapter.getSnappedPoint(point, options);
    }

    /**
     * Compute integer grid space coordinate offset range [i0, j0, i1, j1] enclosing a bounding rectangle across Foundry versions.
     * @param {Object} bounds - Bounding rectangle { x, y, width, height }
     * @returns {number[]|null} [i0, j0, i1, j1] Grid offset range or null
     */
    getOffsetRange(bounds: any) {
        return this.canvasAdapter.getOffsetRange(bounds);
    }

    /**
     * Compute integer grid space coordinate offset range [i0, j0, i1, j1] enclosing a bounding rectangle.
     * Fits against scene dimensions and falls back to manual grid dimension rounding.
     * @param {Object} bounds - Bounding rectangle
     * @returns {number[]} [i0, j0, i1, j1] Grid offset range
     * @protected
     */
    _getGridOffsetRange(bounds: any) {
        if (!canvas?.grid || !bounds) return [0, 0, 0, 0];

        let targetBounds = bounds;
        if (this.dimensionsRect && targetBounds.fit) {
            try { targetBounds = targetBounds.fit(this.dimensionsRect); } catch (e) {}
        }

        const paddedBounds = targetBounds.pad
            ? targetBounds.pad(1)
            : {
                x: targetBounds.x - 1,
                y: targetBounds.y - 1,
                width: targetBounds.width + 2,
                height: targetBounds.height + 2,
                left: (targetBounds.left ?? targetBounds.x) - 1,
                top: (targetBounds.top ?? targetBounds.y) - 1,
                right: (targetBounds.right ?? (targetBounds.x + targetBounds.width)) + 1,
                bottom: (targetBounds.bottom ?? (targetBounds.y + targetBounds.height)) + 1
            };

        if (paddedBounds.left === undefined) paddedBounds.left = paddedBounds.x;
        if (paddedBounds.top === undefined) paddedBounds.top = paddedBounds.y;
        if (paddedBounds.right === undefined) paddedBounds.right = paddedBounds.x + paddedBounds.width;
        if (paddedBounds.bottom === undefined) paddedBounds.bottom = paddedBounds.y + paddedBounds.height;

        let i0 = 0, j0 = 0, i1 = 0, j1 = 0;
        const res: any = this.getOffsetRange(paddedBounds);
        if (res?.length >= 4) {
            [i0, j0, i1, j1] = res;
        }

        if (!Number.isFinite(i0) || !Number.isFinite(j0) || !Number.isFinite(i1) || !Number.isFinite(j1)) {
            const gx = this.gridSizeX;
            const gy = this.gridSizeY;
            i0 = Math.floor(paddedBounds.x / gx);
            j0 = Math.floor(paddedBounds.y / gy);
            i1 = Math.ceil((paddedBounds.x + paddedBounds.width) / gx);
            j1 = Math.ceil((paddedBounds.y + paddedBounds.height) / gy);
        }

        return [i0, j0, i1, j1];
    }

    /**
     * Measures grid distance between two coordinate points across Foundry versions.
     * @param {{x: number, y: number}} origin - Origin point
     * @param {{x: number, y: number}} target - Target point
     * @returns {number} Measured distance in grid units
     */
    measureDistance(origin: any, target: any) {
        return this.canvasAdapter.measureDistance(origin, target);
    }

    /**
     * Return canonical document terminology string ("template" or "region").
     * @abstract
     * @returns {string} The localized or canonical document type term
     */
    get documentTerm(): string {
        throw new Error("Subclass must implement documentTerm getter");
    }

    /**
     * Return section title header for pre-placement configuration.
     * @abstract
     * @returns {string} Section header text
     */
    get prePlacementTitle(): string {
        throw new Error("Subclass must implement prePlacementTitle getter");
    }

    /**
     * Return section title header for preview placement configuration.
     * @abstract
     * @returns {string} Section header text
     */
    get previewPlacementSectionTitle(): string {
        throw new Error("Subclass must implement previewPlacementSectionTitle getter");
    }

    /**
     * Return section title header for placement configuration.
     * @abstract
     * @returns {string} Section header text
     */
    get placementSectionTitle(): string {
        throw new Error("Subclass must implement placementSectionTitle getter");
    }

    /**
     * Return section title header for post-placement configuration.
     * @abstract
     * @returns {string} Section header text
     */
    get postPlacementTitle(): string {
        throw new Error("Subclass must implement postPlacementTitle getter");
    }

    /**
     * Check whether the active Foundry version supports rotating a specific shape type.
     * Defaults to true, overridden by version adapters (e.g. V13 MeasuredTemplate rects).
     * @param {string} shapeType - The shape type identifier ("circle", "cone", "ray", "rect", "square")
     * @returns {boolean} True if the shape type can be rotated in this Foundry version
     */
    supportsShapeRotation(shapeType: any) {
        return true;
    }

    /**
     * Extract normalized calling item and activity context from a Foundry document.
     * Enforces single concrete Document input contract.
     * @param {Document} doc - The template or region document
     * @returns {{item: Item|null, itemName: string, itemId: string, activity: Object|null, activityName: string, activityId: string}} Normalized calling context object containing item and activity details
     */
    extractCallingContext(doc: any) {
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
    matchAutorecEntry(target: any, entries: any) {
        if (!target || !entries) return null;
        const doc = target.document ? target.document : target;
        const context = this.extractCallingContext(doc);
        if (!context.itemName && !context.itemId) {
            log.debug("matchAutorecEntry | Could not extract calling item context (missing itemName and itemId) from document:", { doc, context });
            return null;
        }

        // 1. Check custom flags on calling item or activity (Item Sheet overrides)
        const itemConfig = context.item?.getFlag?.(MODULE_ID, "customConfig") ?? null;
        const activityConfig = Boolean(context.activityId)
            ? (context.item?.getFlag?.(MODULE_ID, "activityConfigs")?.[context.activityId] ?? null)
            : null;
        const activeCustomConfig = activityConfig ?? itemConfig;

        // If explicitly disabled via item or activity custom flag, disable BBC completely
        const isCustomDisabled = (activityConfig?.enabled === false) || (itemConfig?.enabled === false && activityConfig?.enabled !== true);
        if (isCustomDisabled) {
            log.debug(`matchAutorecEntry | [DISABLED VIA FLAG] Crosshairs explicitly disabled for "${context.itemName}" via custom config.`);
            return null;
        }

        // 2. Query registered Autorec entries
        const callingItemName = context.itemName.trim().toLowerCase();
        const candidateEntries: any[] = [];
        for (const entry of entries.values()) {
            if (entry.isDefault) continue;
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
                if (entry.enabled === false && activeCustomConfig?.enabled !== true) {
                    log.debug(`matchAutorecEntry | [DISABLED VIA AUTOREC] Autorec entry for "${entry.itemName}" explicitly disabled crosshairs.`);
                    return null;
                }

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

        if (!baseEntry && !activeCustomConfig) {
            const defaultEntry = entries.get("DEFAULT");
            if (defaultEntry?.enabled) {
                const systemDefault = systemAdapter.getSystemDefault(context);
                const systemAttach = (systemDefault === true || systemDefault === false)
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
                    activity: context.activity,
                    placedFillColor: defaultEntry.placedFillColor ?? getUserColor("#000000"),
                    placedFillAlpha: defaultEntry.placedFillAlpha ?? DEFAULT_AUTOREC_ENTRY.placedFillAlpha
                };
            }
        }

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
    hidePreview(placeable: any) {
        if (!placeable) return;

        const isSeqCrosshair = (target: any) => {
            if (!target) return false;
            return target.constructor?.name === "CrosshairsPlaceable"
                || Boolean(target.document?.crosshair)
                || Boolean(target.tag && String(target.tag).includes("sequencer-crosshair"));
        };

        if (isSeqCrosshair(placeable)) return;

        const makeInvisible = (target: any, isRoot = false) => {
            if (!target || isSeqCrosshair(target)) return;

            try { target.interactive = false; } catch (e) {}
            try { target.interactiveChildren = false; } catch (e) {}
            if ("eventMode" in target) {
                try { target.eventMode = "none"; } catch (e) {}
            }

            if (isRoot) {
                target.visible = true;
                target.renderable = true;
                target.render = () => {};
                target._render = () => {};
                target.renderAdvanced = () => {};

                if (!target._bbcPermanentlyHidden) {
                    target._bbcPermanentlyHidden = true;
                    try { Object.defineProperty(target, "visible", { get: () => true, set: () => {}, configurable: true }); } catch (e) {}
                    try { Object.defineProperty(target, "isVisible", { get: () => true, set: () => {}, configurable: true }); } catch (e) {}
                    try { Object.defineProperty(target, "renderable", { get: () => true, set: () => {}, configurable: true }); } catch (e) {}
                    try { Object.defineProperty(target, "render", { get: () => (() => {}), set: () => {}, configurable: true }); } catch (e) {}
                    try { Object.defineProperty(target, "_render", { get: () => (() => {}), set: () => {}, configurable: true }); } catch (e) {}
                    try { Object.defineProperty(target, "renderAdvanced", { get: () => (() => {}), set: () => {}, configurable: true }); } catch (e) {}
                }
            } else {
                target.visible = false;
                target.renderable = false;
                target.alpha = 0;
                target.worldAlpha = 0;
                target.render = () => {};
                target._render = () => {};
                target.renderAdvanced = () => {};

                if (!target._bbcPermanentlyHidden) {
                    target._bbcPermanentlyHidden = true;
                    try { Object.defineProperty(target, "visible", { get: () => false, set: () => {}, configurable: true }); } catch (e) {}
                    try { Object.defineProperty(target, "renderable", { get: () => false, set: () => {}, configurable: true }); } catch (e) {}
                    try { Object.defineProperty(target, "alpha", { get: () => 0, set: () => {}, configurable: true }); } catch (e) {}
                    try { Object.defineProperty(target, "worldAlpha", { get: () => 0, set: () => {}, configurable: true }); } catch (e) {}
                    try { Object.defineProperty(target, "render", { get: () => (() => {}), set: () => {}, configurable: true }); } catch (e) {}
                    try { Object.defineProperty(target, "_render", { get: () => (() => {}), set: () => {}, configurable: true }); } catch (e) {}
                    try { Object.defineProperty(target, "renderAdvanced", { get: () => (() => {}), set: () => {}, configurable: true }); } catch (e) {}
                }
            }
        };

        const hideContainers = (obj: any, isRoot = true) => {
            if (!obj || isSeqCrosshair(obj)) return;
            makeInvisible(obj, isRoot);

            const dummyChildContainer = {
                position: { x: 0, y: 0, set: () => {} },
                visible: false,
                renderable: false,
                alpha: 0,
                worldAlpha: 0,
                zIndex: 0,
                text: "",
                destroy: () => {},
                render: () => {},
                _render: () => {},
                renderAdvanced: () => {}
            };

            const watchedProps = ["template", "border", "shape", "mesh", "ruler", "controlIcon"];
            for (const prop of watchedProps) {
                let currentVal = obj[prop];
                if (currentVal) {
                    makeInvisible(currentVal, false);
                    if (prop === "ruler") {
                        try { currentVal.text = ""; } catch (e) {}
                    }
                }
                if (!obj._bbcWatchedProperties?.has(prop)) {
                    if (!obj._bbcWatchedProperties) obj._bbcWatchedProperties = new Set();
                    obj._bbcWatchedProperties.add(prop);
                    try {
                        Object.defineProperty(obj, prop, {
                            get: () => currentVal ?? dummyChildContainer,
                            set: (val) => {
                                currentVal = val;
                                if (val) {
                                    makeInvisible(val, false);
                                    if (prop === "ruler") {
                                        try { val.text = ""; } catch (e) {}
                                    }
                                }
                            },
                            configurable: true
                        });
                    } catch (e) {}
                }
            }

            if (obj.children) {
                for (const child of obj.children) {
                    if (child) makeInvisible(child, false);
                }
            }

            if (!obj._bbcAddChildWrapped) {
                obj._bbcAddChildWrapped = true;
                const origAddChild = obj.addChild;
                if (origAddChild) {
                    obj.addChild = function (...children: any[]) {
                        for (const child of children) {
                            if (child) makeInvisible(child, false);
                        }
                        return origAddChild.apply(this, children);
                    };
                }
                const origAddChildAt = obj.addChildAt;
                if (origAddChildAt) {
                    obj.addChildAt = function (child: any, index: any) {
                        if (child) makeInvisible(child, false);
                        return origAddChildAt.apply(this, [child, index]);
                    };
                }
            }
        };

        hideContainers(placeable, true);

        const methodsToIntercept = [
            "refresh", "_refresh",
            "applyRenderFlags", "_applyRenderFlags",
            "_refreshState", "_refreshShape", "_refreshTemplate", "_refreshBorder", "_refreshMeasurements", "_updateMeasurements",
            "draw", "_draw", "clear"
        ];

        for (const methodName of methodsToIntercept) {
            if (methodName === "refresh" || methodName === "_refresh" || placeable[methodName]) {
                try {
                    const orig = placeable[methodName];
                    placeable[methodName] = function (...args: any[]) {
                        let result;
                        try { result = orig?.apply(this, args); } catch (e) {}
                        hideContainers(this);
                        return result ?? this;
                    };
                } catch (e) {}
            }
        }

        this._wrapHighlightGrid(placeable);
    }

    /**
     * Wrap the preview placeable's highlightGrid and _highlightGrid methods to synchronize
     * coordinates, rotation, and geometry with the active crosshair shape instance before calculating grid highlights.
     * @param {PlaceableObject} placeable - Preview placeable
     * @returns {void}
     */
    _wrapHighlightGrid(placeable: any) {
        if (!placeable || placeable._bbcHighlightGridWrapped) return;
        placeable._bbcHighlightGridWrapped = true;

        const self = this;
        const wrapMethod = (fnName: any) => {
            if (placeable[fnName]) {
                const orig = placeable[fnName];
                placeable[fnName] = function (...args: any[]) {
                    if (this._bbcWrappingMethod) {
                        return orig.apply(this, args);
                    }
                    this._bbcWrappingMethod = true;
                    try {
                        const shape = this.crosshair?.shapeInstance ?? activePlacementTracker.crosshair?.shapeInstance;
                        if (shape) {
                            const targetX = shape.x;
                            const targetY = shape.y;
                            let targetDir = shape.direction;

                            const isRect = this.document?.t === "rect";
                            const isRegion = this.document?.documentName === "Region";

                            if (isRect && !isRegion) {
                                const w = this.document?.width ?? shape.config?.width ?? 20;
                                let distFoot = this.document?.distance ?? shape.config?.distance ?? w;
                                if (w > 0 && distFoot > w) {
                                    const isSquareDiagonal = distFoot <= w * 1.6;
                                    distFoot = isSquareDiagonal ? w : Math.round(Math.sqrt(Math.max(0, distFoot * distFoot - w * w)));
                                }
                                const h = distFoot ?? w;
                                targetDir = Math.atan2(h, w) * (180 / Math.PI);
                                if (this.document) {
                                    this.document.distance = Math.round(Math.hypot(w, h) * 100) / 100;
                                    this.document.width = w;
                                }
                            }

                            if (this.document) {
                                const updateData: Record<string, any> = {};
                                if (targetX !== undefined) updateData.x = targetX;
                                if (targetY !== undefined) updateData.y = targetY;
                                if (targetDir !== undefined) updateData.direction = targetDir;
                                if (isRect && !isRegion) {
                                    updateData.distance = this.document.distance;
                                    updateData.width = this.document.width;
                                }
                                if (this.document.updateSource) {
                                    this.document.updateSource(updateData);
                                } else {
                                    Object.assign(this.document, updateData);
                                }
                            }
                            if (targetX !== undefined) { try { this.x = targetX; } catch (e) {} }
                            if (targetY !== undefined) { try { this.y = targetY; } catch (e) {} }
                            if (targetDir !== undefined) { try { this.direction = targetDir; } catch (e) {} }

                            if (this.ray) {
                                const rad = ((targetDir ?? 0) * Math.PI) / 180;
                                const ox = targetX ?? this.x ?? 0;
                                const oy = targetY ?? this.y ?? 0;
                                const pxPerFoot = self.pixelsPerDistance;
                                const dist = isRect && !isRegion && this.document?.distance
                                    ? this.document.distance * pxPerFoot
                                    : (this.ray.distance ?? 1000);
                                const newRay = self.createRayFromAngle(ox, oy, rad, dist);
                                if (newRay) this.ray = newRay;
                            }

                            try {
                                delete this._shape;
                                this._shape = null;
                                if (this._computeShape) {
                                    this.shape = this._computeShape();
                                }
                            } catch (e) {}

                            try { this._refreshPosition?.(); } catch (e) {}
                            try { this._refreshShape?.(); } catch (e) {}
                            try { this._refreshTemplate?.(); } catch (e) {}
                        }

                        const isRegion = this.document?.documentName === "Region" || Boolean(this.shapes || this.document?.shapes);
                        const hId = this.highlightId ?? this.objectId ?? (isRegion ? (this.document?.id ? `Region.${this.document.id}` : "Region.preview") : "preview");
                        this._bbcHighlightId = hId;
                        const hl = self.getHighlightLayer(hId);
                        if (hl) {
                            hl.visible = true;
                            hl.renderable = true;
                        }

                        return orig.apply(this, args);
                    } finally {
                        this._bbcWrappingMethod = false;
                    }
                };
            }
        };

        wrapMethod("highlightGrid");
        wrapMethod("_highlightGrid");
    }

    /**
     * Safely apply render flags onto a PlaceableObject's renderFlags manager.
     * Prevents system or placeable errors if specific flags (such as refreshShape) are not defined as supported RenderFlag options on that placeable.
     * @param {PlaceableObject} tmpl - Placeable graphic object containing renderFlags
     * @param {Object} flags - Key-value pair object of desired render flags (`{ [flagName]: boolean }`)
     * @returns {void}
     */
    _safeSetRenderFlags(tmpl: any, flags: any) {
        if (!tmpl?.renderFlags?.set || !flags) return;

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
    dismissPreview(placeable: any) {
        if (!placeable || placeable._bbcDismissed) return;
        placeable._bbcDismissed = true;

        try { Object.defineProperty(placeable, 'isPreview', { get: () => false, configurable: true }); } catch (e) {}
        try { Object.defineProperty(placeable, 'visible', { get: () => false, configurable: true }); } catch (e) {}
        try { Object.defineProperty(placeable, 'renderable', { get: () => false, configurable: true }); } catch (e) {}

        const doc = placeable.document ? placeable.document : (placeable.documentName ? placeable : null);
        const isRegion = doc?.documentName === "Region" || Boolean(placeable.shapes || doc?.shapes);
        const primaryHId = placeable.highlightId ?? placeable._bbcHighlightId ?? doc?.highlightId ?? doc?._bbcHighlightId;

        const candidateIds = new Set();
        const pId = String(placeable.id ?? doc?.id ?? "").trim();
        if (pId) {
            candidateIds.add(pId);
            candidateIds.add(`Region.${pId}`);
            candidateIds.add(`Template.${pId}`);
        }
        if (placeable.objectId) {
            candidateIds.add(placeable.objectId);
            candidateIds.add(`Region.${placeable.objectId}`);
            candidateIds.add(`Template.${placeable.objectId}`);
        }
        if (placeable._bbcHighlightId) {
            candidateIds.add(placeable._bbcHighlightId);
        }
        candidateIds.add("preview");
        candidateIds.add("Region.preview");
        candidateIds.add("Template.preview");
        const rawLayers = this.highlightLayers;
        if (rawLayers) {
            const layerKeys: any[] = (rawLayers as any).keys
                ? Array.from((rawLayers as any).keys())
                : Object.keys(rawLayers);

            for (const key of layerKeys) {
                if (!key) continue;
                const lower = String(key).toLowerCase();
                if (lower === "preview" || lower.includes(".preview") || lower.includes("preview")) {
                    candidateIds.add(key);
                } else if (pId && (String(key).endsWith(`.${pId}`) || key === pId)) {
                    candidateIds.add(key);
                }
            }
        }

        for (const hId of candidateIds) {
            if (hId !== primaryHId) {
                this.clearHighlightLayer(hId);
            }
        }

        const fallbackRegionId = Boolean(pId) ? `Region.${pId}` : "Region.preview";
        const finalId = primaryHId ?? (isRegion ? fallbackRegionId : (placeable.id ?? "preview"));
        this.clearHighlightLayer(finalId);
        this.clearRegionsHighlight();

        try { placeable.renderFlags?.clear?.(); } catch (e) {}
        try { this.app?.ticker?.remove?.(placeable.applyRenderFlags, placeable); } catch (e) {}

        this.deactivatePlaceablesLayers();

        const stages = [this.stage, this.app?.stage, this.templates, this.templates?.preview, this.regions, this.regions?.preview].filter(Boolean);
        const eventNames = ["pointermove", "mousemove", "pointerdown", "mousedown", "pointerup", "mouseup", "click", "rightclick"];
        for (const stg of stages) {
            if (stg?.listeners && stg?.off) {
                for (const evName of eventNames) {
                    try {
                        const lns: any[] = stg.listeners(evName) ?? [];
                        for (const fn of lns) {
                            if (fn && ((fn as any).context === placeable || (fn.name && (fn.name.includes("mousemove") || fn.name.includes("pointermove") || fn.name.includes("pointerdown") || fn.name.includes("mousedown") || fn.name.includes("click") || fn.name.includes("preview") || fn.name.includes("template") || fn.name.includes("region"))))) {
                                stg.off(evName, fn);
                            }
                        }
                    } catch (e) {}
                }
            }
        }

        if (this.templates?.preview?.children?.includes(placeable)) {
            try { this.templates.preview.removeChild(placeable); } catch (e) {}
        }
        if (this.regions?.preview?.children?.includes(placeable)) {
            try { this.regions.preview.removeChild(placeable); } catch (e) {}
        }
        try {
            placeable.destroy?.({ children: true });
        } catch (e) {}

        for (const hId of candidateIds) {
            if (hId !== primaryHId) {
                this.destroyHighlightLayer(hId);
            }
        }
        this.destroyHighlightLayer(finalId);

        const dummyContainer = {
            position: { x: 0, y: 0, set: () => {} },
            visible: false,
            renderable: false,
            alpha: 0,
            worldAlpha: 0,
            zIndex: 0,
            text: "",
            destroy: () => {},
            render: () => {},
            _render: () => {},
            renderAdvanced: () => {}
        };
        try { placeable.controlIcon = dummyContainer; } catch (e) {}
        try { placeable.ruler = dummyContainer; } catch (e) {}
        try { placeable.template = dummyContainer; } catch (e) {}
        try { placeable.mesh = dummyContainer; } catch (e) {}
        try { placeable.shape = dummyContainer; } catch (e) {}
        try { placeable.border = dummyContainer; } catch (e) {}
        try { if (!placeable.position) placeable.position = dummyContainer.position; } catch (e) {}

        if (game?.modules?.get("sequencer")?.active) {
            try {
                if (Sequencer?.EffectManager?.endEffects) {
                    const previewIds = ["Crosshair", "Cone Crosshair", "Ray Crosshair", "Square Crosshair", "Circle Crosshair"];
                    for (const name of previewIds) {
                        Sequencer.EffectManager.endEffects({ name });
                        Sequencer.EffectManager.endEffects({ name: `${name}-line` });
                    }
                }
            } catch (e) {}
        }
    }

    /**
     * Determine if a placeable object on the canvas represents an unpersisted interactive preview (`MeasuredTemplate` or `Region`).
     * Accurately supports Foundry V14 where client preview documents are instantiated with an ephemeral DataModel ID.
     * @param {PlaceableObject} placeable - Canvas placeable object
     * @returns {boolean} True if the placeable is a live preview graphic
     */
    isPreview(placeable: any) {
        if (!placeable) return false;
        if (placeable._bbcDismissed) return false;
        if (placeable.isPreview === false) return false;

        // Check if document is already persisted in the active scene collection
        const doc = placeable.document ? placeable.document : (placeable.documentName ? placeable : null);
        const scene = canvas?.scene;
        if (doc?.id && scene) {
            const inTemplates = Boolean(scene.templates?.has?.(doc.id));
            const inRegions = Boolean(scene.regions?.has?.(doc.id));
            if (inTemplates || inRegions) {
                return false;
            }
        }

        if (placeable.isPreview === true || placeable._preview === true) return true;

        if (placeable.layer?.preview?.children?.includes?.(placeable) ||
            canvas?.templates?.preview?.children?.includes?.(placeable) ||
            canvas?.regions?.preview?.children?.includes?.(placeable)) {
            return true;
        }

        return Boolean(placeable.isPreview ?? true);
    }

    /**
     * Extract normalized placed fill/border styling values and flags from workflow configuration.
     * Shared across V13 and V14 document updates.
     * @param {Object} [config={}] - Workflow placement configuration options
     * @returns {{placedFillColor?: string, placedFillAlpha?: number, placedBorderColor?: string, placedBorderAlpha?: number, flags: Object}} Extracted placement styling properties and flags
     */
    extractPlacedStylingFlags(config: any = {}) {
        const userColor = getUserColor("#000000");
        const hasExplicitDisable = config.enablePlacedStyling === false;
        const hasExplicitPlacedFillColor = config.placedFillColor !== undefined && config.placedFillColor !== null;
        const placedFillPlayerColor = config.placedFillPlayerColor !== undefined
            ? Boolean(config.placedFillPlayerColor)
            : (hasExplicitPlacedFillColor ? false : Boolean(DEFAULT_AUTOREC_ENTRY.placedFillPlayerColor));
        const hasExplicitPlacedBorderColor = config.placedBorderColor !== undefined && config.placedBorderColor !== null;
        const placedBorderPlayerColor = config.placedBorderPlayerColor !== undefined
            ? Boolean(config.placedBorderPlayerColor)
            : (hasExplicitPlacedBorderColor ? false : Boolean(DEFAULT_AUTOREC_ENTRY.placedBorderPlayerColor));
        const placedFillColor = (!hasExplicitDisable && !placedFillPlayerColor && hasExplicitPlacedFillColor)
            ? config.placedFillColor
            : userColor;
        const placedFillAlpha = (!hasExplicitDisable && config.placedFillAlpha !== undefined && config.placedFillAlpha !== null)
            ? config.placedFillAlpha
            : DEFAULT_AUTOREC_ENTRY.placedFillAlpha;
        const placedBorderColor = placedBorderPlayerColor
            ? userColor
            : (config.placedBorderColor ?? DEFAULT_AUTOREC_ENTRY.placedBorderColor);
        const placedBorderAlpha = (config.placedBorderAlpha !== undefined && config.placedBorderAlpha !== null)
            ? config.placedBorderAlpha
            : DEFAULT_AUTOREC_ENTRY.placedBorderAlpha;
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
                placedBorderAlpha,
                placedFillPlayerColor,
                placedBorderPlayerColor,
                persist: Boolean(config.persist ?? DEFAULT_AUTOREC_ENTRY.persist),
                circleFile: config.circleFile,
                coneFile: config.coneFile,
                rayFile: config.rayFile,
                rectangleFile: config.rectangleFile ?? config.squareFile,
                squareFile: config.rectangleFile ?? config.squareFile
            }
        };

        return { placedFillColor, placedFillAlpha, placedBorderColor, placedBorderAlpha, flags };
    }

    /**
     * Return supported base canvas PlaceableObject type names for this Foundry VTT generation.
     * @abstract
     * @returns {string[]} Base placeable type names (`e.g. ["MeasuredTemplate"]`)
     */
    get supportedBasePlaceables(): any[] {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement supportedBasePlaceables getter.");
    }

    /**
     * Return supported document creation type names (`preCreate`/`create` hook suffixes) for this Foundry VTT generation.
     * @abstract
     * @returns {string[]} Document type names (`e.g. ["MeasuredTemplate"]`)
     */
    get supportedDocumentTypes(): string[] {
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
    generatePlacementHooks(callbacks: any, sysAdapter: any = systemAdapter): any[] {
        const targetSysAdapter = sysAdapter ?? systemAdapter;
        if (targetSysAdapter && !(targetSysAdapter instanceof BaseSystemAdapter)) {
            throw new Error(`generatePlacementHooks requires a valid BaseSystemAdapter instance, received: ${targetSysAdapter}`);
        }
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
    registerPlacementHooks(callbacks: any, sysAdapter: any = systemAdapter): any[] {
        const targetSysAdapter = sysAdapter ?? systemAdapter;
        if (targetSysAdapter && !(targetSysAdapter instanceof BaseSystemAdapter)) {
            throw new Error(`registerPlacementHooks requires a valid BaseSystemAdapter instance, received: ${targetSysAdapter}`);
        }
        const hooks = this.generatePlacementHooks(callbacks, targetSysAdapter);
        for (const hook of hooks) {
            if (hook?.event && hook?.handler) {
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
    handleMeasuredTemplateRefresh(template: any) {
        PixiGraphicsStyler.applyPlacedStyling(template, this.isPreview(template));
    }

    /**
     * Detect geometric properties and dimensions from a MeasuredTemplate or Region Document.
     * @param {Document} doc - MeasuredTemplate or Region document
     * @returns {{type: string, distance: number, width: number, angle: number, x: number, y: number}} Detected geometric properties including type, distance, width, angle, and coordinates
     */
    detectProperties(doc: any): any {
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
    formatPlacementCoordinates(x: number, y: number, direction: number, config: any = {}): any {
        return { x, y, direction, type: config.originalType ?? config.type, originalType: config.originalType };
    }

    /**
     * Create an unpersisted preview placeable object for template/region canvas rendering.
     * @param {Object} [config={}] - Placement configuration
     * @returns {PlaceableObject|null} Created placeable or null
     */
    createUnpersistedPreviewPlaceable(config: any = {}): any {
        if (!this.scene) return null;
        try {
            const docClass = CONFIG?.MeasuredTemplate?.documentClass;
            const objClass = CONFIG?.MeasuredTemplate?.objectClass;
            if (!docClass || !objClass) return null;

            const shapeType = config.type ?? config.t ?? "circle";
            const isRect = shapeType === "rect" || shapeType === "square";
            const data: Record<string, any> = {
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

            const doc = new docClass(data, { parent: this.scene });
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
     * @param {Object} coords - New placement coordinates
     * @returns {void}
     */
    updatePreviewShape(previewDoc: any, coords: any): void {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement updatePreviewShape(previewDoc, coords).");
    }

    /**
     * Finalize document placement properties and dimensions on placement confirmation.
     * @param {Document} doc - Target document being placed
     * @param {Object} [coords={}] - Placement coordinates
     * @param {Object} [config={}] - Crosshair options
     * @param {Object|null} [data=null] - Document update payload
     * @returns {void}
     */
    applyDocumentPlacement(doc: any, coords: any = {}, config: any = {}, data: any = null): void {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement applyDocumentPlacement(doc, coords, config, data).");
    }

    /**
     * Refresh the rendering and grid highlights of a preview template or region.
     * Prevents the native template borders/shapes from flashing visible on rendering cycles.
     * @param {PlaceableObject} tmpl - The placeable template or region preview
     * @param {number} direction - The current direction/rotation in degrees
     * @returns {void}
     */
    refreshTemplateHighlights(tmpl: any, direction: any): void {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement refreshTemplateHighlights(tmpl, direction).");
    }

    /**
     * Resume deferred document creation when an interactive Sequencer placement resolves.
     * @param {Scene} scene - Target canvas Scene
     * @param {Object} deferredData - Initial raw document creation data
     * @param {Object} coords - Resolved placement coordinates
     * @param {string} documentName - Document type name ("MeasuredTemplate" or "Region")
     * @param {Object} [config={}] - Optional configuration
     * @returns {Promise<void>} Resolves when deferred document creation completes
     */
    async createDeferredDocument(scene: any, deferredData: any, coords: any, documentName: string, config: any = {}): Promise<void> {
        if (!scene || !deferredData || !coords) return;
        const cloned = this.deepClone(deferredData);
        const { id, _id, _source, ...data } = cloned;

        const docName = this._getDeferredDocumentName(data, documentName);
        await this._applyDeferredCoordinates(data, coords, docName);
        this.applyDocumentPlacement(data, coords, config, data);

        if (data.shapes) {
            data.shapes = data.shapes.map((s: any) => {
                const shapeObj = s?.toObject ? s.toObject() : s;
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

    _getDeferredDocumentName(data: any, documentName: any): string {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement _getDeferredDocumentName(data, documentName).");
    }

    _applyDeferredCoordinates(data: any, coords: any, docName: any): any {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement _applyDeferredCoordinates(data, coords, docName).");
    }

    snapCoordinates(x: any, y: any, mode = "all") {
        return this.canvasAdapter.snapCoordinates(x, y, mode);
    }

    _getGridSnapMode(snapToGrid: any) {
        if (snapToGrid === false || snapToGrid === "none" || snapToGrid === 0 || snapToGrid === "0") return 0;
        if (typeof snapToGrid === "number") return snapToGrid;
        if (snapToGrid === "center") return CONST?.GRID_SNAPPING_MODES?.CENTER ?? 1;
        if (snapToGrid === "corner" || snapToGrid === "vertex" || snapToGrid === "corners") return CONST?.GRID_SNAPPING_MODES?.VERTEX ?? 2;
        if (snapToGrid === "side" || snapToGrid === "edge" || snapToGrid === "edges") return (CONST?.GRID_SNAPPING_MODES as any)?.SIDE_MIDPOINT ?? (CONST?.GRID_SNAPPING_MODES as any)?.SIDE ?? 4;
        return (CONST?.GRID_SNAPPING_MODES?.CENTER ?? 1) |
               (CONST?.GRID_SNAPPING_MODES?.VERTEX ?? 2) |
               ((CONST?.GRID_SNAPPING_MODES as any)?.SIDE_MIDPOINT ?? (CONST?.GRID_SNAPPING_MODES as any)?.SIDE ?? 4);
    }

    _snapPoint(x: any, y: any, numMode: any): any {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement _snapPoint(x, y, numMode).");
    }

    _getGridCenterPoint(x: any, y: any): any {
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
    resolveAnchorPlacement(targetTok: any, clickCoords: any = {}): any {
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
    isOwner(target: any) {
        if (!target) return true;
        const doc = target.document ? target.document : target;
        if (!doc.id) return true; // Preview templates on canvas are always local to the drawing client
        const authorVal = doc.author ?? doc.user;
        const userId = authorVal?.id ?? authorVal ?? game?.user?.id;
        return userId === game?.user?.id;
    }

    /**
     * Normalize an item or placeable object into a canonical Token instance.
     * Normalizes single concrete input type before passing down to placement helpers.
     * @param {Token|Item|Actor|Object|null} target - Candidate object to normalize
     * @returns {Token|null} Canonical Token object or null
     */
    toToken(target: any) {
        if (!target) return null;
        return target.object ?? target;
    }

    /**
     * Handle preview drawing (v13 drawMeasuredTemplate / v14 drawRegion).
     * @param {PlaceableObject} placeable - Canvas PlaceableObject representing the preview template or region
     * @returns {Promise<void>} Resolves when preview handling is complete
     */
    async handleDrawPreview(placeable: any) {
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

        const entry: any = autorecManager.getEntryForDocument(doc);
        if (!entry) {
            return;
        }

        //     placeableClass: placeable?.constructor?.name,
        //     docData: typeof doc.toObject === "function" ? doc.toObject() : doc,
        //     docFlags: doc.flags
        // });

        // 1. Immediately hide the Foundry template/region preview graphic completely so custom Sequencer visuals take over
        this.hidePreview(placeable);

        const isRegion = doc.documentName === "Region" || Boolean(placeable.shapes || doc.shapes);
        const defaultHlId = isRegion
            ? (doc.id ? `Region.${doc.id}` : "Region.preview")
            : (placeable.highlightId ?? placeable.objectId ?? (doc.id ? `Template.${doc.id}` : "Template.preview"));
        placeable._bbcHighlightId = defaultHlId;

        // 2. Resolve token and item context deterministically through version adapter
        const callingContext = this.extractCallingContext(doc);
        const item = entry.item ?? callingContext.item;
        const rawToken = item?.parent?.getActiveTokens?.()[0] ?? this.controlledTokens[0];
        const token = this.toToken(rawToken);
        const actor = token?.actor ?? item?.actor;


        const placementKey = `${entry.itemName}_${game?.user?.id}`;
        const entryConfig = typeof entry.handler === "object" && entry.handler !== null ? entry.handler : entry;
        const pending: any = {
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
                const builder = (crosshair as Record<string, any>)[crosshairType] ?? crosshair.circle;

                const shapeFileKey = `${crosshairType}File`;
                const shapeSpecificFile = entryConfig[shapeFileKey]
                    ?? (entryConfig.file?.includes?.(crosshairType) ? entryConfig.file : null);

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

                this._patchDeprecations();
                await builder.play(placeable, finalConfig);
            }

        } catch (err: any) {
            const msg = err?.message ?? String(err ?? "Failed to play Sequencer crosshair effect");
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
    handlePreCreate(target: any, _data: any, _options: any, userId: any) {
        if (!target) return true;
        const doc = target.document ? target.document : target;

        if (userId !== game?.user?.id) {
            return true;
        }

        let entry: any = autorecManager.getEntryForDocument(doc);
        let placementKey: string | null = null;
        let pending: any = null;

        if (entry) {
            placementKey = `${entry.itemName}_${game?.user?.id}`;
            pending = this.pendingPlacements.get(placementKey);
        } else {
            // Fallback: match any active uncancelled pending placement for the local user
            for (const [key, val] of this.pendingPlacements.entries()) {
                const session: any = val;
                if (key.endsWith(`_${game?.user?.id}`) && !session.cancelled) {
                    pending = session;
                    placementKey = key;
                    entry = { itemName: session.itemName, handler: session.config };
                    break;
                }
            }
        }


        if (!entry || !pending || !placementKey) {
            return true;
        }

        // If the sequencer sequence was right-click cancelled, abort placement
        if (pending.cancelled) {
            if (pending.placeable) {
                this.dismissPreview(pending.placeable);
            }
            this.pendingPlacements.delete(placementKey);
            return false;
        }

        // If placement sequence has resolved with coordinates, apply placement onto document payload
        if (pending.resolved && pending.coords) {
            this.applyDocumentPlacement(doc, pending.coords, pending.config, _data);
            if (pending.placeable) {
                this.dismissPreview(pending.placeable);
            }
            this.pendingPlacements.delete(placementKey);
            return true;
        }

        // If sequence is still interactive/running, defer creation until sequence resolves
        pending.deferredCreateData = doc.toObject?.() ?? doc;
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
    async handleCreateDocument(target: any, _options: any, userId: any) {
        if (!target) return;
        const doc = target.document ? target.document : target;

        // Synchronize persistent Sequencer animation if enabled (for creating user)
        if (!userId || userId === game?.user?.id) {
            await PersistedAnimationManager.syncPersistedAnimation(doc);
        }

        if (userId !== game?.user?.id) return;

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
        const rawToken = item?.parent?.getActiveTokens?.()[0] ?? this.controlledTokens[0];
        const token = this.toToken(rawToken);
        const actor = token?.actor ?? item?.actor;
        const scope = { doc, token, actor, item, config };

        await ScriptRunner.execute(code, {
            doc,
            token,
            actor,
            item,
            scope,
            config,
            canvas: canvas ?? undefined,
            game: game ?? undefined
        }, `BaseFoundryVTTAdapter.handleCreateDocument (${doc.documentName})`);
    }

    /**
     * Handle document update hook (v13 updateMeasuredTemplate / v14 updateRegion).
     * Synchronizes persistent Sequencer animation position, dimensions, rotation, and lifecycle,
     * and ensures BBC styling flags stay synchronized with native document color/alpha changes.
     * @param {Document|PlaceableObject} target - Template or Region document or placeable that was updated
     * @param {Object} [changed={}] - Document diff payload
     * @param {Object} [_options={}] - Document update options
     * @param {string} [userId] - User ID triggering update
     * @returns {Promise<void>}
     */
    async handleUpdateDocument(target: any, changed: any = {}, _options: any = {}, userId?: string): Promise<void> {
        if (!target) return;
        const doc = target.document ? target.document : target;

        if (doc.flags?.bbc && (!userId || userId === game?.user?.id)) {
            const flagUpdates: Record<string, any> = {};
            if (changed.fillColor !== undefined) flagUpdates.placedFillColor = changed.fillColor;
            if (changed.color !== undefined) flagUpdates.placedFillColor = changed.color;
            if (changed.borderColor !== undefined) flagUpdates.placedBorderColor = changed.borderColor;
            if (changed.fillAlpha !== undefined) flagUpdates.placedFillAlpha = changed.fillAlpha;
            if (changed.borderAlpha !== undefined) flagUpdates.placedBorderAlpha = changed.borderAlpha;
            if (changed.alpha !== undefined) flagUpdates.placedFillAlpha = changed.alpha;

            if (Object.keys(flagUpdates).length > 0) {
                await doc.setFlag?.("bbc", flagUpdates);
            }
        }

        if (!userId || userId === game?.user?.id) {
            await PersistedAnimationManager.syncPersistedAnimation(doc);
        }
    }

    /**
     * Handle document deletion hook (v13 deleteMeasuredTemplate / v14 deleteRegion).
     * Cleans up persistent Sequencer effects bound to the deleted template.
     * @param {Document|PlaceableObject} target - Template or Region document or placeable that was deleted
     * @param {Object} [_options={}] - Document deletion options
     * @param {string} [userId] - User ID triggering deletion
     * @returns {void}
     */
    handleDeleteDocument(target: any, _options: any = {}, userId?: string): void {
        if (!target) return;
        const doc = target.document ? target.document : target;
        if (!userId || userId === game?.user?.id) {
            PersistedAnimationManager.endPersistedAnimation(doc);
        }
    }
}
