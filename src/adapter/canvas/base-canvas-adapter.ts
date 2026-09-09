import { log } from "../../lib/logger.js";

/**
 * Base abstract class for Foundry VTT canvas and grid version-specific adapters.
 * Isolates canvas grid metrics, coordinates, highlighting, stage lifecycle, and placeable layer interactions.
 */
export class BaseCanvasAdapter {
    /**
     * Initialize the base canvas adapter.
     */
    constructor() {
        this.version = 0;
    }

    /**
     * Reference to the active canvas scene.
     * @type {Scene|null}
     */
    get scene() {
        return canvas?.scene ?? null;
    }

    /**
     * Current canvas mouse position.
     * @type {{x: number, y: number}|null}
     */
    get mousePosition() {
        return canvas?.mousePosition ?? null;
    }

    /**
     * Canvas grid size in pixels.
     * @type {number}
     */
    get gridSize() {
        return canvas?.grid?.size ?? canvas?.dimensions?.size ?? 100;
    }

    /**
     * Canvas grid horizontal size in pixels.
     * @type {number}
     */
    get gridSizeX() {
        return canvas?.grid?.sizeX ?? canvas?.grid?.size ?? canvas?.dimensions?.size ?? 100;
    }

    /**
     * Canvas grid vertical size in pixels.
     * @type {number}
     */
    get gridSizeY() {
        return canvas?.grid?.sizeY ?? canvas?.grid?.size ?? canvas?.dimensions?.size ?? 100;
    }

    /**
     * Canvas grid distance per cell (e.g. 5 feet).
     * @type {number}
     */
    get gridDistance() {
        return canvas?.dimensions?.distance ?? 5;
    }

    /**
     * Canvas grid units string (e.g. "ft", "m").
     * @type {string}
     */
    get gridUnits() {
        return canvas?.grid?.units ?? canvas?.dimensions?.units ?? "ft";
    }

    /**
     * Pixels per distance unit (e.g. pixels per foot).
     * @type {number}
     */
    get pixelsPerDistance() {
        const dist = this.gridDistance;
        const size = this.gridSize;
        return (dist > 0) ? (size / dist) : 1;
    }

    /**
     * Canvas dimensions rectangle.
     * @type {Rectangle|null}
     */
    get dimensionsRect() {
        return canvas?.dimensions?.rect ?? null;
    }

    /**
     * Tokens currently controlled by the active user on canvas.
     * @type {Array<Token>}
     */
    get controlledTokens() {
        return canvas?.tokens?.controlled ?? [];
    }

    /**
     * Reference to the primary canvas stage.
     * @type {PIXI.Container|null}
     */
    get stage() {
        return canvas?.stage ?? null;
    }

    /**
     * Reference to the Foundry canvas Pixi application.
     * @type {PIXI.Application|null}
     */
    get app() {
        return canvas?.app ?? null;
    }

    /**
     * Reference to canvas controls layer.
     * @type {ControlsLayer|null}
     */
    get controls() {
        return canvas?.controls ?? null;
    }

    /**
     * Reference to canvas MeasuredTemplate layer.
     * @type {PlaceablesLayer|null}
     */
    get templates() {
        return canvas?.templates ?? null;
    }

    /**
     * Reference to canvas Region layer.
     * @type {PlaceablesLayer|null}
     */
    get regions() {
        return canvas?.regions ?? null;
    }

    /**
     * Active canvas grid highlight layers collection.
     * @type {Object}
     */
    get highlightLayers() {
        return canvas?.interface?.grid?.highlightLayers ?? canvas?.grid?.highlightLayers ?? {};
    }

    /**
     * Adds the specified grid highlight layer across Foundry canvas versions.
     * @param {string} id - The identifier of the highlight layer to add.
     * @returns {void}
     */
    addHighlightLayer(id) {
        if (!id) {
            log.debug("BaseCanvasAdapter.addHighlightLayer | Called with invalid or empty identifier.");
            return;
        }
        const cleanId = id.trim();
        if (!cleanId) return;

        const gridApi = canvas?.interface?.grid ?? canvas?.grid;
        if (gridApi?.addHighlightLayer) {
            try { return gridApi.addHighlightLayer(cleanId); } catch (e) {}
        }
        log.debug(`BaseCanvasAdapter.addHighlightLayer | Could not add highlight layer for key "${cleanId}".`);
    }

    /**
     * Retrieves the specified grid highlight layer from the canvas.
     * @param {string} id - Identifier of the highlight layer
     * @returns {Object|null}
     */
    getHighlightLayer(id) {
        if (!id) {
            log.debug("BaseCanvasAdapter.getHighlightLayer | Called with invalid or empty identifier.");
            return null;
        }
        const cleanId = id.trim();
        if (!cleanId) return null;

        const gridApi = canvas?.interface?.grid ?? canvas?.grid;
        if (gridApi?.getHighlightLayer) {
            try { return gridApi.getHighlightLayer(cleanId); } catch (e) {}
        }
        return canvas?.grid?.highlightLayers?.[cleanId] ?? null;
    }

