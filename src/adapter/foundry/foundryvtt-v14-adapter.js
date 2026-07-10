import { BaseFoundryVTTAdapter } from "./base-foundryvtt-adapter.js";
import { log } from "../../lib/logger.js";

export class FoundryVTTV14Adapter extends BaseFoundryVTTAdapter {
    constructor() {
        super();
        this.version = 14;
    }

    /**
     * Register Foundry VTT v14+ placement hooks for Regions.
     * @param {Object} callbacks - { onDrawPreview, onPreCreate, onCreate }
     */
    registerPlacementHooks(callbacks) {
        Hooks.on("drawMeasuredTemplate", (template) => callbacks.onDrawPreview(template));
        Hooks.on("preCreateRegion", (doc, _data, _options, userId) => callbacks.onPreCreate(doc, _data, _options, userId));
        Hooks.on("createRegion", (doc, _options, userId) => callbacks.onCreate(doc, _options, userId));
    }

    /**
     * Detect shape type and geometric dimensions from a Region document.
     * @param {Document} doc
     * @returns {{type: string, distance: number, width: number, angle: number, x: number, y: number}}
     */
    detectProperties(doc) {
        log.debug("FoundryVTTV14Adapter.detectProperties | Inspecting raw document:", {
            documentName: doc.documentName,
            t: doc.t,
            distance: doc.distance,
            width: doc.width,
            shapes: doc.shapes,
            rawObject: typeof doc.toObject === "function" ? doc.toObject() : doc
        });

        if (doc.t) {
            const shapeMap = {
                circle: "circle",
                cone: "cone",
                ray: "ray",
                rect: "square"
            };
            const distance = doc.distance || 0;
            const result = {
                type: shapeMap[doc.t] || "circle",
                distance,
                radius: distance,
                width: doc.width || 5,
                angle: doc.angle || 53.13,
                x: doc.x || 0,
                y: doc.y || 0
            };
            log.debug("FoundryVTTV14Adapter.detectProperties | Detected from doc.t (MeasuredTemplate):", result);
            return result;
        }

        const shape = doc.shapes?.[0] || {};
        let shapeType = "circle";
        if (shape.type === "circle") shapeType = "circle";
        else if (shape.type === "cone") shapeType = "cone";
        else if (shape.type === "rectangle" || shape.type === "polygon") shapeType = "square";

        const pxPerFoot = (canvas.dimensions?.size || 100) / (canvas.dimensions?.distance || 5);
        const rawRadius = shape.radius || shape.distance || shape.length || 0;
        const distance = rawRadius > 20 ? Math.round(rawRadius / pxPerFoot) : rawRadius;

        const result = {
            type: shapeType,
            distance,
            radius: distance,
            width: shape.width || 5,
            angle: shape.angle || 53.13,
            x: shape.x || 0,
            y: shape.y || 0
        };
        log.debug("FoundryVTTV14Adapter.detectProperties | Detected from doc.shapes (Region):", result);
        return result;
    }

    formatGraphicSize(distance = 30, widthOrAngle = 5, shapeType = "ray") {
        const gridDist = canvas?.dimensions?.distance || 5;
        const lengthGridUnits = distance / gridDist;

        if (shapeType === "circle") {
            const diameterGridUnits = (distance * 2) / gridDist;
            return {
                size: { width: diameterGridUnits, height: diameterGridUnits },
                gridUnits: true
            };
        }

        if (shapeType === "cone") {
            const angleRad = ((widthOrAngle || 53.13) * Math.PI) / 180;
            const widthGridUnits = 2 * lengthGridUnits * Math.tan(angleRad / 2);
            return {
                size: { width: lengthGridUnits, height: widthGridUnits },
                gridUnits: true
            };
        }

        const widthGridUnits = (widthOrAngle || distance) / gridDist;
        return {
            size: { width: lengthGridUnits, height: Math.max(1, widthGridUnits) },
            gridUnits: true
        };
    }

    /**
     * Return template pixel multiplier factor for V14 (converts pixels to exact grid units).
     */
    getTemplatePixelFactor() {
        const gridSize = canvas?.dimensions?.size || 100;
        return { factor: 1 / gridSize, gridUnits: true };
    }


    /**
     * Update live canvas preview shape coordinates during mouse drag.
     * @param {Document} previewDoc
     * @param {{x: number, y: number}} coords
     */
    updatePreviewShape(previewDoc, coords) {
        if (Array.isArray(previewDoc.shapes) && previewDoc.shapes.length > 0) {
            const orig = previewDoc.shapes[0]._source || previewDoc.shapes[0];
            const updatedShape = this._formatRegionShapeUpdate(orig, coords);
            previewDoc.shapes = [updatedShape];
        }
    }

    /**
     * Format the complete updateData payload for modifying a Region document source during preCreate.
     * @param {Document} doc
     * @param {Object} coords
     * @param {Object} [config={}]
     * @returns {Object}
     */
    formatDocumentUpdate(doc, coords = {}, config = {}) {
        const updateData = {};
        if (Array.isArray(doc.shapes) && doc.shapes.length > 0) {
            const originalShape = foundry.utils.deepClone(
                doc.shapes[0]._source || (typeof doc.shapes[0].toObject === "function" ? doc.shapes[0].toObject() : doc.shapes[0])
            );
            const newShape = this._formatRegionShapeUpdate(originalShape, coords);
            delete newShape._id;
            updateData.shapes = [newShape];
        }

        const styling = this.extractPlacedStylingFlags(config);
        if (styling.placedFillColor) updateData.color = styling.placedFillColor;

        updateData.flags = styling.flags;
        if (config.hidden === true || config.hideTemplate === true) {
            updateData.hidden = true;
        }
        return updateData;
    }
    /**
     * Format a Region shape update based on drag destination coordinates.
     * @private
     */
    _formatRegionShapeUpdate(originalShape, coords) {
        const shape = foundry.utils.deepClone(originalShape);
        const pxPerFoot = (canvas?.dimensions?.size || 100) / (canvas?.dimensions?.distance || 5);

        if (coords.x !== undefined) shape.x = coords.x;
        if (coords.y !== undefined) shape.y = coords.y;
        if (coords.direction !== undefined || coords.rotation !== undefined) {
            shape.rotation = coords.direction ?? coords.rotation;
        }
        if (coords.distance !== undefined || coords.radius !== undefined) {
            const rawRadius = coords.distance ?? coords.radius;
            shape.radius = rawRadius <= 1000 ? Math.round(rawRadius * pxPerFoot) : rawRadius;
        }
        if (coords.width !== undefined) {
            const rawWidth = coords.width;
            shape.width = rawWidth <= 1000 ? Math.round(rawWidth * pxPerFoot) : rawWidth;
        }
        return shape;
    }
}

