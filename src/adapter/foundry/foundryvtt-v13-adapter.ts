import { BaseFoundryVTTAdapter } from "./base-foundryvtt-adapter.js";
import { systemAdapter, BaseSystemAdapter } from "../system/index.js";
import { log } from "../../lib/logger.js";
import { localize } from "../../lib/utils.js";
import { activePlacementTracker } from "../../crosshair/util.js";

/**
 * Adapter subclass encapsulating Foundry VTT v13 MeasuredTemplate placement behavior.
 */
export class FoundryVTTV13Adapter extends BaseFoundryVTTAdapter {
    /**
     * Construct a Foundry VTT V13 adapter instance.
     */
    constructor() {
        super();
        this.version = 13;
        this._patchRefreshState();
    }

    /**
     * Patch _refreshState across MeasuredTemplate, Region, and Sequencer CrosshairsPlaceable in V13
     * to prevent unhandled TypeError exceptions when the highlight layer or visual containers
     * are undefined or being destroyed during cancellation/dismissal.
     * @returns {void}
     */
    _patchRefreshState() {
        const classesToPatch: any[] = [
            CONFIG?.MeasuredTemplate?.objectClass,
            CONFIG?.Region?.objectClass
        ].filter(cls => Boolean(cls?.prototype));

        if (game?.modules?.get("sequencer")?.active) {
            try {
                if (Sequencer?.CrosshairsPlaceable) {
                    classesToPatch.push(Sequencer.CrosshairsPlaceable);
                }
            } catch (e) {}
        }

        for (const cls of classesToPatch) {
            if (cls.prototype._bbcRefreshStatePatched) continue;
            cls.prototype._bbcRefreshStatePatched = true;

            const orig = cls.prototype._refreshState;
            cls.prototype._refreshState = function (this: any, ...args: any[]) {
                const gridApi: any = canvas?.interface?.grid ?? canvas?.grid;
                if (gridApi?.getHighlightLayer && this.highlightId) {
                    const hl = gridApi.getHighlightLayer(this.highlightId);
                    if (!hl && gridApi.addHighlightLayer) {
                        try { gridApi.addHighlightLayer(this.highlightId); } catch (e) {}
                    }
                }
                const fallbackContainer: any = {
                    position: { x: 0, y: 0, set: () => {} },
                    visible: false,
                    renderable: false,
                    alpha: 0,
                    worldAlpha: 0,
                    zIndex: 0,
                    text: "",
                    destroy: () => {},
                    render: () => {},
                    _render: () => {},
                    renderAdvanced: () => {}
                };
                if (!this.mesh && this.mesh !== null) {
                    try { this.mesh = fallbackContainer; } catch (e) {}
                }
                if (!this.template && this.template !== null) {
                    try { this.template = fallbackContainer; } catch (e) {}
                }
                if (!this.border && this.border !== null) {
                    try { this.border = fallbackContainer; } catch (e) {}
                }
                if (!this.shape && this.shape !== null) {
                    try { this.shape = fallbackContainer; } catch (e) {}
                }
                if (!this.controlIcon && this.controlIcon !== null) {
                    try { this.controlIcon = fallbackContainer; } catch (e) {}
                }
                if (!this.ruler && this.ruler !== null) {
                    try { this.ruler = fallbackContainer; } catch (e) {}
                }
                try {
                    return orig?.apply(this, args);
                } catch (e) {
                    log.debug("FoundryVTTV13Adapter._patchRefreshState | Safely caught core highlightLayer or visual container exception during teardown/refresh:", e);
                }
            };
        }
    }

    /**
     * Return canonical document terminology string ("template").
     * @returns {string} The localized or canonical document type term
     */
    get documentTerm() {
        return "template";
    }

    /**
     * Return section title header for pre-placement configuration.
     * @returns {string} Section header text
     */
    get prePlacementTitle() {
        return localize("BBC.autorecMenu.preTemplatePlacement", "Pre-Template Placement");
    }

    /**
     * Return section title header for template preview placement configuration.
     * @returns {string} Section header text
     */
    get previewPlacementSectionTitle() {
        return localize("BBC.autorecMenu.templatePreviewPlacementConfig", "Template Preview Placement Configuration");
    }

    /**
     * Return section title header for placement configuration.
     * @returns {string} Section header text
     */
    get placementSectionTitle() {
        return localize("BBC.autorecMenu.templatePlacementConfig", "Template Placement Configuration");
    }

    /**
     * Return section title header for post-placement configuration.
     * @returns {string} Section header text
     */
    get postPlacementTitle() {
        return localize("BBC.autorecMenu.postTemplatePlacement", "Post-Template Placement");
    }

    /**
     * Return supported base canvas PlaceableObject type names for Foundry VTT v13.
     * @returns {string[]} Base placeable type names
     */
    get supportedBasePlaceables() {
        return ["MeasuredTemplate"];
    }