    /**
     * Clears the specified grid highlight layer on the canvas.
     * @param {string} id - Identifier of the highlight layer
     * @returns {void}
     */
    clearHighlightLayer(id) {
        if (!id) {
            log.debug("BaseCanvasAdapter.clearHighlightLayer | Called with invalid or empty identifier.");
            return;
        }
        const cleanId = id.trim();
        if (!cleanId) return;

        const gridApi = canvas?.interface?.grid ?? canvas?.grid;
        if (gridApi?.clearHighlightLayer) {
            try { return gridApi.clearHighlightLayer(cleanId); } catch (e) {}
        }

        const legacyLayer = canvas?.grid?.highlightLayers?.[cleanId];
        if (legacyLayer?.clear) {
            try { legacyLayer.clear(); return; } catch (e) {}
        }

        log.debug(`BaseCanvasAdapter.clearHighlightLayer | No highlight layer available for key "${cleanId}".`);
    }

    /**
     * Destroys the specified grid highlight layer on the canvas.
     * @param {string} id - Identifier of the highlight layer
     * @returns {void}
     */
    destroyHighlightLayer(id) {
        if (!id) return;
        const cleanId = id.trim();
        if (!cleanId) return;

        const gridApi = canvas?.interface?.grid ?? canvas?.grid;
        if (gridApi?.destroyHighlightLayer) {
            try { gridApi.destroyHighlightLayer(cleanId); } catch (e) {}
        }

        const legacyLayer = canvas?.grid?.highlightLayers?.[cleanId];
        if (legacyLayer?.destroy) {
            try { legacyLayer.destroy({ children: true }); } catch (e) {}
        }
        if (canvas?.grid?.highlightLayers && cleanId in canvas.grid.highlightLayers) {
            try { delete canvas.grid.highlightLayers[cleanId]; } catch (e) {}
        }
    }

    /**
     * Highlights a grid position on the canvas across Foundry versions.
     * @param {string} id - Identifier of the highlight layer
     * @param {Object} [options={}] - Highlight parameters (x, y, color, border, shape)
     * @returns {void}
     */
    highlightPosition(id, options = {}) {
        if (!id) return;
        const cleanId = id.trim();
        if (!cleanId) return;

        const gridApi = canvas?.interface?.grid ?? canvas?.grid;
        if (gridApi?.highlightPosition) {
            try { return gridApi.highlightPosition(cleanId, options); } catch (e) {}
        }
        if (canvas?.grid?.highlightGridPosition) {
            try { return canvas.grid.highlightGridPosition(cleanId, options); } catch (e) {}
        }
    }

    /**
     * Safely clears region layer highlights across versions.
     * @returns {void}
     */
    clearRegionsHighlight() {
        try { canvas?.regions?.highlight?.clear?.(); } catch (e) {}
    }

    /**
     * Deactivates templates and regions placeable layers if active.
     * @returns {void}
     */
    deactivatePlaceablesLayers() {
        try {
            canvas?.templates?.deactivate?.();
            canvas?.regions?.deactivate?.();
        } catch (e) {}
    }

