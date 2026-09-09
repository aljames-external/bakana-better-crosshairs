import { BaseCanvasAdapter } from "./base-canvas-adapter.js";

/**
 * Foundry VTT V13 Canvas Adapter.
 * Encapsulates canvas interactions and grid operations for Foundry V13.
 */
export class CanvasV13Adapter extends BaseCanvasAdapter {
    constructor() {
        super();
        this.version = 13;
    }
}
