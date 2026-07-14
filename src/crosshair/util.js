import { log } from "../lib/logger.js";
import { Ray } from "../lib/compat.js";
import { closest } from "../lib/filemanager.js";
import { crosshairAdapter, systemAdapter } from "../adapter/index.js";

let activeWheelHandler = null;
let activePointerHandler = null;

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
    if (!config || typeof config !== "object") {
        if (typeof shapeType === "boolean") return shapeType;
        return Boolean(sysAdapter?.getDefaultStickToToken?.(shapeType, config));
    }
    const val = config.stickToToken;
    if (val !== undefined && val !== null && val !== "" && val !== "default") {
        if (val === false || val === "false" || val === "off" || val === "no" || val === 0 || val === "0") return false;
        if (val === true || val === "true" || val === "on" || val === "yes" || val === 1 || val === "1") return true;
        return Boolean(val);
    }
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
 * @returns {void}
 */
function refreshTemplateHighlights(tmpl, newDirDeg, rad, wheelEvent = null) {
    if (!tmpl) return;
    if (wheelEvent && typeof tmpl._onRotate === "function" && tmpl !== crosshair?.template && !tmpl.isCrosshair) {
        try {
            tmpl._onRotate(wheelEvent);
        } catch (e) {}
    }
    if (crosshairAdapter?.updatePreviewShape && tmpl.document) {
        try {
            const dims = tmpl._bbcDimensions ?? tmpl.document?._bbcDimensions ?? globalThis._activeBBCDimensions;
            const initialDist = dims?.distance ?? tmpl.document.distance ?? (typeof crosshairAdapter.detectProperties === "function" ? crosshairAdapter.detectProperties(tmpl.document).distance : undefined);
            const initialWidth = dims?.width ?? tmpl.document.width ?? (typeof crosshairAdapter.detectProperties === "function" ? crosshairAdapter.detectProperties(tmpl.document).width : undefined);
            const isGridUnits = dims?.gridUnits ?? true;

            const cfg = tmpl._bbcConfig ?? tmpl.document?._bbcConfig ?? {};
            const isSticky = Boolean(tmpl.document?.flags?.bakana?.token ?? tmpl.document?.flags?.bbc?.token ?? tmpl._bbcSticky ?? cfg.token);
            let targetX = 0, targetY = 0;

            if (isSticky && cfg.token && crosshairAdapter?.resolveAnchorPlacement && canvas?.mousePosition) {
                const anchored = crosshairAdapter.resolveAnchorPlacement(cfg.token, canvas.mousePosition);
                targetX = anchored.x;
                targetY = anchored.y;
            } else {
                const mousePos = canvas?.mousePosition ?? { x: tmpl.x ?? tmpl.document?.x ?? 0, y: tmpl.y ?? tmpl.document?.y ?? 0 };
                const snapMode = getGridSnapMode(cfg);
                const snapped = snapMode !== 0 ? snapCoordinates(mousePos.x, mousePos.y, snapMode) : mousePos;
                targetX = snapped.x;
                targetY = snapped.y;
            }

            console.log("%cBBC DIAGNOSTIC | refreshTemplateHighlights BEFORE updatePreviewShape:", "background: #7b2cbf; color: #fff; padding: 2px 4px; border-radius: 2px;", {
                tmplClassName: tmpl.constructor?.name,
                tmplPosition: { x: tmpl.x, y: tmpl.y },
                mousePosition: canvas?.mousePosition,
                targetCoords: { targetX, targetY, initialDist, initialWidth, isGridUnits, isSticky }
            });

            crosshairAdapter.updatePreviewShape(tmpl.document, {
                x: targetX,
                y: targetY,
                direction: newDirDeg,
                rotation: newDirDeg,
                distance: initialDist,
                radius: initialDist,
                width: initialWidth,
                sticky: isSticky,
                gridUnits: isGridUnits
            });
        } catch (e) {}
    }
    tmpl.direction = newDirDeg;
    if (tmpl.document) {
        tmpl.document.direction = newDirDeg;
        if (typeof tmpl.document.updateSource === "function") {
            try { tmpl.document.updateSource({ direction: newDirDeg }); } catch (e) {}
        }
        if (tmpl.document._shape !== undefined) tmpl.document._shape = null;
        if (tmpl.document.shape !== undefined && typeof tmpl.document.shape.clear === "function") {
            try { tmpl.document.shape.clear(); } catch (e) {}
        }
    }
    if (tmpl._shape !== undefined) tmpl._shape = null;
    if (tmpl.shape !== undefined && typeof tmpl.shape.clear === "function") {
        try { tmpl.shape.clear(); } catch (e) {}
    }
    if (tmpl.ray && Ray && tmpl.ray.origin) {
        try {
            tmpl.ray = Ray.fromAngle(tmpl.ray.origin.x, tmpl.ray.origin.y, rad, tmpl.ray.distance ?? 1000);
        } catch (e) {}
    }
    if (tmpl.renderFlags && tmpl.renderFlags.flags) {
        const flagsToSet = {};
        for (const flagName of ["refreshShape", "refreshTemplate", "refreshGrid", "refreshState", "refresh"]) {
            if (flagName in tmpl.renderFlags.flags) {
                flagsToSet[flagName] = true;
            }
        }
        if (Object.keys(flagsToSet).length > 0) {
            tmpl.renderFlags.set(flagsToSet);
        }
    }
    if (typeof tmpl.applyRenderFlags === "function") {
        try { tmpl.applyRenderFlags(); } catch (e) {}
    }
    if (typeof tmpl._refreshShape === "function") {
        try { tmpl._refreshShape(); } catch (e) {}
    }
    if (typeof tmpl.highlightGrid === "function") {
        try { tmpl.highlightGrid(); } catch (e) {}
    }

    console.log("%cBBC DIAGNOSTIC | refreshTemplateHighlights AFTER refresh:", "background: #7b2cbf; color: #fff; padding: 2px 4px; border-radius: 2px;", {
        tmplShape: tmpl.shape ? { x: tmpl.shape.x, y: tmpl.shape.y, width: tmpl.shape.width, height: tmpl.shape.height, bounds: tmpl.shape.bounds } : null,
        docShapes: tmpl.document?.shapes?.contents?.map?.(s => (typeof s?.toObject === "function" ? s.toObject() : s))
    });
}

