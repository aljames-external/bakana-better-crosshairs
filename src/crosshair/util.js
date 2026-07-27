import { log } from "../lib/logger.js";
import { closest } from "../lib/filemanager.js";
import { crosshairAdapter, systemAdapter } from "../adapter/index.js";

let activeWheelHandler = null;
let activePointerHandler = null;
let pendingPointerRaf = null;

export const activePlacementTracker = {
    placeable: null,
    dimensions: null,
    crosshair: null,
    config: null,
    sticky: false
};

/**
 * Helper: Normalize an angle in degrees to the [0, 360) range.
 * @param {number} angleDeg - Raw angle in degrees
 * @returns {number} Normalized angle in degrees between 0 and 360
 */
function _normalizeAngleDegrees(angleDeg) {
    if (typeof angleDeg !== "number" || !Number.isFinite(angleDeg)) return 0;
    let norm = angleDeg % 360;
    if (norm < 0) norm += 360;
    return norm;
}

/**
 * Helper: Calculate angle in radians and degrees from origin to target.
 * @param {{x: number, y: number}} origin - Origin point
 * @param {{x: number, y: number}} target - Target point
 * @returns {{rad: number, deg: number}} Angle in radians and degrees
 */
function _calculateAngleFromOrigin(origin, target) {
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const rad = Math.atan2(dy, dx);
    const deg = _normalizeAngleDegrees(rad * (180 / Math.PI));
    return { rad, deg };
}

/**
 * Helper: Iterate through all active preview lists on canvas and refresh highlights.
 * @param {number} currentDirection - Current direction in degrees
 * @param {number} rad - Current direction in radians
 * @param {object|null} crosshair - Active crosshair instance
 * @param {Event|null} [event=null] - Triggering event if any
 */
function _refreshPreviewHighlights(currentDirection, rad, crosshair, event = null) {
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
                    refreshTemplateHighlights(p, currentDirection, rad, event);
                }
            }
        }
    }
}

/**
 * Helper: Finalize placement by notifying config context and invoking _onPlaced callback.
 * @param {object} result - Formatted placement result
 * @param {object} config - Placement configuration
 * @param {object} crosshair - Placed crosshair instance
 * @param {Array} extraArgs - Extra callback arguments
 * @returns {object} The formatted placement result
 */
function _notifyPlacementResult(result, config, crosshair, extraArgs) {
    config.context?.resolve?.(result);
    if (typeof config._onPlaced === "function") {
        try {
            config._onPlaced(result, crosshair, ...extraArgs);
        } catch (e) {
            log.debug("resolveCrosshairPlacement | Exception in _onPlaced callback:", e);
        }
    }
    return result;
}

/**
 * Determine whether a crosshair should remain attached/stuck to its source token.
 * If no explicit configuration override (`config.stickToToken`) is set, delegates the default
 * choice to the active game system adapter based on the shape type (`shapeType`).
 * @param {object} config - Configuration object containing placement options
 * @param {string|boolean} [shapeType="circle"] - The shape type (`"cone"`, `"ray"`, `"circle"`, `"square"`, `"rect"`) or fallback boolean
 * @param {object} [sysAdapter=systemAdapter] - The active system adapter
 * @returns {boolean} Whether the crosshair should stick to the token
 */
export function shouldStickToToken(config, shapeType = "circle", sysAdapter = systemAdapter) {
    const resolvedType = typeof shapeType === "string" ? shapeType : "circle";
    if (crosshairAdapter?.supportsShapeRotation && !crosshairAdapter.supportsShapeRotation(resolvedType)) {
        return false;
    }
    if (!config || typeof config !== "object") {
        if (typeof shapeType === "boolean") return shapeType;
        return Boolean(sysAdapter?.getDefaultStickToToken?.(shapeType, config));
    }
    const val = config.stickToToken;
    if (val === "true" || val === true || val === 1) return true;
    if (val === "false" || val === false || val === 0) return false;
    if (typeof shapeType === "boolean") return shapeType;
    return Boolean(sysAdapter?.getDefaultStickToToken?.(shapeType, config));
}

/**
 * Resolve an icon string into a direct asset path if it points to a Sequencer Database entry.
 * @param {string} iconPath - Raw icon string (file path or Sequencer database dot path)
 * @returns {string} Fully resolved icon file path
 */
