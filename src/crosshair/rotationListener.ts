import { log } from "../lib/logger.js";
import { adapter } from "../adapter/index.js";
import { TokenGeometry } from "../lib/tokenGeometry.js";
import { activePlacementTracker, shouldStickToToken, getGridSnapMode, snapCoordinates, alignCrosshairAndEffects } from "./util.js";

/**
 * Manages window-level mousewheel and pointer tracking event listeners for interactive crosshair rotation.
 */
export class CrosshairRotationListener {
    activeWheelHandler: ((event: WheelEvent) => void) | null;
    activePointerHandler: ((event: PointerEvent) => void) | null;
    activePointerDownHandler: ((event: PointerEvent) => void) | null;
    pendingPointerRaf: number | null;

    constructor() {
        this.activeWheelHandler = null;
        this.activePointerHandler = null;
        this.activePointerDownHandler = null;
        this.pendingPointerRaf = null;
    }

    /**
     * Refresh the shape and grid highlights of a measured template overlay.
     * @param {object} tmpl - Template placeable or overlay object to refresh
     * @param {number} newDirDeg - New direction angle in degrees
     * @param {number} rad - New direction angle in radians
     * @param {Event|null} [wheelEvent=null] - Optional wheel event
     * @returns {void}
     */
    refreshTemplateHighlights(tmpl: any, newDirDeg: number, rad: number, wheelEvent: Event | null = null) {
        if (!tmpl) return;

        const doc = tmpl.document ?? (tmpl.documentName ? tmpl : null);
        if (doc) {
            const dims = tmpl.dimensions ?? doc.dimensions ?? activePlacementTracker.dimensions;
            const docProps = adapter.crosshair.detectProperties(doc) as any;
            const initialDist = dims?.distance ?? docProps.distance;
            const initialWidth = dims?.width ?? docProps.width;
            const isGridUnits = dims?.gridUnits ?? true;

            const cfg = tmpl.config ?? doc.config ?? activePlacementTracker.config ?? {};
            const shapeType = cfg.type ?? cfg.originalType ?? docProps.type ?? "circle";
            const isSticky = shouldStickToToken(cfg, shapeType) && Boolean(cfg.token ?? doc.flags?.bbc?.token ?? doc.flags?.bakana?.token ?? activePlacementTracker.sticky);
            let targetX = 0, targetY = 0;

            const visual = tmpl.crosshair ?? activePlacementTracker.crosshair;
            if (isSticky && cfg.token && shapeType === "circle") {
                const token = adapter.crosshair.toToken(cfg.token);
                const center = token?.center ?? { x: token?.x ?? 0, y: token?.y ?? 0 };
                targetX = center.x;
                targetY = center.y;
            } else if (isSticky && cfg.token && visual && Number.isFinite(visual.x) && Number.isFinite(visual.y)) {
                targetX = visual.x;
                targetY = visual.y;
            } else if (isSticky && cfg.token && adapter.crosshair.mousePosition) {
                const anchored = adapter.crosshair.resolveAnchorPlacement(cfg.token, adapter.crosshair.mousePosition);
                targetX = anchored.x;
                targetY = anchored.y;
            } else {
                const safeGet = (obj: any, prop: any) => { if (!obj) return undefined; try { return obj[prop]; } catch (e) { return undefined; } };
                const mousePos = adapter.crosshair.mousePosition ?? { x: safeGet(tmpl, "x") ?? doc.x ?? 0, y: safeGet(tmpl, "y") ?? doc.y ?? 0 };
                const snapMode = getGridSnapMode(cfg);
                const snapped = snapMode !== 0 ? snapCoordinates(mousePos.x, mousePos.y, snapMode) : mousePos;
                targetX = snapped.x;
                targetY = snapped.y;
            }

            adapter.crosshair.updatePreviewShape(doc, {
                x: targetX,
                y: targetY,
                direction: newDirDeg,
                rotation: newDirDeg,
                distance: initialDist,
                radius: initialDist,
                width: initialWidth,
                sticky: isSticky,
                gridUnits: isGridUnits,
                type: shapeType,
                originalType: cfg.originalType,
                t: shapeType === "square" ? "rect" : shapeType
            });

            if (tmpl.document) {
                try {
                    tmpl.x = doc.x;
                    tmpl.y = doc.y;
                } catch (e) {}
            }
        }

        if (adapter.crosshair?.hidePreview && adapter.crosshair.isPreview(tmpl)) {
            adapter.crosshair.hidePreview(tmpl);
        }

        if (adapter.crosshair?.refreshTemplateHighlights) {
            try {
                adapter.crosshair.refreshTemplateHighlights(tmpl, newDirDeg);
            } catch (e) {
                log.debug("refreshTemplateHighlights | adapter.crosshair call failed gracefully:", e);
            }
        }
        if (adapter.system?.refreshTemplateHighlights) {
            try {
                adapter.system.refreshTemplateHighlights(tmpl, newDirDeg);
            } catch (e) {
                log.debug("refreshTemplateHighlights | adapter.system call failed gracefully:", e);
            }
        }
    }

