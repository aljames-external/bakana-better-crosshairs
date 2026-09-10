import { log } from "../lib/logger.js";
import { adapter } from "../adapter/index.js";

/**
 * Encapsulates live canvas grid distance measurement text beneath an active crosshair reticle.
 */
export class CrosshairRangeOverlay {
    shape: any;
    textElement: any;

    /**
     * @param {object} shape - The owning BaseCrosshairShape instance
     */
    constructor(shape: any) {
        this.shape = shape;
        this.textElement = null;
    }

    /**
     * Calculate live grid distance between token and crosshair target.
     * @param {{x: number, y: number}} origin - Token origin coordinates
     * @param {{x: number, y: number}} target - Crosshair target coordinates
     * @returns {string} Formatted distance label string (e.g. "30 ft")
     */
    measureDistance(origin: { x: number; y: number }, target: { x: number; y: number }): string {
        const distance = adapter.crosshair.measureDistance(origin, target);
        const units = adapter.crosshair.gridUnits;
        return `${distance} ${units}`;
    }

    /**
     * Update or create the live range text overlay beneath the active crosshair.
     * @returns {void}
     */
    update() {
        const shape = this.shape;
        if (!shape || shape.stickToToken || !shape.token || shape.config?.showRange === false || !shape.sequencerCrosshair) {
            if (this.textElement) this.textElement.visible = false;
            return;
        }

        const origin = shape.token.center;
        const targetX = (shape.sequencerCrosshair && Number.isFinite(shape.sequencerCrosshair.x)) ? shape.sequencerCrosshair.x : shape.x;
        const targetY = (shape.sequencerCrosshair && Number.isFinite(shape.sequencerCrosshair.y)) ? shape.sequencerCrosshair.y : shape.y;
        const target = { x: targetX, y: targetY };
        const labelStr = this.measureDistance(origin, target);

        if (!this.textElement) {
            const TextClass = adapter.crosshair.PreciseText;
            if (!TextClass) return;
            const style = CONFIG?.canvasTextStyle
                ? CONFIG.canvasTextStyle.clone()
                : {
                    fontFamily: "Signika, sans-serif",
                    fontSize: 24,
                    fill: "#ffffff",
                    stroke: "#000000",
                    strokeThickness: 4,
                    align: "center"
                };
            if (style) style.align = "center";
            try {
                this.textElement = new TextClass(labelStr, style as any);
                this.textElement.anchor?.set?.(0.5, 1);
                const parentContainer = shape.sequencerCrosshair.parent ?? adapter.crosshair.controls ?? adapter.crosshair.stage ?? shape.sequencerCrosshair;
                parentContainer?.addChild?.(this.textElement);
            } catch (e) {
                log.debug("CrosshairRangeOverlay.update | Could not create range text element:", e);
                return;
            }
        } else {
            const targetParent = shape.sequencerCrosshair.parent ?? adapter.crosshair.controls ?? adapter.crosshair.stage ?? shape.sequencerCrosshair;
            if (this.textElement.parent !== targetParent) {
                try { targetParent?.addChild?.(this.textElement); } catch (e) {}
            }
        }

        if (this.textElement) {
            this.textElement.text = labelStr;
            this.textElement.visible = true;
            if (this.textElement.parent !== shape.sequencerCrosshair) {
                this.textElement.position?.set?.(target.x, target.y - 25);
                try { this.textElement.rotation = 0; } catch (e) {}
            } else {
                this.textElement.position?.set?.(0, -25);
                try { this.textElement.rotation = -(shape.sequencerCrosshair.rotation ?? 0); } catch (e) {}
            }
        }
    }

    /**
     * Destroy and detach the live range text overlay from the canvas.
     * @returns {void}
     */
    destroy() {
        if (this.textElement) {
            try {
                this.textElement.parent?.removeChild?.(this.textElement);
                this.textElement.destroy?.({ children: true });
            } catch (e) {}
            this.textElement = null;
        }
    }
}