export function resolveCrosshairIcon(iconPath) {
    if (!iconPath || typeof iconPath !== "string") return "";
    const trimmed = iconPath.trim();
    if (!trimmed) return "";
    const resolvedPath = closest(trimmed) ?? trimmed;
    try {
        if (typeof Sequencer !== "undefined" && Sequencer.Database && typeof Sequencer.Database.entryExists === "function") {
            if (Sequencer.Database.entryExists(resolvedPath)) {
                const entry = Sequencer.Database.getEntry(resolvedPath);
                const resolved = Array.isArray(entry) ? entry[0] : entry;
                if (typeof resolved === "string") return resolved;
                if (resolved && typeof resolved === "object") {
                    const file = Array.isArray(resolved.file) ? resolved.file[0] : resolved.file;
                    if (typeof file === "string") return file;
                    if (file && typeof file === "object" && typeof file.file === "string") return file.file;
                }
            }
        }
    } catch (e) {
        log.warn(`Could not resolve Sequencer Database entry for icon "${resolvedPath}":`, e);
    }
    return resolvedPath;
}

/**
 * Refresh the shape and grid highlights of a measured template overlay.
 * @param {object} tmpl - Template placeable or overlay object to refresh
 * @param {number} newDirDeg - New direction angle in degrees
 * @param {number} rad - New direction angle in radians
 * @param {Event|null} [wheelEvent=null] - Optional wheel event
 * @returns {void}
 */
