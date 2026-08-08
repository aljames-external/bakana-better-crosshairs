import { log } from "../lib/logger.js";
import { crosshairAdapter, systemAdapter } from "../adapter/index.js";
import { TokenGeometry } from "../lib/tokenGeometry.js";
import { activePlacementTracker, shouldStickToToken, getGridSnapMode, snapCoordinates, alignCrosshairAndEffects } from "./util.js";

/**
 * Manages window-level mousewheel and pointer tracking event listeners for interactive crosshair rotation.
 */
export class CrosshairRotationListener {
    constructor() {
        this.activeWheelHandler = null;
        this.activePointerHandler = null;
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
    refreshTemplateHighlights(tmpl, newDirDeg, rad, wheelEvent = null) {
        if (!tmpl) return;

        const doc = tmpl.document ?? (tmpl.documentName ? tmpl : null);
        if (doc) {
            const dims = tmpl.dimensions ?? doc.dimensions ?? activePlacementTracker.dimensions;
            const docProps = crosshairAdapter.detectProperties(doc);
            const initialDist = dims?.distance ?? docProps.distance;
            const initialWidth = dims?.width ?? docProps.width;
            const isGridUnits = dims?.gridUnits ?? true;

            const cfg = tmpl.config ?? doc.config ?? activePlacementTracker.config ?? {};
            const shapeType = cfg.type ?? cfg.originalType ?? docProps.type ?? "circle";
            const isSticky = shouldStickToToken(cfg, shapeType) && Boolean(cfg.token ?? doc.flags?.bbc?.token ?? doc.flags?.bakana?.token ?? activePlacementTracker.sticky);
            let targetX = 0, targetY = 0;

            const visual = tmpl.crosshair ?? activePlacementTracker.crosshair;
            if (isSticky && cfg.token && shapeType === "circle") {
                const token = crosshairAdapter.toToken(cfg.token) ?? cfg.token;
                const center = token.center ?? { x: token.x ?? 0, y: token.y ?? 0 };
                targetX = center.x;
                targetY = center.y;
            } else if (isSticky && cfg.token && visual && Number.isFinite(visual.x) && Number.isFinite(visual.y)) {
                targetX = visual.x;
                targetY = visual.y;
            } else if (isSticky && cfg.token && canvas?.mousePosition) {
                const anchored = crosshairAdapter.resolveAnchorPlacement(cfg.token, canvas.mousePosition);
                targetX = anchored.x;
                targetY = anchored.y;
            } else {
                const safeGet = (obj, prop) => { if (!obj) return undefined; try { return obj[prop]; } catch (e) { return undefined; } };
                const mousePos = canvas?.mousePosition ?? { x: safeGet(tmpl, "x") ?? doc.x ?? 0, y: safeGet(tmpl, "y") ?? doc.y ?? 0 };
                const snapMode = getGridSnapMode(cfg);
                const snapped = snapMode !== 0 ? snapCoordinates(mousePos.x, mousePos.y, snapMode) : mousePos;
                targetX = snapped.x;
                targetY = snapped.y;
            }

            crosshairAdapter.updatePreviewShape(doc, {
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

        if (crosshairAdapter?.refreshTemplateHighlights) {
            try {
                crosshairAdapter.refreshTemplateHighlights(tmpl, newDirDeg);
            } catch (e) {
                log.debug("refreshTemplateHighlights | crosshairAdapter call failed gracefully:", e);
            }
        }
        if (systemAdapter?.refreshTemplateHighlights) {
            try {
                systemAdapter.refreshTemplateHighlights(tmpl, newDirDeg);
            } catch (e) {
                log.debug("refreshTemplateHighlights | systemAdapter call failed gracefully:", e);
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
    refreshAllActiveHighlights(currentDirection, rad, crosshair, event = null) {
        if (crosshair?.shapeInstance && typeof crosshair.shapeInstance._updateRangeText === "function") {
            crosshair.shapeInstance._updateRangeText();
        }
        const previewLists = [
            canvas?.templates?.preview?.children,
            canvas?.templates?.placeables,
            canvas?.regions?.preview?.children,
            canvas?.regions?.placeables,
            crosshair?.template ? [crosshair.template] : null,
            activePlacementTracker.placeable ? [activePlacementTracker.placeable] : null
        ];
        for (const list of previewLists) {
            if (Array.isArray(list)) {
                for (const p of list) {
                    if (p && (crosshairAdapter.isPreview(p) || p === crosshair?.template || p === activePlacementTracker.placeable)) {
                        this.refreshTemplateHighlights(p, currentDirection, rad, event);
                    }
                }
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
    rotateCrosshairInstance(crosshair, newDirDeg, config = {}) {
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
            if (!isRect) {
                try { crosshair.rotation = rad; } catch (e) { log.debug("rotateCrosshairInstance | Exception setting crosshair.rotation:", e); }
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

        if (!isRayOrCone && !isAttached) {
            if (typeof crosshair.refresh === "function") {
                crosshair.refresh();
            }
        }
    }

    /**
     * Remove active window event listeners for crosshair wheel rotation and pointer tracking.
     * @returns {void}
     */
    detach() {
        if (this.pendingPointerRaf !== null && typeof cancelAnimationFrame === "function") {
            cancelAnimationFrame(this.pendingPointerRaf);
            this.pendingPointerRaf = null;
        }
        if (this.activeWheelHandler && typeof window?.removeEventListener === "function") {
            window.removeEventListener("wheel", this.activeWheelHandler, { capture: true });
            this.activeWheelHandler = null;
        }
        if (this.activePointerHandler && typeof window?.removeEventListener === "function") {
            window.removeEventListener("pointermove", this.activePointerHandler, { capture: true });
            this.activePointerHandler = null;
        }
        log.debug("CrosshairRotationListener.detach | Mousewheel & pointermove listeners removed.");
    }

    /**
     * Attach window event listeners to handle mouse wheel and pointer movement during crosshair placement.
     * @param {object|null} shape - The crosshair placeable instance or shape instance
     * @param {object} [config={}] - Configuration options for crosshair placement
     * @returns {void}
     */
    attach(shape, config = {}) {
        this.detach();

        const isShapeInstance = shape && typeof shape.rotate === "function" && typeof shape.move === "function";
        const crosshair = isShapeInstance ? shape.sequencerCrosshair : shape;

        const shapeType = config.type ?? config.t ?? shape?.type ?? "circle";
        const canRotate = crosshairAdapter.supportsShapeRotation(shapeType);
        const isAttached = shouldStickToToken(config, shapeType) && Boolean(config.token);
        config.currentDirection = config.currentDirection ?? config.direction ?? 0;

        if (!isAttached && canRotate) {
            this.activeWheelHandler = (event) => {
                const requiresCtrl = systemAdapter.requiresWheelModifier();
                if (requiresCtrl && !event.ctrlKey && !event.metaKey) return;
                if (typeof event.preventDefault === "function") event.preventDefault();
                if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
                if (typeof event.stopPropagation === "function") event.stopPropagation();

                const step = event.shiftKey ? 1 : 5;
                const delta = event.deltaY < 0 ? -step : step;
                config.currentDirection = TokenGeometry.normalizeAngle(config.currentDirection + delta);

                if (isShapeInstance) {
                    shape.rotate(config.currentDirection);
                } else {
                    const rad = config.currentDirection * (Math.PI / 180);
                    alignCrosshairAndEffects(crosshair, config, rad);
                    this.refreshAllActiveHighlights(config.currentDirection, rad, crosshair, event);
                }
            };
            if (typeof window?.addEventListener === "function") {
                window.addEventListener("wheel", this.activeWheelHandler, { capture: true, passive: false });
            }
        } else {
            log.debug("CrosshairRotationListener.attach | Crosshair is attached to token or non-rotatable. Disabling mouse wheel rotation.");
        }

        this.activePointerHandler = (event) => {
            if (this.pendingPointerRaf !== null) return;
            const scheduleFrame = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => { fn(); return null; };
            this.pendingPointerRaf = scheduleFrame(() => {
                this.pendingPointerRaf = null;
                if (isShapeInstance) {
                    if (canvas?.mousePosition) {
                        const pt = canvas.mousePosition;
                        if (isAttached && shape.token) {
                            const anchored = crosshairAdapter.resolveAnchorPlacement(shape.token, pt);
                            shape.rotate(anchored.direction, false);
                        }
                        shape.move(pt.x, pt.y);
                    }
                } else {
                    if (isAttached && crosshair && canvas?.mousePosition) {
                        const pt = canvas.mousePosition;
                        const anchored = crosshairAdapter.resolveAnchorPlacement(config.token, pt);
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

        if (typeof window?.addEventListener === "function") {
            window.addEventListener("pointermove", this.activePointerHandler, { capture: true, passive: true });
        }
    }
}

export const rotationListener = new CrosshairRotationListener();
