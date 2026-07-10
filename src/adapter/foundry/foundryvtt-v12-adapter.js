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
        const distance = doc.distance || 0;
        return {
            type: shapeMap[doc.t] || "circle",
            distance,
            radius: distance,
            width: doc.width || 0,
            angle: doc.angle || 0,
            x: doc.x || 0,
            y: doc.y || 0
        };
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
        if (coords.direction !== undefined || coords.rotation !== undefined) {
            previewDoc.direction = coords.direction ?? coords.rotation;
        }
        if (coords.distance !== undefined || coords.radius !== undefined) {
            previewDoc.distance = coords.distance ?? coords.radius;
        }
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
        if (coords.distance !== undefined || coords.radius !== undefined) updateData.distance = coords.distance ?? coords.radius;
        if (coords.direction !== undefined || coords.rotation !== undefined) updateData.direction = coords.direction ?? coords.rotation;
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

    /**
     * Resolve placement origin coordinates for an anchored shape in Foundry V12/V13 MeasuredTemplates.
     * Circles and squares center on the token. Rays and cones use token perimeter intersection snapped to the nearest grid vertex.
     */
    resolveAnchoredPlacement(token, clickX, clickY, isRayOrCone, direction, helpers = {}) {
        if (!token) return { x: clickX, y: clickY, direction };
        if (!isRayOrCone) {
            const x = token.center?.x ?? (token.x + (token.w || 0) / 2);
            const y = token.center?.y ?? (token.y + (token.h || 0) / 2);
            return { x, y, direction };
        }
        if (typeof helpers.getTokenEdgePoint === "function" && typeof helpers.snapCoordinates === "function") {
            const edgePoint = helpers.getTokenEdgePoint(token, clickX, clickY, false);
            const snappedEdge = helpers.snapCoordinates(edgePoint.x, edgePoint.y, "corner");
            return {
                x: snappedEdge.x,
                y: snappedEdge.y,
                direction: direction ?? edgePoint.direction
            };
        }
        return { x: clickX, y: clickY, direction };
    }
}