    /**
     * Return supported document creation type names (`preCreate`/`create` hook suffixes) for Foundry VTT v13.
     * @returns {string[]} Document type names
     */
    get supportedDocumentTypes() {
        return ["MeasuredTemplate"];
    }

    /**
     * Generate structured placement hook descriptors for Foundry VTT v13.
     * Quarantined directly inside FoundryVTTV13Adapter without relying on base class generation logic.
     * @param {Object} callbacks - Placement hook callbacks (`{ onDrawPreview, onPreCreate, onCreate }`)
     * @param {Object} [sysAdapter=systemAdapter] - Active System Adapter instance
     * @returns {Array<{event: string, handler: Function, category: string, targetName: string}>} Array of generated hook descriptor objects
     */
    generatePlacementHooks(callbacks: any = {}, sysAdapter: any = systemAdapter): any[] {
        const targetSysAdapter = sysAdapter ?? systemAdapter;
        if (targetSysAdapter && !(targetSysAdapter instanceof BaseSystemAdapter)) {
            throw new Error(`generatePlacementHooks requires a valid BaseSystemAdapter instance, received: ${targetSysAdapter}`);
        }
        const onDrawPreview = callbacks?.onDrawPreview ?? ((placeable: any) => this.handleDrawPreview(placeable));
        const onPreCreate = callbacks?.onPreCreate ?? ((doc: any, _data: any, _options: any, userId?: string) => this.handlePreCreate(doc, _data, _options, userId));
        const onCreate = callbacks?.onCreate ?? ((doc: any, _options: any, userId?: string) => this.handleCreateDocument(doc, _options, userId));
        const onUpdate = callbacks?.onUpdate ?? ((doc: any, changed: any, _options: any, userId?: string) => this.handleUpdateDocument(doc, changed, _options, userId));
        const onDelete = callbacks?.onDelete ?? ((doc: any, _options: any, userId?: string) => this.handleDeleteDocument(doc, _options, userId));
        const basePlaceables = this.supportedBasePlaceables;
        const customPlaceables = targetSysAdapter?.getCustomPlaceableClassNames?.() ?? [];
        const dynamicPlaceables: any[] = [];

        if (CONFIG) {
            for (const base of basePlaceables) {
                const customClass = (CONFIG as any)[base]?.objectClass?.name;
                if (customClass && !basePlaceables.includes(customClass) && !customPlaceables.includes(customClass)) {
                    dynamicPlaceables.push(customClass);
                }
            }
        }

        const drawPlaceables = new Set([...basePlaceables, ...customPlaceables, ...dynamicPlaceables]);
        const drawHooks = Array.from(drawPlaceables).flatMap((placeableName) => [
            { event: `draw${placeableName}`, handler: onDrawPreview, category: "draw", targetName: placeableName },
            { event: `refresh${placeableName}`, handler: (template: any) => this.handleMeasuredTemplateRefresh(template), category: "refresh", targetName: placeableName }
        ]);

        const baseDocumentTypes = this.supportedDocumentTypes;
        const customDocumentTypes = targetSysAdapter?.getCustomDocumentTypes?.() ?? [];
        const dynamicDocumentTypes: any[] = [];

        if (CONFIG) {
            for (const docType of baseDocumentTypes) {
                const customDocName = (CONFIG as any)[docType]?.documentClass?.documentName;
                if (customDocName && !baseDocumentTypes.includes(customDocName) && !customDocumentTypes.includes(customDocName)) {
                    dynamicDocumentTypes.push(customDocName);
                }
            }
        }

        const createDocumentTypes = new Set([...baseDocumentTypes, ...customDocumentTypes, ...dynamicDocumentTypes]);
        const documentHooks = Array.from(createDocumentTypes).flatMap((docType) => [
            { event: `preCreate${docType}`, handler: onPreCreate, category: "preCreate", targetName: docType },
            { event: `create${docType}`, handler: onCreate, category: "create", targetName: docType },
            { event: `update${docType}`, handler: onUpdate, category: "update", targetName: docType },
            { event: `delete${docType}`, handler: onDelete, category: "delete", targetName: docType }
        ]);

        const generatedHooks = [...drawHooks, ...documentHooks];

        if (targetSysAdapter?.modifyPlacementHooks) {
            const modifiedHooks = targetSysAdapter.modifyPlacementHooks(generatedHooks, callbacks);
            log.debug("FoundryVTTV13Adapter.generatePlacementHooks | Modified placement hooks from system adapter:", modifiedHooks);
            return modifiedHooks;
        }

        log.debug("FoundryVTTV13Adapter.generatePlacementHooks | Generated placement hooks:", generatedHooks);
        return generatedHooks;
    }

