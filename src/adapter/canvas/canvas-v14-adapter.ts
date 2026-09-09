import { BaseCanvasAdapter } from "./base-canvas-adapter.js";
import { log } from "../../lib/logger.js";

/**
 * Foundry VTT V14+ Canvas Adapter.
 * Encapsulates canvas interactions and grid operations for Foundry V14+,
 * routing highlight management through canvas.interface.grid and coordinates through canvas.grid.
 */
export class CanvasV14Adapter extends BaseCanvasAdapter {
    constructor() {
        super();
        this.version = 14;
    }

    /**
     * Adds the specified grid highlight layer on Foundry V14 canvas.interface.grid.
     * @override
     * @param {string} id - Identifier of the highlight layer
     * @returns {void}
     */
    addHighlightLayer(id) {
        if (!id) return null;
        const cleanId = id.trim();
        if (!cleanId) return null;
        return canvas.interface.grid.addHighlightLayer(cleanId);
    }

    /**
     * Retrieves the specified grid highlight layer from Foundry V14 canvas.interface.grid.
     * @override
     * @param {string} id - Identifier of the highlight layer
     * @returns {Object|null}
     */
    getHighlightLayer(id) {
        if (!id) return null;
        const cleanId = id.trim();
        if (!cleanId) return null;
        return canvas.interface.grid.getHighlightLayer(cleanId);
    }

    /**
     * Clears the specified grid highlight layer on Foundry V14 canvas.interface.grid.
     * @override
     * @param {string} id - Identifier of the highlight layer
     * @returns {void}
     */
    clearHighlightLayer(id) {
        if (!id) return;
        const cleanId = id.trim();
        if (!cleanId) return;
        canvas.interface.grid.clearHighlightLayer(cleanId);
    }

    /**
     * Destroys the specified grid highlight layer on Foundry V14 canvas.interface.grid.
     * @override
     * @param {string} id - Identifier of the highlight layer
     * @returns {void}
     */
    destroyHighlightLayer(id) {
        if (!id) return;
        const cleanId = id.trim();
        if (!cleanId) return;
        canvas.interface.grid.destroyHighlightLayer(cleanId);
    }

    /**
     * Highlights a grid position on Foundry V14 canvas.interface.grid.
     * @override
     * @param {string} id - Identifier of the highlight layer
     * @param {Object} [options={}] - Highlight parameters
     * @returns {void}
     */
    highlightPosition(id, options = {}) {
        if (!id) return;
        const cleanId = id.trim();
        if (!cleanId) return;
        canvas.interface.grid.highlightPosition(cleanId, options);
    }

    /**
     * Get the center point of a grid space on Foundry V14 canvas.grid.
     * @override
     * @param {{x?: number, y?: number, i?: number, j?: number}} coords - Coordinates object
     * @returns {{x: number, y: number}}
     */
    getCenterPoint(coords) {
        return canvas.grid.getCenterPoint(coords);
    }

    /**
     * Get the top-left point of a grid space on Foundry V14 canvas.grid.
     * @override
     * @param {{x?: number, y?: number, i?: number, j?: number}} coords - Coordinates object
     * @returns {{x: number, y: number}}
     */
    getTopLeftPoint(coords) {
        return canvas.grid.getTopLeftPoint(coords);
    }

    /**
     * Get snapped point coordinates on Foundry V14 canvas.grid.
     * @override
     * @param {{x: number, y: number}} point - Target point
     * @param {Object} [options={}] - Snapping options ({ mode })
     * @returns {{x: number, y: number}|null}
     */
    getSnappedPoint(point, options = {}) {
        return canvas.grid.getSnappedPoint(point, options);
    }

    /**
     * Compute integer grid space coordinate offset range on Foundry V14 canvas.grid.
     * @override
     * @param {Object} bounds - Bounding rectangle
     * @returns {number[]|null}
     */
    getOffsetRange(bounds) {
        return canvas.grid.getOffsetRange(bounds);
    }
}
