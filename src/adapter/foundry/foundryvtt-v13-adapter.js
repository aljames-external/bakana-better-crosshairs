import { BaseFoundryVTTAdapter } from "./base-foundryvtt-adapter.js";
import { systemAdapter } from "../system/index.js";
import { log } from "../../lib/logger.js";
import { localize } from "../../lib/utils.js";

/**
 * Adapter subclass encapsulating Foundry VTT v13 MeasuredTemplate placement behavior.
 */
export class FoundryVTTV13Adapter extends BaseFoundryVTTAdapter {
    /**
     * Construct a Foundry VTT V13 adapter instance.
     */
    constructor() {
        super();
        this.version = 13;
    }

    /**
     * Return canonical document terminology string ("template").
     * @returns {string} The localized or canonical document type term
     */
    get documentTerm() {
        return "template";
    }

    /**
     * Return section title header for pre-placement configuration.
     * @returns {string} Section header text
     */
    get prePlacementTitle() {
        return localize("BBC.autorecMenu.preTemplatePlacement", "Pre-Template Placement");
    }

    /**
     * Return section title header for placement configuration.
     * @returns {string} Section header text
     */
    get placementSectionTitle() {
        return localize("BBC.autorecMenu.templatePlacementConfig", "Template Placement Configuration");
    }

    /**
     * Return section title header for post-placement configuration.
     * @returns {string} Section header text
     */
    get postPlacementTitle() {
        return localize("BBC.autorecMenu.postTemplatePlacement", "Post-Template Placement");
    }

    /**
     * Return supported base canvas PlaceableObject type names for Foundry VTT v13.
     * @returns {string[]} Base placeable type names
     */
    get supportedBasePlaceables() {
        return ["MeasuredTemplate"];
    }

    /**
     * Return supported document creation type names (`preCreate`/`create` hook suffixes) for Foundry VTT v13.
     * @returns {string[]} Document type names
     */
    get supportedDocumentTypes() {
        return ["MeasuredTemplate"];
    }

    /**
     * Generate structured placement hook descriptors for Foundry VTT v13.
     * Quarantined directly inside FoundryVTTV13Adapter without relying on base class generation logic.
     * @param {Object} callbacks - Placement hook callbacks (`{ onDrawPreview, onPreCreate, onCreate }`)
     * @param {Object} [sysAdapter=systemAdapter] - Active System Adapter instance
     * @returns {Array<{event: string, handler: Function, category: string, targetName: string}>} Array of generated hook descriptor objects
     */
    generatePlacementHooks(callbacks = {}, sysAdapter = systemAdapter) {
        const targetSysAdapter = sysAdapter ?? systemAdapter;
        const onDrawPreview = callbacks?.onDrawPreview ?? ((placeable) => this.handleDrawPreview(placeable));
        const onPreCreate = callbacks?.onPreCreate ?? ((doc, _data, _options, userId) => this.handlePreCreate(doc, _data, _options, userId));
        const onCreate = callbacks?.onCreate ?? ((doc, _options, userId) => this.handleCreateDocument(doc, _options, userId));
        const basePlaceables = this.supportedBasePlaceables;
        const customPlaceables = targetSysAdapter?.getCustomPlaceableClassNames?.() ?? [];
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
        const drawHooks = Array.from(drawPlaceables).flatMap((placeableName) => [
            { event: `draw${placeableName}`, handler: onDrawPreview, category: "draw", targetName: placeableName },
            { event: `refresh${placeableName}`, handler: (template) => this.handleMeasuredTemplateRefresh(template), category: "refresh", targetName: placeableName }
        ]);

        const baseDocumentTypes = this.supportedDocumentTypes;
        const customDocumentTypes = targetSysAdapter?.getCustomDocumentTypes?.() ?? [];
        const dynamicDocumentTypes = [];

        if (typeof CONFIG !== "undefined") {
            for (const docType of baseDocumentTypes) {
                const customDocName = CONFIG[docType]?.documentClass?.documentName;
                if (customDocName && typeof customDocName === "string" && !baseDocumentTypes.includes(customDocName) && !customDocumentTypes.includes(customDocName)) {
                    dynamicDocumentTypes.push(customDocName);
                }
            }
        }

        const createDocumentTypes = new Set([...baseDocumentTypes, ...customDocumentTypes, ...dynamicDocumentTypes]);
        const documentHooks = Array.from(createDocumentTypes).flatMap((docType) => [
            { event: `preCreate${docType}`, handler: onPreCreate, category: "preCreate", targetName: docType },
            { event: `create${docType}`, handler: onCreate, category: "create", targetName: docType }
        ]);

        const generatedHooks = [...drawHooks, ...documentHooks];

        if (targetSysAdapter && typeof targetSysAdapter.modifyPlacementHooks === "function") {
            const modifiedHooks = targetSysAdapter.modifyPlacementHooks(generatedHooks, callbacks, this);
            log.debug("FoundryVTTV13Adapter.generatePlacementHooks | Modified placement hooks from system adapter:", modifiedHooks);
            return modifiedHooks;
        }

        log.debug("FoundryVTTV13Adapter.generatePlacementHooks | Generated placement hooks:", generatedHooks);
        return generatedHooks;
    }