function refreshTemplateHighlights(tmpl, newDirDeg, rad, wheelEvent = null) {
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
        if (isSticky && cfg.token && visual && Number.isFinite(visual.x) && Number.isFinite(visual.y)) {
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
 * Rotate an active crosshair instance and its associated template highlights to a new direction.
 * Ensures circle crosshairs remain unrotated while directional shapes align with cursor/wheel.
 * @param {object} crosshair - The active crosshair instance to rotate
 * @param {number} newDirDeg - New direction angle in degrees
 * @param {object} [config={}] - Crosshair placement configuration
 * @returns {void}
 */
function rotateCrosshairInstance(crosshair, newDirDeg, config = {}) {
    if (!crosshair) return;
    const rad = newDirDeg * (Math.PI / 180);

    const mergedConfig = { ...crosshair.config, ...config };
    const shapeType = mergedConfig.type ?? mergedConfig.t ?? crosshair.type ?? "circle";
    const isRect = shapeType === "rect" || shapeType === "square";
    const isAttached = shouldStickToToken(mergedConfig, shapeType) && Boolean(mergedConfig.token);

    if (!isAttached) {
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
        refreshTemplateHighlights(tmpl, newDirDeg, rad);
    }

    const isRayOrCone = shapeType === "ray" || shapeType === "cone";

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
export function detachWheelRotation() {
    if (pendingPointerRaf !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(pendingPointerRaf);
        pendingPointerRaf = null;
    }
    if (activeWheelHandler && typeof window?.removeEventListener === "function") {
        window.removeEventListener("wheel", activeWheelHandler, { capture: true });
        activeWheelHandler = null;
    }
    if (activePointerHandler && typeof window?.removeEventListener === "function") {
        window.removeEventListener("pointermove", activePointerHandler, { capture: true });
        activePointerHandler = null;
    }
    log.debug("detachWheelRotation | Mousewheel & pointermove listeners removed.");
}

/**
 * Attach window event listeners to handle mouse wheel and pointer movement during crosshair placement.
 * @param {object|null} shape - The crosshair placeable instance or shape instance
 * @param {object} [config={}] - Crosshair configuration containing rotation options
 * @returns {void}
 */
export function attachWheelRotation(shape, config = {}) {
    detachWheelRotation();

    const isShapeInstance = shape && typeof shape.rotate === "function" && typeof shape.move === "function";
    const crosshair = isShapeInstance ? shape.sequencerCrosshair : shape;

    const shapeType = config.type ?? config.t ?? shape?.type ?? "circle";
    const canRotate = crosshairAdapter.supportsShapeRotation(shapeType);
    const isAttached = shouldStickToToken(config, shapeType) && Boolean(config.token);
    config.currentDirection = config.currentDirection ?? config.direction ?? 0;

    if (!isAttached && canRotate) {
        activeWheelHandler = (event) => {
            const requiresCtrl = systemAdapter.requiresWheelModifier();
            if (requiresCtrl && !event.ctrlKey) return;
            if (typeof event.preventDefault === "function") event.preventDefault();
            if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
            if (typeof event.stopPropagation === "function") event.stopPropagation();

            const step = event.shiftKey ? 1 : 5;
            const delta = event.deltaY < 0 ? -step : step;
            config.currentDirection = _normalizeAngleDegrees(config.currentDirection + delta);

            if (isShapeInstance) {
                shape.rotate(config.currentDirection);
            } else {
                const rad = config.currentDirection * (Math.PI / 180);
                alignCrosshairAndEffects(crosshair, config, rad);
                _refreshPreviewHighlights(config.currentDirection, rad, crosshair, event);
            }
        };
        window.addEventListener("wheel", activeWheelHandler, { capture: true, passive: false });
    } else {
        log.debug("attachWheelRotation | Crosshair is attached to token. Disabling mouse wheel rotation.");
    }

    activePointerHandler = (event) => {
        if (pendingPointerRaf !== null) return;
        const scheduleFrame = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => { fn(); return null; };
        pendingPointerRaf = scheduleFrame(() => {
            pendingPointerRaf = null;
            if (isShapeInstance) {
                if (canvas?.mousePosition) {
                    const pt = canvas.mousePosition;
                    if (isAttached && shape.token) {
                        const origin = shape.token.center ?? { x: shape.x, y: shape.y };
                        const { deg } = _calculateAngleFromOrigin(origin, pt);
                        shape.rotate(deg, false);
                    }
                    shape.move(pt.x, pt.y);
                }
            } else {
                if (isAttached && crosshair && canvas?.mousePosition) {
                    const pt = canvas.mousePosition;
                    const origin = config.token?.center ?? { x: crosshair.x, y: crosshair.y };
                    const { rad, deg } = _calculateAngleFromOrigin(origin, pt);
                    config.currentDirection = deg;
                    alignCrosshairAndEffects(crosshair, config, rad);
                }
                const rad = (config.currentDirection ?? 0) * (Math.PI / 180);
                _refreshPreviewHighlights(config.currentDirection, rad, crosshair);
                if (!isAttached) {
                    alignCrosshairAndEffects(crosshair, config, rad);
                }
            }
        });
    };

    window.addEventListener("pointermove", activePointerHandler, { capture: true, passive: true });
}

/**
 * Align crosshair container and all active Sequencer effects so their origin sits precisely
 * at the container's origin (0, 0) and rotates around the cursor point.
 * @param {object} crosshair - Active Sequencer crosshair container
 * @param {object} config - Crosshair placement config
 * @param {number} rad - Current rotation angle in radians
 * @returns {void}
 */
export function alignCrosshairAndEffects(crosshair, config = {}, rad = 0) {
    rotateCrosshairInstance(crosshair, config.currentDirection ?? config.direction ?? 0, config);

    const shapeType = config.type ?? config.t ?? crosshair?.type ?? "circle";
    const isRect = shapeType === "rect" || shapeType === "square";
    const isAttached = shouldStickToToken(config, shapeType) && Boolean(config.token ?? crosshair?.config?.token ?? crosshair?.token);

    if (typeof Sequencer !== "undefined" && Sequencer.EffectManager) {
        try {
            const effects = Sequencer.EffectManager.getEffects({ name: config.id });
            for (const eff of effects) {
                if (!isAttached) {
                    if (isRect) {
                        if (eff.container) {
                            eff.container.pivot.set(0, 0);
                            if (eff.sprite) eff.sprite.position.set(0, 0);
                            if (eff.spriteContainer) eff.spriteContainer.position.set(0, 0);
                        }
                    }
                    if (eff.container && typeof eff.container.rotation !== "undefined") {
                        eff.container.rotation = rad;
                    }
                    if (typeof eff.rotation !== "undefined") eff.rotation = rad;
                    if (typeof eff.update === "function") {
                        try {
                            eff.update({ rotation: rad });
                        } catch (e) {
                            log.debug("alignCrosshairAndEffects | Exception updating Sequencer effect rotation:", e);
                        }
                    }
                }
            }
        } catch (e) {
            log.debug("alignCrosshairAndEffects | Exception querying Sequencer EffectManager:", e);
        }
    }
}

/**
 * Determine the canonical grid snapping mode integer for Sequencer and Foundry grid calculations.
 * Defaults to 7 (CENTER | VERTEX | SIDE_MIDPOINT) matching core MeasuredTemplate behaviors.
 * @param {object} [config={}] - Crosshair placement configuration
 * @returns {number} Snapping mode bitmask integer
 */
export function getGridSnapMode(config = {}) {
    if (config.snapToGrid === false || config.snapToGrid === "none" || config.snapToGrid === 0 || config.snapToGrid === "0") return 0;
    if (typeof config.snapToGrid === "number") return config.snapToGrid;
    if (config.snapToGrid === "center") return CONST?.GRID_SNAPPING_MODES?.CENTER ?? 1;
    if (config.snapToGrid === "corner" || config.snapToGrid === "vertex" || config.snapToGrid === "corners") return CONST?.GRID_SNAPPING_MODES?.VERTEX ?? 2;
    if (config.snapToGrid === "side" || config.snapToGrid === "edge" || config.snapToGrid === "edges") return CONST?.GRID_SNAPPING_MODES?.SIDE_MIDPOINT ?? CONST?.GRID_SNAPPING_MODES?.SIDE ?? 4;
    return (CONST?.GRID_SNAPPING_MODES?.CENTER ?? 1) |
           (CONST?.GRID_SNAPPING_MODES?.VERTEX ?? 2) |
           (CONST?.GRID_SNAPPING_MODES?.SIDE_MIDPOINT ?? CONST?.GRID_SNAPPING_MODES?.SIDE ?? 4);
}

/**
 * Shared utility to resolve crosshair coordinates and direction upon placement.
 * Sequencer passes coordinates or the crosshair object to CALLBACKS.PLACED.
 * We inspect all arguments and fall back to canvas.mousePosition if needed.
 * @param {object} crosshair - The placed Sequencer crosshair instance or placement object
 * @param {object} [config={}] - Configuration object containing placement options
 * @param {...*} extraArgs - Additional arguments passed by placement callback
 * @returns {object} Formatted placement coordinates and direction `{ x, y, direction }`
 */
export function resolveCrosshairPlacement(crosshair, config = {}, ...extraArgs) {
    detachWheelRotation();
    log.debug("resolveCrosshairPlacement | Inspecting arguments passed to PLACED callback:", crosshair, config, extraArgs);

    const shape = (crosshair && typeof crosshair.getPlacementUpdates === "function")
        ? crosshair
        : (crosshair?.shapeInstance ?? config?.shapeInstance ?? activePlacementTracker.crosshair?.shapeInstance);

    if (shape && typeof shape.getPlacementUpdates === "function") {
        const result = shape.getPlacementUpdates();
        return _notifyPlacementResult(result, config, crosshair, extraArgs);
    }

    let direction = (typeof config.currentDirection === "number")
        ? config.currentDirection
        : (typeof config.direction === "number")
            ? config.direction
            : (typeof shape?.direction === "number")
                ? shape.direction
                : undefined;

    // Search extra arguments for explicit rotation/direction if not already set by placement config
    if (direction === undefined) {
        const allArgs = [crosshair, config, ...extraArgs];
        for (const arg of allArgs) {
            if (!arg || typeof arg !== "object") continue;
            let foundDir = arg.currentDirection ?? arg.direction ?? arg.data?.direction ?? arg.template?.direction;
            if (typeof foundDir === "number" && direction === undefined) {
                direction = foundDir;
            } else if (arg.ray && typeof arg.ray.angle === "number" && direction === undefined) {
                direction = arg.ray.angle * (180 / Math.PI);
            } else if (direction === undefined) {
                const rot = arg.rotation ?? arg.data?.rotation ?? arg.direction;
                if (typeof rot === "number") {
                    direction = (Math.abs(rot) <= Math.PI * 2 && rot !== 0) ? (rot * (180 / Math.PI)) : rot;
                }
            }
        }
    }

    const mousePos = canvas?.mousePosition ?? {};
    const clickX = mousePos.x ?? 0;
    const clickY = mousePos.y ?? 0;

    const shapeType = config.type ?? config.t ?? "circle";
    const isAnchored = shouldStickToToken(config, shapeType) && Boolean(config.token);

    let x = clickX;
    let y = clickY;

    if (isAnchored && config.token) {
        if (crosshair && Number.isFinite(crosshair.x) && Number.isFinite(crosshair.y)) {
            x = crosshair.x;
            y = crosshair.y;
            log.debug("resolveCrosshairPlacement | Token anchored placement using exact Sequencer attached visual position ->", { x, y, direction });
        } else {
            const anchored = crosshairAdapter.resolveAnchorPlacement(config.token, { x: clickX, y: clickY });
            x = anchored.x;
            y = anchored.y;
            if (direction === undefined) direction = anchored.direction;
            log.debug("resolveCrosshairPlacement | Token anchored placement via version adapter fallback ->", { x, y, direction });
        }
    } else {
        // Detached / free cursor placement: Origin is where the user clicked (clickX, clickY)
        x = clickX;
        y = clickY;
        const snapMode = getGridSnapMode(config);
        if (snapMode !== 0) {
            const snapped = snapCoordinates(x, y, snapMode);
            x = snapped.x;
            y = snapped.y;
        }
        if (direction === undefined) {
            direction = config.currentDirection ?? config.direction ?? config.angle ?? 0;
        }
    }

    const finalDirection = _normalizeAngleDegrees(direction);
    const result = crosshairAdapter.formatPlacementCoordinates(x, y, finalDirection, config);

    return _notifyPlacementResult(result, config, crosshair, extraArgs);
}

/**
 * Snap raw coordinates according to the provided snapping mode.
 * @param {number} x - Raw X coordinate to snap
 * @param {number} y - Raw Y coordinate to snap
 * @param {string|number|boolean} [mode="all"] - Snapping mode ("all", "center", "corner", "edges", bitmask integer)
 * @returns {object} Snapped coordinates `{ x, y }`
 */
export function snapCoordinates(x, y, mode = "all") {
    return crosshairAdapter.snapCoordinates(x, y, mode);
}

/**
 * Calculate point on token boundary edge toward target position along with angle in degrees.
 * @param {Token} tok - Raw token input (placeable or document)
 * @param {number} targetX - Target X coordinate
 * @param {number} targetY - Target Y coordinate
 * @param {boolean} [sticky=false] - Whether to snap to 8-way sticky perimeter points
 * @returns {object} Edge point coordinates and angle `{ x, y, direction }`
 */
export function getTokenEdgePoint(tok, targetX, targetY, sticky = false) {
    if (!tok) return { x: targetX, y: targetY, direction: 0 };
    const token = crosshairAdapter.toToken(tok) ?? (tok.object ?? tok);
    if (!token) return { x: targetX, y: targetY, direction: 0 };
    const size = canvas?.grid?.size ?? 100;
    const cx = token.center?.x ?? (token.x + (token.w ?? size) / 2);
    const cy = token.center?.y ?? (token.y + (token.h ?? size) / 2);
    const hw = (token.w ?? size) / 2;
    const hh = (token.h ?? size) / 2;

    const { rad: angleRad, deg: angleDeg } = _calculateAngleFromOrigin({ x: cx, y: cy }, { x: targetX, y: targetY });

    if (sticky) {
        // 8-way sticky perimeter snap (snaps origin to 4 corners and 4 cardinal edge midpoints)
        const sector = Math.round(angleDeg / 45) % 8;
        let x = cx, y = cy;
        switch (sector) {
            case 0: x = cx + hw; y = cy; break;      // 0 deg (Right)
            case 1: x = cx + hw; y = cy + hh; break; // 45 deg (Bottom-Right)
            case 2: x = cx;      y = cy + hh; break; // 90 deg (Bottom)
            case 3: x = cx - hw; y = cy + hh; break; // 135 deg (Bottom-Left)
            case 4: x = cx - hw; y = cy; break;      // 180 deg (Left)
            case 5: x = cx - hw; y = cy - hh; break; // 225 deg (Top-Left)
            case 6: x = cx;      y = cy - hh; break; // 270 deg (Top)
            case 7: x = cx + hw; y = cy - hh; break; // 315 deg (Top-Right)
        }
        return { x, y, direction: angleDeg };
    }

    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    const tx = Math.abs(cosA) > 1e-6 ? Math.abs(hw / cosA) : Infinity;
    const ty = Math.abs(sinA) > 1e-6 ? Math.abs(hh / sinA) : Infinity;
    const t = Math.min(tx, ty);

    return {
        x: cx + cosA * t,
        y: cy + sinA * t,
        direction: angleDeg
    };
}

const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

/**
 * Execute custom concurrent Javascript code before running the Sequencer .play() sequence.
 * Wrapped in try/catch block with standard context variables.
 * @param {Token} token - Token associated with the placement
 * @param {object} [config={}] - Configuration object containing code and scope
 * @param {object|null} [crosshairSequence=null] - Active Sequencer crosshair sequence instance
 * @returns {Promise<void>}
 */
export async function runConcurrentScript(token, config = {}, crosshairSequence = null) {
    const code = config.concurrentCode;
    if (!code || typeof code !== "string" || !code.trim()) return;

    const actor = token?.actor ?? config.actor;
    const item = config.item;
    const scope = config.scope ?? { token, actor, item, config };

    try {
        const fn = new AsyncFunction(
            "token",
            "actor",
            "item",
            "scope",
            "config",
            "crosshair",
            "canvas",
            "game",
            code
        );
        await fn(token, actor, item, scope, config, crosshairSequence, canvas, game);
    } catch (e) {
        log.error("Error executing concurrent placement script:", e);
    }
}
