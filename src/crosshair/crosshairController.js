import { MODULE_ID, BROADCAST_INTERVAL_MS } from "../lib/constants.js";
import { log } from "../lib/logger.js";
import { crosshairAdapter } from "../adapter/index.js";
import { alignCrosshairAndEffects } from "./util.js";

/**
 * Unified Controller managing crosshair animation, snapping, position updates, and visual rendering
 * for both Local interactive placement and Remote peer player visual tracking.
 */
let shapeClasses = null;

/**
 * Lazy async loader for shape subclass models to prevent circular ES module import dependency loops.
 * @returns {Promise<Object>} Object containing loaded shape class constructors
 */
export async function getShapeClasses() {
    if (!shapeClasses) {
        const [{ CircleCrosshairShape }, { ConeCrosshairShape }, { RayCrosshairShape }, { SquareCrosshairShape }] = await Promise.all([
            import("./circle.js"),
            import("./cone.js"),
            import("./ray.js"),
            import("./square.js")
        ]);
        shapeClasses = { CircleCrosshairShape, ConeCrosshairShape, RayCrosshairShape, SquareCrosshairShape };
    }
    return shapeClasses;
}

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
            this.shape.destroy?.();
        }
    }

    /**
     * Static helper to attach a crosshair visual animation and coordinate tracking to a target token.
     * Delegates to attachCrosshairToToken function.
     * @param {Token|Document|object} sourceToken - Target Token placeable or document
     * @param {string|import("./base.js").BaseCrosshairShape|Function} shape - Shape identifier, constructor, or shape instance
     * @param {number|object} size - Crosshair size/distance parameter or config
     * @param {Function} [getCursorPositionFn] - Callback returning live {x, y} cursor coordinates
     * @param {Function|object} [cancelFn] - Cancellation callback or context object
     * @param {object} [options={}] - Additional configuration options
     * @returns {Promise<object>} Handle object managing attached crosshair session
     */
    static async attachToToken(sourceToken, shape, size, getCursorPositionFn, cancelFn, options = {}) {
        return attachCrosshairToToken(sourceToken, shape, size, getCursorPositionFn, cancelFn, options);
    }

    /**
     * Static helper to hide and terminate active crosshair visual animations attached to a token.
     * @param {Token|Document|object} sourceToken - Target Token placeable or document
     * @param {object} [options={}] - Options containing effect id or options
     * @returns {Promise<void>}
     */
    static async hide(sourceToken, options = {}) {
        const token = crosshairAdapter.toToken(sourceToken);
        const effectId = options.id ?? "Crosshair";
        if (typeof Sequencer !== "undefined" && Sequencer.EffectManager) {
            try {
                await Sequencer.EffectManager.endEffects({ name: effectId, object: token });
                await Sequencer.EffectManager.endEffects({ name: `${effectId}-line`, object: token });
                await Sequencer.EffectManager.endEffects({ name: `${effectId}-icon`, object: token });
            } catch (e) {
                log.debug("CrosshairController.hide | Exception ending Sequencer effects:", e);
            }
        }
    }

    /**
     * Alias for CrosshairController.hide
     */
    static async stop(sourceToken, options = {}) {
        return CrosshairController.hide(sourceToken, options);
    }
}

/**
 * Encapsulates attaching a crosshair visual animation and position tracking to a token.
 * Supports both local cursor tracking (e.g. canvas.mousePosition) and remote player cursor tracking (e.g. getPeerCursorPosition).
 *
 * @param {Token|Document|object} sourceToken - Target Token placeable or document to attach crosshairs to
 * @param {string|import("./base.js").BaseCrosshairShape|Function} shape - Shape identifier ("circle", "cone", "ray", "square", "rect"), constructor, or instance
 * @param {number|object} size - Crosshair distance/radius in grid/canvas units or configuration object
 * @param {Function} [getCursorPositionFn] - Callback returning live {x, y} coordinates (defaults to canvas.mousePosition)
 * @param {Function|object} [cancelFn] - Callback or context object invoked when placement is canceled or stopped
 * @param {object} [options={}] - Additional configuration and visual execution options
 * @returns {Promise<object>} Controller handle object with { shape, controller, token, start, update, stop, hide }
 */