    /**
     * Detect shape type and geometric dimensions from a MeasuredTemplate document in V13.
     * @param {Document} doc - MeasuredTemplate document
     * @returns {{type: string, distance: number, radius: number, width: number, angle: number, direction: number, rotation: number, x: number, y: number, elevation: number}} Detected shape properties and dimensions
     */
    detectProperties(doc: any) {
        const targetDoc = doc?.document ? doc.document : doc;
        if (!targetDoc) {
            return { type: "circle", t: "circle", distance: 0, radius: 0, width: 5, angle: 360, direction: 0, rotation: 0, x: 0, y: 0, elevation: 0 };
        }
        const shapeMap: Record<string, string> = {
            circle: "circle",
            cone: "cone",
            ray: "ray",
            rect: "square"
        };
        let distance = targetDoc.distance ?? 0;
        const width = targetDoc.width ?? 5;
        if (targetDoc.t === "rect" && width > 0 && distance > width) {
            const isSquareDiagonal = distance <= width * 1.6;
            distance = isSquareDiagonal ? width : Math.round(Math.sqrt(Math.max(0, distance * distance - width * width)));
        }
        let rawDir = targetDoc.direction ?? 0;
        if (targetDoc.t === "rect") {
            const w = width > 0 ? width : distance;
            const h = distance > 0 ? distance : w;
            const diagAngle = Math.atan2(h, w) * (180 / Math.PI);
            rawDir = (rawDir - diagAngle + 360) % 360;
        }
        return {
            type: shapeMap[targetDoc.t] ?? "circle",
            t: targetDoc.t ?? "circle",
            distance,
            radius: distance,
            width,
            angle: targetDoc.angle ?? (targetDoc.t === "cone" ? 53.13 : 360),
            direction: rawDir,
            rotation: rawDir,
            x: targetDoc.x ?? 0,
            y: targetDoc.y ?? 0,
            elevation: targetDoc.elevation ?? 0
        };
    }

    /**
     * Format drag destination coordinates into a V13 MeasuredTemplate placement coordinates payload.
     * @param {number} x - Destination x-coordinate
     * @param {number} y - Destination y-coordinate
     * @param {number} direction - Direction angle in degrees
     * @param {Object} [config={}] - Optional sequence placement configuration
     * @returns {{x: number, y: number, direction: number, rotation: number, distance: number|undefined, radius: number|undefined, width: number|undefined, sticky: boolean, type: string, originalType: string|undefined, t: string}} Formatted placement coordinates payload
     */
    formatPlacementCoordinates(x: number, y: number, direction: number, config: any = {}): any {
        const shapeTypeMap: Record<string, string> = {
            circle: "circle",
            cone: "cone",
            ray: "ray",
            rect: "rect",
            square: "rect"
        };
        const rawType = config.originalType ?? config.type ?? config.t;
        const resolvedT = shapeTypeMap[rawType] ?? config.t ?? "circle";
        const isSquareOrRect = resolvedT === "rect";
        const stickVal = config.stickToToken ?? config.sticky;
        const isSticky = Boolean(stickVal && stickVal !== "none" && stickVal !== "false" && config.token);
        const primaryDim = config.distance ?? config.radius;

        let finalDirection = Number.isFinite(direction) ? (((direction % 360) + 360) % 360) : 0;
        if (isSquareOrRect) {
            const rawDist = config.distance ?? config.radius;
            let distFoot = rawDist;
            const widthFoot = config.width ?? distFoot;
            if (widthFoot > 0 && distFoot > widthFoot) {
                const isSquareDiagonal = distFoot <= widthFoot * 1.6;
                distFoot = isSquareDiagonal ? widthFoot : Math.round(Math.sqrt(Math.max(0, distFoot * distFoot - widthFoot * widthFoot)));
            }
            const w = widthFoot ?? 20;
            const h = distFoot ?? w;
            finalDirection = Math.atan2(h, w) * (180 / Math.PI);
        }

        return {
            x: Math.round(x),
            y: Math.round(y),
            direction: finalDirection,
            rotation: finalDirection,
            distance: config.distance ?? primaryDim,
            radius: config.radius ?? primaryDim,
            width: config.width,
            angle: config.angle,
            sticky: isSticky,
            type: isSquareOrRect ? "square" : (config.originalType ?? config.type ?? "circle"),
            originalType: config.originalType,
            t: resolvedT
        };
    }

    /**
     * Check whether Foundry V13 supports rotating a specific shape type.
     * V13 MeasuredTemplate rects/squares cannot be rotated diagonally on canvas grid.
     * @param {string} shapeType - The shape type identifier
     * @returns {boolean} False for rect and square, true for circle, cone, ray
     */
    supportsShapeRotation(shapeType: string): boolean {
        if (!shapeType) return true;
        const lower = String(shapeType).toLowerCase();
        return lower !== "rect" && lower !== "square";
    }

    /**
     * Return template pixel multiplier factor and gridUnits mode for Sequencer effects in V13.
     * @returns {{factor: number, gridUnits: boolean}} Template pixel multiplier factor and gridUnits mode
     */
    getTemplatePixelFactor() {
        return { factor: 1, gridUnits: false };
    }

