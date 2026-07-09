import { log } from "../lib/logger.js";

let activeWheelHandler = null;
let activePointerHandler = null;

function refreshTemplateHighlights(tmpl, newDirDeg, rad) {
    if (!tmpl) return;
    tmpl.direction = newDirDeg;
    if (tmpl.document) {
        tmpl.document.direction = newDirDeg;
        if (typeof tmpl.document.updateSource === "function") {
            try { tmpl.document.updateSource({ direction: newDirDeg }); } catch (e) {}
        }
    }
    if (tmpl.ray && typeof Ray !== "undefined" && tmpl.ray.origin) {
        try {
            tmpl.ray = Ray.fromAngle(tmpl.ray.origin.x, tmpl.ray.origin.y, rad, tmpl.ray.distance || 1000);
        } catch (e) {}
    }
    if (tmpl.renderFlags) {
        tmpl.renderFlags.set({ refreshShape: true, refreshTemplate: true, refreshGrid: true });
    }
    if (typeof tmpl.refresh === "function") {
        try { tmpl.refresh(); } catch (e) {}
    }
    if (typeof tmpl.highlightGrid === "function") {
        try { tmpl.highlightGrid(); } catch (e) {}
    }
}

function rotateCrosshairInstance(crosshair, newDirDeg) {
    if (!crosshair) return;
    const rad = newDirDeg * (Math.PI / 180);

    if ("direction" in crosshair) crosshair.direction = newDirDeg;
    if ("_direction" in crosshair) crosshair._direction = newDirDeg;
    if ("rotation" in crosshair) crosshair.rotation = rad;
    if ("_rotation" in crosshair) crosshair._rotation = rad;

    if (crosshair.config) {
        crosshair.config.direction = newDirDeg;
        if ("rotation" in crosshair.config) crosshair.config.rotation = rad;
    }
    if (crosshair.data) {
        crosshair.data.direction = newDirDeg;
        if ("rotation" in crosshair.data) crosshair.data.rotation = rad;
    }

    const tmpl = crosshair.template || crosshair._template || crosshair.placeable;
    if (tmpl) {
        refreshTemplateHighlights(tmpl, newDirDeg, rad);
    }

    const isRay = crosshair.type === "ray" || crosshair.config?.type === "ray" || crosshair.data?.type === "ray";

    if (!isRay) {
        if (typeof crosshair.update === "function") {
            try { crosshair.update({ direction: newDirDeg }); } catch (e) {}
            try { crosshair.update(); } catch (e) {}
        }
        if (typeof crosshair.draw === "function") {
            try { crosshair.draw(); } catch (e) {}
        }
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
 * Attach a mousewheel event listener to rotate a Sequencer crosshair interactively.
 */
export function attachWheelRotation(crosshair, config = {}) {
    detachWheelRotation();

    config.currentDirection = config.currentDirection ?? config.direction ?? 0;

    activeWheelHandler = (event) => {
        const step = event.shiftKey ? 1 : 5; // 5 degrees normally (72 mousewheel steps per 360° turn)
        const delta = event.deltaY < 0 ? -step : step;
        config.currentDirection = (config.currentDirection + delta + 360) % 360;

        const rad = config.currentDirection * (Math.PI / 180);

        log.debug("Crosshair mousewheel rotation | Wheel scrolled:", {
            deltaY: event.deltaY,
            step: delta,
            newDirection: config.currentDirection
        });

        // 1. Store direction on crosshair object and force full internal redraw of shape overlay and grid highlights
        rotateCrosshairInstance(crosshair, config.currentDirection);

        const isRay = config.type === "ray";

        // 2. Rotate internal PIXI graphics inside crosshair container (rotates transparent grey shape)
        if (crosshair) {
            if (crosshair.sprite) {
                if (isRay && crosshair.sprite.anchor && crosshair.sprite.anchor.x !== 0) {
                    const curRad = crosshair.sprite.rotation || 0;
                    const halfLen = (crosshair.sprite.width || 0) / 2;
                    crosshair.sprite.x -= Math.cos(curRad) * halfLen;
                    crosshair.sprite.y -= Math.sin(curRad) * halfLen;
                    crosshair.sprite.anchor.set(0, 0.5);
                }
                crosshair.sprite.rotation = rad;
            }
            if (crosshair.mesh) crosshair.mesh.rotation = rad;
            if (crosshair.graphics) crosshair.graphics.rotation = rad;
            if (Array.isArray(crosshair.children)) {
                for (const child of crosshair.children) {
                    if (child.rotation !== undefined && (child.isGraphics || child.type === "Graphics" || child.constructor?.name === "Graphics")) {
                        child.rotation = rad;
                    }
                }
            }
        }

        // 3. Rotate the active Sequencer visual effect graphics directly around the left edge midpoint
        if (typeof Sequencer !== "undefined" && Sequencer.EffectManager) {
            try {
                const effects = Sequencer.EffectManager.getEffects({ name: config.id });
                for (const eff of effects) {
                    if (eff.sprite) {
                        if (isRay && eff.sprite.anchor && eff.sprite.anchor.x !== 0) {
                            const curRad = eff.sprite.rotation || 0;
                            const halfLen = (eff.sprite.width || 0) / 2;
                            eff.sprite.x -= Math.cos(curRad) * halfLen;
                            eff.sprite.y -= Math.sin(curRad) * halfLen;
                            eff.sprite.anchor.set(0, 0.5);
                        }
                        eff.sprite.rotation = rad;
                    }
                    else if (eff.mesh) eff.mesh.rotation = rad;
                    else if (eff.container) eff.container.rotation = rad;
                    else if (typeof eff.rotation !== "undefined") eff.rotation = rad;
                }
            } catch (e) {}
        }

        // 4. Update any active Core Foundry preview MeasuredTemplate shape & grid highlight overlay
        if (canvas?.templates?.preview?.children) {
            for (const child of canvas.templates.preview.children) {
                refreshTemplateHighlights(child, config.currentDirection, rad);
            }
        }
        if (canvas?.templates?.placeables) {
            for (const p of canvas.templates.placeables) {
                if (p.isPreview) refreshTemplateHighlights(p, config.currentDirection, rad);
            }
        }
    };

    activePointerHandler = () => {
        const rad = config.currentDirection * (Math.PI / 180);
        if (canvas?.templates?.preview?.children) {
            for (const child of canvas.templates.preview.children) {
                if (child.document && child.document.direction !== config.currentDirection) {
                    refreshTemplateHighlights(child, config.currentDirection, rad);
                }
            }
        }
    };

    window.addEventListener("wheel", activeWheelHandler, { capture: true, passive: true });
    window.addEventListener("pointermove", activePointerHandler, { capture: true, passive: true });
    log.debug("attachWheelRotation | Mousewheel & pointermove listeners attached for crosshair rotation (capture phase).");
}

/**
 * Detach the active mousewheel event listener.
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
 * Shared utility to resolve crosshair coordinates and direction upon placement.
 * Sequencer passes coordinates or the crosshair object to CALLBACKS.PLACED.
 * We inspect all arguments and fall back to canvas.mousePosition if needed.
 */
export function resolveCrosshairPlacement(crosshair, config = {}, ...extraArgs) {
    detachWheelRotation();
    log.debug("resolveCrosshairPlacement | Inspecting arguments passed to PLACED callback:", crosshair, config, extraArgs);

    let targetX, targetY, direction;

    if (typeof config.currentDirection === "number") {
        direction = config.currentDirection;
    }

    // Search all arguments for click/target x/y coordinates and rotation/direction
    const allArgs = [crosshair, config, ...extraArgs];
    for (const arg of allArgs) {
        if (!arg || typeof arg !== "object") continue;

        let foundDir = arg.direction ?? arg.data?.direction ?? arg.template?.direction ?? arg.placeable?.direction ?? arg._direction;
        if (typeof foundDir === "number") {
            direction = foundDir;
        } else if (arg.ray && typeof arg.ray.angle === "number") {
            direction = arg.ray.angle * (180 / Math.PI);
        } else {
            const rot = arg.rotation ?? arg.data?.rotation ?? arg._rotation;
            if (typeof rot === "number") {
                direction = (Math.abs(rot) <= Math.PI * 2 && rot !== 0) ? (rot * (180 / Math.PI)) : rot;
            }
        }

        if (typeof arg.x === "number" && typeof arg.y === "number" && targetX === undefined) {
            targetX = arg.x;
            targetY = arg.y;
        }
        if (arg.position && typeof arg.position.x === "number" && typeof arg.position.y === "number" && targetX === undefined) {
            targetX = arg.position.x;
            targetY = arg.position.y;
        }
        if (arg.center && typeof arg.center.x === "number" && typeof arg.center.y === "number" && targetX === undefined) {
            targetX = arg.center.x;
            targetY = arg.center.y;
        }
    }

    if (typeof direction === "number") {
        while (direction < 0) direction += 360;
        direction = direction % 360;
    }

    if (typeof targetX !== "number" || typeof targetY !== "number") {
        const mousePos = canvas?.mousePosition || {};
        targetX = mousePos.x ?? 0;
        targetY = mousePos.y ?? 0;
    }

    let x = targetX;
    let y = targetY;

    const isAnchored = (config.stickToToken || config.attachToToken || config.lockToToken) && config.token;
    const isV14 = typeof game !== "undefined" && typeof foundry !== "undefined" && foundry.utils.isNewerVersion(game.version, "14");

    if (isAnchored) {
        if (!isV14) {
            const mousePos = canvas?.mousePosition || {};
            const clickX = mousePos.x ?? targetX;
            const clickY = mousePos.y ?? targetY;
            const edgePoint = getTokenEdgePoint(config.token, clickX, clickY);
            x = edgePoint.x;
            y = edgePoint.y;
            direction = edgePoint.direction;
        }
        log.debug("resolveCrosshairPlacement | Token anchored edge placement ->", { x, y, direction, isV14 });
    } else {
        const snapMode = config.snapToGrid ?? "corner";
        if (snapMode && snapMode !== false && snapMode !== "none") {
            const snapped = snapCoordinates(x, y, snapMode);
            x = snapped.x;
            y = snapped.y;
        }
    }

    const result = {
        x,
        y,
        direction: direction ?? 0,
        rotation: direction ?? 0
    };
    if (typeof config.width === "number") result.width = config.width;
    if (typeof config.distance === "number" || typeof config.radius === "number") {
        result.distance = config.distance ?? config.radius;
    }

    log.debug("resolveCrosshairPlacement | Resolved placement coordinates:", result);

    if (config.context) {
        config.context.resolve(result);
    }
    return result;
}

/**
 * Calculate point on token boundary edge toward target position along with angle in degrees.
 */
export function getTokenEdgePoint(token, targetX, targetY, sticky = true) {
    const cx = token.center?.x ?? (token.x + (token.w || 0) / 2);
    const cy = token.center?.y ?? (token.y + (token.h || 0) / 2);
    const hw = (token.w || canvas?.grid?.size || 100) / 2;
    const hh = (token.h || canvas?.grid?.size || 100) / 2;

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

/**
 * Snap coordinates to grid center, corners, edges, or nearest of all.
 */
export function snapCoordinates(x, y, mode = "all") {
    if (!canvas?.grid) return { x, y };

    try {
        const size = canvas.grid.size || 100;

        if (mode === "center") {
            if (typeof canvas.grid.getCenter === "function") {
                const [cx, cy] = canvas.grid.getCenter(x, y);
                return { x: cx, y: cy };
            }
            if (typeof canvas.grid.getCenterPoint === "function") {
                const pt = canvas.grid.getCenterPoint({ x, y });
                return { x: pt.x, y: pt.y };
            }
        }

        if (mode === "corner" || mode === "corners") {
            const sx = Math.round(x / size) * size;
            const sy = Math.round(y / size) * size;
            return { x: sx, y: sy };
        }

        if (mode === "all" || mode === true || mode === "default" || mode === "edges" || mode === "edge") {
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