    /**
     * Get the center point of a grid space enclosing the given coordinates across Foundry versions.
     * @param {{x?: number, y?: number, i?: number, j?: number}} coords - Coordinates object
     * @returns {{x: number, y: number}} The center coordinates
     */
    getCenterPoint(coords) {
        if (canvas?.grid?.getCenterPoint) {
            try {
                const pt = canvas.grid.getCenterPoint(coords);
                if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) return { x: pt.x, y: pt.y };
            } catch (e) {}
        }
        if (canvas?.grid?.getCenter) {
            try {
                const [cx, cy] = canvas.grid.getCenter(coords?.x ?? 0, coords?.y ?? 0);
                return { x: cx, y: cy };
            } catch (e) {}
        }
        return { x: coords?.x ?? 0, y: coords?.y ?? 0 };
    }

    /**
     * Get the top-left point of a grid space enclosing the given coordinates across Foundry versions.
     * @param {{x?: number, y?: number, i?: number, j?: number}} coords - Coordinates object
     * @returns {{x: number, y: number}} The top-left coordinates
     */
    getTopLeftPoint(coords) {
        if (canvas?.grid?.getTopLeftPoint) {
            try {
                const pt = canvas.grid.getTopLeftPoint(coords);
                if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) return { x: pt.x, y: pt.y };
            } catch (e) {}
        }
        if (canvas?.grid?.getTopLeft) {
            try {
                const [x, y] = canvas.grid.getTopLeft(coords?.x ?? coords?.i ?? 0, coords?.y ?? coords?.j ?? 0);
                return { x, y };
            } catch (e) {}
        }
        return { x: coords?.x ?? 0, y: coords?.y ?? 0 };
    }

    /**
     * Get snapped point coordinates on the grid.
     * @param {{x: number, y: number}} point - Target point
     * @param {Object} [options={}] - Snapping options ({ mode })
     * @returns {{x: number, y: number}|null} Snapped point or null
     */
    getSnappedPoint(point, options = {}) {
        if (canvas?.grid?.getSnappedPoint) {
            try {
                const snapped = canvas.grid.getSnappedPoint(point, options);
                if (snapped && Number.isFinite(snapped.x) && Number.isFinite(snapped.y)) {
                    return { x: snapped.x, y: snapped.y };
                }
            } catch (e) {}
        }
        if (canvas?.grid?.getSnappedPosition) {
            try {
                const snapped = canvas.grid.getSnappedPosition(point.x, point.y, options.mode);
                if (snapped && Number.isFinite(snapped.x) && Number.isFinite(snapped.y)) {
                    return { x: snapped.x, y: snapped.y };
                }
            } catch (e) {}
        }
        return null;
    }

    /**
     * Compute integer grid space coordinate offset range [i0, j0, i1, j1] enclosing a bounding rectangle across Foundry versions.
     * @param {Object} bounds - Bounding rectangle { x, y, width, height }
     * @returns {number[]|null} [i0, j0, i1, j1] Grid offset range or null
     */
    getOffsetRange(bounds) {
        if (canvas?.grid?.getOffsetRange) {
            try { return canvas.grid.getOffsetRange(bounds); } catch (e) {}
        }
        return null;
    }

    /**
     * Measures grid distance between two coordinate points across Foundry versions.
     * @param {{x: number, y: number}} origin - Origin point
     * @param {{x: number, y: number}} target - Target point
     * @returns {number} Measured distance in grid units
     */
    measureDistance(origin, target) {
        if (canvas?.grid?.measurePath) {
            try {
                const measured = canvas.grid.measurePath([origin, target]);
                if (measured && Number.isFinite(measured.distance)) return measured.distance;
            } catch (e) {}
        }
        if (canvas?.grid?.measureDistance) {
            try { return Math.round(canvas.grid.measureDistance(origin, target) * 10) / 10; } catch (e) {}
        }
        const dx = (target?.x ?? 0) - (origin?.x ?? 0);
        const dy = (target?.y ?? 0) - (origin?.y ?? 0);
        const dist = Math.hypot(dx, dy);
        const gridDist = this.gridDistance;
        const gridSize = this.gridSize;
        return Math.round((dist / gridSize) * gridDist * 10) / 10;
    }

    /**
     * Snap coordinate values to grid space.
     * @param {number} x - Target X coordinate
     * @param {number} y - Target Y coordinate
     * @param {string|number|boolean} [mode="all"] - Snap mode (all, center, corner, edges, etc.)
     * @returns {{x: number, y: number}} Snapped coordinates
     */
    snapCoordinates(x, y, mode = "all") {
        if (!canvas?.grid || mode === false || mode === "none" || mode === 0 || mode === "0") return { x, y };

        const size = this.gridSize;

        if (mode !== "center" && mode !== "corner" && mode !== "corners") {
            const numMode = this._getGridSnapMode(mode);
            if (numMode !== 0) {
                const snapped = this.getSnappedPoint({ x, y }, { mode: numMode });
                if (snapped) return snapped;
            }
        }

        if (mode === "center" || mode === 1) {
            const center = this.getCenterPoint({ x, y });
            if (center) return center;
        }

        if (mode === "corner" || mode === "corners" || mode === 2) {
            const sx = Math.round(x / size) * size;
            const sy = Math.round(y / size) * size;
            return { x: sx, y: sy };
        }

        if (mode === "all" || mode === true || mode === "default" || mode === "edges" || mode === "edge" || Number.isFinite(mode)) {
            const numMode = this._getGridSnapMode(mode === true ? "all" : mode);
            if (numMode !== 0) {
                const snapped = this.getSnappedPoint({ x, y }, { mode: numMode });
                if (snapped) return snapped;
            }

            // Fallback: manual half-grid snap
            const half = size / 2;
            const sx = Math.round(x / half) * half;
            const sy = Math.round(y / half) * half;
            return { x: sx, y: sy };
        }

        return { x, y };
    }

    /**
     * Internal helper to convert string mode or numeric mode to numeric CONST.GRID_SNAPPING_MODES bitmask.
     * @protected
     * @param {string|number} mode - Mode name or numeric bitmask
     * @returns {number} Numeric bitmask mode
     */
    _getGridSnapMode(mode) {
        if (Number.isFinite(mode)) return mode;
        const modes = CONST?.GRID_SNAPPING_MODES;
        if (!modes) return 0;
        switch (mode) {
            case "center": return modes.CENTER ?? 1;
            case "edge":
            case "edges": return modes.EDGE ?? 4;
            case "corner":
            case "corners":
            case "vertex":
            case "vertices": return modes.VERTEX ?? 2;
            case "corner-center":
            case "vertex-center": return (modes.VERTEX ?? 2) | (modes.CENTER ?? 1);
            case "corner-edge":
            case "vertex-edge": return (modes.VERTEX ?? 2) | (modes.EDGE ?? 4);
            case "all": return (modes.VERTEX ?? 2) | (modes.EDGE ?? 4) | (modes.CENTER ?? 1);
            default: return 0;
        }
    }
}