/**
 * Rotate an active crosshair instance and its associated template highlights to a new direction.
 * Ensures circle crosshairs remain unrotated while directional shapes align with cursor/wheel.
 * @param {object} crosshair - The active crosshair instance to rotate
 * @param {number} newDirDeg - New direction angle in degrees
 * @returns {void}
 */
function rotateCrosshairInstance(crosshair, newDirDeg) {
    if (!crosshair) return;
    const rad = newDirDeg * (Math.PI / 180);

    const shapeType = crosshair.type ?? crosshair.config?.type ?? crosshair.data?.type ?? "circle";
    const isRect = shapeType === "rect" || shapeType === "square";
    const isAttached = shouldStickToToken(crosshair.config ?? {}, shapeType) && Boolean(crosshair.config?.token ?? crosshair.token);

    crosshair.direction = newDirDeg;
    if (!isRect || isAttached) {
        crosshair.rotation = rad;
    } else {
        crosshair.rotation = 0;
    }

    if (crosshair.config) {
        crosshair.config.direction = newDirDeg;
        crosshair.config.rotation = rad;
    }
    if (crosshair.data) {
        crosshair.data.direction = newDirDeg;
        crosshair.data.rotation = rad;
    }
    const tmpl = crosshair.template;
    if (tmpl) {
        tmpl._bbcCrosshair = crosshair;
        refreshTemplateHighlights(tmpl, newDirDeg, rad);
    }

    const isRay = crosshair.type === "ray" || crosshair.config?.type === "ray" || crosshair.data?.type === "ray";

    if (!isRay) {
        if (typeof crosshair.refresh === "function") {
            try { crosshair.refresh(); } catch (e) {}
        }
    }
    if (typeof crosshair._onMouseMove === "function" && canvas?.mousePosition) {
        try {
            crosshair._onMouseMove({
                data: { getLocalPosition: () => canvas.mousePosition },
                clientX: canvas.mousePosition.x,
                clientY: canvas.mousePosition.y
            });
        } catch (e) {}
    }
}


