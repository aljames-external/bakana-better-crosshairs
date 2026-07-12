import { BaseFoundryVTTAdapter } from "./base-foundryvtt-adapter.js";
import { log } from "../../lib/logger.js";
import { localize } from "../../lib/utils.js";

/**
 * Adapter subclass encapsulating Foundry VTT v14+ Region and MeasuredTemplate placement behavior.
 */
export class FoundryVTTV14Adapter extends BaseFoundryVTTAdapter {
    /**
     * Initialize the Foundry VTT v14+ adapter instance and set its version identifier.
     */
    constructor() {
        super();
        this.version = 14;
    }

    /**
     * Return canonical document terminology string for V14+ ("region").
     * @returns {string} Document type term
     */
    get documentTerm() {
        return "region";
    }

    /**
     * Return section title header for pre-region placement configuration.
     * @returns {string} Section header text
     */
    get prePlacementTitle() {
        return localize("BBC.autorecMenu.preRegionPlacement", "Pre-Region Placement");
    }

    /**
     * Return section title header for region placement configuration.
     * @returns {string} Section header text
     */
    get placementSectionTitle() {
        return localize("BBC.autorecMenu.regionPlacementConfig", "Region Placement Configuration");
    }

    /**
     * Return section title header for post-region placement configuration.
     * @returns {string} Section header text
     */
    get postPlacementTitle() {
        return localize("BBC.autorecMenu.postRegionPlacement", "Post-Region Placement");
    }

    /**
     * Return supported base canvas PlaceableObject type names for Foundry VTT v14+.
     * @returns {string[]} Base placeable type names
     */
    get supportedBasePlaceables() {
        return ["MeasuredTemplate", "Region"];
    }

    /**
     * Return supported document creation type names (`preCreate`/`create` hook suffixes) for Foundry VTT v14+.
     * @returns {string[]} Document type names
     */
    get supportedDocumentTypes() {
        return ["MeasuredTemplate", "Region"];
    }

    /**
     * Detect shape type and geometric dimensions from a Region document.
     * @param {Document} doc - The Region or MeasuredTemplate document to inspect
     * @returns {{type: string, distance: number, radius: number, width: number, angle: number, x: number, y: number}} Detected geometric properties and shape type
     */
    detectProperties(doc) {
        log.debug("FoundryVTTV14Adapter.detectProperties | Inspecting raw document:", {
            documentName: doc.documentName,
            t: doc.t,
            distance: doc.distance,
            width: doc.width,
            shapes: doc.shapes,
            rawObject: doc.toObject?.() ?? doc
        });

        if (doc.t) {
            const shapeMap = {
                circle: "circle",
                cone: "cone",
                ray: "ray",
                rect: "square"
            };
            const distance = doc.distance ?? 0;
            const result = {
                type: shapeMap[doc.t] ?? "circle",
                distance,
                radius: distance,
                width: doc.width ?? 5,
                angle: doc.angle ?? 53.13,
                x: doc.x ?? 0,
                y: doc.y ?? 0
            };
            log.debug("FoundryVTTV14Adapter.detectProperties | Detected from doc.t (MeasuredTemplate):", result);
            return result;
        }

        const shapesList = this._getShapesArray(doc);
        const shape = typeof shapesList[0]?.toObject === "function" ? shapesList[0].toObject() : (shapesList[0] ?? {});
        let shapeType = "circle";
        if (shape.type === "circle") shapeType = "circle";
        else if (shape.type === "cone") shapeType = "cone";
        else if (shape.type === "rectangle" || shape.type === "polygon") shapeType = "square";

        const pxPerFoot = (canvas.dimensions?.size ?? 100) / (canvas.dimensions?.distance ?? 5);
        const rawRadius = shape.radius ?? 0;
        const distance = Math.round(rawRadius / pxPerFoot);

        const result = {
            type: shapeType,
            distance,
            radius: distance,
            width: shape.width ?? 5,
            angle: shape.angle ?? 53.13,
            x: shape.x ?? 0,
            y: shape.y ?? 0
        };
        return result;
    }

    /**
     * Helper to safely extract a Region shapes array from either an Array or Collection property.
     * @param {Document} doc - Region document
     * @returns {Array} Array of shape objects or models
     */
    _getShapesArray(doc) {
        if (!doc) return [];
        return doc.shapes?.contents ?? (Array.isArray(doc.shapes) ? doc.shapes : []);
    }

    /**
     * Return template pixel multiplier factor for V14 (converts pixels to exact grid units).
     * @returns {{factor: number, gridUnits: boolean}} The template scaling factor and grid units flag
     */
    getTemplatePixelFactor() {
        const gridSize = canvas?.dimensions?.size ?? 100;
        return { factor: 1 / gridSize, gridUnits: true };
    }

