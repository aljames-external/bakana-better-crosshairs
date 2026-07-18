import { BaseFoundryVTTAdapter } from "./base-foundryvtt-adapter.js";
import { systemAdapter } from "../system/index.js";
import { log } from "../../lib/logger.js";
import { localize } from "../../lib/utils.js";
import { Ray } from "../../lib/compat.js";

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
     * Generate structured placement hook descriptors across all supported V14+ placeable and document types (`MeasuredTemplate`, `Region`).
     * Quarantined directly inside FoundryVTTV14Adapter without relying on base class generation logic.
     * @param {Object} callbacks - Placement hook callbacks (`{ onDrawPreview, onPreCreate, onCreate }`)
     * @param {Object} [sysAdapter=systemAdapter] - Active System Adapter instance
     * @returns {Array<{event: string, handler: Function, category: string, targetName: string}>} Array of generated hook descriptor objects
     */
    generatePlacementHooks(callbacks = {}, sysAdapter = systemAdapter) {
        const targetSysAdapter = sysAdapter ?? systemAdapter;
        const onDrawPreview = callbacks?.onDrawPreview ?? ((placeable) => this.handleDrawPreview(placeable));
        const onPreCreate = callbacks?.onPreCreate ?? ((doc, _data, _options, userId) => this.handlePreCreate(doc, _data, _options, userId));
        const onCreate = callbacks?.onCreate ?? ((doc, _options, userId) => this.handleCreateDocument(doc, _options, userId));
        const basePlaceables = this.supportedBasePlaceables;
        const customPlaceables = targetSysAdapter?.getCustomPlaceableClassNames?.() ?? [];
        const dynamicPlaceables = [];

        if (typeof CONFIG !== "undefined") {
            for (const base of basePlaceables) {
                const customClass = CONFIG[base]?.objectClass?.name;
                if (customClass && typeof customClass === "string" && !basePlaceables.includes(customClass) && !customPlaceables.includes(customClass)) {
                    dynamicPlaceables.push(customClass);
                }
            }
        }

        const drawPlaceables = new Set([...basePlaceables, ...customPlaceables, ...dynamicPlaceables]);
        const drawHooks = Array.from(drawPlaceables).flatMap((placeableName) => [
            { event: `draw${placeableName}`, handler: onDrawPreview, category: "draw", targetName: placeableName },
            { event: `refresh${placeableName}`, handler: (template) => this.handleMeasuredTemplateRefresh(template), category: "refresh", targetName: placeableName }
        ]);

        const baseDocumentTypes = this.supportedDocumentTypes;
        const customDocumentTypes = targetSysAdapter?.getCustomDocumentTypes?.() ?? [];
        const dynamicDocumentTypes = [];

        if (typeof CONFIG !== "undefined") {
            for (const docType of baseDocumentTypes) {
                const customDocName = CONFIG[docType]?.documentClass?.documentName;
                if (customDocName && typeof customDocName === "string" && !baseDocumentTypes.includes(customDocName) && !customDocumentTypes.includes(customDocName)) {
                    dynamicDocumentTypes.push(customDocName);
                }
            }
        }

        const createDocumentTypes = new Set([...baseDocumentTypes, ...customDocumentTypes, ...dynamicDocumentTypes]);
        const documentHooks = Array.from(createDocumentTypes).flatMap((docType) => [
            { event: `preCreate${docType}`, handler: onPreCreate, category: "preCreate", targetName: docType },
            { event: `create${docType}`, handler: onCreate, category: "create", targetName: docType }
        ]);

        const generatedHooks = [...drawHooks, ...documentHooks];

        if (targetSysAdapter && typeof targetSysAdapter.modifyPlacementHooks === "function") {
            const modifiedHooks = targetSysAdapter.modifyPlacementHooks(generatedHooks, callbacks, this);
            log.debug("FoundryVTTV14Adapter.generatePlacementHooks | Modified placement hooks from system adapter:", modifiedHooks);
            return modifiedHooks;
        }

        log.debug("FoundryVTTV14Adapter.generatePlacementHooks | Generated placement hooks:", generatedHooks);
        return generatedHooks;
    }

    /**
     * Detect shape type and geometric dimensions from a Region or MeasuredTemplate document.
     * @param {Document} doc - The Region or MeasuredTemplate document to inspect
     * @returns {{type: string, distance: number, radius: number, width: number, angle: number, x: number, y: number}} Detected geometric properties and shape type
     */
    detectProperties(doc) {
        const shapesList = this._getShapesArray(doc);
        log.debug("FoundryVTTV14Adapter | [Square Lifecycle 1/5] Original shape from Foundry:", {
            documentName: doc.documentName ?? (doc.t ? "MeasuredTemplate" : "Region"),
            t: doc.t,
            shapes: shapesList,
            rawDocument: typeof doc.toObject === "function" ? doc.toObject() : doc
        });

        const docName = doc.documentName ?? (doc.t ? "MeasuredTemplate" : "Region");
        if (docName === "MeasuredTemplate") {
            const shapeMap = {
                circle: "circle",
                cone: "cone",
                ray: "ray",
                rect: "square"
            };
            let distance = doc.distance ?? 0;
            const width = doc.width ?? 5;
            if (doc.t === "rect" && width > 0 && distance > width) {
                const isSquareDiagonal = distance <= width * 1.6;
                distance = isSquareDiagonal ? width : Math.round(Math.sqrt(Math.max(0, distance * distance - width * width)));
            }
            const result = {
                type: shapeMap[doc.t] ?? "circle",
                distance,
                radius: distance,
                width,
                angle: doc.angle ?? 53.13,
                x: doc.x ?? 0,
                y: doc.y ?? 0
            };
            log.debug("FoundryVTTV14Adapter.detectProperties | Detected from doc.t (MeasuredTemplate):", result);
            return result;
        }

        if (shapesList.length === 0) {
            const fallbackDistance = doc.distance ?? doc.radius ?? 0;
            return {
                type: "circle",
                distance: fallbackDistance,
                radius: fallbackDistance,
                width: doc.width ?? 5,
                angle: doc.angle ?? 360,
                x: doc.x ?? 0,
                y: doc.y ?? 0
            };
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
        const docName = previewDoc.documentName ?? (previewDoc.shapes ? "Region" : "MeasuredTemplate");
        if (docName === "Region") {
            const shapesList = this._getShapesArray(previewDoc);
            const orig = typeof shapesList[0]?.toObject === "function" ? shapesList[0].toObject() : shapesList[0];
            const updatedShape = this._formatRegionShapeUpdate(orig, coords);
            delete updatedShape._id;
            try {
                previewDoc.updateSource({ shapes: [updatedShape] }); 
            } catch (e) {
                previewDoc.shapes = [updatedShape];
            }
        } else {
            const isRect = previewDoc.t === "rect" || coords.type === "square" || coords.type === "rect" || coords.originalType === "square" || coords.t === "rect";
            const isSticky = Boolean(coords.sticky ?? coords.token);
            const pxPerFoot = (canvas?.dimensions?.size ?? 100) / (canvas?.dimensions?.distance ?? 5);
            let distFoot = coords.distance ?? coords.radius ?? coords.width;
            const widthFoot = coords.width ?? coords.distance ?? coords.radius;
            if (isRect && widthFoot > 0 && distFoot > widthFoot) {
                const isSquareDiagonal = distFoot <= widthFoot * 1.6;
                distFoot = isSquareDiagonal ? widthFoot : Math.round(Math.sqrt(Math.max(0, distFoot * distFoot - widthFoot * widthFoot)));
            }

            let targetX = coords.x;
            let targetY = coords.y;
            if (isRect && isSticky && targetX !== undefined && targetY !== undefined) {
                const wPx = (widthFoot ?? 20) * pxPerFoot;
                const rad = ((coords.direction ?? coords.rotation ?? previewDoc.direction ?? 0) * Math.PI) / 180;
                targetX = Math.round(targetX + (wPx / 2) * Math.sin(rad));
                targetY = Math.round(targetY - (wPx / 2) * Math.cos(rad));
            }

            const updateObj = {};
            if (targetX !== undefined) updateObj.x = targetX;
            if (targetY !== undefined) updateObj.y = targetY;
            if (coords.direction !== undefined) updateObj.direction = coords.direction;
            else if (coords.rotation !== undefined) updateObj.direction = coords.rotation;
            if (isRect) {
                updateObj.t = "rect";
                const w = coords.width ?? coords.distance ?? coords.radius ?? 20;
                const h = coords.distance ?? coords.radius ?? coords.width ?? w;
                updateObj.distance = Math.round(Math.sqrt(w * w + h * h) * 100) / 100;
                updateObj.width = w;
            } else {
                if (coords.distance !== undefined) updateObj.distance = coords.distance;
                else if (coords.radius !== undefined) updateObj.distance = coords.radius;
                if (coords.width !== undefined) updateObj.width = coords.width;
            }

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
        const styling = this.extractPlacedStylingFlags(config);
        const docName = doc.documentName ?? (doc.shapes ? "Region" : "MeasuredTemplate");
        if (docName === "Region") {
            const originalShape = doc.shapes?.[0] ?? doc.shapes?.contents?.[0];
            if (originalShape) {
                const updateData = {
                    flags: styling.flags
                };
                const shapeCoords = {
                    ...coords,
                    gridUnits: coords.gridUnits ?? config.gridUnits ?? true,
                    sticky: Boolean(config.token ?? coords.token ?? coords.sticky)
                };
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
            }
        } else {
            const pxPerFoot = (canvas?.dimensions?.size ?? 100) / (canvas?.dimensions?.distance ?? 5);
            let distFoot = coords.distance ?? coords.radius ?? coords.width;
            const widthFoot = coords.width ?? coords.distance ?? coords.radius;
            const isRect = (doc.t === "rect" || coords.type === "square" || coords.type === "rect" || coords.originalType === "square" || config.originalType === "square" || coords.t === "rect" || config.t === "rect" || config.type === "square" || config.type === "rect");
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
            if (isRect) {
                updateData.t = "rect";
                const w = coords.width ?? coords.distance ?? coords.radius ?? config.width ?? config.distance ?? config.radius ?? 20;
                const h = coords.distance ?? coords.radius ?? coords.width ?? config.distance ?? config.radius ?? config.width ?? w;
                updateData.distance = Math.round(Math.sqrt(w * w + h * h) * 100) / 100;
                updateData.width = w;
            } else {
                if (coords.distance !== undefined) updateData.distance = coords.distance;
                else if (coords.radius !== undefined) updateData.distance = coords.radius;
                if (coords.width !== undefined) updateData.width = coords.width;
            }

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
        const isSquareOrRect = config.originalType === "square" || config.type === "square" || config.type === "rect" || config.t === "rect" || config.t === "square";
        const isSticky = Boolean((config.stickToToken ?? config.sticky) && config.token);
        return {
            x,
            y,
            direction,
            rotation: direction,
            distance: config.distance ?? config.radius,
            radius: config.radius ?? config.distance,
            width: config.width,
            gridUnits: Boolean(config.gridUnits ?? true),
            sticky: isSticky,
            type: isSquareOrRect ? "square" : (config.originalType ?? config.type),
            originalType: config.originalType,
            t: isSquareOrRect ? "rect" : config.t
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
            let distFoot = coords.distance ?? coords.radius ?? coords.width;
            let widthFoot = coords.width ?? coords.distance ?? coords.radius;
            const isSquare = coords.type === "square" || coords.originalType === "square" || coords.t === "rect" || (distFoot > 0 && distFoot === widthFoot);
            if (isSquare) {
                const sideLength = widthFoot ?? distFoot ?? 20;
                distFoot = sideLength;
                widthFoot = sideLength;
            } else if (widthFoot > 0 && distFoot > widthFoot) {
                const isSquareDiagonal = distFoot <= widthFoot * 1.6;
                distFoot = isSquareDiagonal ? widthFoot : Math.round(Math.sqrt(Math.max(0, distFoot * distFoot - widthFoot * widthFoot)));
            }
            if (distFoot !== undefined) {
                shape.width = isGridUnits ? Math.round(distFoot * pxPerFoot) : distFoot;
            }
            if (widthFoot !== undefined) {
                shape.height = isGridUnits ? Math.round(widthFoot * pxPerFoot) : widthFoot;
            }

            if (coords.x !== undefined && coords.y !== undefined) {
                const wPx = shape.width ?? 200;
                const rad = ((shape.rotation ?? 0) * Math.PI) / 180;
                const isSticky = Boolean(coords.sticky ?? coords.token);
                if (isSticky) {
                    shape.x = Math.round(coords.x + (wPx / 2) * Math.sin(rad));
                    shape.y = Math.round(coords.y - (wPx / 2) * Math.cos(rad));
                } else {
                    shape.x = Math.round(coords.x);
                    shape.y = Math.round(coords.y);
                }
            }
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
        log.debug("FoundryVTTV14Adapter._formatRegionShapeUpdate | [Square Lifecycle 4/5] Region shape modified for Foundry after left click:", {
            originalShape,
            inputCoords: coords,
            pxPerFoot,
            isGridUnits,
            modifiedRegionShape: shape
        });
        return shape;
    }

    /**
     * Resume deferred Region or MeasuredTemplate creation in V14 when an interactive Sequencer placement resolves.
     * @param {Scene} scene - Target Canvas Scene
     * @param {Object} deferredData - Initial raw document creation data (`doc.toObject()`)
     * @param {Object} coords - Resolved placement coordinates from Sequencer
     * @returns {Promise<void>} Resolves when deferred document creation completes
     */
    _getDeferredDocumentName(data, documentName) {
        return documentName ?? (data.shapes ? "Region" : "MeasuredTemplate");
    }

    _applyDeferredCoordinates(data, coords, docName) {
        if (docName === "Region") {
            const shapesList = data.shapes?.contents ?? (Array.isArray(data.shapes) ? data.shapes : []);
            if (shapesList.length > 0) {
                const origShape = typeof shapesList[0]?.toObject === "function" ? shapesList[0].toObject() : shapesList[0];
                const newShape = this._formatRegionShapeUpdate(origShape, coords);
                delete newShape._id;
                data.shapes = [newShape];
            }
        } else {
            if (coords.x !== undefined) data.x = coords.x;
            if (coords.y !== undefined) data.y = coords.y;
            if (coords.direction !== undefined) data.direction = coords.direction;
            else if (coords.rotation !== undefined) data.direction = coords.rotation;
            if (coords.distance !== undefined) data.distance = coords.distance;
            else if (coords.radius !== undefined) data.distance = coords.radius;
        }
    }

    /**
     * Refresh the rendering and grid highlights of a preview Region or MeasuredTemplate.
     * Prevents the native template/region borders/shapes from flashing visible on rendering cycles.
     * @param {PlaceableObject} tmpl - The preview Region or MeasuredTemplate
     * @param {number} direction - The current direction in degrees
     * @returns {void}
     */
    refreshTemplateHighlights(tmpl, direction) {
        if (!tmpl) return;

        const doc = tmpl.document;
        if (!doc) return;

        const isRegion = doc.documentName === "Region";

        if (isRegion) {
            if (tmpl.renderFlags) {
                tmpl.renderFlags.set({ refreshState: true, refresh: true });
            }
            if (typeof tmpl.applyRenderFlags === "function") tmpl.applyRenderFlags();
            this.hidePreview(tmpl);
            return;
        }

        // MeasuredTemplate in V14:
        if (tmpl.isPreview && !tmpl._bbcRotateOverridden) {
            tmpl._bbcRotateOverridden = true;
            tmpl._onRotate = function(event) {
                if (event && typeof event.stopPropagation === "function") event.stopPropagation();
            };
        }

        const rad = direction * (Math.PI / 180);
        tmpl.direction = direction;

        doc.direction = direction;
        doc.updateSource({ direction });
        doc._shape = null;
        if (doc.shape?.clear) doc.shape.clear();

        tmpl._shape = null;
        if (tmpl.shape?.clear) tmpl.shape.clear();


        if (tmpl.renderFlags) {
            tmpl.renderFlags.set({
                refreshShape: true,
                refreshTemplate: true,
                refreshGrid: true,
                refreshState: true,
                refresh: true
            });
        }
        if (typeof tmpl.applyRenderFlags === "function") tmpl.applyRenderFlags();
        if (typeof tmpl._refreshShape === "function") tmpl._refreshShape();
        if (typeof tmpl.highlightGrid === "function") tmpl.highlightGrid();

        this.hidePreview(tmpl);
    }

    /**
     * Handle document post-creation hook for V14 (createRegion / createMeasuredTemplate).
     * Logs the actual region/template shape that Foundry ended up making, and delegates to base implementation.
     * @param {Document} doc - Template or Region document that was created
     * @param {Object} _options - Document creation options
     * @param {string} userId - ID of the user creating the document
     * @returns {Promise<void>} Resolves when post-placement execution completes
     */
    async handleCreateDocument(doc, _options, userId) {
        await super.handleCreateDocument(doc, _options, userId);
        if (userId === game?.user?.id && doc) {
            const docName = doc.documentName ?? (doc.shapes ? "Region" : "MeasuredTemplate");
            const shapesList = this._getShapesArray(doc);
            log.debug("FoundryVTTV14Adapter.handleCreateDocument | [Square Lifecycle 5/5] Actual region shape Foundry ended up making:", {
                docId: doc.id,
                documentName: docName,
                shapes: shapesList,
                rawDocument: typeof doc.toObject === "function" ? doc.toObject() : doc
            });
        }
    }

    _snapPoint(x, y, numMode) {
        const snapped = canvas.grid.getSnappedPoint({ x, y }, { mode: numMode });
        return { x: snapped.x, y: snapped.y };
    }

    _getGridCenterPoint(x, y) {
        const pt = canvas.grid.getCenterPoint({ x, y });
        return { x: pt.x, y: pt.y };
    }
}
