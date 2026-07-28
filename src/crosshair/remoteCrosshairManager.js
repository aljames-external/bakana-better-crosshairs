import { MODULE_ID } from "../lib/constants.js";
import { log } from "../lib/logger.js";

/**
 * Encapsulates a non-interactive remote crosshair visual rendered on a peer client's canvas.
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
        this.file = String(payload.file ?? "");
        this.lineFile = String(payload.lineFile ?? "");
        this.icon = String(payload.icon ?? "");
        this.fillColor = String(payload.fillColor ?? "#ffffff");
        this.fillAlpha = Number(payload.fillAlpha ?? 0.25);
        this.borderColor = String(payload.borderColor ?? "#ffffff");
        this.borderAlpha = Number(payload.borderAlpha ?? 0.8);
        this.distance = Number(payload.distance ?? 0);
        this.width = Number(payload.width ?? 0);
        this.angle = Number(payload.angle ?? 0);
        this.direction = Number(payload.direction ?? 0);
        this.tokenId = payload.tokenId ? String(payload.tokenId) : null;
        this.stickToToken = Boolean(payload.stickToToken);
        this.showLine = Boolean(payload.showLine);
        this.x = Number(payload.x ?? 0);
        this.y = Number(payload.y ?? 0);

        this.effectName = `remote-crosshair-${this.placementId}`;
        this.lineEffectName = `remote-crosshair-${this.placementId}-line`;
        this.isDestroyed = false;
    }

    /**
     * Resolve current target coordinates using peer player's canvas cursor pointer or broadcasted coordinates.
     * @returns {{x: number, y: number}} Target canvas coordinates
     */
    resolveTargetPosition() {
        if (this.stickToToken && this.tokenId && canvas?.tokens?.get) {
            const tok = canvas.tokens.get(this.tokenId);
            if (tok) {
                const center = tok.center ?? { x: (tok.x ?? 0) + (tok.w ?? 100) / 2, y: (tok.y ?? 0) + (tok.h ?? 100) / 2 };
                return center;
            }
        }

        // Check peer user cursor pointer on canvas (Rule 5 & user prompt spec)
        if (canvas?.controls?.cursors && this.senderUserId) {
            const peerCursor = canvas.controls.cursors[this.senderUserId];
            if (peerCursor && typeof peerCursor.x === "number" && typeof peerCursor.y === "number") {
                return { x: peerCursor.x, y: peerCursor.y };
            }
        }

        return { x: this.x, y: this.y };
    }

    /**
     * Create and play the remote Sequencer visual effect.
     * @returns {Promise<void>}
     */
    async create() {
        if (typeof Sequencer === "undefined" || !this.file) return;

        const pos = this.resolveTargetPosition();
        const rad = this.direction * (Math.PI / 180);
        const seq = new Sequence();

        // 1. Line connecting token to cursor if enabled
        if (this.showLine && this.lineFile && this.tokenId && canvas?.tokens?.get) {
            const tok = canvas.tokens.get(this.tokenId);
            if (tok) {
                seq.effect()
                    .name(this.lineEffectName)
                    .file(this.lineFile)
                    .attachTo(tok)
                    .stretchTo({ x: pos.x, y: pos.y })
                    .opacity(0.8)
                    .locally()
                    .persist();
            }
        }

        // 2. Crosshair shape graphic effect
        seq.effect()
            .name(this.effectName)
            .file(this.file)
            .atPosition({ x: pos.x, y: pos.y })
            .rotation(rad)
            .opacity(0.8)
            .belowTokens()
            .locally()
            .persist();

        log.debug(`RemoteCrosshairVisual.create | Playing remote crosshair visual "${this.effectName}" for user "${this.senderUserId}" at:`, pos);
        await seq.play();
    }

    /**
     * Update target position, rotation, and size properties on active remote Sequencer effects.
     * @param {Object} updatePayload - Socket payload containing updated coordinate and transform properties
     * @returns {void}
     */
    update(updatePayload) {
        if (this.isDestroyed || typeof Sequencer === "undefined") return;

        if (typeof updatePayload.x === "number") this.x = updatePayload.x;
        if (typeof updatePayload.y === "number") this.y = updatePayload.y;
        if (typeof updatePayload.direction === "number") this.direction = updatePayload.direction;
        if (typeof updatePayload.distance === "number") this.distance = updatePayload.distance;
        if (typeof updatePayload.width === "number") this.width = updatePayload.width;
        if (typeof updatePayload.angle === "number") this.angle = updatePayload.angle;

        const pos = this.resolveTargetPosition();
        const rad = this.direction * (Math.PI / 180);

        try {
            const effects = Sequencer.EffectManager.getEffects({ name: this.effectName });
            for (const eff of effects) {
                if (eff.container) {
                    eff.container.position.set(pos.x, pos.y);
                    eff.container.rotation = rad;
                }
                if (typeof eff.rotation !== "undefined") eff.rotation = rad;
                if (typeof eff.update === "function") {
                    try {
                        eff.update({ x: pos.x, y: pos.y, rotation: rad });
                    } catch (e) {}
                }
            }

            if (this.lineFile) {
                const lineEffects = Sequencer.EffectManager.getEffects({ name: this.lineEffectName });
                for (const lineEff of lineEffects) {
                    if (typeof lineEff.stretchTo === "function") {
                        try {
                            lineEff.stretchTo({ x: pos.x, y: pos.y });
                        } catch (e) {}
                    }
                }
            }
        } catch (e) {
            log.debug("RemoteCrosshairVisual.update | Exception updating remote Sequencer effect:", e);
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
                await Sequencer.EffectManager.endEffects({ name: this.lineEffectName });
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
