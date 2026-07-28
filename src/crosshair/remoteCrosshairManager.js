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
 * Retrieve active peer player canvas cursor position from Foundry controls layer or user activity state.
 * @param {string} userId - User ID of the peer player
 * @returns {{x: number, y: number}|null} Canvas coordinates or null
 */
export function getPeerCursorPosition(userId) {
    if (!userId) return null;

    // 1. Inspect canvas.controls.cursors PIXI children or dictionary lookup
    if (canvas?.controls?.cursors) {
        if (Array.isArray(canvas.controls.cursors.children)) {
            const cursor = canvas.controls.cursors.children.find(c => c?.user?.id === userId || c?.userId === userId || c?.id === userId);
            if (cursor) {
                const px = cursor.target?.x ?? cursor.position?.x ?? cursor.x;
                const py = cursor.target?.y ?? cursor.position?.y ?? cursor.y;
                if (Number.isFinite(px) && Number.isFinite(py)) {
                    return { x: px, y: py };
                }
            }
        }
        if (canvas.controls.cursors[userId]) {
            const c = canvas.controls.cursors[userId];
            const px = c.target?.x ?? c.position?.x ?? c.x;
            const py = c.target?.y ?? c.position?.y ?? c.y;
            if (Number.isFinite(px) && Number.isFinite(py)) {
                return { x: px, y: py };
            }
        }
    }

    // 2. Inspect game.users activity state
    const user = game?.users?.get?.(userId);
    if (user) {
        const c = user.activity?.cursor ?? user._cursor ?? user.cursor;
        if (c && Number.isFinite(c.x) && Number.isFinite(c.y)) {
            return { x: c.x, y: c.y };
        }
    }

    return null;
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

        const targetAnchorObj = { x: pos.x, y: pos.y, rotation: this.shape.direction * (Math.PI / 180) };
        await this.shape.playGraphicEffect(targetAnchorObj);

        alignCrosshairAndEffects(targetAnchorObj, this.shape.config, this.shape.direction * (Math.PI / 180));
        log.debug(`RemoteCrosshairVisual.create | Playing remote crosshair visual "${this.effectName}" for user "${this.senderUserId}" at:`, pos);
    }

    /**
     * Update target position, rotation, and size properties on active remote Sequencer effects.
     * @param {Object} updatePayload - Socket payload containing updated coordinate and transform properties
     * @returns {void}
     */
    update(updatePayload) {
        if (this.isDestroyed || typeof Sequencer === "undefined") return;

        if (this.shape) {
            if (typeof updatePayload.x === "number") this.shape.x = updatePayload.x;
            if (typeof updatePayload.y === "number") this.shape.y = updatePayload.y;
            if (typeof updatePayload.direction === "number") {
                this.shape.direction = updatePayload.direction;
                this.shape.config.currentDirection = updatePayload.direction;
            }
            if (typeof updatePayload.distance === "number") this.shape.distance = updatePayload.distance;
            if (typeof updatePayload.width === "number") this.shape.width = updatePayload.width;
            if (typeof updatePayload.angle === "number") this.shape.angle = updatePayload.angle;
        }

        if (typeof updatePayload.x === "number") this.rawX = updatePayload.x;
        if (typeof updatePayload.y === "number") this.rawY = updatePayload.y;
        if (typeof updatePayload.direction === "number") this.rawDirection = updatePayload.direction;

        const pos = this.resolveTargetPosition();
        const dir = this.shape?.direction ?? this.rawDirection;
        const rad = dir * (Math.PI / 180);
        const targetAnchorObj = { x: pos.x, y: pos.y, rotation: rad };

        if (this.shape) {
            alignCrosshairAndEffects(targetAnchorObj, this.shape.config, rad);
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
