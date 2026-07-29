import { MODULE_ID, BROADCAST_INTERVAL_MS } from "../lib/constants.js";
import { log } from "../lib/logger.js";
import { crosshairAdapter } from "../adapter/index.js";
import { alignCrosshairAndEffects, _calculateAngleFromOrigin } from "./util.js";
import { CrosshairController, attachCrosshairToToken, getShapeClasses } from "./crosshairController.js";


/**
 * Factory helper to instantiate shape model subclasses for remote crosshair rendering.
 * @param {string} shapeType - Target shape identifier ("circle", "cone", "ray", "square", "rect")
 * @param {Object} config - Crosshair configuration options
 * @returns {Promise<import("./base.js").BaseCrosshairShape|null>} Instantiated shape subclass instance or null
 */
export async function createRemoteShapeInstance(shapeType, config = {}) {
    const classes = await getShapeClasses();
    const type = String(shapeType ?? "circle").toLowerCase();
    const previewPlaceable = crosshairAdapter.createUnpersistedPreviewPlaceable(config);
    if (type === "cone" && classes.ConeCrosshairShape) return new classes.ConeCrosshairShape(previewPlaceable, config);
    if (type === "ray" && classes.RayCrosshairShape) return new classes.RayCrosshairShape(previewPlaceable, config);
    if ((type === "square" || type === "rect") && classes.SquareCrosshairShape) return new classes.SquareCrosshairShape(previewPlaceable, config);
    if (classes.CircleCrosshairShape) return new classes.CircleCrosshairShape(previewPlaceable, config);
    return null;
}

/**
 * Resolves live canvas cursor coordinates for a given user name or ID (defaults to "Gamemaster").
 * @param {string} [identifier="Gamemaster"] - User name or User ID to lookup
 * @returns {{x: number, y: number}|null} Canvas coordinates or null
 */
export function getGamemasterCursorPosition(identifier = "Gamemaster") {
    if (!identifier) return null;

    // 1. Resolve User document by name or ID
    const user = game?.users?.getName?.(identifier)
        ?? game?.users?.get?.(identifier)
        ?? game?.users?.find?.(u => u?.name === identifier || u?.id === identifier);

    const userId = user?.id ?? (game?.users?.has?.(identifier) ? identifier : null);

    const extractCoords = (obj) => {
        if (!obj) return null;
        const px = obj.destination?.x ?? obj.target?.x ?? obj.position?.x ?? obj.x;
        const py = obj.destination?.y ?? obj.target?.y ?? obj.position?.y ?? obj.y;
        if (Number.isFinite(px) && Number.isFinite(py)) {
            return { x: px, y: py };
        }
        return null;
    };

    // 2. Inspect user document activity tracking (Foundry V13/V14 user.activity.cursor)
    if (user) {
        const act = extractCoords(user.activity?.cursor) ?? extractCoords(user._activity?.cursor) ?? extractCoords(user._cursor) ?? extractCoords(user.cursor);
        if (act) return act;
    }

    // 3. Inspect canvas.controls._cursors (Foundry ControlsLayer internal cursor Map/dictionary)
    if (canvas?.controls?._cursors) {
        const _cursors = canvas.controls._cursors;
        let cursor = null;
        if (typeof _cursors.get === "function") {
            if (userId) cursor = _cursors.get(userId);
            if (!cursor) cursor = _cursors.get(identifier);
        } else if (typeof _cursors === "object") {
            if (userId && _cursors[userId]) cursor = _cursors[userId];
            if (!cursor && _cursors[identifier]) cursor = _cursors[identifier];
        }

        const coords = extractCoords(cursor);
        if (coords) return coords;
    }

    // 4. Inspect canvas.controls.cursors PIXI children
    if (canvas?.controls?.cursors?.children && Array.isArray(canvas.controls.cursors.children)) {
        const children = canvas.controls.cursors.children;
        const cursor = children.find(c =>
            c?.user?.name === identifier ||
            (userId && c?.user?.id === userId) ||
            c?._user?.name === identifier ||
            (userId && c?._user?.id === userId) ||
            (userId && c?.userId === userId) ||
            (userId && c?._userId === userId) ||
            (userId && c?.id === identifier) ||
            c?.id === identifier ||
            c?.name === identifier ||
            c?.document?.name === identifier ||
            (userId && c?.document?.id === userId)
        );

        const coords = extractCoords(cursor);
        if (coords) return coords;
    }

    return null;
}

/**
 * Retrieve active peer player canvas cursor position from Foundry controls layer or user activity state.
 * Strictly matches user ID (Rule 7 & user prompt directive).
 * @param {string} userId - User ID of the peer player
 * @returns {{x: number, y: number}|null} Canvas coordinates or null
 */
