import { BaseFoundryVTTAdapter } from "./base-foundryvtt-adapter.js";
import { log } from "../../lib/logger.js";
import { localize } from "../../lib/utils.js";

/**
 * Adapter subclass encapsulating Foundry VTT v14+ Region placement behavior.
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
        return ["Region"];
    }

    /**
     * Return supported document creation type names (`preCreate`/`create` hook suffixes) for Foundry VTT v14+.
     * @returns {string[]} Document type names
     */
    get supportedDocumentTypes() {
        return ["Region"];
    }

    /**
     * Detect shape type and geometric dimensions from a Region document.
     * @param {Document} doc - The Region document to inspect
     * @returns {{type: string, distance: number, radius: number, width: number, angle: number, x: number, y: number}} Detected geometric properties and shape type
     */
    detectProperties(doc) {
        log.debug("FoundryVTTV14Adapter.detectProperties | Inspecting raw document:", {
            documentName: doc.documentName,
            shapes: doc.shapes,
            rawObject: doc.toObject?.() ?? doc
        });

        const shapesList = this._getShapesArray(doc);
        if (shapesList.length === 0) {
            throw new Error("FoundryVTTV14Adapter.detectProperties | No shapes found in Region document:", doc);
        }

        const shape = shapesList[0].toObject();
        let shapeType = undefined;
        switch (shape.type) {
            case "circle":      shapeType = "circle";   break;
            case "cone":        shapeType = "cone";     break;
            case "rectangle":
            case "polygon":     shapeType = "square";   break;
            default:
                throw new Error("FoundryVTTV14Adapter.detectProperties | Unrecognized Region shape type:", shape.type);
        }

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
        return doc.shapes ?? [];
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
     * @param {Document} previewDoc - The Region preview document being updated
     * @param {{x?: number, y?: number, rotation?: number, radius?: number, width?: number, gridUnits?: boolean}} coords - The target canvas placement coordinates
     * @returns {void}
     */
    updatePreviewShape(previewDoc, coords) {
        if (!previewDoc || !coords) return;
        const shapesList = this._getShapesArray(previewDoc);
        if (shapesList.length === 0) return;

        const orig = shapesList[0].toObject();
        const updatedShape = this._formatRegionShapeUpdate(orig, coords);
        delete updatedShape._id;
        try {
            previewDoc.updateSource({ shapes: [updatedShape] }); 
        } catch (e) {
            previewDoc.shapes = [updatedShape];
        }
    }

    /**
     * Apply resolved placement coordinates and workflow flags onto a Region document.
     * @param {Document} doc - The target Region document to update
     * @param {Object} [coords={}] - The resolved placement coordinates
     * @param {Object} [config={}] - Optional placement styling and behavior configuration
     * @returns {void}
     */
    applyDocumentPlacement(doc, coords = {}, config = {}) {
        const styling = this.extractPlacedStylingFlags(config);
        const shapesList = this._getShapesArray(doc);
        if (shapesList.length === 0) return;

        const updateData = {
            flags: styling.flags
        };
        const shapeObj = shapesList[0].toObject();
        const originalShape = foundry.utils.deepClone(shapeObj);
        const newShape = this._formatRegionShapeUpdate(originalShape, coords);
        delete newShape._id;
        updateData.shapes = [newShape];

        const targetColor = styling.placedFillColor ?? styling.placedBorderColor;
        if (targetColor) updateData.color = targetColor;
        if (styling.placedFillColor) updateData.fillColor = styling.placedFillColor;
        if (styling.placedBorderColor) updateData.borderColor = styling.placedBorderColor;

        const targetAlpha = styling.placedFillAlpha ?? styling.placedBorderAlpha;
        if (targetAlpha !== undefined) updateData.alpha = targetAlpha;
        if (styling.placedFillAlpha !== undefined) updateData.fillAlpha = styling.placedFillAlpha;
        if (styling.placedBorderAlpha !== undefined) updateData.borderAlpha = styling.placedBorderAlpha;

        if (config.hidden || config.hideTemplate) updateData.hidden = true;

        doc.updateSource(updateData);
    }

    /**
     * Format drag destination coordinates into a V14 Region placement coordinates payload.
     * @param {number} x - Destination x-coordinate
     * @param {number} y - Destination y-coordinate
     * @param {number} direction - Rotation angle in degrees
     * @param {Object} [config={}] - Optional sequence placement configuration
     * @returns {{x: number, y: number, rotation: number, radius: number|undefined, width: number|undefined, gridUnits: boolean}} Formatted placement coordinates payload
     */
    formatPlacementCoordinates(x, y, direction, config = {}) {
        return {
            x,
            y,
            rotation: direction,
            radius: config.radius,
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
