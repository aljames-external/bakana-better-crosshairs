import { MODULE_ID, BROADCAST_INTERVAL_MS } from "../lib/constants.js";
import { log } from "../lib/logger.js";
import { crosshairAdapter } from "../adapter/index.js";
import { alignCrosshairAndEffects } from "./util.js";

/**
 * Unified Controller managing crosshair animation, snapping, position updates, and visual rendering
 * for both Local interactive placement and Remote peer player visual tracking.
 */
export class CrosshairController {
    /**
     * @param {import("./base.js").BaseCrosshairShape} shape - Crosshair shape instance
     * @param {Object} config - Configuration options
     * @param {Function} getCursorPositionFn - Callback function returning live {x, y} coordinates
     * @param {Object} [options={}] - Execution options
     * @param {string} [options.updateTrigger="event"] - Update mode ("event" | "ticker")
     * @param {number} [options.intervalMs=200] - Ticker throttle interval in milliseconds
     */
    constructor(shape, config = {}, getCursorPositionFn, options = {}) {
        this.shape = shape;
        this.config = config;
        this.getCursorPositionFn = getCursorPositionFn;
        this.updateTrigger = options.updateTrigger ?? "event";
        this.intervalMs = options.intervalMs ?? BROADCAST_INTERVAL_MS;
        this.lastRenderTime = 0;
        this.isDestroyed = false;
        this._onPointerMoveBound = this._onPointerMove.bind(this);
        this._onTickerBound = this._onTicker.bind(this);
    }

    /**
     * Start the unified crosshair controller: creates Sequencer crosshair and attaches coordinate update listeners.
     * @returns {Promise<void>}
     */
    async start() {
        if (!this.shape || this.started) return;
        this.started = true;

        // Attach position tracking listeners according to updateTrigger
        if (this.updateTrigger === "ticker") {
            if (canvas?.app?.ticker) {
                try {
                    canvas.app.ticker.add(this._onTickerBound);
                } catch (e) {}
            }
        } else if (this.updateTrigger === "event") {
            if (canvas?.stage) {
                try {
                    canvas.stage.on("pointermove", this._onPointerMoveBound);
                } catch (e) {}
            }
        }

        // Initial render update
        this.update(true);
    }

    /**
     * Core unified position and snapping update step.
     * Computes grid snapping / token edge anchoring, updates shape, drives Sequencer container, and updates template highlights.
     * @param {boolean} [force=false] - Force update ignoring throttle
     * @returns {void}
     */
    update(force = false) {
        if (this.isDestroyed || !this.shape || typeof this.getCursorPositionFn !== "function") return;

        const now = Date.now();
        if (!force && this.updateTrigger === "ticker" && (now - this.lastRenderTime < this.intervalMs)) {
            return;
        }
        this.lastRenderTime = now;

        const cursorPos = this.getCursorPositionFn();
        if (!cursorPos || !Number.isFinite(cursorPos.x) || !Number.isFinite(cursorPos.y)) {
            return;
        }

        const isAttached = Boolean(this.shape.stickToToken && this.shape.token);

        if (isAttached) {
            // Token edge anchoring for attached rays, cones, and shapes
            const anchored = crosshairAdapter.resolveAnchorPlacement(this.shape.token, cursorPos);
            this.shape.move(cursorPos.x, cursorPos.y);
            const dir = anchored.direction ?? this.shape.direction ?? 0;
            this.shape.rotate(dir);
        } else {
            // Free cursor placement with grid snapping
            this.shape.move(cursorPos.x, cursorPos.y);
            const dir = this.shape.config?.currentDirection ?? this.shape.direction ?? this.config.direction ?? 0;
            this.shape.rotate(dir);
        }
    }

    _onPointerMove() {
        this.update(false);
    }

    _onTicker() {
        this.update(false);
    }

    /**
     * Terminate position update listeners and release shape/Sequencer resources.
     * @returns {void}
     */
    stop() {
        if (this.isDestroyed) return;
        this.isDestroyed = true;

        if (canvas?.stage && this._onPointerMoveBound) {
            try {
                canvas.stage.off("pointermove", this._onPointerMoveBound);
            } catch (e) {}
        }

        if (canvas?.app?.ticker && this._onTickerBound) {
            try {
                canvas.app.ticker.remove(this._onTickerBound);
            } catch (e) {}
        }

        if (this.shape) {
            this.shape.destroy();
        }
    }
}