export function getPeerCursorPosition(userId) {
    if (!userId) return null;

    return getGamemasterCursorPosition(userId);
}

/**
 * Diagnostic helper to inspect active Foundry cursors and user activity state for a given user ID or name.
 * @param {string} [identifier="Gamemaster"] - User name or ID to inspect
 * @returns {Object} Diagnostic summary object
 */
export function diagnoseUserCursor(identifier = "Gamemaster") {
    const user = game?.users?.getName?.(identifier)
        ?? game?.users?.get?.(identifier)
        ?? game?.users?.find?.(u => u?.name === identifier || u?.id === identifier);

    const userId = user?.id;

    const controls = canvas?.controls;
    const cursorsContainer = controls?.cursors;
    const internalCursors = controls?._cursors;

    let _cursorsKeys = [];
    let _cursorsMatch = null;
    if (internalCursors) {
        if (typeof internalCursors.keys === "function") {
            _cursorsKeys = Array.from(internalCursors.keys());
        } else if (typeof internalCursors === "object") {
            _cursorsKeys = Object.keys(internalCursors);
        }

        if (userId && internalCursors.get) _cursorsMatch = internalCursors.get(userId);
        if (!_cursorsMatch && internalCursors.get) _cursorsMatch = internalCursors.get(identifier);
        if (!_cursorsMatch && typeof internalCursors === "object") _cursorsMatch = internalCursors[userId] ?? internalCursors[identifier];
    }

    const childrenDetails = cursorsContainer?.children?.map((c, idx) => ({
        index: idx,
        constructor: c?.constructor?.name,
        cId: c?.id,
        cUserId: c?.userId,
        c_userId: c?._userId,
        userName: c?.user?.name,
        userId: c?.user?.id,
        _userName: c?._user?.name,
        _userId: c?._user?.id,
        docName: c?.document?.name,
        docId: c?.document?.id,
        keys: c ? Object.keys(c) : [],
        target: c?.target ? { x: c.target.x, y: c.target.y } : null,
        position: c?.position ? { x: c.position.x, y: c.position.y } : null,
        x: c?.x,
        y: c?.y,
        visible: c?.visible
    })) ?? [];

    const userActivity = user ? {
        id: user.id,
        name: user.name,
        activity: user.activity,
        _activity: user._activity,
        _cursor: user._cursor,
        cursor: user.cursor
    } : "User not found";

    const report = {
        identifier,
        resolvedUserId: userId,
        userActivity,
        _cursorsKeys,
        _cursorsMatch: _cursorsMatch ? {
            class: _cursorsMatch.constructor?.name,
            target: _cursorsMatch.target,
            position: _cursorsMatch.position,
            x: _cursorsMatch.x,
            y: _cursorsMatch.y
        } : null,
        cursorsContainerClass: cursorsContainer?.constructor?.name,
        childrenCount: childrenDetails.length,
        childrenDetails
    };

    log.debug("Bakana Better Crosshairs | User Cursor Diagnostic", report);
    return report;
}

/**
 * Encapsulates a non-interactive remote crosshair visual rendered on a peer client's canvas.
 * Reuses BaseCrosshairShape logic to guarantee identical origin, rotation, anchor, and graphic scaling.
 */
export class RemoteCrosshairVisual {
    /**
     * Single concrete payload Object constructor (Rule 5).
     * @param {Object} payload - Initial CROSSHAIR_START socket message payload dictionary
     */
    constructor(payload = {}) {
        this.placementId = String(payload.placementId ?? "");
        this.senderUserId = String(payload.senderUserId ?? "");
        this.shapeType = String(payload.shapeType ?? "circle");
        this.effectName = `remote-crosshair-${this.senderUserId}-${this.placementId}`;
        this.isDestroyed = false;

        this.rawX = Number(payload.originX ?? payload.x ?? 0);
        this.rawY = Number(payload.originY ?? payload.y ?? 0);
        this.cursorX = Number(payload.cursorX ?? this.rawX);
        this.cursorY = Number(payload.cursorY ?? this.rawY);
        this.rawDirection = Number(payload.direction ?? 0);

        this.config = {
            id: this.effectName,
            type: this.shapeType,
            file: payload.file,
            lineFile: payload.lineFile,
            icon: payload.icon,
            fillColor: payload.fillColor,
            fillAlpha: payload.fillAlpha,
            borderColor: payload.borderColor,
            borderAlpha: payload.borderAlpha,
            distance: payload.distance,
            width: payload.width,
            angle: payload.angle,
            direction: payload.direction,
            x: this.rawX,
            y: this.rawY,
            isRemote: true
        };

        this.shape = null;
        this.activeEffect = null;
    }