/**
 * Remove active window event listeners for crosshair wheel rotation and pointer tracking.
 * @returns {void}
 */
export function detachWheelRotation() {
    if (activeWheelHandler) {
        window.removeEventListener("wheel", activeWheelHandler, { capture: true });
        activeWheelHandler = null;
    }
    if (activePointerHandler) {
        window.removeEventListener("pointermove", activePointerHandler, { capture: true });
        activePointerHandler = null;
    }
    log.debug("detachWheelRotation | Mousewheel & pointermove listeners removed.");
}

/**
 * Attach window event listeners to handle mouse wheel and pointer movement during crosshair placement.
 * @param {object|null} crosshair - The crosshair placeable instance
 * @param {object} [config={}] - Crosshair configuration containing rotation options
 * @returns {void}
 */
export function attachWheelRotation(crosshair, config = {}) {
    detachWheelRotation();

    const shapeType = config.type ?? config.t ?? "circle";
    const isAttached = shouldStickToToken(config, shapeType) && Boolean(config.token);
    config.currentDirection = config.currentDirection ?? config.direction ?? 0;

    if (!isAttached) {
        activeWheelHandler = (event) => {
            const requiresCtrl = systemAdapter?.requiresWheelModifier?.() ?? false;
            if (requiresCtrl && !event.ctrlKey) return;
            if (typeof event.preventDefault === "function") event.preventDefault();
            if (typeof event.stopPropagation === "function") event.stopPropagation();

            const step = event.shiftKey ? 1 : 5;
            const delta = event.deltaY < 0 ? -step : step;
            config.currentDirection = (config.currentDirection + delta + 360) % 360;

            const rad = config.currentDirection * (Math.PI / 180);

            alignCrosshairAndEffects(crosshair, config, rad);

            const previewLists = [
                canvas?.templates?.preview?.children,
                canvas?.templates?.placeables,
                canvas?.regions?.preview?.children,
                canvas?.regions?.placeables,
                crosshair?.template ? [crosshair.template] : null
            ];
            for (const list of previewLists) {
                if (Array.isArray(list)) {
                    for (const p of list) {
                        if (p.isPreview || list === canvas?.templates?.preview?.children || list === canvas?.regions?.preview?.children || p === crosshair?.template) {
                            refreshTemplateHighlights(p, config.currentDirection, rad, event);
                        }
                    }
                }
            }
        };
        window.addEventListener("wheel", activeWheelHandler, { capture: true, passive: false });
    } else {
        log.debug("attachWheelRotation | Crosshair is attached to token. Disabling mouse wheel rotation.");
    }

    activePointerHandler = () => {
        if (isAttached && crosshair && canvas?.mousePosition) {
            const pt = canvas.mousePosition;
            const origin = config.token?.center ?? { x: crosshair.x, y: crosshair.y };
            const angleRad = Math.atan2(pt.y - origin.y, pt.x - origin.x);
            let dir = angleRad * (180 / Math.PI);
            if (dir < 0) dir += 360;
            config.currentDirection = dir;
            alignCrosshairAndEffects(crosshair, config, angleRad);
        }
        const rad = (config.currentDirection ?? 0) * (Math.PI / 180);
        const previewLists = [
            canvas?.templates?.preview?.children,
            canvas?.templates?.placeables,
            canvas?.regions?.preview?.children,
            canvas?.regions?.placeables,
            crosshair?.template ? [crosshair.template] : null
        ];
        for (const list of previewLists) {
            if (Array.isArray(list)) {
                for (const p of list) {
                    if (p.isPreview || list === canvas?.templates?.preview?.children || list === canvas?.regions?.preview?.children || p === crosshair?.template) {
                        refreshTemplateHighlights(p, config.currentDirection, rad);
                    }
                }
            }
        }
    };

    window.addEventListener("pointermove", activePointerHandler, { capture: true, passive: true });
    log.debug("attachWheelRotation | Listeners attached for crosshair pointer tracking and rotation (capture phase).");
}