    /**
     * Update live canvas preview shape coordinates during mouse drag.
     * @param {Document} previewDoc - Preview MeasuredTemplate document
     * @param {{x?: number, y?: number, direction?: number, distance?: number, width?: number, angle?: number, type?: string, originalType?: string, t?: string, sticky?: boolean, token?: Token}} coords - Destination preview coordinates
     * @returns {void}
     */
    updatePreviewShape(previewDoc: any, coords: any): void {
        if (!previewDoc || !coords) return;
        const targetDoc = previewDoc.document ? previewDoc.document : previewDoc;
        const tmpl = previewDoc._object ? previewDoc._object : (previewDoc.document ? previewDoc : null);
        const isRect = targetDoc.t === "rect" || coords.type === "square" || coords.type === "rect" || coords.originalType === "square" || coords.t === "rect";
        const pxPerFoot = this.pixelsPerDistance;
        let distFoot = coords.distance ?? coords.radius;
        const widthFoot = coords.width ?? distFoot;

        if (isRect) {
            if (widthFoot > 0 && distFoot > widthFoot) {
                const isSquareDiagonal = distFoot <= widthFoot * 1.6;
                distFoot = isSquareDiagonal ? widthFoot : Math.round(Math.sqrt(Math.max(0, distFoot * distFoot - widthFoot * widthFoot)));
            }

            let targetX = coords.x;
            let targetY = coords.y;
            const rad = ((coords.direction ?? coords.rotation ?? targetDoc.direction ?? 0) * Math.PI) / 180;
            const isSticky = Boolean(coords.sticky ?? coords.token);

            if (isSticky && targetX !== undefined && targetY !== undefined) {
                const wPx = (widthFoot ?? 20) * pxPerFoot;
                targetX = Math.round(targetX + (wPx / 2) * Math.sin(rad));
                targetY = Math.round(targetY - (wPx / 2) * Math.cos(rad));
            }

            targetDoc.t = "rect";
            const w = widthFoot ?? 20;
            const h = distFoot ?? w;
            const diagDist = Math.round(Math.sqrt(w * w + h * h) * 100) / 100;
            const diagAngle = Math.atan2(h, w) * (180 / Math.PI);
            targetDoc.distance = diagDist;
            targetDoc.width = w;
            targetDoc.direction = diagAngle;

            const updateObj: Record<string, any> = {
                t: "rect",
                distance: diagDist,
                width: w,
                direction: diagAngle
            };
            if (targetX !== undefined) {
                targetDoc.x = targetX;
                updateObj.x = targetX;
            }
            if (targetY !== undefined) {
                targetDoc.y = targetY;
                updateObj.y = targetY;
            }

            if (targetDoc.updateSource) {
                try { targetDoc.updateSource(updateObj); } catch (e) { Object.assign(targetDoc, updateObj); }
            } else {
                Object.assign(targetDoc, updateObj);
            }

            if (tmpl) {
                try { tmpl.position?.set?.(targetDoc.x, targetDoc.y); } catch (e) {}
                try { tmpl.x = targetDoc.x; tmpl.y = targetDoc.y; } catch (e) {}
                tmpl.direction = diagAngle;
                this._safeSetRenderFlags(tmpl, { refreshPosition: true, refreshShape: true });
                tmpl.applyRenderFlags?.();
            }
        } else {
            const updateObj: Record<string, any> = {};
            if (coords.x !== undefined) {
                targetDoc.x = Math.round(coords.x);
                updateObj.x = Math.round(coords.x);
            }
            if (coords.y !== undefined) {
                targetDoc.y = Math.round(coords.y);
                updateObj.y = Math.round(coords.y);
            }
            if (coords.direction !== undefined) {
                const normDir = ((coords.direction % 360) + 360) % 360;
                targetDoc.direction = normDir;
                updateObj.direction = normDir;
            }
            if (coords.t !== undefined) {
                targetDoc.t = coords.t;
                updateObj.t = coords.t;
            }
            if (coords.distance !== undefined) {
                targetDoc.distance = Math.max(0, coords.distance);
                updateObj.distance = Math.max(0, coords.distance);
            }
            if (coords.angle !== undefined) {
                targetDoc.angle = coords.angle;
                updateObj.angle = coords.angle;
            }
            if (coords.width !== undefined) {
                targetDoc.width = coords.width;
                updateObj.width = coords.width;
            }

            if (targetDoc.updateSource) {
                try { targetDoc.updateSource(updateObj); } catch (e) { Object.assign(targetDoc, updateObj); }
            } else {
                Object.assign(targetDoc, updateObj);
            }

            if (tmpl) {
                try { tmpl.position?.set?.(targetDoc.x, targetDoc.y); } catch (e) {}
                try { tmpl.x = targetDoc.x; tmpl.y = targetDoc.y; } catch (e) {}
                if (coords.direction !== undefined) tmpl.direction = targetDoc.direction;
                this._safeSetRenderFlags(tmpl, { refreshPosition: true, refreshShape: true });
                tmpl.applyRenderFlags?.();
            }
        }
    }