    /**
     * Resolve target position for peer cursor.
     * @returns {{x: number, y: number}} Live peer cursor coordinates or initial payload coordinates
     */
    resolveTargetPosition() {
        return getPeerCursorPosition(this.senderUserId) ?? { x: this.rawX, y: this.rawY };
    }

    /**
     * Create and play the remote non-interactive Sequencer visual effect.
     * @returns {Promise<void>}
     */
    async create() {
        if (!this.shape) {
            this.shape = await createRemoteShapeInstance(this.shapeType, this.config);
            if (this.shape) {
                this.shape.x = this.rawX;
                this.shape.y = this.rawY;
                this.shape.direction = this.rawDirection;
                this.shape.config.isRemote = true;
            }
        }

        if (typeof Sequencer === "undefined") return;

        const effectFile = this.shape?.getGraphicFile?.() ?? this.config.file;
        if (!effectFile) return;

        const { widthPx, heightPx, factor, gridUnits } = this.shape?.getGraphicDimensions?.() ?? { widthPx: 100, heightPx: 100, factor: 1, gridUnits: false };
        const deg = this.rawDirection ?? 0;
        const rad = deg * (Math.PI / 180);

        const seq = new Sequence();
        seq.effect()
            .name(this.effectName)
            .file(effectFile)
            .atLocation({ x: this.rawX, y: this.rawY })
            .rotate(rad)
            .anchor(this.shape?.animationAnchor ?? { x: 0.5, y: 0.5 })
            .size({ width: widthPx * factor, height: heightPx * factor }, { gridUnits: Boolean(gridUnits) })
            .opacity(0.8)
            .belowTokens()
            .locally()
            .persist();

        await seq.play();

        if (Sequencer.EffectManager) {
            const [eff] = Sequencer.EffectManager.getEffects({ name: this.effectName });
            if (eff) {
                this.activeEffect = eff;
                if (this.shape) {
                    this.shape.sequencerCrosshair = eff.container ?? eff;
                }
            }
        }
    }

    /**
     * Update target position, rotation, and size properties on active remote Sequencer effects.
     * @param {Object} updatePayload - Socket payload containing updated coordinate and transform properties
     * @returns {void}
     */
    update(updatePayload) {
        if (this.isDestroyed || typeof Sequencer === "undefined") return;

        const ox = Number(updatePayload.originX ?? updatePayload.x);
        const oy = Number(updatePayload.originY ?? updatePayload.y);
        const cx = Number(updatePayload.cursorX);
        const cy = Number(updatePayload.cursorY);
        const dir = Number(updatePayload.direction);

        if (Number.isFinite(ox)) this.rawX = ox;
        if (Number.isFinite(oy)) this.rawY = oy;
        if (Number.isFinite(cx)) this.cursorX = cx;
        if (Number.isFinite(cy)) this.cursorY = cy;
        if (Number.isFinite(dir)) this.rawDirection = dir;

        log.debug(`[Bakana Remote Socket Update] Sender: "${this.senderUserId}" | Origin: (${this.rawX}, ${this.rawY}) | Cursor: (${this.cursorX}, ${this.cursorY}) | Direction: ${this.rawDirection}°`);

        const rad = (this.rawDirection ?? 0) * (Math.PI / 180);

        if (this.shape) {
            this.shape.x = this.rawX;
            this.shape.y = this.rawY;
            this.shape.direction = this.rawDirection;
        }

        if (Sequencer.EffectManager) {
            const effects = Sequencer.EffectManager.getEffects({ name: this.effectName });
            for (const eff of effects) {
                eff.x = this.rawX;
                eff.y = this.rawY;
                if (eff.worldPosition) {
                    eff.worldPosition.x = this.rawX;
                    eff.worldPosition.y = this.rawY;
                }
                if (eff.position) {
                    eff.position.x = this.rawX;
                    eff.position.y = this.rawY;
                }
                eff.rotation = rad;

                if (eff.container) {
                    if (eff.container.position?.set) {
                        eff.container.position.set(this.rawX, this.rawY);
                    } else {
                        eff.container.x = this.rawX;
                        eff.container.y = this.rawY;
                    }
                    eff.container.rotation = rad;
                }

                if (typeof eff.update === "function") {
                    try {
                        eff.update({
                            position: { x: this.rawX, y: this.rawY },
                            rotation: rad
                        });
                    } catch (e) {}
                }
            }
        }
    }

