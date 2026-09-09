import { log } from "../lib/logger.js";
import { closest } from "../lib/filemanager.js";
import { adapter } from "../adapter/index.js";
import { TokenGeometry } from "../lib/tokenGeometry.js";
import { rotationListener } from "./rotationListener.js";
import { ScriptRunner } from "../lib/scriptRunner.js";

export const activePlacementTracker: {
    placeable: any;
    dimensions: any;
    crosshair: any;
    config: any;
    sticky: boolean;
} = {
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
export function _normalizeAngleDegrees(angleDeg) {
    return TokenGeometry.normalizeAngle(angleDeg);
}

export function _calculateAngleFromOrigin(origin, target) {
    return TokenGeometry.calculateAngle(origin, target);
}

/**
 * Helper: Iterate through all active preview lists on canvas and refresh highlights.
 * @param {number} currentDirection - Current direction in degrees
 * @param {number} rad - Current direction in radians
 * @param {object|null} crosshair - Active crosshair instance
 * @param {Event|null} [event=null] - Triggering event if any
 */
function _refreshPreviewHighlights(currentDirection, rad, crosshair, event = null) {
    rotationListener.refreshAllActiveHighlights(currentDirection, rad, crosshair, event);
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
    try {
        config._onPlaced?.(result, crosshair, ...extraArgs);
    } catch (e) {
        log.debug("resolveCrosshairPlacement | Exception in _onPlaced callback:", e);
    }
    return result;
}

/**
 * Determine whether a crosshair should remain attached/stuck to its source token.
 * If no explicit configuration override (`config.stickToToken`) is set, delegates the default
 * choice to the active game system adapter based on the shape type (`shapeType`).
 * @param {object} config - Configuration object containing placement options
 * @param {string} [shapeType="circle"] - The shape type (`"cone"`, `"ray"`, `"circle"`, `"square"`, `"rect"`)
 * @param {object} [sysAdapter=adapter.system] - The active system adapter
 * @returns {boolean} Whether the crosshair should stick to the token
 */
export function shouldStickToToken(config, shapeType = "circle", sysAdapter = adapter.system) {
    if (adapter.crosshair?.supportsShapeRotation && !adapter.crosshair.supportsShapeRotation(shapeType)) {
        return false;
    }
    if (!config) {
        return Boolean(sysAdapter?.getDefaultStickToToken?.(shapeType, config));
    }
    const val = config.stickToToken;
    if (val === "true" || val === true || val === 1) return true;
    if (val === "false" || val === false || val === 0) return false;
    return Boolean(sysAdapter?.getDefaultStickToToken?.(shapeType, config));
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
    rotationListener.refreshTemplateHighlights(tmpl, newDirDeg, rad, wheelEvent);
}

/**
 * Remove active window event listeners for crosshair wheel rotation and pointer tracking.
 * @returns {void}
 */
export function detachWheelRotation() {
    rotationListener.detach();
}

/**
 * Attach window event listeners to handle mouse wheel and pointer movement during crosshair placement.
 * @param {object|null} shape - The crosshair placeable instance or shape instance
 * @param {object} [config={}] - Crosshair configuration containing rotation options
 * @returns {void}
 */
export function attachWheelRotation(shape, config = {}) {
    rotationListener.attach(shape, config);
}

/**
 * Rotate an active crosshair instance and its associated template highlights to a new direction.
 * @param {object} crosshair - The active crosshair instance to rotate
 * @param {number} newDirDeg - New direction angle in degrees
 * @param {object} [config={}] - Crosshair placement configuration
 * @returns {void}
 */
export function rotateCrosshairInstance(crosshair, newDirDeg, config = {}) {
    rotationListener.rotateCrosshairInstance(crosshair, newDirDeg, config);
}

/**
 * Align crosshair container and all active Sequencer effects so their origin sits precisely
 * at the container's origin (0, 0) and rotates around the cursor point.
 * @param {object} crosshair - Active Sequencer crosshair container
 * @param {object} config - Crosshair placement config
 * @param {number} rad - Current rotation angle in radians
 * @returns {void}
 */
export function alignCrosshairAndEffects(crosshair: any, config: Record<string, any> = {}, rad: number = 0) {
    const deg = config.currentDirection ?? config.direction ?? (rad * (180 / Math.PI));
    rotateCrosshairInstance(crosshair, deg, config);

    const shape = crosshair?.shapeInstance ?? config?.shapeInstance ?? activePlacementTracker.crosshair?.shapeInstance;
    const shapeType = config.type ?? config.t ?? shape?.type ?? crosshair?.type ?? "circle";
    const isRect = shapeType === "rect" || shapeType === "square";
    const rawToken = config.token ?? crosshair?.config?.token ?? crosshair?.token ?? shape?.token;
    const token = adapter.crosshair.toToken(rawToken);
    const isAttached = shouldStickToToken(config, shapeType) && Boolean(token);
    const effectId = config.id ?? shape?.id ?? "Crosshair";

    let targetX = 0;
    let targetY = 0;

    if (isAttached && token) {
        if (shapeType === "circle") {
            const center = token.center;
            targetX = center.x;
            targetY = center.y;
        } else {
            const cursorPt = (adapter.crosshair.mousePosition && Number.isFinite(adapter.crosshair.mousePosition.x))
                ? adapter.crosshair.mousePosition
                : { x: shape?.cursorX ?? shape?.x ?? crosshair?.x ?? 0, y: shape?.cursorY ?? shape?.y ?? crosshair?.y ?? 0 };
            const anchored = adapter.crosshair.resolveAnchorPlacement(token, cursorPt);
            targetX = anchored.x;
            targetY = anchored.y;
        }
    } else {
        const cursorPt = (adapter.crosshair.mousePosition && Number.isFinite(adapter.crosshair.mousePosition.x))
            ? adapter.crosshair.mousePosition
            : { x: shape?.cursorX ?? shape?.x ?? crosshair?.x ?? 0, y: shape?.cursorY ?? shape?.y ?? crosshair?.y ?? 0 };
        targetX = cursorPt.x;
        targetY = cursorPt.y;
    }

    log.debug(`[Bakana Sequencer Effect Alignment] Config ID: "${effectId}" | Type: "${shapeType}" | Target Pos: (${targetX}, ${targetY}) | Rad: ${rad.toFixed(4)} | Deg: ${deg.toFixed(2)}°`);

    if (game?.modules?.get("sequencer")?.active) {
        try {
            if (Sequencer?.EffectManager) {
                const mainEffects = Sequencer.EffectManager.getEffects({ name: effectId }) ?? [];
                const iconEffects = Sequencer.EffectManager.getEffects({ name: `${effectId}-icon` }) ?? [];
                const effects = [...mainEffects, ...iconEffects];
                for (const eff of effects) {
                    const isIcon = eff.name === `${effectId}-icon`;
                    const effRad = isIcon ? 0 : rad;
                    const effDeg = isIcon ? 0 : deg;

                    eff.x = targetX;
                    eff.y = targetY;
                    if (eff.worldPosition) {
                        eff.worldPosition.x = targetX;
                        eff.worldPosition.y = targetY;
                    }
                    if (eff.position) {
                        eff.position.x = targetX;
                        eff.position.y = targetY;
                    }
                    eff.rotation = effRad;

                    if (eff.container) {
                        if (eff.container.position?.set) {
                            eff.container.position.set(targetX, targetY);
                        } else {
                            eff.container.x = targetX;
                            eff.container.y = targetY;
                        }
                        eff.container.rotation = effRad;
                    }

                    if (eff.spriteContainer?.rotation !== undefined) {
                        eff.spriteContainer.rotation = 0;
                    }

                    if (eff.rotation !== undefined) eff.rotation = effRad;
                    try {
                        eff.update?.({
                            position: { x: targetX, y: targetY },
                            rotation: effDeg
                        });
                    } catch (e) {
                        log.debug("alignCrosshairAndEffects | Exception updating Sequencer effect rotation:", e);
                    }

                    if (isRect && eff.container && !isIcon) {
                        eff.container.pivot?.set?.(0, 0);
                        eff.sprite?.position?.set?.(0, 0);
                        eff.spriteContainer?.position?.set?.(0, 0);
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
export function getGridSnapMode(config: Record<string, any> = {}) {
    if (config.snapToGrid === false || config.snapToGrid === "none" || config.snapToGrid === 0 || config.snapToGrid === "0") return 0;
    if (typeof config.snapToGrid === "number") return config.snapToGrid;
    if (config.snapToGrid === "center") return CONST?.GRID_SNAPPING_MODES?.CENTER ?? 1;
    if (config.snapToGrid === "corner" || config.snapToGrid === "vertex" || config.snapToGrid === "corners") return CONST?.GRID_SNAPPING_MODES?.VERTEX ?? 2;
    if (config.snapToGrid === "side" || config.snapToGrid === "edge" || config.snapToGrid === "edges") return CONST?.GRID_SNAPPING_MODES?.SIDE_MIDPOINT ?? (CONST?.GRID_SNAPPING_MODES as any)?.SIDE ?? 4;
    return (CONST?.GRID_SNAPPING_MODES?.CENTER ?? 1) |
           (CONST?.GRID_SNAPPING_MODES?.VERTEX ?? 2) |
           (CONST?.GRID_SNAPPING_MODES?.SIDE_MIDPOINT ?? (CONST?.GRID_SNAPPING_MODES as any)?.SIDE ?? 4);
}

/**
 * Shared utility to resolve crosshair coordinates and direction upon placement.
 * @param {object} crosshair - Placed Sequencer crosshair instance or shape instance
 * @param {object} [config={}] - Crosshair placement configuration
 * @param {...*} extraArgs - Additional arguments passed by placement callback
 * @returns {object} Formatted placement coordinates and direction `{ x, y, direction }`
 */
export function resolveCrosshairPlacement(crosshair: any, config: Record<string, any> = {}, ...extraArgs: any[]) {
    detachWheelRotation();
    log.debug("resolveCrosshairPlacement | Inspecting arguments passed to PLACED callback:", crosshair, config, extraArgs);

    const shape = crosshair?.getPlacementUpdates
        ? crosshair
        : (crosshair?.shapeInstance ?? config?.shapeInstance ?? activePlacementTracker.crosshair?.shapeInstance);

    if (shape?.getPlacementUpdates) {
        const result = shape.getPlacementUpdates();
        return _notifyPlacementResult(result, config, crosshair, extraArgs);
    }

    let direction = config.currentDirection
        ?? config.direction
        ?? shape?.direction
        ?? crosshair?.direction
        ?? undefined;

    // Search extra arguments for explicit rotation/direction if not already set by placement config
    if (direction === undefined) {
        const allArgs = [crosshair, config, ...extraArgs];
        for (const arg of allArgs) {
            if (!arg) continue;
            let foundDir = arg.currentDirection ?? arg.direction ?? arg.data?.direction ?? arg.template?.direction;
            if (foundDir !== undefined && direction === undefined) {
                direction = foundDir;
            } else if (arg.ray?.angle !== undefined && direction === undefined) {
                direction = arg.ray.angle * (180 / Math.PI);
            } else if (direction === undefined) {
                const rot = arg.rotation ?? arg.data?.rotation ?? arg.direction;
                if (rot !== undefined) {
                    direction = (Math.abs(rot) <= Math.PI * 2 && rot !== 0) ? (rot * (180 / Math.PI)) : rot;
                }
            }
        }
    }

    const mousePos = (adapter.crosshair.mousePosition ?? {}) as any;
    const clickX = mousePos.x ?? 0;
    const clickY = mousePos.y ?? 0;

    const shapeType = config.type ?? config.t ?? "circle";
    const isAnchored = shouldStickToToken(config, shapeType) && Boolean(config.token);

    let x = clickX;
    let y = clickY;

    if (isAnchored && config.token) {
        if (shapeType === "circle") {
            const token = adapter.crosshair.toToken(config.token);
            const center = token?.center ?? { x: clickX, y: clickY };
            x = center.x;
            y = center.y;
            direction = 0;
        } else {
            const mousePos = adapter.crosshair.mousePosition ?? { x: clickX, y: clickY };
            const anchored = adapter.crosshair.resolveAnchorPlacement(config.token, mousePos);
            x = (crosshair && Number.isFinite(crosshair.x)) ? crosshair.x : anchored.x;
            y = (crosshair && Number.isFinite(crosshair.y)) ? crosshair.y : anchored.y;
            if (direction === undefined) {
                direction = (crosshair && Number.isFinite(crosshair.direction)) ? crosshair.direction : anchored.direction;
            }
        }
        log.debug("resolveCrosshairPlacement | Token anchored placement ->", { x, y, direction });
    } else {
        // Detached / free cursor placement: Origin is where the user clicked (clickX, clickY)
        x = (crosshair && Number.isFinite(crosshair.x)) ? crosshair.x : clickX;
        y = (crosshair && Number.isFinite(crosshair.y)) ? crosshair.y : clickY;
        const snapMode = getGridSnapMode(config);
        if (snapMode !== 0) {
            const snapped = snapCoordinates(x, y, snapMode);
            x = snapped.x;
            y = snapped.y;
        }
        if (direction === undefined) {
            direction = config.currentDirection ?? config.direction ?? (crosshair && Number.isFinite(crosshair.direction) ? crosshair.direction : (config.angle ?? 0));
        }
    }

    const finalDirection = _normalizeAngleDegrees(direction);
    const result = adapter.crosshair.formatPlacementCoordinates(x, y, finalDirection, config);

    return _notifyPlacementResult(result, config, crosshair, extraArgs);
}

/**
 * Snap raw coordinates according to the provided snapping mode.
 * @param {number} x - Raw X coordinate to snap
 * @param {number} y - Raw Y coordinate to snap
 * @param {string|number|boolean} [mode="all"] - Snapping mode ("all", "center", "corner", "edges", bitmask integer)
 * @returns {object} Snapped coordinates `{ x, y }`
 */
export function snapCoordinates(x: number, y: number, mode: string | number | boolean = "all") {
    return adapter.crosshair.snapCoordinates(x, y, mode as any);
}

/**
 * Calculate point on token boundary edge toward target position along with angle in degrees.
 * @param {Token} tok - Raw token input (placeable or document)
 * @param {number} targetX - Target X coordinate
 * @param {number} targetY - Target Y coordinate
 * @param {boolean} [sticky=false] - Whether to snap to 8-way sticky perimeter points
 * @returns {object} Edge point coordinates and angle `{ x, y, direction }`
 */
export function getTokenEdgePoint(tok: any, targetX: number, targetY: number, sticky: boolean = false) {
    const token = adapter.crosshair.toToken(tok);
    return TokenGeometry.getTokenEdgePoint(token, targetX, targetY, sticky);
}

/**
 * Execute custom concurrent Javascript code before running the Sequencer .play() sequence.
 * Wrapped in try/catch block with standard context variables.
 * @param {Token} token - Token associated with the placement
 * @param {object} [config={}] - Configuration object containing code and scope
 * @param {object|null} [crosshairSequence=null] - Active Sequencer crosshair sequence instance
 * @returns {Promise<void>}
 */
export async function runConcurrentScript(token: any, config: Record<string, any> = {}, crosshairSequence: any = null) {
    const code = config.concurrentCode;
    if (!code || typeof code !== "string" || !code.trim()) return;

    const actor = token?.actor ?? config.actor;
    const item = config.item;
    const scope = config.scope ?? { token, actor, item, config };

    await ScriptRunner.execute(code, {
        token,
        actor,
        item,
        scope,
        config,
        crosshair: crosshairSequence,
        canvas: canvas ?? undefined,
        game: game ?? undefined
    }, "runConcurrentScript");
}