    /**
     * Apply resolved placement coordinates and workflow flags onto a MeasuredTemplate document in V13.
     * @param {Document} doc - MeasuredTemplate document
     * @param {Object} [coords={}] - Resolved placement coordinates
     * @param {Object} [config={}] - Workflow placement configuration
     * @param {Object|null} [data=null] - Document update payload
     * @returns {void}
     */
    applyDocumentPlacement(doc: any, coords: any = {}, config: any = {}, data: any = null): void {
        if (!doc) return;
        const targetDoc = doc.document ? doc.document : doc;
        const styling = this.extractPlacedStylingFlags(config);
        const isRect = targetDoc.t === "rect" || coords.type === "square" || coords.type === "rect" || coords.originalType === "square" || config.originalType === "square" || coords.t === "rect" || config.t === "rect" || config.type === "square" || config.type === "rect";
        const updateData: Record<string, any> = {
            flags: styling.flags
        };

        const pxPerFoot = this.pixelsPerDistance;
        const rawDist = coords.distance ?? coords.radius;
        let distFoot = rawDist ?? config.distance ?? config.radius;
        const widthFoot = coords.width ?? config.width ?? distFoot;

        if (isRect) {
            if (widthFoot > 0 && distFoot > widthFoot) {
                const isSquareDiagonal = distFoot <= widthFoot * 1.6;
                distFoot = isSquareDiagonal ? widthFoot : Math.round(Math.sqrt(Math.max(0, distFoot * distFoot - widthFoot * widthFoot)));
            }

            let targetX = coords.x;
            let targetY = coords.y;
            const rad = ((coords.direction ?? coords.rotation ?? targetDoc.direction ?? 0) * Math.PI) / 180;
            const isSticky = Boolean(config.token ?? coords.token ?? coords.sticky);

            if (isSticky && targetX !== undefined && targetY !== undefined) {
                const wPx = (widthFoot ?? 20) * pxPerFoot;
                targetX = Math.round(targetX + (wPx / 2) * Math.sin(rad));
                targetY = Math.round(targetY - (wPx / 2) * Math.cos(rad));
            }

            updateData.t = "rect";
            if (targetX !== undefined) updateData.x = Math.round(targetX);
            if (targetY !== undefined) updateData.y = Math.round(targetY);
            const w = coords.width ?? config.width ?? distFoot ?? 20;
            const h = distFoot ?? config.distance ?? config.radius ?? w;
            const diagDist = Math.round(Math.hypot(w, h) * 100) / 100;
            const diagAngle = Math.atan2(h, w) * (180 / Math.PI);
            updateData.distance = diagDist;
            updateData.width = w;
            updateData.direction = diagAngle;
        } else {
            if (coords.x !== undefined) updateData.x = Math.round(coords.x);
            if (coords.y !== undefined) updateData.y = Math.round(coords.y);
            if (coords.direction !== undefined) updateData.direction = ((coords.direction % 360) + 360) % 360;
            else if (coords.rotation !== undefined) updateData.direction = ((coords.rotation % 360) + 360) % 360;
            if (coords.t !== undefined) updateData.t = coords.t;
            else if (config.t !== undefined) updateData.t = config.t;
            if (coords.distance !== undefined) updateData.distance = coords.distance;
            else if (coords.radius !== undefined) updateData.distance = coords.radius;
            if (coords.angle !== undefined) updateData.angle = coords.angle;
            else if (config.angle !== undefined) updateData.angle = config.angle;
            if (coords.width !== undefined) updateData.width = coords.width;
        }

        if (styling.placedFillColor !== undefined && styling.placedFillColor !== null) updateData.fillColor = styling.placedFillColor;
        if (styling.placedBorderColor !== undefined && styling.placedBorderColor !== null) updateData.borderColor = styling.placedBorderColor;
        if (styling.placedFillAlpha !== undefined) updateData.fillAlpha = styling.placedFillAlpha;
        if (styling.placedBorderAlpha !== undefined) updateData.borderAlpha = styling.placedBorderAlpha;
        if (config.hidden || config.hideTemplate) updateData.hidden = true;

        if (targetDoc?.updateSource) {
            targetDoc.updateSource(updateData);
        } else {
            Object.assign(targetDoc, updateData);
        }
        if (data) {
            this.mergeObject(data, updateData);
        }
    }

    /**
     * Resume deferred MeasuredTemplate creation in V13 when an interactive Sequencer placement resolves.
     * @param {Object} data - Initial raw document creation data (`doc.toObject()`)
     * @param {string} [documentName] - Explicit document type name
     * @returns {string} Always "MeasuredTemplate" in V13
     */
    _getDeferredDocumentName(data: any, documentName: any) {
        return "MeasuredTemplate";
    }

