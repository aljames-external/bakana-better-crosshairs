export class FoundryVTTV12Adapter {
    constructor() {
        this.version = 12;
    }

    /**
     * Register Foundry VTT v12/v13 placement hooks for MeasuredTemplates.
     * @param {Object} callbacks - { onDrawPreview, onPreCreate, onCreate }
     */
    registerPlacementHooks(callbacks) {
        Hooks.on("drawMeasuredTemplate", (template) => callbacks.onDrawPreview(template));
        Hooks.on("preCreateMeasuredTemplate", (doc, data, options, userId) => callbacks.onPreCreate(doc, data, options, userId));
        Hooks.on("createMeasuredTemplate", (doc, options, userId) => callbacks.onCreate(doc, options, userId));
    }

    /**
     * Hide the default placeable preview graphic so custom Sequencer visuals take over.
     * @param {PlaceableObject} placeable
     */
    hidePreview(placeable) {
        placeable.visible = false;
        placeable.renderable = false;
        placeable.alpha = 0;
        if (placeable.template) placeable.template.visible = false;
        if (placeable.ruler) placeable.ruler.visible = false;
        if (placeable.controlIcon) placeable.controlIcon.visible = false;

        placeable.refresh = function() {
            this.visible = false;
            this.renderable = false;
            if (this.ruler) {
                this.ruler.visible = false;
                this.ruler.text = "";
            }
            if (this.template) this.template.visible = false;
            if (this.controlIcon) this.controlIcon.visible = false;
            return this;
        };
        placeable.highlightGrid = function() {};
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
        return {
            type: shapeMap[doc.t] || "circle",
            distance: doc.distance || 0,
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
        const dx = coords.x - previewDoc.x;
        const dy = coords.y - previewDoc.y;
        previewDoc.direction = Math.toDegrees(Math.atan2(dy, dx));
        previewDoc.distance = Math.hypot(dx, dy) / (canvas.dimensions?.size || 100) * (canvas.dimensions?.distance || 5);
    }

    /**
     * Clear lingering placement preview graphics on the canvas.
     */
    clearPreviewCanvas() {
        if (canvas.templates?.preview) {
            canvas.templates.preview.removeChildren();
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

        const placedFillColor = config.placedFillColor || config.templateFillColor;
        const placedFillAlpha = config.placedFillAlpha !== undefined ? config.placedFillAlpha : config.templateFillAlpha;
        const placedBorderColor = config.placedBorderColor || config.templateBorderColor;
        const placedBorderAlpha = config.placedBorderAlpha !== undefined ? config.placedBorderAlpha : config.templateBorderAlpha;

        if (placedFillColor) updateData.fillColor = placedFillColor;
        if (placedBorderColor) updateData.borderColor = placedBorderColor;
        if ("fillAlpha" in (doc._source || doc) && placedFillAlpha !== undefined) updateData.fillAlpha = placedFillAlpha;
        if ("alpha" in (doc._source || doc) && placedFillAlpha !== undefined) updateData.alpha = placedFillAlpha;

        if (placedFillColor || placedFillAlpha !== undefined || placedBorderColor || placedBorderAlpha !== undefined) {
            updateData.flags = foundry.utils.mergeObject(doc.flags || {}, {
                bbc: { placedFillColor, placedFillAlpha, placedBorderColor, placedBorderAlpha }
            });
        }
        return updateData;
    }

    /**
     * Format a shape coordinate update for a live preview.
     * @param {Object} originalShape
     * @param {Object} coords
     * @returns {Object}
     */
    formatShapeUpdate(originalShape, coords) {
        return foundry.utils.mergeObject(foundry.utils.deepClone(originalShape), coords);
    }

    /**
     * Get primary and secondary (farpoint) world coordinates from a template document.
     * @param {Document} doc
     * @returns {{primary: {x: number, y: number}, secondary: {x: number, y: number}}}
     */
    getPosition(doc) {
        const primary = { x: doc.x || 0, y: doc.y || 0 };
        let secondary = { x: primary.x, y: primary.y };
        if (doc.direction !== undefined && doc.distance) {
            const rad = Math.toRadians(doc.direction);
            const distPx = (doc.distance / (canvas.dimensions?.distance || 5)) * (canvas.dimensions?.size || 100);
            secondary = {
                x: primary.x + Math.cos(rad) * distPx,
                y: primary.y + Math.sin(rad) * distPx
            };
        }
        return { primary, secondary };
    }
}
