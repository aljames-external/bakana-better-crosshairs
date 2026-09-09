import { MODULE_ID, BROADCAST_INTERVAL_MS, REMOTE_CROSSHAIR_TIMEOUT_MS } from "../lib/constants.js";
import { socketlib } from "../integration/socketlib.js";
import { log } from "../lib/logger.js";
import { adapter } from "../adapter/index.js";
import { alignCrosshairAndEffects, _calculateAngleFromOrigin } from "./util.js";
import { CrosshairController, attachCrosshairToToken, getShapeClasses } from "./crosshairController.js";


/**
 * Factory helper to instantiate shape model subclasses for remote crosshair rendering.
 * @param {string} shapeType - Target shape identifier ("circle", "cone", "ray", "square", "rect")
 * @param {Object} config - Crosshair configuration options
 * @returns {Promise<import("./base.js").BaseCrosshairShape|null>} Instantiated shape subclass instance or null
 */
export async function createRemoteShapeInstance(shapeType: string, config: Record<string, any> = {}) {
    const classes = await getShapeClasses();
    if (!classes) return null;
    const type = String(shapeType ?? "circle").toLowerCase();
    const previewPlaceable = adapter.crosshair.createUnpersistedPreviewPlaceable(config);
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

    const extractCoords = (obj: any) => {
        if (!obj) return null;
        const px = obj.destination?.x ?? obj.target?.x ?? obj.position?.x ?? obj.x;
        const py = obj.destination?.y ?? obj.target?.y ?? obj.position?.y ?? obj.y;
        if (Number.isFinite(px) && Number.isFinite(py)) {
            return { x: px, y: py };
        }
        return null;
    };

    // 2. Inspect user document activity tracking (Foundry V13/V14 user.activity.cursor)
    const userAny = user as any;
    if (userAny) {
        const act = extractCoords(userAny.activity?.cursor) ?? extractCoords(userAny._activity?.cursor) ?? extractCoords(userAny._cursor) ?? extractCoords(userAny.cursor);
        if (act) return act;
    }

    // 3. Inspect canvas controls cursors
    const controls = adapter.crosshair.controls as any;
    const cursorSources = [controls?._cursors, controls?.cursors].filter(Boolean);
    for (const _cursors of cursorSources) {
        if (!_cursors) continue;
        let cursor = null;
        if (_cursors.get) {
            if (userId) cursor = _cursors.get(userId);
            if (!cursor) cursor = _cursors.get(identifier);
        } else {
            if (userId && _cursors[userId]) cursor = _cursors[userId];
            if (!cursor && _cursors[identifier]) cursor = _cursors[identifier];
        }

        const coords = extractCoords(cursor);
        if (coords) return coords;
    }

    // 4. Inspect controls cursors PIXI children
    if (controls?.cursors?.children) {
        const children = controls.cursors.children;
        const cursor = children.find((c: any) =>
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
export function getPeerCursorPosition(userId: any) {
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

    const controls = adapter.crosshair.controls as any;
    const cursorsContainer = controls?.cursors;
    const internalCursors = controls?._cursors;

    let _cursorsKeys: string[] = [];
    let _cursorsMatch: any = null;
    if (internalCursors) {
        if (internalCursors.keys) {
            _cursorsKeys = Array.from(internalCursors.keys());
        } else {
            _cursorsKeys = Object.keys(internalCursors);
        }

        if (userId && internalCursors.get) _cursorsMatch = internalCursors.get(userId);
        if (!_cursorsMatch && internalCursors.get) _cursorsMatch = internalCursors.get(identifier);
        if (!_cursorsMatch) _cursorsMatch = (userId ? internalCursors[userId] : null) ?? internalCursors[identifier];
    }

    const childrenDetails = cursorsContainer?.children?.map((c: any, idx: number) => ({
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

    const userAny = user as any;
    const userActivity = userAny ? {
        id: userAny.id,
        name: userAny.name,
        activity: userAny.activity,
        _activity: userAny._activity,
        _cursor: userAny._cursor,
        cursor: userAny.cursor
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

export interface RemoteCrosshairPayload {
    type?: string;
    placementId?: string;
    senderUserId?: string;
    shapeType?: string;
    timeoutMs?: number;
    originX?: number;
    originY?: number;
    x?: number;
    y?: number;
    cursorX?: number;
    cursorY?: number;
    direction?: number;
    icon?: string | null;
    showItemIcon?: boolean;
    file?: string;
    lineFile?: string;
    fillColor?: string;
    fillAlpha?: number;
    borderColor?: string;
    borderAlpha?: number;
    distance?: number;
    width?: number;
    angle?: number;
    isRemote?: boolean;
}

/**
 * Encapsulates a non-interactive remote crosshair visual rendered on a peer client's canvas.
 * Reuses BaseCrosshairShape logic to guarantee identical origin, rotation, anchor, and graphic scaling.
 */
export class RemoteCrosshairVisual {
    placementId: string;
    senderUserId: string;
    shapeType: string;
    effectName: string;
    isDestroyed: boolean;
    timeoutMs: number;
    timeoutTimer: any;
    onTimeout: ((visual: RemoteCrosshairVisual) => void) | null;
    rawX: number;
    rawY: number;
    cursorX: number;
    cursorY: number;
    rawDirection: number;
    icon: string | null;
    showItemIcon: boolean;
    config: Record<string, any>;
    shape: any;

    /**
     * Single concrete payload Object constructor (Rule 5).
     * @param {RemoteCrosshairPayload} payload - Initial CROSSHAIR_START socket message payload dictionary
     */
    constructor(payload: RemoteCrosshairPayload = {}) {
        this.placementId = String(payload.placementId ?? "");
        this.senderUserId = String(payload.senderUserId ?? "");
        this.shapeType = String(payload.shapeType ?? "circle");
        this.effectName = `remote-crosshair-${this.senderUserId}-${this.placementId}`;
        this.isDestroyed = false;
        this.timeoutMs = Number(payload.timeoutMs ?? REMOTE_CROSSHAIR_TIMEOUT_MS);
        this.timeoutTimer = null;
        this.onTimeout = null;

        this.rawX = Number(payload.originX ?? payload.x ?? 0);
        this.rawY = Number(payload.originY ?? payload.y ?? 0);
        this.cursorX = Number(payload.cursorX ?? this.rawX);
        this.cursorY = Number(payload.cursorY ?? this.rawY);
        this.rawDirection = Number(payload.direction ?? 0);
        this.icon = payload.icon ?? null;
        this.showItemIcon = payload.showItemIcon !== false;

        this.config = {
            id: this.effectName,
            type: this.shapeType,
            file: payload.file,
            lineFile: payload.lineFile,
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
            icon: this.icon,
            showItemIcon: this.showItemIcon,
            isRemote: true
        };

        this.shape = null;
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

        if (!this.timeoutTimer && this.timeoutMs > 0) {
            this.resetTimeout();
        }

        if (!Sequencer) return;

        const effectFile = this.shape?.getGraphicFile?.() ?? this.config.file;
        const iconFile = this.icon;
        const hasIcon = Boolean(this.showItemIcon && iconFile);

        if (!effectFile && !hasIcon) return;

        const { widthPx, heightPx, factor, gridUnits } = this.shape?.getGraphicDimensions?.() ?? { widthPx: 100, heightPx: 100, factor: 1, gridUnits: false };
        const deg = this.rawDirection ?? 0;
        const rad = deg * (Math.PI / 180);

        const seq = new Sequence();

        if (effectFile) {
            seq.effect()
                .name(this.effectName)
                .file(effectFile)
                .atLocation({ x: this.rawX, y: this.rawY })
                .rotate(deg)
                .anchor(this.shape?.animationAnchor ?? { x: 0.5, y: 0.5 })
                .size({ width: widthPx * factor, height: heightPx * factor }, { gridUnits: Boolean(gridUnits) })
                .opacity(0.8)
                .belowTokens()
                .locally()
                .persist();
        }

        if (hasIcon) {
            const gridSize = adapter.crosshair.gridSize;
            const iconSize = Math.max(gridSize * 0.5, 36);
            seq.effect()
                .name(`${this.effectName}-icon`)
                .file(iconFile)
                .atLocation({ x: this.rawX, y: this.rawY })
                .size(iconSize, { gridUnits: false })
                .anchor({ x: 0.5, y: 0.5 })
                .opacity(0.95)
                .aboveLighting()
                .locally()
                .persist();
        }

        await seq.play();
    }

    /**
     * Resets or starts the inactivity timeout timer for automatic self-removal.
     * @param {Function|null} [onTimeout=null] - Optional callback invoked prior to destruction on timeout
     * @returns {void}
     */
    resetTimeout(onTimeout: ((visual: RemoteCrosshairVisual) => void | Promise<void>) | null = null) {
        if (this.timeoutTimer) {
            clearTimeout(this.timeoutTimer);
            this.timeoutTimer = null;
        }

        if (onTimeout) {
            this.onTimeout = onTimeout;
        }

        if (this.isDestroyed || this.timeoutMs <= 0) return;

        this.timeoutTimer = setTimeout(async () => {
            if (this.isDestroyed) return;
            log.warn(`Remote crosshair placement "${this.placementId}" timed out after ${this.timeoutMs}ms without updates from caster "${this.senderUserId}". Self-removing.`);
            try {
                await this.onTimeout?.(this);
            } catch (e) {
                log.debug("RemoteCrosshairVisual.resetTimeout | Error executing onTimeout callback:", e);
            }
            await this.destroy();
        }, this.timeoutMs);

        this.timeoutTimer?.unref?.();
    }

    /**
     * Handle incoming heartbeat signal from caster to refresh inactivity timeout.
     * @returns {void}
     */
    heartbeat() {
        if (this.isDestroyed) return;
        this.resetTimeout();
    }

    /**
     * Update target position, rotation, and size properties on active remote Sequencer effects.
     * @param {Object} updatePayload - Socket payload containing updated coordinate and transform properties
     * @returns {void}
     */
    update(updatePayload: any) {
        this.resetTimeout();
        if (this.isDestroyed || !Sequencer) return;

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

        const deg = this.rawDirection ?? 0;
        const rad = deg * (Math.PI / 180);

        log.debug(`[Bakana Remote Socket Update] Sender: "${this.senderUserId}" | Origin: (${this.rawX}, ${this.rawY}) | Cursor: (${this.cursorX}, ${this.cursorY}) | Direction: ${this.rawDirection}° | PIXI Container Rotation: ${rad.toFixed(4)} rad`);

        if (this.shape) {
            this.shape.x = this.rawX;
            this.shape.y = this.rawY;
            this.shape.direction = this.rawDirection;
        }

        if (Sequencer.EffectManager) {
            const mainEffects = Sequencer.EffectManager.getEffects({ name: this.effectName }) ?? [];
            const iconEffects = Sequencer.EffectManager.getEffects({ name: `${this.effectName}-icon` }) ?? [];
            const effects = [...mainEffects, ...iconEffects];
            for (const eff of effects) {
                const isIcon = eff.name === `${this.effectName}-icon`;
                const effRot = isIcon ? 0 : rad;
                const effDeg = isIcon ? 0 : deg;

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
                eff.rotation = effRot;

                if (eff.container) {
                    if (eff.container.position?.set) {
                        eff.container.position.set(this.rawX, this.rawY);
                    } else {
                        eff.container.x = this.rawX;
                        eff.container.y = this.rawY;
                    }
                    eff.container.rotation = effRot;
                }

                if (eff.spriteContainer?.rotation !== undefined) {
                    eff.spriteContainer.rotation = 0;
                }

                try {
                    eff.update?.({
                        position: { x: this.rawX, y: this.rawY },
                        rotation: effDeg
                    });
                } catch (e) {}
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

        if (this.timeoutTimer) {
            clearTimeout(this.timeoutTimer);
            this.timeoutTimer = null;
        }

        if (Sequencer?.EffectManager) {
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
    remoteCrosshairs: Map<string, RemoteCrosshairVisual>;
    getPeerCursorPosition?: typeof getPeerCursorPosition;
    getGamemasterCursorPosition?: typeof getGamemasterCursorPosition;
    diagnoseUserCursor?: typeof diagnoseUserCursor;
    createRemoteShapeInstance?: typeof createRemoteShapeInstance;

    constructor() {
        this.remoteCrosshairs = new Map();
    }

    /**
     * Check whether crosshair broadcasting and remote visual rendering are enabled for incoming payloads.
     * @param {string} senderUserId - User ID of the socket sender
     * @returns {boolean} True if payload should be processed and rendered
     */
    shouldRenderRemote(senderUserId: any) {
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
    async handleSocketMessage(payload: any) {
        if (!payload?.type) return;
        const type = String(payload.type ?? "");
        if (!type.startsWith("CROSSHAIR_")) return;

        const senderUserId = String(payload.senderUserId ?? "");
        log.debug(`[Bakana Remote Socket] Received "${type}" payload from sender "${senderUserId}":`, payload);
        if (!this.shouldRenderRemote(senderUserId)) return;

        if (type === "CROSSHAIR_CLEAR") {
            log.info(`[Bakana Remote Socket] Received CROSSHAIR_CLEAR from sender "${senderUserId}". Clearing remote crosshairs.`);
            await this.clear();
            return;
        }

        const placementId = String(payload.placementId ?? "");
        if (!placementId) return;

        if (type === "CROSSHAIR_START") {
            const existing = this.remoteCrosshairs.get(placementId);
            if (existing) {
                await existing.destroy();
            }

            const visual = new RemoteCrosshairVisual(payload);
            this.remoteCrosshairs.set(placementId, visual);
            visual.resetTimeout(async (timedOutVisual) => {
                this.remoteCrosshairs.delete(timedOutVisual.placementId);
            });
            await visual.create();
        } else if (type === "CROSSHAIR_UPDATE") {
            const visual = this.remoteCrosshairs.get(placementId);
            if (visual) {
                visual.update(payload);
            }
        } else if (type === "CROSSHAIR_HEARTBEAT") {
            const visual = this.remoteCrosshairs.get(placementId);
            if (visual) {
                log.debug(`[Bakana Remote Socket] Heartbeat received for placement "${placementId}" from sender "${senderUserId}".`);
                visual.heartbeat();
            }
        } else if (type === "CROSSHAIR_END") {
            const visual = this.remoteCrosshairs.get(placementId);
            if (visual) {
                const finalOriginX = Number(payload.originX ?? payload.x ?? visual.rawX);
                const finalOriginY = Number(payload.originY ?? payload.y ?? visual.rawY);
                const finalCursorX = Number(payload.cursorX ?? visual.cursorX);
                const finalCursorY = Number(payload.cursorY ?? visual.cursorY);
                const finalDirection = Number(payload.direction ?? visual.rawDirection);
                const finalRotationRad = Number(payload.rotationRad ?? (finalDirection * (Math.PI / 180)));
                const reason = String(payload.reason ?? "placed");

                log.debug(`[Bakana Remote Final Placement] Sender: "${senderUserId}" | Reason: "${reason}" | Final Origin: (${finalOriginX}, ${finalOriginY}) | Final Cursor: (${finalCursorX}, ${finalCursorY}) | Final Direction: ${finalDirection}° | PIXI Container Rotation: ${finalRotationRad.toFixed(4)} rad`);

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
     * Remove all remote crosshairs belonging to a specific user (e.g. on disconnect).
     * @param {string} userId - User ID whose remote crosshairs should be cleared
     * @returns {Promise<void>}
     */
    async clearForUser(userId: string) {
        if (!userId) return;
        const toDelete: string[] = [];
        for (const [id, visual] of this.remoteCrosshairs.entries()) {
            if (visual.senderUserId === userId) {
                toDelete.push(id);
                await visual.destroy();
            }
        }
        for (const id of toDelete) {
            this.remoteCrosshairs.delete(id);
        }
    }

    /**
     * Clear all active remote crosshairs (e.g. on scene transitions, disconnects, or manual GM action).
     * @param {Object} [options={}] - Options dictionary
     * @param {boolean} [options.broadcast=false] - Whether to broadcast clear event to peer clients
     * @returns {Promise<void>}
     */
    async clear(options: { broadcast?: boolean } = {}) {
        for (const [id, visual] of this.remoteCrosshairs.entries()) {
            await visual.destroy();
        }
        this.remoteCrosshairs.clear();

        if (options?.broadcast && game?.socket) {
            socketlib.emit({
                type: "CROSSHAIR_CLEAR",
                senderUserId: game?.user?.id ?? ""
            });
        }
    }
}

export const remoteCrosshairManager = new RemoteCrosshairManagerClass();
remoteCrosshairManager.getPeerCursorPosition = getPeerCursorPosition;
remoteCrosshairManager.getGamemasterCursorPosition = getGamemasterCursorPosition;
remoteCrosshairManager.diagnoseUserCursor = diagnoseUserCursor;
remoteCrosshairManager.createRemoteShapeInstance = createRemoteShapeInstance;
