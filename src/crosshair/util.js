import { log } from "../lib/logger.js";
import { closest } from "../lib/filemanager.js";
import { crosshairAdapter, systemAdapter } from "../adapter/index.js";
import { TokenGeometry } from "../lib/tokenGeometry.js";
import { rotationListener } from "./rotationListener.js";
import { ScriptRunner } from "../lib/scriptRunner.js";

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
export function alignCrosshairAndEffects(crosshair, config = {}, rad = 0) {
    const deg = config.currentDirection ?? config.direction ?? (rad * (180 / Math.PI));
    rotateCrosshairInstance(crosshair, deg, config);

    const shape = crosshair?.shapeInstance ?? config?.shapeInstance ?? activePlacementTracker.crosshair?.shapeInstance;
    const shapeType = config.type ?? config.t ?? shape?.type ?? crosshair?.type ?? "circle";
    const isRect = shapeType === "rect" || shapeType === "square";
    const rawToken = config.token ?? crosshair?.config?.token ?? crosshair?.token ?? shape?.token;
    const token = crosshairAdapter.toToken(rawToken);
    const isAttached = shouldStickToToken(config, shapeType) && Boolean(token);
    const effectId = config.id ?? shape?.id ?? "Crosshair";

    let targetX = 0;
    let targetY = 0;

    if (isAttached && token) {
        if (shapeType === "circle") {
            const center = token.center ?? { x: token.x ?? 0, y: token.y ?? 0 };
            targetX = center.x;
            targetY = center.y;
        } else {
            const cursorPt = (canvas?.mousePosition && Number.isFinite(canvas.mousePosition.x))
                ? canvas.mousePosition
                : { x: shape?.cursorX ?? shape?.x ?? crosshair?.x ?? 0, y: shape?.cursorY ?? shape?.y ?? crosshair?.y ?? 0 };
            const anchored = crosshairAdapter.resolveAnchorPlacement(token, cursorPt);
            targetX = anchored.x;
            targetY = anchored.y;
        }
    } else {
        const cursorPt = (canvas?.mousePosition && Number.isFinite(canvas.mousePosition.x))
            ? canvas.mousePosition
            : { x: shape?.cursorX ?? shape?.x ?? crosshair?.x ?? 0, y: shape?.cursorY ?? shape?.y ?? crosshair?.y ?? 0 };
        targetX = cursorPt.x;
        targetY = cursorPt.y;
    }

    log.debug(`[Bakana Sequencer Effect Alignment] Config ID: "${effectId}" | Type: "${shapeType}" | Target Pos: (${targetX}, ${targetY}) | Rad: ${rad.toFixed(4)} | Deg: ${deg.toFixed(2)}°`);

    if (typeof Sequencer !== "undefined" && Sequencer.EffectManager) {
        try {
            const effects = Sequencer.EffectManager.getEffects({ name: effectId });
            for (const eff of effects) {
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
                eff.rotation = rad;

                if (eff.container) {
                    if (eff.container.position?.set) {
                        eff.container.position.set(targetX, targetY);
                    } else {
                        eff.container.x = targetX;
                        eff.container.y = targetY;
                    }
                    eff.container.rotation = rad;
                }

                if (eff.spriteContainer && typeof eff.spriteContainer.rotation !== "undefined") {
                    eff.spriteContainer.rotation = 0;
                }

                if (typeof eff.rotation !== "undefined") eff.rotation = rad;
                if (typeof eff.update === "function") {
                    try {
                        eff.update({
                            position: { x: targetX, y: targetY },
                            rotation: deg
                        });
                    } catch (e) {
                        log.debug("alignCrosshairAndEffects | Exception updating Sequencer effect rotation:", e);
                    }
                }

                if (isRect && eff.container) {
                    eff.container.pivot.set(0, 0);
                    if (eff.sprite) eff.sprite.position.set(0, 0);
                    if (eff.spriteContainer) eff.spriteContainer.position.set(0, 0);
                }
            }

            const iconEffects = Sequencer.EffectManager.getEffects({ name: `${effectId}-icon` });
            for (const eff of iconEffects) {
                if (effects.includes(eff)) continue;
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
                if (eff.container?.position?.set) {
                    eff.container.position.set(targetX, targetY);
                } else if (eff.container) {
                    eff.container.x = targetX;
                    eff.container.y = targetY;
                }
                if (typeof eff.update === "function") {
                    try {
                        eff.update({ position: { x: targetX, y: targetY } });
                    } catch (e) {}
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
                : (typeof crosshair?.direction === "number")
                    ? crosshair.direction
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
        if (shapeType === "circle") {
            const token = crosshairAdapter.toToken(config.token) ?? config.token;
            const center = token.center ?? { x: token.x ?? 0, y: token.y ?? 0 };
            x = center.x;
            y = center.y;
            direction = 0;
        } else {
            const mousePos = canvas?.mousePosition ?? { x: clickX, y: clickY };
            const anchored = crosshairAdapter.resolveAnchorPlacement(config.token, mousePos);
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
    const token = crosshairAdapter.toToken(tok) ?? (tok?.object ?? tok);
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
export async function runConcurrentScript(token, config = {}, crosshairSequence = null) {
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
        canvas: typeof canvas !== "undefined" ? canvas : undefined,
        game: typeof game !== "undefined" ? game : undefined
    }, "runConcurrentScript");
}
