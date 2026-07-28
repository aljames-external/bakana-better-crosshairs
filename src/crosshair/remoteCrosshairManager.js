import { MODULE_ID } from "../lib/constants.js";
import { log } from "../lib/logger.js";
import { alignCrosshairAndEffects } from "./util.js";

let shapeClasses = null;

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

/**
 * Factory helper to instantiate shape model subclasses for remote crosshair rendering.
 * @param {string} shapeType - Target shape identifier ("circle", "cone", "ray", "square", "rect")
 * @param {Object} config - Crosshair configuration options
 * @returns {import("./base.js").BaseCrosshairShape|null} Instantiated shape subclass instance or null
 */
export function createRemoteShapeInstance(shapeType, config = {}) {
    const classes = shapeClasses ?? {};
    const type = String(shapeType ?? "circle").toLowerCase();
    if (type === "cone" && classes.ConeCrosshairShape) return new classes.ConeCrosshairShape(null, config);
    if (type === "ray" && classes.RayCrosshairShape) return new classes.RayCrosshairShape(null, config);
    if ((type === "square" || type === "rect") && classes.SquareCrosshairShape) return new classes.SquareCrosshairShape(null, config);
    if (classes.CircleCrosshairShape) return new classes.CircleCrosshairShape(null, config);
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

    const userId = user?.id;

    // 2. Inspect canvas.controls._cursors (Foundry ControlsLayer internal cursor Map/dictionary)
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

        if (cursor) {
            const px = cursor.target?.x ?? cursor.position?.x ?? cursor.x;
            const py = cursor.target?.y ?? cursor.position?.y ?? cursor.y;
            if (Number.isFinite(px) && Number.isFinite(py)) {
                return { x: px, y: py };
            }
        }
    }

    // 3. Inspect canvas.controls.cursors PIXI children
    if (canvas?.controls?.cursors?.children && Array.isArray(canvas.controls.cursors.children) && canvas.controls.cursors.children.length > 0) {
        const children = canvas.controls.cursors.children;
        const cursor = children.find(c =>
            c?.user?.name === identifier ||
            (userId && c?.user?.id === userId) ||
            c?._user?.name === identifier ||
            (userId && c?._user?.id === userId) ||
            (userId && c?.userId === userId) ||
            (userId && c?._userId === userId) ||
            (userId && c?.id === userId) ||
            c?.id === identifier ||
            c?.name === identifier ||
            c?.document?.name === identifier ||
            (userId && c?.document?.id === userId)
        ) ?? (children.length === 1 ? children[0] : null);

        if (cursor) {
            const px = cursor.target?.x ?? cursor.position?.x ?? cursor.x;
            const py = cursor.target?.y ?? cursor.position?.y ?? cursor.y;
            if (Number.isFinite(px) && Number.isFinite(py)) {
                return { x: px, y: py };
            }
        }
    }

    // 4. Inspect canvas.controls.cursors dictionary (if cursors itself is an object mapping userId -> cursor)
    if (canvas?.controls?.cursors && typeof canvas.controls.cursors === "object") {
        const cursors = canvas.controls.cursors;
        const cursor = (userId && cursors[userId]) ?? cursors[identifier];
        if (cursor && (cursor.x || cursor.y || cursor.target || cursor.position)) {
            const px = cursor.target?.x ?? cursor.position?.x ?? cursor.x;
            const py = cursor.target?.y ?? cursor.position?.y ?? cursor.y;
            if (Number.isFinite(px) && Number.isFinite(py)) {
                return { x: px, y: py };
            }
        }
    }

    // 5. Inspect user document activity tracking
    if (user) {
        const c = user.activity?.cursor ?? user._activity?.cursor ?? user._cursor ?? user.cursor;
        if (c && Number.isFinite(c.x) && Number.isFinite(c.y)) {
            return { x: c.x, y: c.y };
        }
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

    console.log("%c Bakana Better Crosshairs | User Cursor Diagnostic ", "background: #222; color: #bada55; font-size: 14px;", report);
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
    constructor(payload) {
        this.placementId = String(payload.placementId ?? "");
        this.senderUserId = String(payload.senderUserId ?? "");
        this.shapeType = String(payload.shapeType ?? payload.type ?? "circle");
        this.effectName = `remote-crosshair-${this.senderUserId}-${this.placementId}`;
        this.isDestroyed = false;

        const tokenId = payload.tokenId ? String(payload.tokenId) : null;
        const token = (tokenId && canvas?.tokens?.get) ? canvas.tokens.get(tokenId) : null;

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
            x: Number(payload.x ?? 0),
            y: Number(payload.y ?? 0),
            token,
            stickToToken: Boolean(payload.stickToToken && token),
            showLine: Boolean(payload.showLine),
            currentDirection: payload.direction
        };

        this.rawX = Number(payload.x ?? 0);
        this.rawY = Number(payload.y ?? 0);
        this.rawDirection = Number(payload.direction ?? 0);
        this.lastCursorLogTime = 0;
        this.lastRenderTime = 0;
        this.shape = createRemoteShapeInstance(this.shapeType, this.config);
        if (this.shape) {
            this.shape.x = this.rawX;
            this.shape.y = this.rawY;
            this.shape.direction = this.rawDirection;
        }
    }

    /**
     * Resolve current target coordinates using peer player's canvas cursor pointer or broadcasted coordinates.
     * @returns {{x: number, y: number}} Target canvas coordinates
     */
    resolveTargetPosition() {
        if (this.shape?.stickToToken && this.shape?.token) {
            const tok = this.shape.token;
            const center = tok.center ?? { x: (tok.x ?? 0) + (tok.w ?? 100) / 2, y: (tok.y ?? 0) + (tok.h ?? 100) / 2 };
            return center;
        }

        // Check peer user cursor pointer on canvas or user activity (Rule 5 & user prompt spec)
        const peerPos = getPeerCursorPosition(this.senderUserId);
        if (peerPos) {
            return peerPos;
        }

        return { x: this.shape?.x ?? this.rawX, y: this.shape?.y ?? this.rawY };
    }

    /**
     * Frame ticker callback updating active Sequencer effect position at 200ms cadence (5 Hz).
     * @protected
     * @param {boolean} [force=false] - Force update regardless of 200ms interval throttle
     * @returns {void}
     */
    _onTick(force = false) {
        if (this.isDestroyed || typeof Sequencer === "undefined") return;

        const now = Date.now();
        if (!force && (now - this.lastRenderTime < BROADCAST_INTERVAL_MS)) {
            return;
        }
        this.lastRenderTime = now;

        const pos = this.resolveTargetPosition();
        if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;

        if (this.shape) {
            this.shape.x = pos.x;
            this.shape.y = pos.y;
        }

        const dir = this.shape?.direction ?? this.rawDirection;
        const rad = dir * (Math.PI / 180);
        const targetAnchorObj = { x: pos.x, y: pos.y, rotation: rad };

        if (this.shape) {
            alignCrosshairAndEffects(targetAnchorObj, this.shape.config, rad);
        }

        // Periodic 2-second cursor position debug logging
        if (now - this.lastCursorLogTime >= 2000) {
            this.lastCursorLogTime = now;
            const peerPosResolved = getPeerCursorPosition(this.senderUserId);
            log.debug(`RemoteCrosshairVisual.cursorLog | Active remote crosshair position for user "${this.senderUserId}":`, {
                senderUserId: this.senderUserId,
                placementId: this.placementId,
                peerPosResolved,
                finalPos: pos,
                direction: dir
            });
        }
    }

    /**
     * Create and play the remote Sequencer visual effect reusing BaseCrosshairShape animation logic.
     * @returns {Promise<void>}
     */
    async create() {
        if (typeof Sequencer === "undefined") return;

        await getShapeClasses();
        if (!this.shape) {
            this.shape = createRemoteShapeInstance(this.shapeType, this.config);
        }
        if (!this.shape) return;

        const pos = this.resolveTargetPosition();
        this.shape.x = pos.x;
        this.shape.y = pos.y;

        const dirDeg = this.shape.direction ?? this.rawDirection;
        const rotRad = dirDeg * (Math.PI / 180);
        const targetAnchorObj = { x: pos.x, y: pos.y, rotation: rotRad };

        log.debug(`RemoteCrosshairVisual.create | Render initialization info for user "${this.senderUserId}":`, {
            senderUserId: this.senderUserId,
            placementId: this.placementId,
            shapeType: this.shapeType,
            effectName: this.effectName,
            distance: this.shape.distance,
            width: this.shape.width,
            angle: this.shape.angle,
            direction: dirDeg,
            rotationRad: rotRad,
            file: this.config.file,
            lineFile: this.config.lineFile,
            icon: this.config.icon,
            fillColor: this.config.fillColor,
            fillAlpha: this.config.fillAlpha,
            borderColor: this.config.borderColor,
            borderAlpha: this.config.borderAlpha,
            stickToToken: this.config.stickToToken,
            showLine: this.config.showLine,
            initialPos: pos
        });

        await this.shape.playGraphicEffect(targetAnchorObj);
        alignCrosshairAndEffects(targetAnchorObj, this.shape.config, rotRad);

        if (canvas?.app?.ticker) {
            try {
                canvas.app.ticker.add(this._onTick, this);
            } catch (e) {}
        }
    }

    /**
     * Update target position, rotation, and size properties on active remote Sequencer effects.
     * @param {Object} updatePayload - Socket payload containing updated coordinate and transform properties
     * @returns {void}
     */
    update(updatePayload) {
        if (this.isDestroyed || typeof Sequencer === "undefined") return;

        if (typeof updatePayload.x === "number") {
            this.rawX = updatePayload.x;
            if (this.shape) this.shape.x = updatePayload.x;
        }
        if (typeof updatePayload.y === "number") {
            this.rawY = updatePayload.y;
            if (this.shape) this.shape.y = updatePayload.y;
        }
        if (typeof updatePayload.direction === "number") {
            this.rawDirection = updatePayload.direction;
            if (this.shape) {
                this.shape.direction = updatePayload.direction;
                this.shape.config.currentDirection = updatePayload.direction;
            }
        }
        if (typeof updatePayload.distance === "number" && this.shape) this.shape.distance = updatePayload.distance;
        if (typeof updatePayload.width === "number" && this.shape) this.shape.width = updatePayload.width;
        if (typeof updatePayload.angle === "number" && this.shape) this.shape.angle = updatePayload.angle;

        this._onTick(true);
    }

    /**
     * Terminate active remote Sequencer effects and release resources.
     * @returns {Promise<void>}
     */
    async destroy() {
        if (this.isDestroyed) return;
        this.isDestroyed = true;

        if (canvas?.app?.ticker) {
            try {
                canvas.app.ticker.remove(this._onTick, this);
            } catch (e) {}
        }

        if (typeof Sequencer !== "undefined" && Sequencer.EffectManager) {
            try {
                await Sequencer.EffectManager.endEffects({ name: this.effectName });
                await Sequencer.EffectManager.endEffects({ name: `${this.effectName}-line` });
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