    /**
     * Update live canvas preview shape coordinates during mouse drag.
     * @param {Document} previewDoc - The Region or MeasuredTemplate preview document being updated
     * @param {{x?: number, y?: number, rotation?: number, direction?: number, radius?: number, distance?: number, width?: number, gridUnits?: boolean}} coords - The target canvas placement coordinates
     * @returns {void}
     */
    updatePreviewShape(previewDoc, coords) {
        if (!previewDoc || !coords) return;
        const shapesList = this._getShapesArray(previewDoc);
        if (shapesList.length > 0) {
            const orig = typeof shapesList[0]?.toObject === "function" ? shapesList[0].toObject() : shapesList[0];
            const updatedShape = this._formatRegionShapeUpdate(orig, coords);
            previewDoc.shapes = [updatedShape];
        } else {
            if (coords.x !== undefined) previewDoc.x = coords.x;
            if (coords.y !== undefined) previewDoc.y = coords.y;
            if (coords.direction !== undefined) previewDoc.direction = coords.direction;
            else if (coords.rotation !== undefined) previewDoc.direction = coords.rotation;
            if (coords.distance !== undefined) previewDoc.distance = coords.distance;
            else if (coords.radius !== undefined) previewDoc.distance = coords.radius;
        }
    }

    /**
     * Apply resolved placement coordinates and workflow flags onto a Region or MeasuredTemplate document.
     * @param {Document} doc - The target document to update
     * @param {Object} [coords={}] - The resolved placement coordinates
     * @param {Object} [config={}] - Optional placement styling and behavior configuration
     * @returns {void}
     */
    applyDocumentPlacement(doc, coords = {}, config = {}) {
        const styling = this.extractPlacedStylingFlags(config);
        const shapesList = this._getShapesArray(doc);
        const isRegion = shapesList.length > 0;

        if (isRegion) {
            const updateData = {
                flags: styling.flags
            };
            const shapeObj = typeof shapesList[0]?.toObject === "function" ? shapesList[0].toObject() : shapesList[0];
            const originalShape = foundry.utils.deepClone(shapeObj);
            const newShape = this._formatRegionShapeUpdate(originalShape, coords);
            delete newShape._id;
            updateData.shapes = [newShape];

            if (styling.placedFillColor) updateData.color = styling.placedFillColor;
            if (config.hidden || config.hideTemplate) updateData.hidden = true;

            doc.updateSource(updateData);
        } else {
            const updateData = {
                flags: styling.flags
            };
            if (coords.x !== undefined) updateData.x = coords.x;
            if (coords.y !== undefined) updateData.y = coords.y;
            if (coords.direction !== undefined) updateData.direction = coords.direction;
            else if (coords.rotation !== undefined) updateData.direction = coords.rotation;
            if (coords.distance !== undefined) updateData.distance = coords.distance;
            else if (coords.radius !== undefined) updateData.distance = coords.radius;
            if (coords.width !== undefined) updateData.width = coords.width;

            if (styling.placedFillColor) updateData.fillColor = styling.placedFillColor;
            if (styling.placedBorderColor) updateData.borderColor = styling.placedBorderColor;
            if (styling.placedFillAlpha !== undefined) updateData.fillAlpha = styling.placedFillAlpha;
            if (styling.placedBorderAlpha !== undefined) updateData.borderAlpha = styling.placedBorderAlpha;
            if (config.hidden || config.hideTemplate) updateData.hidden = true;

            doc.updateSource(updateData);
        }
    }

    /**
     * Format drag destination coordinates into a V14 placement coordinates payload.
     * @param {number} x - Destination x-coordinate
     * @param {number} y - Destination y-coordinate
     * @param {number} direction - Rotation angle in degrees
     * @param {Object} [config={}] - Optional sequence placement configuration
     * @returns {{x: number, y: number, direction: number, rotation: number, distance: number|undefined, radius: number|undefined, width: number|undefined, gridUnits: boolean}} Formatted placement coordinates payload
     */
    formatPlacementCoordinates(x, y, direction, config = {}) {
        return {
            x,
            y,
            direction,
            rotation: direction,
            distance: config.distance ?? config.radius,
            radius: config.radius ?? config.distance,
            width: config.width,
            gridUnits: Boolean(config.gridUnits ?? true)
        };
    }

    /**
     * Format and clone a V14 Region shape payload (`doc.shapes[0]`) with updated destination coordinates and dimensions.
     * Converts grid-unit measurements (`radius`, `width`) to canvas pixels when `coords.gridUnits` is true.
     *
     * @param {Object} originalShape - The base V14 Region shape data object (`doc.shapes[0]`)
     * @param {Object} coords - The placement coordinates payload (`{ x, y, rotation, radius, width, gridUnits }`)
     * @returns {Object} A cloned and formatted Region shape payload
     * @private
     */
    _formatRegionShapeUpdate(originalShape, coords) {
        // Deep clone shape payload to prevent mutating caller or document source references
        const shape = foundry.utils.deepClone(originalShape);
        const pxPerFoot = (canvas?.dimensions?.size ?? 100) / (canvas?.dimensions?.distance ?? 5);
        const isGridUnits = Boolean(coords.gridUnits ?? true);

        // Apply placement origin coordinates and rotation directly
        if (coords.x !== undefined) shape.x = coords.x;
        if (coords.y !== undefined) shape.y = coords.y;
        if (coords.rotation !== undefined) shape.rotation = coords.rotation;

        // Convert radius/width from grid distance units (feet/meters) to canvas pixels when placement specifies gridUnits
        if (coords.radius !== undefined) {
            shape.radius = isGridUnits ? Math.round(coords.radius * pxPerFoot) : coords.radius;
        }
        if (coords.width !== undefined) {
            shape.width = isGridUnits ? Math.round(coords.width * pxPerFoot) : coords.width;
        }
        return shape;
    }
}