    /**
     * Terminate active remote Sequencer effects and release resources.
     * @returns {Promise<void>}
     */
    async destroy() {
        if (this.isDestroyed) return;
        this.isDestroyed = true;

        if (typeof Sequencer !== "undefined" && Sequencer.EffectManager) {
            try {
                await Sequencer.EffectManager.endEffects({ name: this.effectName });
                await Sequencer.EffectManager.endEffects({ name: `${this.effectName}-line` });
                await Sequencer.EffectManager.endEffects({ name: `${this.effectName}-icon` });
            } catch (e) {
                log.debug("RemoteCrosshairVisual.destroy | Exception terminating remote Sequencer effects:", e);
            }
        }
    }
}

/**
 * Singleton manager tracking active remote crosshairs broadcasted by peer clients.
 */
class RemoteCrosshairManagerClass {
    constructor() {
        /** @type {Map<string, RemoteCrosshairVisual>} */
        this.remoteCrosshairs = new Map();
    }

    /**
     * Check whether crosshair broadcasting and remote visual rendering are enabled for incoming payloads.
     * @param {string} senderUserId - User ID of the socket sender
     * @returns {boolean} True if payload should be processed and rendered
     */
    shouldRenderRemote(senderUserId) {
        if (!senderUserId || senderUserId === game?.user?.id) return false;
        if (!game?.settings) return false;

        const broadcastEnabled = game.settings.get(MODULE_ID, "enableCrosshairBroadcasting") !== false;
        const showRemote = game.settings.get(MODULE_ID, "showOtherPlayersCrosshairs") !== false;

        return Boolean(broadcastEnabled && showRemote);
    }

    /**
     * Handle incoming socket payloads for remote crosshair synchronization.
     * Single concrete payload parameter contract (Rule 5).
     * @param {Object} payload - Received socket message dictionary
     * @returns {Promise<void>}
     */
    async handleSocketMessage(payload) {
        if (!payload || typeof payload !== "object") return;
        const type = String(payload.type ?? "");
        if (!type.startsWith("CROSSHAIR_")) return;

        const senderUserId = String(payload.senderUserId ?? "");
        log.debug(`[Bakana Remote Socket] Received "${type}" payload from sender "${senderUserId}":`, payload);
        if (!this.shouldRenderRemote(senderUserId)) return;

        const placementId = String(payload.placementId ?? "");
        if (!placementId) return;

        if (type === "CROSSHAIR_START") {
            const existing = this.remoteCrosshairs.get(placementId);
            if (existing) {
                await existing.destroy();
            }

            const visual = new RemoteCrosshairVisual(payload);
            this.remoteCrosshairs.set(placementId, visual);
            await visual.create();
        } else if (type === "CROSSHAIR_UPDATE") {
            const visual = this.remoteCrosshairs.get(placementId);
            if (visual) {
                visual.update(payload);
            }
        } else if (type === "CROSSHAIR_END") {
            const visual = this.remoteCrosshairs.get(placementId);
            if (visual) {
                const finalOriginX = Number(payload.originX ?? payload.x ?? visual.rawX);
                const finalOriginY = Number(payload.originY ?? payload.y ?? visual.rawY);
                const finalCursorX = Number(payload.cursorX ?? visual.cursorX);
                const finalCursorY = Number(payload.cursorY ?? visual.cursorY);
                const finalDirection = Number(payload.direction ?? visual.rawDirection);
                const reason = String(payload.reason ?? "placed");

                log.debug(`[Bakana Remote Final Placement] Sender: "${senderUserId}" | Reason: "${reason}" | Final Origin: (${finalOriginX}, ${finalOriginY}) | Final Cursor: (${finalCursorX}, ${finalCursorY}) | Final Direction: ${finalDirection}°`);

                if (Number.isFinite(finalOriginX)) visual.rawX = finalOriginX;
                if (Number.isFinite(finalOriginY)) visual.rawY = finalOriginY;
                if (Number.isFinite(finalDirection)) visual.rawDirection = finalDirection;

                visual.update({
                    originX: finalOriginX,
                    originY: finalOriginY,
                    cursorX: finalCursorX,
                    cursorY: finalCursorY,
                    direction: finalDirection
                });

                await visual.destroy();
                this.remoteCrosshairs.delete(placementId);
            }
        }
    }

    /**
     * Clear all active remote crosshairs (e.g. on scene transitions or disconnects).
     * @returns {Promise<void>}
     */
    async clear() {
        for (const [id, visual] of this.remoteCrosshairs.entries()) {
            await visual.destroy();
        }
        this.remoteCrosshairs.clear();
    }
}

export const remoteCrosshairManager = new RemoteCrosshairManagerClass();
