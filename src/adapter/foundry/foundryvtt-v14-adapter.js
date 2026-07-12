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
     * Register Foundry VTT v14+ placement hooks for Regions.
     * @param {Object} callbacks - Placement callback handlers ({ onDrawPreview, onPreCreate, onCreate })
     * @returns {void}
     */
    registerPlacementHooks(callbacks) {
        Hooks.on("drawMeasuredTemplate", (template) => callbacks.onDrawPreview(template));
        Hooks.on("preCreateRegion", (doc, _data, _options, userId) => callbacks.onPreCreate(doc, _data, _options, userId));
        Hooks.on("createRegion", (doc, _options, userId) => callbacks.onCreate(doc, _options, userId));
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

        const shape = doc.shapes?.[0] ?? {};
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
        log.debug("FoundryVTTV14Adapter.detectProperties | Detected from doc.shapes (Region):", result);
        return result;
    }

    /**
     * Compute canvas graphic dimensions in grid units for a V14 Region shape.
     * @param {number} [distance=30] - Shape distance/length
     * @param {number} [widthOrAngle=5] - Shape width (ray/square) or angle in degrees (cone)
     * @param {string} [shapeType="ray"] - Canonical shape type ('circle', 'cone', 'ray', 'square')
     * @returns {{size: {width: number, height: number}, gridUnits: boolean}} Computed graphic dimensions and gridUnits flag
     */
    formatGraphicSize(distance = 30, widthOrAngle = 5, shapeType = "ray") {
        const gridDist = canvas?.dimensions?.distance ?? 5;
        const lengthGridUnits = distance / gridDist;

        if (shapeType === "circle") {
            const diameterGridUnits = (distance * 2) / gridDist;
            return {
                size: { width: diameterGridUnits, height: diameterGridUnits },
                gridUnits: true
            };
        }

        if (shapeType === "cone") {
            const angleRad = ((widthOrAngle ?? 53.13) * Math.PI) / 180;
            const widthGridUnits = 2 * lengthGridUnits * Math.tan(angleRad / 2);
            return {
                size: { width: lengthGridUnits, height: widthGridUnits },
                gridUnits: true
            };
        }

        const widthGridUnits = (widthOrAngle ?? distance) / gridDist;
        return {
            size: { width: lengthGridUnits, height: Math.max(1, widthGridUnits) },
            gridUnits: true
        };
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
        if (Array.isArray(previewDoc.shapes) && previewDoc.shapes.length > 0) {
            const orig = previewDoc.shapes[0].toObject();
            const updatedShape = this._formatRegionShapeUpdate(orig, coords);
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
        const updateData = {
            flags: styling.flags
        };

        if (Array.isArray(doc.shapes) && doc.shapes.length > 0) {
            const shapeObj = doc.shapes[0].toObject();
            const originalShape = foundry.utils.deepClone(shapeObj);
            const newShape = this._formatRegionShapeUpdate(originalShape, coords);
            delete newShape._id;
            updateData.shapes = [newShape];
        }

        if (styling.placedFillColor) updateData.color = styling.placedFillColor;
        if (config.hidden || config.hideTemplate) updateData.hidden = true;

        doc.updateSource(updateData);
    }

    /**
     * Format drag destination coordinates into a V14 Region placement coordinates payload.
     * @param {number} x - Destination x-coordinate
     * @param {number} y - Destination y-coordinate
     * @param {number} direction - Rotation angle in degrees
     * @param {Object} [config={}] - Optional sequence placement configuration
     * @returns {{x: number, y: number, rotation: number, radius: number|undefined, width: number|undefined, gridUnits: boolean}} Formatted Region placement coordinates payload
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