    /**
     * Detect shape type and geometric dimensions from a MeasuredTemplate document.
     * @param {Document} doc - MeasuredTemplate document
     * @returns {{type: string, distance: number, radius: number, width: number, angle: number, x: number, y: number}} Detected shape properties and dimensions
     */
    detectProperties(doc) {
        const shapeMap = {
            circle: "circle",
            cone: "cone",
            ray: "ray",
            rect: "square"
        };
        const distance = doc.distance ?? 0;
        return {
            type: shapeMap[doc.t] ?? "circle",
            distance,
            radius: distance,
            width: doc.width ?? 0,
            angle: doc.angle ?? 0,
            x: doc.x ?? 0,
            y: doc.y ?? 0
        };
    }

    /**
     * Format drag destination coordinates into a V13 MeasuredTemplate placement coordinates payload.
     * @param {number} x - Destination x-coordinate
     * @param {number} y - Destination y-coordinate
     * @param {number} direction - Direction angle in degrees
     * @param {Object} [config={}] - Optional sequence placement configuration
     * @returns {{x: number, y: number, direction: number, distance: number|undefined, width: number|undefined}} Formatted placement coordinates payload
     */
    formatPlacementCoordinates(x, y, direction, config = {}) {
        const isSquareOrRect = config.originalType === "square" || config.type === "square" || config.type === "rect" || config.t === "rect" || config.t === "square";
        return {
            x,
            y,
            direction,
            distance: config.distance,
            width: config.width,
            sticky: Boolean(config.token),
            type: isSquareOrRect ? "square" : (config.originalType ?? config.type),
            originalType: config.originalType,
            t: isSquareOrRect ? "rect" : config.t
        };
    }

    /**
     * Return template pixel multiplier factor for V13 (legacy pixel sizing).
     * @returns {{factor: number, gridUnits: boolean}} Template pixel multiplier factor and gridUnits mode
     */
    getTemplatePixelFactor() {
        return { factor: 1, gridUnits: false };
    }

    /**
     * Update live canvas preview shape coordinates during mouse drag.
     * @param {Document} previewDoc - Preview MeasuredTemplate document
     * @param {{x?: number, y?: number, direction?: number, distance?: number, width?: number, type?: string, originalType?: string, t?: string}} coords - Destination preview coordinates
     * @returns {void}
     */
    updatePreviewShape(previewDoc, coords) {
        if (!previewDoc || !coords) return;
        if (coords.x !== undefined) previewDoc.x = coords.x;
        if (coords.y !== undefined) previewDoc.y = coords.y;
        if (coords.direction !== undefined) previewDoc.direction = coords.direction;
        const isRect = previewDoc.t === "rect" || coords.type === "square" || coords.type === "rect" || coords.originalType === "square" || coords.t === "rect";
        if (isRect) {
            previewDoc.t = "rect";
            const w = coords.width ?? coords.distance ?? 20;
            const h = coords.distance ?? coords.width ?? w;
            previewDoc.distance = Math.round(Math.sqrt(w * w + h * h) * 100) / 100;
            previewDoc.width = w;
        } else if (coords.distance !== undefined) {
            previewDoc.distance = coords.distance;
        }
    }

