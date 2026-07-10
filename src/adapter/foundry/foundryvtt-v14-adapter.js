import { BaseFoundryVTTAdapter } from "./base-foundryvtt-adapter.js";

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
        Hooks.on("drawRegion", (region) => callbacks.onDrawPreview(region));
        Hooks.on("preCreateRegion", (doc, _data, _options, userId) => callbacks.onPreCreate(doc, _data, _options, userId));
        Hooks.on("createRegion", (doc, _options, userId) => callbacks.onCreate(doc, _options, userId));

    }

    /**
     * Detect shape type and geometric dimensions from a Region document.
     * @param {Document} doc
     * @returns {{type: string, distance: number, width: number, angle: number, x: number, y: number}}
     */
    detectProperties(doc) {
        const shape = doc.shapes?.[0] || {};
        let shapeType = "circle";
        if (shape.type === "circle") shapeType = "circle";
        else if (shape.type === "cone") shapeType = "cone";
        else if (shape.type === "rectangle" || shape.type === "polygon") shapeType = "square";

        const pxPerFoot = (canvas.dimensions?.size || 100) / (canvas.dimensions?.distance || 5);
        const rawRadius = shape.radius || shape.distance || shape.length || 0;
        const distance = rawRadius > 20 ? Math.round(rawRadius / pxPerFoot) : rawRadius;

        return {
            type: shapeType,
            distance,
            radius: distance,
            width: shape.width || 0,
            angle: shape.angle || 0,
            x: shape.x || 0,
            y: shape.y || 0
        };
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
        if (coords.x !== undefined) shape.x = coords.x;
        if (coords.y !== undefined) shape.y = coords.y;
        if (coords.direction !== undefined || coords.rotation !== undefined) {
            shape.rotation = coords.direction ?? coords.rotation;
        }
        if (coords.distance !== undefined || coords.radius !== undefined) {
            shape.radius = coords.distance ?? coords.radius;
        }
        if (coords.width !== undefined) shape.width = coords.width;
        return shape;
    }

    /**
     * Resolve placement anchor coordinates {x, y, direction} on a token's edge toward a click coordinate.
     */
    resolveAnchorPlacement(token, clickCoords = {}) {
        return super.resolveAnchorPlacement(token, clickCoords);
    }
}