export async function attachCrosshairToToken(sourceToken, shape, size, getCursorPositionFn, cancelFn, options = {}) {
    const token = crosshairAdapter.toToken(sourceToken);

    let sizeConfig = {};
    if (typeof size === "number" && Number.isFinite(size)) {
        sizeConfig = { distance: size, radius: size };
    } else if (size && typeof size === "object") {
        sizeConfig = { ...size };
    }

    const resolvedGetCursorFn = (typeof getCursorPositionFn === "function")
        ? getCursorPositionFn
        : () => (canvas?.mousePosition ?? null);

    let resolvedCancelFn = null;
    if (typeof cancelFn === "function") {
        resolvedCancelFn = cancelFn;
    } else if (cancelFn && typeof cancelFn.cancel === "function") {
        resolvedCancelFn = () => cancelFn.cancel();
    }

    const mergedConfig = {
        ...sizeConfig,
        ...options,
        token,
        stickToToken: options.stickToToken ?? true,
        context: (cancelFn && typeof cancelFn === "object") ? cancelFn : options.context
    };

    let shapeInstance = null;
    if (shape && typeof shape === "object" && typeof shape.move === "function" && typeof shape.rotate === "function") {
        shapeInstance = shape;
        if (token) shapeInstance.token = token;
    } else if (typeof shape === "function") {
        const previewPlaceable = crosshairAdapter.createUnpersistedPreviewPlaceable(mergedConfig);
        shapeInstance = new shape(previewPlaceable, mergedConfig);
    } else {
        const shapeType = String(typeof shape === "string" ? shape : options.type ?? "circle").toLowerCase();
        const classes = await getShapeClasses();
        const previewPlaceable = crosshairAdapter.createUnpersistedPreviewPlaceable(mergedConfig);
        if (shapeType === "cone" && classes.ConeCrosshairShape) {
            shapeInstance = new classes.ConeCrosshairShape(previewPlaceable, mergedConfig);
        } else if (shapeType === "ray" && classes.RayCrosshairShape) {
            shapeInstance = new classes.RayCrosshairShape(previewPlaceable, mergedConfig);
        } else if ((shapeType === "square" || shapeType === "rect") && classes.SquareCrosshairShape) {
            shapeInstance = new classes.SquareCrosshairShape(previewPlaceable, mergedConfig);
        } else if (classes.CircleCrosshairShape) {
            shapeInstance = new classes.CircleCrosshairShape(previewPlaceable, mergedConfig);
        }
    }

    const controllerOptions = {
        updateTrigger: options.updateTrigger ?? (options.isRemote ? "ticker" : "event"),
        intervalMs: options.intervalMs ?? BROADCAST_INTERVAL_MS
    };

    const controller = new CrosshairController(shapeInstance, mergedConfig, resolvedGetCursorFn, controllerOptions);
    if (shapeInstance) {
        shapeInstance.controller = controller;
    }

    const handle = {
        shape: shapeInstance,
        controller,
        token,
        start: async () => {
            if (shapeInstance) {
                try {
                    const [crosshairSeq] = await shapeInstance.create();
                    if (crosshairSeq) {
                        await crosshairSeq.play();
                    }
                } catch (e) {
                    log.debug("attachCrosshairToToken.start | Exception playing shape sequence:", e);
                }
            }
            await controller.start();
            return handle;
        },
        update: (force = false) => {
            controller.update(force);
        },
        stop: async (reason = "canceled") => {
            controller.stop();
            if (shapeInstance && typeof shapeInstance.stopBroadcasting === "function") {
                shapeInstance.stopBroadcasting(reason);
            }
            const effectId = shapeInstance?.id ?? options.id ?? "Crosshair";
            if (typeof Sequencer !== "undefined" && Sequencer.EffectManager) {
                try {
                    await Sequencer.EffectManager.endEffects({ name: effectId, object: token });
                    await Sequencer.EffectManager.endEffects({ name: `${effectId}-line`, object: token });
                    await Sequencer.EffectManager.endEffects({ name: `${effectId}-icon`, object: token });
                } catch (e) {
                    log.debug("attachCrosshairToToken.stop | Exception ending Sequencer effects:", e);
                }
            }
            if (shapeInstance && typeof shapeInstance.hide === "function") {
                shapeInstance.hide();
            }
            if (resolvedCancelFn) {
                try {
                    resolvedCancelFn(reason);
                } catch (e) {
                    log.debug("attachCrosshairToToken.stop | Exception in cancel callback:", e);
                }
            }
        },
        hide: async () => {
            await handle.stop("hidden");
        }
    };

    return handle;
}