    /**
     * Protected helper to apply resolved placement coordinates onto deferred creation data in V13.
     * @param {Object} data - Target document data payload
     * @param {Object} coords - Placement coordinates
     * @param {string} docName - Document type name
     * @protected
     */
    _applyDeferredCoordinates(data: any, coords: any, docName: any) {
        if (coords.x !== undefined) data.x = Math.round(coords.x);
        if (coords.y !== undefined) data.y = Math.round(coords.y);
        const isRect = data.t === "rect" || coords.type === "square" || coords.type === "rect" || coords.originalType === "square" || coords.t === "rect";
        if (isRect) {
            data.t = "rect";
            const rawDist = coords.distance ?? coords.radius;
            let distFoot = rawDist;
            const widthFoot = coords.width ?? distFoot;
            if (widthFoot > 0 && distFoot > widthFoot) {
                const isSquareDiagonal = distFoot <= widthFoot * 1.6;
                distFoot = isSquareDiagonal ? widthFoot : Math.round(Math.sqrt(Math.max(0, distFoot * distFoot - widthFoot * widthFoot)));
            }
            const w = widthFoot ?? 20;
            const h = distFoot ?? w;
            data.distance = Math.round(Math.hypot(w, h) * 100) / 100;
            data.width = w;
            data.direction = Math.atan2(h, w) * (180 / Math.PI);
        } else {
            if (coords.direction !== undefined) data.direction = ((coords.direction % 360) + 360) % 360;
            else if (coords.rotation !== undefined) data.direction = ((coords.rotation % 360) + 360) % 360;
            if (coords.distance !== undefined) data.distance = coords.distance;
            else if (coords.radius !== undefined) data.distance = coords.radius;
            if (coords.t !== undefined) data.t = coords.t;
            if (coords.angle !== undefined) data.angle = coords.angle;
            if (coords.width !== undefined) data.width = coords.width;
        }
    }

    /**
     * Refresh the rendering and grid highlights of a preview MeasuredTemplate in V13.
     * Prevents the native template borders/shapes from flashing visible on rendering cycles.
     * @param {PlaceableObject} tmpl - The preview MeasuredTemplate
     * @param {number} direction - The current direction in degrees
     * @returns {void}
     */
    refreshTemplateHighlights(tmpl: any, direction: any) {
        this._patchRefreshState();
        if (!tmpl || tmpl._bbcRefreshingHighlights) return;
        tmpl._bbcRefreshingHighlights = true;

        try {
            const doc = tmpl.document;
            const isRect = doc?.t === "rect" || tmpl.t === "rect";
            const normDir = Number.isFinite(direction) ? (((direction % 360) + 360) % 360) : (doc?.direction ?? tmpl?.direction ?? 0);
            let effectiveDirection = normDir;

            const w = doc?.width ?? 20;
            let distFoot = doc?.distance ?? w;
            if (isRect && w > 0 && distFoot > w) {
                const isSquareDiagonal = distFoot <= w * 1.6;
                distFoot = isSquareDiagonal ? w : Math.round(Math.sqrt(Math.max(0, distFoot * distFoot - w * w)));
            }
            const h = distFoot ?? w;

            if (isRect) {
                effectiveDirection = Math.atan2(h, w) * (180 / Math.PI);
                if (doc) {
                    doc.distance = Math.round(Math.hypot(w, h) * 100) / 100;
                    doc.width = w;
                }
            }

            const rad = effectiveDirection * (Math.PI / 180);
            tmpl.direction = effectiveDirection;

            const shape = tmpl.crosshair?.shapeInstance ?? activePlacementTracker.crosshair?.shapeInstance;
            let targetX = shape?.x ?? doc?.x ?? tmpl.x;
            let targetY = shape?.y ?? doc?.y ?? tmpl.y;

            const isAttached = Boolean(shape?.stickToToken && shape?.token);
            if (isAttached && shape.token) {
                if (shape.type === "circle") {
                    const center = shape.token.center ?? { x: shape.token.x ?? 0, y: shape.token.y ?? 0 };
                    targetX = center.x;
                    targetY = center.y;
                } else {
                    const mousePos = (this.mousePosition && Number.isFinite(this.mousePosition.x))
                        ? this.mousePosition
                        : { x: shape.cursorX ?? shape.x, y: shape.cursorY ?? shape.y };
                    const anchored = this.resolveAnchorPlacement(shape.token, mousePos);
                    targetX = anchored.x;
                    targetY = anchored.y;
                }
            }

            if (doc) {
                doc.direction = effectiveDirection;
                if (targetX !== undefined) doc.x = targetX;
                if (targetY !== undefined) doc.y = targetY;
                const updateData: Record<string, any> = { direction: effectiveDirection };
                if (isRect) {
                    updateData.distance = doc.distance;
                    updateData.width = doc.width;
                }
                if (targetX !== undefined) updateData.x = targetX;
                if (targetY !== undefined) updateData.y = targetY;
                if (doc.updateSource) {
                    try { doc.updateSource(updateData); } catch (e) { Object.assign(doc, updateData); }
                } else {
                    Object.assign(doc, updateData);
                }
                if (doc.shape?.clear) doc.shape.clear();
            }
            if (targetX !== undefined) {
                try { tmpl.x = targetX; } catch (e) {}
                try { tmpl.position?.set?.(targetX, targetY); } catch (e) {}
            }
            if (targetY !== undefined) {
                try { tmpl.y = targetY; } catch (e) {}
            }
            tmpl.rotation = rad;

            const ox = targetX ?? tmpl.ray?.origin?.x ?? tmpl.x ?? 0;
            const oy = targetY ?? tmpl.ray?.origin?.y ?? tmpl.y ?? 0;
            const pxPerFoot = this.pixelsPerDistance;
            const dist = isRect && doc?.distance ? doc.distance * pxPerFoot : (tmpl.ray?.distance ?? ((doc?.distance ?? 30) * pxPerFoot));
            const newRay = this.createRayFromAngle(ox, oy, rad, dist);
            if (newRay) tmpl.ray = newRay;

            try {
                delete tmpl._shape;
                tmpl._shape = null;
                if (tmpl._computeShape) {
                    tmpl.shape = tmpl._computeShape();
                }
            } catch (e) {}

            try { tmpl._refreshPosition?.(); } catch (e) {}
            try { tmpl._refreshShape?.(); } catch (e) {}
            try { tmpl._refreshTemplate?.(); } catch (e) {}
            try { tmpl.ruler?._refreshRulerText?.(); } catch (e) {}

            try {
                Object.defineProperty(tmpl, "isVisible", { get: () => true, configurable: true });
            } catch (e) {}

            const hId = tmpl.highlightId ?? tmpl.objectId ?? `Template.${doc?.id ?? "preview"}`;
            tmpl._bbcHighlightId = hId;
            this.addHighlightLayer(hId);

            this._safeSetRenderFlags(tmpl, {
                refreshTemplate: true,
                refreshShape: true,
                refreshGrid: true,
                refreshState: true,
                refresh: true
            });
            try { tmpl.applyRenderFlags?.(); } catch (e) {}
            try { tmpl.highlightGrid?.(); } catch (e) {}

            const hl = this.getHighlightLayer(hId);
            if (hl) {
                hl.visible = true;
                hl.renderable = true;
            }
        } finally {
            tmpl._bbcRefreshingHighlights = false;
        }
    }

