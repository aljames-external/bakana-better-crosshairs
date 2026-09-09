import { MODULE_ID, BROADCAST_INTERVAL_MS } from "../lib/constants.js";
import { log } from "../lib/logger.js";
import { adapter } from "../adapter/index.js";
import { alignCrosshairAndEffects } from "./util.js";
import { getPeerCursorPosition } from "./remoteCrosshairManager.js";

/**
 * Unified Controller managing crosshair animation, snapping, position updates, and visual rendering
 * for both Local interactive placement and Remote peer player visual tracking.
 */
let shapeClasses: {
    CircleCrosshairShape: any;
    ConeCrosshairShape: any;
    RayCrosshairShape: any;
    SquareCrosshairShape: any;
} | null = null;

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

export interface CrosshairControllerOptions {
    updateTrigger?: "event" | "ticker";
    intervalMs?: number;
}

/**
 * Unified Controller managing crosshair animation, snapping, position updates, and visual rendering
 * for both Local interactive placement and Remote peer player visual tracking.
 */
export class CrosshairController {
    shape: any;
    config: Record<string, any>;
    getCursorPositionFn: (token?: any, config?: any) => { x: number; y: number } | null;
    updateTrigger: "event" | "ticker";
    intervalMs: number;
    lastRenderTime: number;
    isDestroyed: boolean;
    started: boolean;
    private _onPointerMoveBound: any;
    private _onTickerBound: any;