    /**
     * Iterate through all active preview lists on canvas and refresh highlights.
     * @param {number} currentDirection - Current direction in degrees
     * @param {number} rad - Current direction in radians
     * @param {object} crosshair - The active crosshair instance
     * @param {Event|null} [event=null] - Triggering event
     * @returns {void}
     */
    refreshAllActiveHighlights(currentDirection: number, rad: number, crosshair: any, event: Event | null = null) {
        crosshair?.shapeInstance?._updateRangeText?.();
        const previewLists = [
            adapter.crosshair.templates?.preview?.children,
            adapter.crosshair.templates?.placeables,
            adapter.crosshair.regions?.preview?.children,
            adapter.crosshair.regions?.placeables,
            crosshair?.template ? [crosshair.template] : null,
            activePlacementTracker.placeable ? [activePlacementTracker.placeable] : null
        ];

        for (const list of previewLists) {
            if (!list) continue;
            for (const tmpl of list) {
                if (!tmpl || !adapter.crosshair.isPreview(tmpl)) continue;
                this.refreshTemplateHighlights(tmpl, currentDirection, rad, event);
            }
        }
    }

    /**
     * Rotate an active crosshair instance and its associated template highlights to a new direction.
     * @param {object} crosshair - The active crosshair instance to rotate
     * @param {number} newDirDeg - New direction angle in degrees
     * @param {object} [config={}] - Crosshair placement configuration
     * @returns {void}
     */
    rotateCrosshairInstance(crosshair: any, newDirDeg: any, config = {}) {
        if (!crosshair) return;
        const rad = newDirDeg * (Math.PI / 180);

        const mergedConfig = { ...crosshair.config, ...config };
        const shapeType = mergedConfig.type ?? mergedConfig.t ?? crosshair.type ?? "circle";
        const isRect = shapeType === "rect" || shapeType === "square";
        const isRayOrCone = shapeType === "ray" || shapeType === "cone";
        const isAttached = shouldStickToToken(mergedConfig, shapeType) && Boolean(mergedConfig.token);
        const isRemote = String(mergedConfig.id ?? "").startsWith("remote-crosshair-");

        if (!isAttached || isRayOrCone || isRemote) {
            crosshair.direction = newDirDeg;
            if (crosshair.document) {
                crosshair.document.direction = newDirDeg;
                try {
                    crosshair.document.updateSource?.({ direction: newDirDeg });
                } catch (e) {
                    log.debug("rotateCrosshairInstance | Exception updating crosshair document source:", e);
                }
            }
            if (crosshair.ray) {
                const ox = crosshair.x ?? 0;
                const oy = crosshair.y ?? 0;
                const dist = crosshair.ray.distance ?? 1000;
                const newRay = adapter.crosshair.createRayFromAngle(ox, oy, rad, dist);
                if (newRay) crosshair.ray = newRay;
            }
            if (!isRect) {
                try {
                    crosshair.rotation = rad;
                } catch (e) { log.debug("rotateCrosshairInstance | Exception setting crosshair.rotation:", e); }
            } else {
                try { crosshair.rotation = 0; } catch (e) { log.debug("rotateCrosshairInstance | Exception resetting crosshair.rotation:", e); }
            }
            if (crosshair.config) {
                crosshair.config.direction = newDirDeg;
                crosshair.config.rotation = rad;
            }
            if (crosshair.data) {
                crosshair.data.direction = newDirDeg;
                crosshair.data.rotation = rad;
            }
        } else {
            crosshair.direction = 0;
            if (crosshair.document) {
                crosshair.document.direction = 0;
                try {
                    crosshair.document.updateSource?.({ direction: 0 });
                } catch (e) {}
            }
            try { crosshair.rotation = 0; } catch (e) { log.debug("rotateCrosshairInstance | Exception resetting attached crosshair.rotation:", e); }
            if (crosshair.config) {
                crosshair.config.direction = 0;
                crosshair.config.rotation = 0;
            }
            if (crosshair.data) {
                crosshair.data.direction = 0;
                crosshair.data.rotation = 0;
            }
        }
        const tmpl = crosshair.template;
        if (tmpl) {
            activePlacementTracker.crosshair = crosshair;
            this.refreshTemplateHighlights(tmpl, newDirDeg, rad);
        }

        if (!isAttached) {
            try { crosshair._refreshShape?.(); } catch (e) {}
            try { crosshair._refreshTemplate?.(); } catch (e) {}
            try {
                crosshair.renderFlags?.set?.({
                    refreshShape: true,
                    refreshTemplate: true,
                    refreshState: true
                });
                crosshair.applyRenderFlags?.();
            } catch (e) {}
            crosshair.refresh?.();
        }
    }