    /**
     * Wrap the preview placeable's highlightGrid and _highlightGrid methods in V13 to synchronize
     * coordinates, rotation, and geometry with the active crosshair shape instance before calculating grid highlights.
     * Ensures document.x, document.y, and shape match the active token anchor point or free cursor before V13 grid tile testing.
     * @override
     * @param {PlaceableObject} placeable - Preview placeable
     * @returns {void}
     */
    _wrapHighlightGrid(placeable: any) {
        this._patchRefreshState();
        if (!placeable || placeable._bbcHighlightGridWrapped) return;
        placeable._bbcHighlightGridWrapped = true;

        try {
            Object.defineProperty(placeable, "isVisible", { get: () => true, configurable: true });
        } catch (e) {}

        const self = this;
        const wrapMethod = (fnName: any) => {
            if (placeable[fnName]) {
                const orig = placeable[fnName];
                placeable[fnName] = function (...args: any[]) {
                    if (this._bbcWrappingMethod) {
                        return orig.apply(this, args);
                    }
                    this._bbcWrappingMethod = true;
                    try {
                        const shape = this.crosshair?.shapeInstance ?? activePlacementTracker.crosshair?.shapeInstance;
                        const isRect = this.document?.t === "rect";

                        const shapeDir = shape?.direction
                            ?? this.crosshair?.direction
                            ?? activePlacementTracker.crosshair?.direction
                            ?? activePlacementTracker.config?.currentDirection
                            ?? activePlacementTracker.config?.direction;
                        const normDir = Number.isFinite(shapeDir) ? (((shapeDir % 360) + 360) % 360) : undefined;

                        if (shape) {
                            let targetX = shape.x;
                            let targetY = shape.y;
                            let effectiveDir = normDir ?? this.document?.direction ?? 0;

                            const isAttached = Boolean(shape.stickToToken && shape.token);
                            if (isAttached && shape.token) {
                                if (shape.type === "circle") {
                                    const center = shape.token.center ?? { x: shape.token.x ?? 0, y: shape.token.y ?? 0 };
                                    targetX = center.x;
                                    targetY = center.y;
                                    effectiveDir = 0;
                                } else {
                                    const mousePos = (self.mousePosition && Number.isFinite(self.mousePosition.x))
                                        ? self.mousePosition
                                        : { x: shape.cursorX ?? shape.x, y: shape.cursorY ?? shape.y };
                                    const anchored = self.resolveAnchorPlacement(shape.token, mousePos);
                                    targetX = anchored.x;
                                    targetY = anchored.y;
                                    effectiveDir = anchored.direction;
                                }
                            }

                            if (isRect) {
                                const w = this.document?.width ?? shape.config?.width ?? 20;
                                let distFoot = this.document?.distance ?? shape.config?.distance ?? w;
                                if (w > 0 && distFoot > w) {
                                    const isSquareDiagonal = distFoot <= w * 1.6;
                                    distFoot = isSquareDiagonal ? w : Math.round(Math.sqrt(Math.max(0, distFoot * distFoot - w * w)));
                                }
                                const h = distFoot ?? w;
                                effectiveDir = Math.atan2(h, w) * (180 / Math.PI);
                                if (this.document) {
                                    this.document.distance = Math.round(Math.hypot(w, h) * 100) / 100;
                                    this.document.width = w;
                                }
                            }

                            if (this.document) {
                                const updateData: Record<string, any> = {};
                                if (targetX !== undefined) {
                                    this.document.x = targetX;
                                    updateData.x = targetX;
                                }
                                if (targetY !== undefined) {
                                    this.document.y = targetY;
                                    updateData.y = targetY;
                                }
                                if (effectiveDir !== undefined) {
                                    this.document.direction = effectiveDir;
                                    updateData.direction = effectiveDir;
                                }
                                if (isRect) {
                                    updateData.distance = this.document.distance;
                                    updateData.width = this.document.width;
                                }
                                if (this.document.updateSource) {
                                    try { this.document.updateSource(updateData); } catch (e) { Object.assign(this.document, updateData); }
                                } else {
                                    Object.assign(this.document, updateData);
                                }
                            }
                            if (targetX !== undefined) {
                                try { this.x = targetX; } catch (e) {}
                                try { this.position?.set?.(targetX, targetY); } catch (e) {}
                            }
                            if (targetY !== undefined) {
                                try { this.y = targetY; } catch (e) {}
                            }
                            if (effectiveDir !== undefined) {
                                try { this.direction = effectiveDir; } catch (e) {}
                            }

                            if (this.ray) {
                                const rad = ((effectiveDir ?? 0) * Math.PI) / 180;
                                const ox = targetX ?? this.x ?? 0;
                                const oy = targetY ?? this.y ?? 0;
                                const pxPerFoot = self.pixelsPerDistance;
                                const dist = isRect && this.document?.distance
                                    ? this.document.distance * pxPerFoot
                                    : (this.ray.distance ?? 1000);
                                const newRay = self.createRayFromAngle(ox, oy, rad, dist);
                                if (newRay) this.ray = newRay;
                            }

                            try {
                                delete this._shape;
                                this._shape = null;
                                if (this._computeShape) {
                                    this.shape = this._computeShape();
                                }
                            } catch (e) {}

                            try { this._refreshPosition?.(); } catch (e) {}
                            try { this._refreshShape?.(); } catch (e) {}
                            try { this._refreshTemplate?.(); } catch (e) {}
                        }

                        const hId = this.highlightId ?? this.objectId ?? (this.document?.id ? `Template.${this.document.id}` : "Template.preview");
                        this._bbcHighlightId = hId;
                        self.addHighlightLayer(hId);
                        const hl = self.getHighlightLayer(hId);
                        if (hl) {
                            hl.visible = true;
                            hl.renderable = true;
                        }

                        return orig.apply(this, args);
                    } finally {
                        this._bbcWrappingMethod = false;
                    }
                };
            }
        };

        wrapMethod("highlightGrid");
        wrapMethod("_highlightGrid");
        wrapMethod("_refreshGrid");
    }

