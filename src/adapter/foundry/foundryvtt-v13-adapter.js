import { BaseFoundryVTTAdapter } from "./base-foundryvtt-adapter.js";
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
}
