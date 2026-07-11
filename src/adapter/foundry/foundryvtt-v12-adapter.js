import { BaseFoundryVTTAdapter } from "./base-foundryvtt-adapter.js";

export class FoundryVTTV12Adapter extends BaseFoundryVTTAdapter {
    constructor() {
        super();
        this.version = 12;
    }

    /**
     * Register Foundry VTT v12/v13 placement hooks for MeasuredTemplates.
     * @param {Object} callbacks - { onDrawPreview, onPreCreate, onCreate }
     */
    registerPlacementHooks(callbacks) {
        Hooks.on("drawMeasuredTemplate", (template) => callbacks.onDrawPreview(template));
        Hooks.on("preCreateMeasuredTemplate", (doc, _data, _options, userId) => callbacks.onPreCreate(doc, _data, _options, userId));
        Hooks.on("createMeasuredTemplate", (doc, _options, userId) => callbacks.onCreate(doc, _options, userId));

    }

    /**
     * Detect shape type and geometric dimensions from a MeasuredTemplate document.
     * @param {Document} doc
     * @returns {{type: string, distance: number, width: number, angle: number, x: number, y: number}}
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

    formatPlacementCoordinates(x, y, direction, config = {}) {
        return {
            x,
            y,
            direction,
            distance: config.distance,
            width: config.width
        };
    }

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
     * Return template pixel multiplier factor for V12 (legacy pixel sizing).
     */
    getTemplatePixelFactor() {
        return { factor: 1, gridUnits: false };
    }


    /**
     * Update live canvas preview shape coordinates during mouse drag.
     * @param {Document} previewDoc
     * @param {{x: number, y: number}} coords
     */
    updatePreviewShape(previewDoc, coords) {
        if (!previewDoc || !coords) return;
        if (coords.x !== undefined) previewDoc.x = coords.x;
        if (coords.y !== undefined) previewDoc.y = coords.y;
        if (coords.direction !== undefined) previewDoc.direction = coords.direction;
        if (coords.distance !== undefined) previewDoc.distance = coords.distance;
    }

    /**
     * Format the complete updateData payload for modifying a document source during preCreate.
     * @param {Document} doc
     * @param {Object} coords
     * @param {Object} [config={}]
     * @returns {Object}
     */
    formatDocumentUpdate(doc, coords = {}, config = {}) {
        const updateData = {};
        if (coords.x !== undefined) updateData.x = coords.x;
        if (coords.y !== undefined) updateData.y = coords.y;
        if (coords.distance !== undefined) updateData.distance = coords.distance;
        if (coords.direction !== undefined) updateData.direction = coords.direction;
        if (coords.width !== undefined) updateData.width = coords.width;
        if (coords.t !== undefined) updateData.t = coords.t;

        const styling = this.extractPlacedStylingFlags(config);

        if (styling.placedFillColor) updateData.fillColor = styling.placedFillColor;
        if (styling.placedBorderColor) updateData.borderColor = styling.placedBorderColor;
        if ("fillAlpha" in (doc._source || doc) && styling.placedFillAlpha !== undefined) updateData.fillAlpha = styling.placedFillAlpha;
        if ("alpha" in (doc._source || doc) && styling.placedFillAlpha !== undefined) updateData.alpha = styling.placedFillAlpha;

        if (styling.placedFillColor || styling.placedFillAlpha !== undefined || styling.placedBorderColor || styling.placedBorderAlpha !== undefined) {
            updateData.flags = styling.flags;
        }
        if (config.hidden === true || config.hideTemplate === true) {
            updateData.hidden = true;
        }
        return updateData;
    }
}