    /**
     * Apply resolved placement coordinates and workflow flags onto a MeasuredTemplate document.
     * @param {Document} doc - MeasuredTemplate document
     * @param {Object} [coords={}] - Resolved placement coordinates
     * @param {Object} [config={}] - Workflow placement configuration
     * @returns {void}
     */
    applyDocumentPlacement(doc, coords = {}, config = {}) {
        const styling = this.extractPlacedStylingFlags(config);
        const updateData = {
            ...coords,
            flags: styling.flags
        };

        const isRect = doc.t === "rect" || coords.type === "square" || coords.type === "rect" || coords.originalType === "square" || config.originalType === "square" || coords.t === "rect" || config.t === "rect" || config.type === "square" || config.type === "rect";
        if (isRect) {
            updateData.t = "rect";
            const w = coords.width ?? coords.distance ?? config.width ?? config.distance ?? 20;
            const h = coords.distance ?? coords.width ?? config.distance ?? config.width ?? w;
            updateData.distance = Math.round(Math.sqrt(w * w + h * h) * 100) / 100;
            updateData.width = w;
        }

        if (styling.placedFillColor) updateData.fillColor = styling.placedFillColor;
        if (styling.placedBorderColor) updateData.borderColor = styling.placedBorderColor;
        if (styling.placedFillAlpha !== undefined) updateData.fillAlpha = styling.placedFillAlpha;
        if (styling.placedBorderAlpha !== undefined) updateData.borderAlpha = styling.placedBorderAlpha;
        if (config.hidden || config.hideTemplate) updateData.hidden = true;

        doc.updateSource(updateData);
    }

    /**
     * Resume deferred MeasuredTemplate creation in V13 when an interactive Sequencer placement resolves.
     * @param {Scene} scene - Target Canvas Scene
     * @param {Object} deferredData - Initial raw document creation data (`doc.toObject()`)
     * @param {Object} coords - Resolved placement coordinates from Sequencer (`{ x, y, direction, distance, ... }`)
     * @returns {Promise<void>} Resolves when deferred document creation completes
     */
    async createDeferredDocument(scene, deferredData, coords) {
        if (!scene || !deferredData || !coords) return;
        const data = foundry.utils.deepClone(deferredData);
        delete data._id;

        if (coords.x !== undefined) data.x = coords.x;
        if (coords.y !== undefined) data.y = coords.y;
        if (coords.direction !== undefined) data.direction = coords.direction;
        else if (coords.rotation !== undefined) data.direction = coords.rotation;
        if (coords.distance !== undefined) data.distance = coords.distance;
        else if (coords.radius !== undefined) data.distance = coords.radius;

        console.log("%cBBC DIAGNOSTIC | V13 createDeferredDocument:", "background: #7b2cbf; color: #fff; padding: 2px 4px; border-radius: 2px;", {
            docName: "MeasuredTemplate",
            resolvedCoords: coords,
            deferredCreatePayload: data
        });

        try {
            await scene.createEmbeddedDocuments("MeasuredTemplate", [data]);
        } catch (err) {
            log.error("FoundryVTTV13Adapter.createDeferredDocument | Failed to create deferred MeasuredTemplate:", err);
        }
    }

    /**
     * Refresh the rendering and grid highlights of a preview MeasuredTemplate.
     * Prevents the native template borders/shapes from flashing visible on rendering cycles.
     * @param {PlaceableObject} tmpl - The preview MeasuredTemplate
     * @param {number} direction - The current direction in degrees
     * @returns {void}
     */
    refreshTemplateHighlights(tmpl, direction) {
        if (!tmpl) return;

        if (tmpl.isPreview && !tmpl._bbcRotateOverridden) {
            tmpl._bbcRotateOverridden = true;
            tmpl._onRotate = function(event) {
                if (event && typeof event.stopPropagation === "function") event.stopPropagation();
            };
        }

        const rad = direction * (Math.PI / 180);
        tmpl.direction = direction;

        const doc = tmpl.document;
        if (doc) {
            doc.direction = direction;
            doc.updateSource({ direction });
            doc._shape = null;
            if (doc.shape?.clear) doc.shape.clear();
        }
        tmpl._shape = null;
        if (tmpl.shape?.clear) tmpl.shape.clear();

        if (tmpl.ray && globalThis.Ray) {
            const ox = tmpl.ray.origin?.x ?? tmpl.x;
            const oy = tmpl.ray.origin?.y ?? tmpl.y;
            tmpl.ray = globalThis.Ray.fromAngle(ox, oy, rad, tmpl.ray.distance ?? 1000);
        }

        if (tmpl.renderFlags) {
            tmpl.renderFlags.set({
                refreshShape: true,
                refreshTemplate: true,
                refreshGrid: true,
                refreshState: true,
                refresh: true
            });
        }
        if (typeof tmpl.applyRenderFlags === "function") tmpl.applyRenderFlags();
        if (typeof tmpl._refreshShape === "function") tmpl._refreshShape();
        if (typeof tmpl.highlightGrid === "function") tmpl.highlightGrid();

        this.hidePreview(tmpl);
    }
}