    /**
     * Intercept preview drawing for MeasuredTemplate in V13.
     * @override
     * @param {PlaceableObject} placeable - Preview placeable
     * @returns {Promise<void>}
     */
    async handleDrawPreview(placeable: any) {
        this._patchRefreshState();
        return super.handleDrawPreview(placeable);
    }

    /**
     * Handle document post-creation hook for V13 (createMeasuredTemplate).
     * @param {Document} doc - MeasuredTemplate document that was created
     * @param {Object} _options - Document creation options
     * @param {string} userId - ID of the user creating the document
     * @returns {Promise<void>} Resolves when post-placement execution completes
     */
    async handleCreateDocument(doc: any, _options: any, userId: any) {
        await super.handleCreateDocument(doc, _options, userId);
    }

    _snapPoint(x: any, y: any, numMode: any) {
        return this.getSnappedPoint({ x, y }, { mode: numMode });
    }

    _getGridCenterPoint(x: any, y: any) {
        return this.getCenterPoint({ x, y });
    }

    /**
     * Preload Handlebars templates using modern Foundry V13+ namespaced API.
     * @override
     * @param {string[]} paths - Array of template paths to preload
     * @returns {Promise<Function[]>}
     */
    async loadTemplates(paths: string[]): Promise<Function[]> {
        return foundry.applications.handlebars.loadTemplates(paths);
    }
}

