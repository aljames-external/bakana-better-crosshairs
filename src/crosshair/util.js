import { log } from "../lib/logger.js";
import { Token, Ray } from "../lib/compat.js";
import { crosshairAdapter } from "../adapter/foundry/index.js";

let activeWheelHandler = null;
let activePointerHandler = null;

export function shouldStickToToken(config, defaultVal = false) {
    if (!config || typeof config !== "object") return defaultVal;
    const stickVal = String(config.stickToToken);
    if (stickVal === "true") return true;
    if (stickVal === "false") return false;
    return defaultVal;
}

function refreshTemplateHighlights(tmpl, newDirDeg, rad) {
    if (!tmpl) return;
    tmpl.direction = newDirDeg;
    if (tmpl.document) {
        tmpl.document.direction = newDirDeg;
        if (typeof tmpl.document.updateSource === "function") {
            try { tmpl.document.updateSource({ direction: newDirDeg }); } catch (e) {}
        }
    }
    if (tmpl.ray && Ray && tmpl.ray.origin) {
        try {
            tmpl.ray = Ray.fromAngle(tmpl.ray.origin.x, tmpl.ray.origin.y, rad, tmpl.ray.distance ?? 1000);
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

    crosshair.direction = newDirDeg;
    crosshair.rotation = rad;

    if (crosshair.config) {
        crosshair.config.direction = newDirDeg;
        crosshair.config.rotation = rad;
    }
    if (crosshair.data) {
        crosshair.data.direction = newDirDeg;
        crosshair.data.rotation = rad;
    }

    const tmpl = crosshair.template ?? crosshair._template ?? crosshair.placeable;
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

    const isCone = config.type === "cone" || config.t === "cone";
    const isAttached = shouldStickToToken(config, isCone) && Boolean(config.token);
    if (isAttached) {
        log.debug("attachWheelRotation | Crosshair is attached to token. Disabling mouse wheel rotation.");
        return;
    }

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
                    const curRad = crosshair.sprite.rotation ?? 0;
                    const halfLen = (crosshair.sprite.width ?? 0) / 2;
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
                            const curRad = eff.sprite.rotation ?? 0;
                            const halfLen = (eff.sprite.width ?? 0) / 2;
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

    let direction = typeof config.currentDirection === "number" ? config.currentDirection : undefined;

    // Search arguments for explicit rotation/direction
    const allArgs = [crosshair, config, ...extraArgs];
    for (const arg of allArgs) {
        if (!arg || typeof arg !== "object") continue;
        let foundDir = arg.direction ?? arg.data?.direction ?? arg.template?.direction ?? arg.placeable?.direction ?? arg._direction;
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

    const isRayOrCone = config.type === "ray" || config.type === "cone" || config.t === "ray" || config.t === "cone";
    const isCone = config.type === "cone" || config.t === "cone";
    const isAnchored = shouldStickToToken(config, isCone) && Boolean(config.token);

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
        const snapMode = config.snapToGrid ?? "corner";
        if (snapMode && snapMode !== false && snapMode !== "none") {
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
    }

    const result = crosshairAdapter.formatPlacementCoordinates(x, y, typeof direction === "number" ? direction : 0, config);

    log.debug("resolveCrosshairPlacement | Resolved and formatted placement coordinates:", result);

    if (config.context) {
        config.context.resolve(result);
    }
    return result;
}

/**
 * Snap coordinates to grid center, corners, edges, or nearest of all.
 */
export function snapCoordinates(x, y, mode = "all") {
    if (!canvas?.grid) return { x, y };

    try {
        const size = canvas.grid.size ?? 100;

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

const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

/**
 * Execute custom concurrent Javascript code before running the Sequencer .play() sequence.
 * Wrapped in try/catch block with standard context variables.
 */
export async function runConcurrentScript(token, config = {}, crosshairSequence = null) {
    const code = config.concurrentCode ?? config.preAnimationCode ?? config.customCode;
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