/**
 * Align crosshair container and all active Sequencer effects so their origin (0, 0.5 for cones/rays, 0, 0 for squares, 0.5, 0.5 for circles)
 * sits precisely at the container's origin (0, 0) and rotates around the cursor point.
 * @param {object} crosshair - Active Sequencer crosshair container
 * @param {object} config - Crosshair placement config
 * @param {number} rad - Current rotation angle in radians
 * @returns {void}
 */
export function alignCrosshairAndEffects(crosshair, config = {}, rad = 0) {
    rotateCrosshairInstance(crosshair, config.currentDirection ?? config.direction ?? 0);

    const shapeType = config.type ?? config.t ?? crosshair?.type ?? "circle";
    const isRect = shapeType === "rect" || shapeType === "square";
    const isAttached = shouldStickToToken(config, shapeType) && Boolean(config.token ?? crosshair?.config?.token ?? crosshair?.token);

    // Synchronize rotation across all active Sequencer visual effect graphics without fighting Sequencer's internal pivot/anchor layout
    if (typeof Sequencer !== "undefined" && Sequencer.EffectManager) {
        try {
            const effects = Sequencer.EffectManager.getEffects({ name: config.id });
            for (const eff of effects) {
                if (isRect && !isAttached && eff.container) {
                    eff.container.pivot.set(0, 0);
                    if (eff.sprite) eff.sprite.position.set(0, 0);
                    if (eff.spriteContainer) eff.spriteContainer.position.set(0, 0);
                    if (typeof eff._updatePivot === "function") {
                        eff._updatePivot = () => {
                            if (eff.container) eff.container.pivot.set(0, 0);
                            if (eff.sprite) eff.sprite.position.set(0, 0);
                            if (eff.spriteContainer) eff.spriteContainer.position.set(0, 0);
                        };
                    }
                }
                if (eff.container && typeof eff.container.rotation !== "undefined") {
                    eff.container.rotation = rad;
                }
                if (typeof eff.rotation !== "undefined") eff.rotation = rad;
                if (typeof eff.update === "function") {
                    try { eff.update({ rotation: rad }); } catch (e) {}
                }
            }
        } catch (e) {}
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
    if (config.snapToGrid === "center") return globalThis.CONST?.GRID_SNAPPING_MODES?.CENTER ?? 1;
    if (config.snapToGrid === "corner" || config.snapToGrid === "vertex" || config.snapToGrid === "corners") return globalThis.CONST?.GRID_SNAPPING_MODES?.VERTEX ?? 2;
    if (config.snapToGrid === "side" || config.snapToGrid === "edge" || config.snapToGrid === "edges") return globalThis.CONST?.GRID_SNAPPING_MODES?.SIDE_MIDPOINT ?? globalThis.CONST?.GRID_SNAPPING_MODES?.SIDE ?? 4;
    return (globalThis.CONST?.GRID_SNAPPING_MODES?.CENTER ?? 1) |
           (globalThis.CONST?.GRID_SNAPPING_MODES?.VERTEX ?? 2) |
           (globalThis.CONST?.GRID_SNAPPING_MODES?.SIDE_MIDPOINT ?? globalThis.CONST?.GRID_SNAPPING_MODES?.SIDE ?? 4);
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

    let direction = typeof config.currentDirection === "number" ? config.currentDirection : undefined;

    // Search arguments for explicit rotation/direction
    const allArgs = [crosshair, config, ...extraArgs];
    for (const arg of allArgs) {
        if (!arg || typeof arg !== "object") continue;
        let foundDir = arg.direction ?? arg.data?.direction ?? arg.template?.direction;
        if (typeof foundDir === "number" && direction === undefined) {
            direction = foundDir;
        } else if (arg.ray && typeof arg.ray.angle === "number" && direction === undefined) {
            direction = arg.ray.angle * (180 / Math.PI);
        } else if (direction === undefined) {
            const rot = arg.rotation ?? arg.data?.rotation ?? arg._rotation;
            if (typeof rot === "number") {
                direction = (Math.abs(rot) <= Math.PI * 2 && rot !== 0) ? (rot * (180 / Math.PI)) : rot;
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
        const anchored = crosshairAdapter.resolveAnchorPlacement(config.token, { x: clickX, y: clickY });
        x = anchored.x;
        y = anchored.y;
        if (direction === undefined) direction = anchored.direction;
        log.debug("resolveCrosshairPlacement | Token anchored placement via version adapter ->", { x, y, direction });
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

    if (typeof direction === "number") {
        while (direction < 0) direction += 360;
        direction = direction % 360;
    } else {
        direction = 0;
    }

    const result = crosshairAdapter.formatPlacementCoordinates(x, y, typeof direction === "number" ? direction : 0, config);

    console.log("%cBBC DIAGNOSTIC | resolveCrosshairPlacement Result:", "background: #7b2cbf; color: #fff; padding: 2px 4px; border-radius: 2px;", {
        rawClick: { clickX, clickY },
        snapped: { x, y },
        direction,
        formattedResult: result,
        activeDimensions: globalThis._activeBBCDimensions
    });

    config.context?.resolve?.(result);
    if (typeof config._onPlaced === "function") {
        try { config._onPlaced(result, crosshair, ...extraArgs); } catch (e) {}
    }
    return result;
}

/**
 * Snap raw coordinates according to the provided snapping mode.
 * @param {number} x - Raw X coordinate to snap
 * @param {number} y - Raw Y coordinate to snap
 * @param {string|number|boolean} [mode="all"] - Snapping mode ("all", "center", "corner", "edges", bitmask integer)
 * @returns {object} Snapped coordinates `{ x, y }`
 */
export function snapCoordinates(x, y, mode = "all") {
    if (!canvas?.grid || mode === false || mode === "none" || mode === 0 || mode === "0") return { x, y };

    try {
        const size = canvas.grid.size ?? 100;

        if (typeof canvas.grid.getSnappedPosition === "function" && mode !== "center" && mode !== "corner" && mode !== "corners") {
            const numMode = typeof mode === "number" ? mode : getGridSnapMode({ snapToGrid: mode });
            if (numMode !== 0) {
                const snapped = canvas.grid.getSnappedPosition(x, y, numMode);
                return { x: snapped.x, y: snapped.y };
            }
        }

        if (mode === "center" || mode === 1) {
            if (typeof canvas.grid.getCenter === "function") {
                const [cx, cy] = canvas.grid.getCenter(x, y);
                return { x: cx, y: cy };
            }
            if (typeof canvas.grid.getCenterPoint === "function") {
                const pt = canvas.grid.getCenterPoint({ x, y });
                return { x: pt.x, y: pt.y };
            }
        }

        if (mode === "corner" || mode === "corners" || mode === 2) {
            const sx = Math.round(x / size) * size;
            const sy = Math.round(y / size) * size;
            return { x: sx, y: sy };
        }

        if (mode === "all" || mode === true || mode === "default" || mode === "edges" || mode === "edge" || typeof mode === "number") {
            // Snaps to nearest of: center, corners, or edges (half-grid interval size / 2)
            const half = size / 2;
            const sx = Math.round(x / half) * half;
            const sy = Math.round(y / half) * half;
            return { x: sx, y: sy };
        }
    } catch (e) {
        log.warn("snapCoordinates | Error snapping coordinates:", e);
    }
    return { x, y };
}

/**
 * Calculate point on token boundary edge toward target position along with angle in degrees.
 * @param {Token} tok - Normalized Token object
 * @param {number} targetX - Target X coordinate
 * @param {number} targetY - Target Y coordinate
 * @param {boolean} [sticky=false] - Whether to snap to 8-way sticky perimeter points
 * @returns {object} Edge point coordinates and angle `{ x, y, direction }`
 */
export function getTokenEdgePoint(tok, targetX, targetY, sticky = false) {
    if (!tok) return { x: targetX, y: targetY, direction: 0 };
    const size = canvas?.grid?.size ?? 100;
    const cx = tok.center?.x ?? (tok.x + (tok.w ?? 0) / 2);
    const cy = tok.center?.y ?? (tok.y + (tok.h ?? 0) / 2);
    const hw = (tok.w ?? size) / 2;
    const hh = (tok.h ?? size) / 2;

    const dx = targetX - cx;
    const dy = targetY - cy;
    const angleRad = Math.atan2(dy, dx);
    let angleDeg = angleRad * (180 / Math.PI);
    if (angleDeg < 0) angleDeg += 360;

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
