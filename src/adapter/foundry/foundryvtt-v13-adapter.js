import { BaseFoundryVTTAdapter } from "./base-foundryvtt-adapter.js";
import { localize } from "../../lib/utils.js";

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
     * Register Foundry VTT v13 placement hooks for MeasuredTemplates.
     * @param {Object} callbacks - { onDrawPreview, onPreCreate, onCreate }
     * @returns {void}
     */
    registerPlacementHooks(callbacks) {
        Hooks.on("drawMeasuredTemplate", (template) => callbacks.onDrawPreview(template));
        Hooks.on("preCreateMeasuredTemplate", (doc, _data, _options, userId) => callbacks.onPreCreate(doc, _data, _options, userId));
        Hooks.on("createMeasuredTemplate", (doc, _options, userId) => callbacks.onCreate(doc, _options, userId));
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
        return {
            x,
            y,
            direction,
            distance: config.distance,
            width: config.width
        };
    }

    /**
     * Compute canvas graphic dimensions in pixel units for a V13 MeasuredTemplate shape.
     * @param {number} [distance=30] - Shape distance/length
     * @param {number} [widthOrAngle=5] - Shape width (ray/square) or angle in degrees (cone)
     * @param {string} [shapeType="ray"] - Canonical shape type ('circle', 'cone', 'ray', 'square')
     * @returns {{size: {width: number, height: number}, gridUnits: boolean}} Graphic dimensions in pixel units and gridUnits flag
     */
    formatGraphicSize(distance = 30, widthOrAngle = 5, shapeType = "ray") {
        const gridDist = canvas?.dimensions?.distance ?? 5;
        const gridSize = canvas?.dimensions?.size ?? 100;
        const lengthPixels = (distance / gridDist) * gridSize;

        if (shapeType === "circle") {
            const diameterPixels = ((distance * 2) / gridDist) * gridSize;
            return {
                size: { width: diameterPixels, height: diameterPixels },
                gridUnits: false
            };
        }

        if (shapeType === "cone") {
            const angleRad = ((widthOrAngle ?? 53.13) * Math.PI) / 180;
            const widthPixels = 2 * lengthPixels * Math.tan(angleRad / 2);
            return {
                size: { width: lengthPixels, height: widthPixels },
                gridUnits: false
            };
        }

        const widthPixels = ((widthOrAngle ?? distance) / gridDist) * gridSize;
        return {
            size: { width: lengthPixels, height: Math.max(gridSize, widthPixels) },
            gridUnits: false
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
     * @param {{x?: number, y?: number, direction?: number, distance?: number}} coords - Destination preview coordinates
     * @returns {void}
     */
    updatePreviewShape(previewDoc, coords) {
        if (!previewDoc || !coords) return;
        if (coords.x !== undefined) previewDoc.x = coords.x;
        if (coords.y !== undefined) previewDoc.y = coords.y;
        if (coords.direction !== undefined) previewDoc.direction = coords.direction;
        if (coords.distance !== undefined) previewDoc.distance = coords.distance;
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

        if (styling.placedFillColor) updateData.fillColor = styling.placedFillColor;
        if (styling.placedBorderColor) updateData.borderColor = styling.placedBorderColor;
        if (styling.placedFillAlpha !== undefined) updateData.fillAlpha = styling.placedFillAlpha;
        if (config.hidden || config.hideTemplate) updateData.hidden = true;

        doc.updateSource(updateData);
    }
}