    /**
     * @param {import("./base.js").BaseCrosshairShape} shape - Crosshair shape instance
     * @param {Object} config - Configuration options
     * @param {Function} getCursorPositionFn - Callback function returning live {x, y} coordinates
     * @param {CrosshairControllerOptions} [options={}] - Execution options
     */
    constructor(shape: any, config: Record<string, any> = {}, getCursorPositionFn?: any, options: CrosshairControllerOptions = {}) {
        this.shape = shape;
        this.config = config;
        this.getCursorPositionFn = getCursorPositionFn;
        this.updateTrigger = options.updateTrigger ?? "event";
        this.intervalMs = options.intervalMs ?? BROADCAST_INTERVAL_MS;
        this.lastRenderTime = 0;
        this.isDestroyed = false;
        this.started = false;
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
            if (adapter.crosshair.app?.ticker) {
                try {
                    adapter.crosshair.app.ticker.add(this._onTickerBound);
                } catch (e) {}
            }
        } else if (this.updateTrigger === "event") {
            if (adapter.crosshair.stage) {
                try {
                    adapter.crosshair.stage.on("pointermove", this._onPointerMoveBound);
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
        if (this.isDestroyed || !this.shape || !this.getCursorPositionFn) return;

        const now = Date.now();
        if (!force && this.updateTrigger === "ticker" && (now - this.lastRenderTime < this.intervalMs)) {
            return;
        }
        this.lastRenderTime = now;

        const cursorPos = this.getCursorPositionFn();
        log.debug(`[Bakana Crosshair Tracking] User: "${this.config?.senderUserId ?? game?.user?.id}" | isRemote: ${Boolean(this.config?.isRemote)} | Cursor Pos:`, cursorPos, `| Direction: ${this.shape?.direction}`);
        if (!cursorPos || !Number.isFinite(cursorPos.x) || !Number.isFinite(cursorPos.y)) {
            if (this.config.isRemote && Number.isFinite(this.shape.direction)) {
                this.shape.rotate(this.shape.direction);
            }
            return;
        }

        const isAttached = Boolean(this.shape.stickToToken && this.shape.token);

        if (isAttached) {
            if (this.shape.type === "circle") {
                const token = adapter.crosshair.toToken(this.shape.token);
                const center = token?.center ?? { x: token?.x ?? 0, y: token?.y ?? 0 };
                this.shape.move(center.x, center.y);
                this.shape.rotate(0);
            } else {
                // Token edge anchoring for attached rays, cones, and shapes
                const anchored = adapter.crosshair.resolveAnchorPlacement(this.shape.token, cursorPos);
                this.shape.move(cursorPos.x, cursorPos.y);
                const dir = anchored.direction ?? this.shape.direction ?? 0;
                this.shape.rotate(dir);
            }
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

        if (adapter.crosshair.stage && this._onPointerMoveBound) {
            try {
                adapter.crosshair.stage.off("pointermove", this._onPointerMoveBound);
            } catch (e) {}
        }

        if (adapter.crosshair.app?.ticker && this._onTickerBound) {
            try {
                adapter.crosshair.app.ticker.remove(this._onTickerBound);
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
    static async attachToToken(sourceToken: any, shape: any, size: any, getCursorPositionFn: any, cancelFn: any, options = {}) {
        return attachCrosshairToToken(sourceToken, shape, size, getCursorPositionFn, cancelFn, options);
    }

    /**
     * Static helper to hide and terminate active crosshair visual animations attached to a token.
     * @param {Token|Document|object} sourceToken - Target Token placeable or document
     * @param {object} [options={}] - Options containing effect id or options
     * @returns {Promise<void>}
     */
    static async hide(sourceToken: any, options: { id?: string; [key: string]: any } = {}) {
        const token = adapter.crosshair.toToken(sourceToken);
        const effectId = options.id ?? "Crosshair";
        if (game?.modules?.get("sequencer")?.active) {
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
    static async stop(sourceToken: any, options: any = {}) {
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
export async function attachCrosshairToToken(
    sourceToken: any,
    shape: any,
    size: any,
    getCursorPositionFn?: any,
    cancelFn?: any,
    options: Record<string, any> = {}
) {
    const token = adapter.crosshair.toToken(sourceToken);

    const extractUserId = (val: any) => val?.id ?? val ?? "";

    const callingUserId =
        extractUserId(options.callingUserId) ||
        extractUserId(options.senderUserId) ||
        extractUserId(options.userId) ||
        extractUserId(options.user) ||
        extractUserId(options.actor?.user);

    if (callingUserId && callingUserId !== game?.user?.id) {
        options.isRemote = true;
        options.senderUserId = callingUserId;
    }

    let sizeConfig: Record<string, any> = {};
    if (Number.isFinite(size)) {
        sizeConfig = { distance: size, radius: size };
    } else if (size) {
        sizeConfig = { ...size };
    }

    const resolvedGetCursorFn = getCursorPositionFn
        ?? (options.isRemote && options.senderUserId
            ? () => getPeerCursorPosition(options.senderUserId)
            : () => (adapter.crosshair.mousePosition ?? null));

    let resolvedCancelFn: any = null;
    if (cancelFn?.cancel) {
        resolvedCancelFn = () => cancelFn.cancel();
    } else if (cancelFn) {
        resolvedCancelFn = cancelFn;
    }

    const mergedConfig = {
        ...sizeConfig,
        ...options,
        token,
        stickToToken: options.stickToToken ?? true,
        context: cancelFn?.cancel ? cancelFn : options.context
    };

    let shapeInstance: any = null;
    if (shape?.move && shape?.rotate) {
        shapeInstance = shape;
        if (token) shapeInstance.token = token;
    } else if (shape?.prototype) {
        const previewPlaceable = adapter.crosshair.createUnpersistedPreviewPlaceable(mergedConfig);
        shapeInstance = new shape(previewPlaceable, mergedConfig);
    } else {
        const shapeType = String(shape ?? options.type ?? "circle").toLowerCase();
        const classes = await getShapeClasses();
        const previewPlaceable = adapter.crosshair.createUnpersistedPreviewPlaceable(mergedConfig);
        if (shapeType === "cone" && classes?.ConeCrosshairShape) {
            shapeInstance = new classes.ConeCrosshairShape(previewPlaceable, mergedConfig);
        } else if (shapeType === "ray" && classes?.RayCrosshairShape) {
            shapeInstance = new classes.RayCrosshairShape(previewPlaceable, mergedConfig);
        } else if ((shapeType === "square" || shapeType === "rect") && classes?.SquareCrosshairShape) {
            shapeInstance = new classes.SquareCrosshairShape(previewPlaceable, mergedConfig);
        } else if (classes?.CircleCrosshairShape) {
            shapeInstance = new classes.CircleCrosshairShape(previewPlaceable, mergedConfig);
        }
    }

    const controllerOptions: CrosshairControllerOptions = {
        updateTrigger: options.updateTrigger ?? (options.isRemote ? "ticker" : "event"),
        intervalMs: options.intervalMs ?? BROADCAST_INTERVAL_MS
    };

    const controller = new CrosshairController(shapeInstance, mergedConfig, resolvedGetCursorFn, controllerOptions);
    if (shapeInstance) {
        shapeInstance.controller = controller;
    }

    const handle: Record<string, any> = {
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
                if (!options.isRemote) {
                    shapeInstance?.startBroadcasting?.();
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
            shapeInstance?.stopBroadcasting?.(reason);
            const effectId = shapeInstance?.id ?? options.id ?? "Crosshair";
            if (game?.modules?.get("sequencer")?.active) {
                try {
                    await Sequencer.EffectManager.endEffects({ name: effectId, object: token });
                    await Sequencer.EffectManager.endEffects({ name: `${effectId}-line`, object: token });
                    await Sequencer.EffectManager.endEffects({ name: `${effectId}-icon`, object: token });
                } catch (e) {
                    log.debug("attachCrosshairToToken.stop | Exception ending Sequencer effects:", e);
                }
            }
            shapeInstance?.hide?.();
            if (resolvedCancelFn) {
                try {
                    resolvedCancelFn(reason);
                } catch (e) {
                    log.debug("attachCrosshairToToken.stop | Exception in cancel callback:", e);
                }
            }
        },
        hide: async () => {
            shapeInstance?.hide?.();
            const effectId = shapeInstance?.id ?? options.id ?? "Crosshair";
            if (game?.modules?.get("sequencer")?.active) {
                try {
                    await Sequencer.EffectManager.endEffects({ name: effectId, object: token });
                    await Sequencer.EffectManager.endEffects({ name: `${effectId}-line`, object: token });
                    await Sequencer.EffectManager.endEffects({ name: `${effectId}-icon`, object: token });
                } catch (e) {
                    log.debug("attachCrosshairToToken.hide | Exception ending Sequencer effects:", e);
                }
            }
        }
    };

    return handle;
}

