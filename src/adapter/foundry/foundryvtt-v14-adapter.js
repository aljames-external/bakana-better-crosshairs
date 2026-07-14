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
     * Detect shape type and geometric dimensions from a Region or MeasuredTemplate document.
     * @param {Document} doc - The Region or MeasuredTemplate document to inspect
     * @returns {{type: string, distance: number, radius: number, width: number, angle: number, x: number, y: number}} Detected geometric properties and shape type
     */
    detectProperties(doc) {
        log.debug("FoundryVTTV14Adapter.detectProperties | Inspecting raw document:", {
            documentName: doc.documentName,
            t: doc.t,
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
        if (shapesList.length === 0) {
            throw new Error("FoundryVTTV14Adapter.detectProperties | No shapes found in Region document:", doc);
        }

        const shape = typeof shapesList[0]?.toObject === "function" ? shapesList[0].toObject() : (shapesList[0] ?? {});
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
        let distance = 0;
        let width = 5;
        if (shape.type === "rectangle") {
            const rawLengthPx = shape.width ?? shape.radius ?? 0;
            const rawWidthPx = shape.height ?? shape.width ?? shape.radius ?? 0;
            distance = Math.round(rawLengthPx / pxPerFoot);
            width = Math.round(rawWidthPx / pxPerFoot);
        } else {
            const rawRadius = shape.radius ?? 0;
            distance = Math.round(rawRadius / pxPerFoot);
            width = distance;
        }

        const result = {
            type: shapeType,
            distance,
            radius: distance,
            width,
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
        const orig = shapesList.length > 0 ? (typeof shapesList[0]?.toObject === "function" ? shapesList[0].toObject() : shapesList[0]) : null;
        if (previewDoc.t === "rect" || coords.type === "square" || coords.type === "rect" || orig?.type === "rectangle") {
            /* Bypassing square/rect modifications per user instruction */
            return;
        }
        if (shapesList.length > 0) {
            const updatedShape = this._formatRegionShapeUpdate(orig, coords);
            delete updatedShape._id;
            try {
                previewDoc.updateSource({ shapes: [updatedShape] }); 
            } catch (e) {
                previewDoc.shapes = [updatedShape];
            }
        } else {
            const updateObj = {};
            if (coords.x !== undefined) updateObj.x = coords.x;
            if (coords.y !== undefined) updateObj.y = coords.y;
            if (coords.direction !== undefined) updateObj.direction = coords.direction;
            else if (coords.rotation !== undefined) updateObj.direction = coords.rotation;
            if (coords.distance !== undefined) updateObj.distance = coords.distance;
            else if (coords.radius !== undefined) updateObj.distance = coords.radius;

            try {
                previewDoc.updateSource(updateObj);
            } catch (e) {
                Object.assign(previewDoc, updateObj);
            }
        }
    }

    /**
     * Apply resolved placement coordinates and workflow flags onto a Region or MeasuredTemplate document.
     * @param {Document} doc - The target Region or MeasuredTemplate document to update
     * @param {Object} [coords={}] - The resolved placement coordinates
     * @param {Object} [config={}] - Optional placement styling and behavior configuration
     * @returns {void}
     */
    applyDocumentPlacement(doc, coords = {}, config = {}) {
        const shapesList = this._getShapesArray(doc);
        const orig = shapesList.length > 0 ? (typeof shapesList[0]?.toObject === "function" ? shapesList[0].toObject() : shapesList[0]) : null;
        if (doc?.t === "rect" || coords.type === "square" || coords.type === "rect" || orig?.type === "rectangle") {
            /* Bypassing square/rect modifications per user instruction */
            return;
        }
        const styling = this.extractPlacedStylingFlags(config);
        const isRegion = shapesList.length > 0;
        log.debug("FoundryVTTV14Adapter.applyDocumentPlacement | Input:", {
            isRegion,
            docClassName: doc.constructor?.name,
            coords,
            configToken: Boolean(config.token)
        });

        if (isRegion) {
            const updateData = {
                flags: styling.flags
            };
            const originalShape = foundry.utils.deepClone(orig);
            const shapeCoords = { ...coords, sticky: Boolean(config.token ?? coords.token ?? coords.sticky) };
            const newShape = this._formatRegionShapeUpdate(originalShape, shapeCoords);
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

            log.debug("FoundryVTTV14Adapter.applyDocumentPlacement | Applying Region updateSource:", updateData);
            doc.updateSource(updateData);
        } else {
            const pxPerFoot = (canvas?.dimensions?.size ?? 100) / (canvas?.dimensions?.distance ?? 5);
            let distFoot = coords.distance ?? coords.radius ?? coords.width;
            const widthFoot = coords.width ?? coords.distance ?? coords.radius;
            const isRect = (doc.t === "rect" || coords.type === "square" || coords.type === "rect");
            if (isRect && widthFoot > 0 && distFoot > widthFoot) {
                const isSquareDiagonal = distFoot <= widthFoot * 1.6;
                distFoot = isSquareDiagonal ? widthFoot : Math.round(Math.sqrt(Math.max(0, distFoot * distFoot - widthFoot * widthFoot)));
            }

            let targetX = coords.x;
            let targetY = coords.y;
            const rad = ((coords.direction ?? coords.rotation ?? doc.direction ?? 0) * Math.PI) / 180;
            const isSticky = Boolean(config.token ?? coords.token ?? coords.sticky);
            if (isRect && isSticky && targetX !== undefined && targetY !== undefined) {
                const wPx = (widthFoot ?? 20) * pxPerFoot;
                targetX = Math.round(targetX + (wPx / 2) * Math.sin(rad));
                targetY = Math.round(targetY - (wPx / 2) * Math.cos(rad));
            }

            const updateData = {
                flags: styling.flags
            };
            if (targetX !== undefined) updateData.x = targetX;
            if (targetY !== undefined) updateData.y = targetY;
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
     * Format drag destination coordinates into a V14 placement coordinates payload supporting both Region and MeasuredTemplate properties.
     * @param {number} x - Destination x-coordinate
     * @param {number} y - Destination y-coordinate
     * @param {number} direction - Rotation angle in degrees
     * @param {Object} [config={}] - Optional sequence placement configuration
     * @returns {{x: number, y: number, direction: number, rotation: number, distance: number|undefined, radius: number|undefined, width: number|undefined, gridUnits: boolean, sticky: boolean}} Formatted placement coordinates payload
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
            gridUnits: Boolean(config.gridUnits ?? true),
            sticky: Boolean(config.token)
        };
    }

    /**
     * Format and clone a V14 Region shape payload (`doc.shapes[0]`) with updated destination coordinates and dimensions.
     * Converts grid-unit measurements (`radius`, `width`) to canvas pixels when `coords.gridUnits` is true.
     *
     * @param {Object} originalShape - The base V14 Region shape data object (`doc.shapes[0]`)
     * @param {Object} coords - The placement coordinates payload (`{ x, y, rotation, radius, width, gridUnits, sticky }`)
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
        else if (coords.direction !== undefined) shape.rotation = coords.direction;

        if (shape.type === "rectangle") {
            /* Bypassing square/rect modifications per user instruction */
        } else if (shape.type === "circle") {
            const radFoot = coords.radius ?? coords.distance ?? coords.width;
            if (radFoot !== undefined) {
                shape.radius = isGridUnits ? Math.round(radFoot * pxPerFoot) : radFoot;
            }
        } else {
            if (coords.radius !== undefined) {
                shape.radius = isGridUnits ? Math.round(coords.radius * pxPerFoot) : coords.radius;
            }
            if (coords.width !== undefined) {
                shape.width = isGridUnits ? Math.round(coords.width * pxPerFoot) : coords.width;
            }
        }
        log.debug("FoundryVTTV14Adapter._formatRegionShapeUpdate | Result:", {
            shapeType: shape.type,
            inputCoords: coords,
            pxPerFoot,
            isGridUnits,
            outputShape: shape
        });
        return shape;
    }
}
