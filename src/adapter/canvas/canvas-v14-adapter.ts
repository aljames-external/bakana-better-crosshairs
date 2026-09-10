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
    override addHighlightLayer(id: string): any {
        if (!id) return null;
        const cleanId = id.trim();
        if (!cleanId) return null;
        return (canvas as any)?.interface?.grid?.addHighlightLayer(cleanId);
    }

    /**
     * Retrieves the specified grid highlight layer from Foundry V14 canvas.interface.grid.
     * @override
     * @param {string} id - Identifier of the highlight layer
     * @returns {Object|null}
     */
    override getHighlightLayer(id: string): any {
        if (!id) return null;
        const cleanId = id.trim();
        if (!cleanId) return null;
        return (canvas as any)?.interface?.grid?.getHighlightLayer(cleanId);
    }

    /**
     * Clears the specified grid highlight layer on Foundry V14 canvas.interface.grid.
     * @override
     * @param {string} id - Identifier of the highlight layer
     * @returns {void}
     */
    override clearHighlightLayer(id: string): void {
        if (!id) return;
        const cleanId = id.trim();
        if (!cleanId) return;
        (canvas as any)?.interface?.grid?.clearHighlightLayer(cleanId);
    }

    /**
     * Destroys the specified grid highlight layer on Foundry V14 canvas.interface.grid.
     * @override
     * @param {string} id - Identifier of the highlight layer
     * @returns {void}
     */
    override destroyHighlightLayer(id: string): void {
        if (!id) return;
        const cleanId = id.trim();
        if (!cleanId) return;
        (canvas as any)?.interface?.grid?.destroyHighlightLayer(cleanId);
    }

    /**
     * Highlights a grid position on Foundry V14 canvas.interface.grid.
     * @override
     * @param {string} id - Identifier of the highlight layer
     * @param {Object} [options={}] - Highlight parameters
     * @returns {void}
     */
    override highlightPosition(id: string, options: any = {}): void {
        if (!id) return;
        const cleanId = id.trim();
        if (!cleanId) return;
        (canvas as any)?.interface?.grid?.highlightPosition(cleanId, options);
    }

    /**
     * Get the center point of a grid space on Foundry V14 canvas.grid.
     * @override
     * @param {{x?: number, y?: number, i?: number, j?: number}} coords - Coordinates object
     * @returns {{x: number, y: number}}
     */
    override getCenterPoint(coords: any): any {
        return (canvas as any)?.grid?.getCenterPoint(coords);
    }

    /**
     * Get the top-left point of a grid space on Foundry V14 canvas.grid.
     * @override
     * @param {{x?: number, y?: number, i?: number, j?: number}} coords - Coordinates object
     * @returns {{x: number, y: number}}
     */
    override getTopLeftPoint(coords: any): any {
        return (canvas as any)?.grid?.getTopLeftPoint(coords);
    }

    /**
     * Get snapped point coordinates on Foundry V14 canvas.grid.
     * @override
     * @param {{x: number, y: number}} point - Target point
     * @param {Object} [options={}] - Snapping options ({ mode })
     * @returns {{x: number, y: number}|null}
     */
    override getSnappedPoint(point: any, options: any = {}): any {
        return (canvas as any)?.grid?.getSnappedPoint(point, options);
    }

    /**
     * Compute integer grid space coordinate offset range on Foundry V14 canvas.grid.
     * @override
     * @param {Object} bounds - Bounding rectangle
     * @returns {number[]|null}
     */
    override getOffsetRange(bounds: any): any {
        return (canvas as any)?.grid?.getOffsetRange(bounds);
    }
}