    /**
     * Remove active window event listeners for crosshair wheel rotation and pointer tracking.
     * @returns {void}
     */
    detach() {
        if (this.pendingPointerRaf !== null) {
            cancelAnimationFrame(this.pendingPointerRaf);
            this.pendingPointerRaf = null;
        }
        if (this.activeWheelHandler) {
            window?.removeEventListener?.("wheel", this.activeWheelHandler, { capture: true });
            this.activeWheelHandler = null;
        }
        if (this.activePointerHandler) {
            window?.removeEventListener?.("pointermove", this.activePointerHandler, { capture: true });
            this.activePointerHandler = null;
        }
        if (this.activePointerDownHandler) {
            window?.removeEventListener?.("pointerdown", this.activePointerDownHandler, { capture: true });
            this.activePointerDownHandler = null;
        }
        log.debug("CrosshairRotationListener.detach | Mousewheel, pointermove, & pointerdown listeners removed.");
    }

    /**
     * Attach window event listeners to handle mouse wheel and pointer movement during crosshair placement.
     * @param {object|null} shape - The crosshair placeable instance or shape instance
     * @param {object} [config={}] - Configuration options for crosshair placement
     * @returns {void}
     */
    attach(shape: any, config: Record<string, any> = {}) {
        this.detach();

        const isShapeInstance = Boolean(shape?.rotate && shape?.move);
        const crosshair = isShapeInstance ? shape.sequencerCrosshair : shape;

        const shapeType = config.type ?? config.t ?? shape?.type ?? "circle";
        const canRotate = adapter.crosshair.supportsShapeRotation(shapeType);
        const isAttached = shouldStickToToken(config, shapeType) && Boolean(config.token);
        config.currentDirection = config.currentDirection ?? config.direction ?? 0;

        if (!isAttached && canRotate) {
            this.activeWheelHandler = (event) => {
                const requiresCtrl = adapter.system.requiresWheelModifier();
                if (requiresCtrl && !event.ctrlKey && !event.metaKey) return;
                event.preventDefault?.();
                event.stopImmediatePropagation?.();
                event.stopPropagation?.();

                const step = event.shiftKey ? 1 : 5;
                const delta = event.deltaY < 0 ? -step : step;
                config.currentDirection = TokenGeometry.normalizeAngle(config.currentDirection + delta);

                const rad = config.currentDirection * (Math.PI / 180);
                if (isShapeInstance) {
                    shape.rotate(config.currentDirection);
                } else {
                    alignCrosshairAndEffects(crosshair, config, rad);
                    this.refreshAllActiveHighlights(config.currentDirection, rad, crosshair, event);
                }
            };
            window?.addEventListener?.("wheel", this.activeWheelHandler, { capture: true, passive: false });
        } else {
            log.debug("CrosshairRotationListener.attach | Crosshair is attached to token or non-rotatable. Disabling mouse wheel rotation.");
        }

        this.activePointerHandler = (event) => {
            if (this.pendingPointerRaf !== null) return;
            const scheduleFrame = (cb: FrameRequestCallback) => (window?.requestAnimationFrame ? window.requestAnimationFrame(cb) : (cb(0), 0));
            this.pendingPointerRaf = scheduleFrame(() => {
                this.pendingPointerRaf = null;
                let pt = adapter.crosshair.mousePosition;
                if (!pt && event && adapter.crosshair.stage?.toLocal) {
                    try { pt = adapter.crosshair.stage.toLocal(event); } catch (e) {}
                }
                if (isShapeInstance) {
                    if (pt) {
                        shape.move(pt.x, pt.y);
                    }
                } else {
                    if (isAttached && crosshair && pt) {
                        const anchored = adapter.crosshair.resolveAnchorPlacement(config.token, pt);
                        config.currentDirection = anchored.direction;
                        alignCrosshairAndEffects(crosshair, config, anchored.direction * (Math.PI / 180));
                    }
                    const rad = (config.currentDirection ?? 0) * (Math.PI / 180);
                    this.refreshAllActiveHighlights(config.currentDirection, rad, crosshair);
                    if (!isAttached) {
                        alignCrosshairAndEffects(crosshair, config, rad);
                    }
                }
            });
        };

        this.activePointerDownHandler = (event) => {
            if (event.button === 2) {
                log.debug("CrosshairRotationListener.attach | Right click cancel detected in capture phase.");
                try { crosshair?.cancel?.(); } catch (e) {}
                if (isShapeInstance) {
                    try { shape?.onCancelCallback?.(); } catch (e) {}
                } else {
                    try { (activePlacementTracker.crosshair as any)?.cancel?.(); } catch (e) {}
                }
            }
        };

        window?.addEventListener?.("pointermove", this.activePointerHandler, { capture: true, passive: true });
        window?.addEventListener?.("pointerdown", this.activePointerDownHandler, { capture: true });
    }
}

export const rotationListener = new CrosshairRotationListener();
