import { log } from "../lib/logger.js";

/**
 * Encapsulates live canvas grid distance measurement text beneath an active crosshair reticle.
 */
export class CrosshairRangeOverlay {
    /**
     * @param {object} shape - The owning BaseCrosshairShape instance
     */
    constructor(shape) {
        this.shape = shape;
        this.textElement = null;
    }

    /**
     * Calculate live grid distance between token and crosshair target.
     * @param {{x: number, y: number}} origin - Token origin coordinates
     * @param {{x: number, y: number}} target - Crosshair target coordinates
     * @returns {string} Formatted distance label string (e.g. "30 ft")
     */
    measureDistance(origin, target) {
        let distance = 0;
        try {
            if (canvas?.grid && typeof canvas.grid.measurePath === "function") {
                const measured = canvas.grid.measurePath([origin, target]);
                distance = measured?.distance ?? 0;
            } else if (canvas?.grid && typeof canvas.grid.measureDistance === "function") {
                distance = Math.round(canvas.grid.measureDistance(origin, target) * 10) / 10;
            } else if (canvas?.dimensions) {
                const distPx = Math.hypot(target.x - origin.x, target.y - origin.y);
                const gridDist = canvas.dimensions.distance ?? 5;
                const gridSize = canvas.dimensions.size ?? 100;
                distance = Math.round((distPx / gridSize) * gridDist);
            }
        } catch (e) {
            const distPx = Math.hypot(target.x - origin.x, target.y - origin.y);
            const gridDist = canvas?.dimensions?.distance ?? 5;
            const gridSize = canvas?.dimensions?.size ?? 100;
            distance = Math.round((distPx / gridSize) * gridDist);
        }

        const units = canvas?.grid?.units ?? canvas?.dimensions?.units ?? "ft";
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

        const origin = shape.token.center ?? { x: shape.token.x ?? 0, y: shape.token.y ?? 0 };
        const targetX = (shape.sequencerCrosshair && Number.isFinite(shape.sequencerCrosshair.x)) ? shape.sequencerCrosshair.x : shape.x;
        const targetY = (shape.sequencerCrosshair && Number.isFinite(shape.sequencerCrosshair.y)) ? shape.sequencerCrosshair.y : shape.y;
        const target = { x: targetX, y: targetY };
        const labelStr = this.measureDistance(origin, target);

        if (!this.textElement) {
            const TextClass = foundry?.canvas?.containers?.PreciseText ?? PreciseText ?? PIXI?.Text;
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
                this.textElement = new TextClass(labelStr, style);
                if (this.textElement.anchor && typeof this.textElement.anchor.set === "function") {
                    this.textElement.anchor.set(0.5, 1);
                }
                const parentContainer = shape.sequencerCrosshair.parent ?? canvas?.controls ?? canvas?.stage ?? shape.sequencerCrosshair;
                if (typeof parentContainer.addChild === "function") {
                    parentContainer.addChild(this.textElement);
                }
            } catch (e) {
                log.debug("CrosshairRangeOverlay.update | Could not create range text element:", e);
                return;
            }
        } else {
            const targetParent = shape.sequencerCrosshair.parent ?? canvas?.controls ?? canvas?.stage ?? shape.sequencerCrosshair;
            if (this.textElement.parent !== targetParent && typeof targetParent.addChild === "function") {
                try { targetParent.addChild(this.textElement); } catch (e) {}
            }
        }

        this.textElement.text = labelStr;
        this.textElement.visible = true;
        if (this.textElement.parent !== shape.sequencerCrosshair) {
            if (this.textElement.position && typeof this.textElement.position.set === "function") {
                this.textElement.position.set(target.x, target.y - 25);
            }
            try { this.textElement.rotation = 0; } catch (e) {}
        } else {
            if (this.textElement.position && typeof this.textElement.position.set === "function") {
                this.textElement.position.set(0, -25);
            }
            try { this.textElement.rotation = -(shape.sequencerCrosshair.rotation ?? 0); } catch (e) {}
        }
    }

    /**
     * Destroy and detach the live range text overlay from the canvas.
     * @returns {void}
     */
    destroy() {
        if (this.textElement) {
            try {
                if (this.textElement.parent && typeof this.textElement.parent.removeChild === "function") {
                    this.textElement.parent.removeChild(this.textElement);
                }
                if (typeof this.textElement.destroy === "function") {
                    this.textElement.destroy({ children: true });
                }
            } catch (e) {}
            this.textElement = null;
        }
    }
}
