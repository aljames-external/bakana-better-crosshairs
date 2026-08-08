import { MODULE_ID, BROADCAST_INTERVAL_MS } from "../lib/constants.js";
import { socketlib } from "../integration/socketlib.js";
import { log } from "../lib/logger.js";

/**
 * Manages periodic socket broadcasting of local crosshair state to connected peer clients.
 */
export class CrosshairBroadcaster {
    /**
     * @param {object} shape - The owning BaseCrosshairShape instance
     */
    constructor(shape) {
        this.shape = shape;
        this.timer = null;
        this.placementId = null;
        this.lastState = null;
    }

    /**
     * Extract current live coordinates, dimensions, and rotation state from the shape and canvas.
     * @returns {object} Normalized live state snapshot
     */
    getLiveState() {
        const shape = this.shape;
        const originX = (shape.sequencerCrosshair && Number.isFinite(shape.sequencerCrosshair.x))
            ? shape.sequencerCrosshair.x
            : shape.x;
        const originY = (shape.sequencerCrosshair && Number.isFinite(shape.sequencerCrosshair.y))
            ? shape.sequencerCrosshair.y
            : shape.y;

        const cursorX = (canvas?.mousePosition && Number.isFinite(canvas.mousePosition.x))
            ? canvas.mousePosition.x
            : originX;
        const cursorY = (canvas?.mousePosition && Number.isFinite(canvas.mousePosition.y))
            ? canvas.mousePosition.y
            : originY;

        let direction = shape.config?.currentDirection ?? shape.direction ?? 0;
        if (shape.sequencerCrosshair && Number.isFinite(shape.sequencerCrosshair.direction)) {
            direction = shape.sequencerCrosshair.direction;
        } else if (shape.sequencerCrosshair && Number.isFinite(shape.sequencerCrosshair.rotation)) {
            direction = shape.sequencerCrosshair.rotation * (180 / Math.PI);
        }

        return {
            originX,
            originY,
            cursorX,
            cursorY,
            x: originX,
            y: originY,
            direction,
            distance: shape.distance,
            width: shape.width,
            angle: shape.angle
        };
    }

    /**
     * Start periodic socket broadcasting of local crosshair state to peer clients at BROADCAST_INTERVAL_MS.
     * @returns {void}
     */
    start() {
        if (!game?.user || !game?.settings) return;
        const broadcastEnabled = game.settings.get(MODULE_ID, "enableCrosshairBroadcasting") !== false;
        if (!broadcastEnabled) return;

        this.stop();

        const shape = this.shape;
        const live = this.getLiveState();
        this.placementId = `${game.user.id}_${shape.id}_${Date.now()}`;
        shape.placementId = this.placementId;

        const initialPayload = {
            type: "CROSSHAIR_START",
            placementId: this.placementId,
            senderUserId: game.user.id,
            shapeType: shape.type,
            file: shape.getGraphicFile(),
            lineFile: shape.lineFile,
            icon: shape.icon,
            fillColor: shape.fillColor,
            fillAlpha: shape.fillAlpha,
            borderColor: shape.borderColor,
            borderAlpha: shape.borderAlpha,
            distance: live.distance,
            width: live.width,
            angle: live.angle,
            direction: live.direction,
            rotationRad: (live.direction ?? 0) * (Math.PI / 180),
            tokenId: shape.token?.id ?? null,
            stickToToken: Boolean(shape.stickToToken && shape.token),
            showLine: Boolean(shape.showLine),
            originX: live.originX,
            originY: live.originY,
            cursorX: live.cursorX,
            cursorY: live.cursorY,
            x: live.originX,
            y: live.originY
        };

        this.lastState = { ...live };
        socketlib.emit(initialPayload);

        this.timer = setInterval(() => {
            if (!this.placementId) return;
            const updated = this.getLiveState();
            const last = this.lastState ?? {};

            const hasChanged =
                Math.abs((updated.originX ?? 0) - (last.originX ?? 0)) > 1e-3 ||
                Math.abs((updated.originY ?? 0) - (last.originY ?? 0)) > 1e-3 ||
                Math.abs((updated.cursorX ?? 0) - (last.cursorX ?? 0)) > 1e-3 ||
                Math.abs((updated.cursorY ?? 0) - (last.cursorY ?? 0)) > 1e-3 ||
                Math.abs((updated.direction ?? 0) - (last.direction ?? 0)) > 1e-2 ||
                updated.distance !== last.distance ||
                updated.width !== last.width ||
                updated.angle !== last.angle;

            if (!hasChanged) return;

            this.lastState = { ...updated };
            socketlib.emit({
                type: "CROSSHAIR_UPDATE",
                placementId: this.placementId,
                senderUserId: game.user.id,
                originX: updated.originX,
                originY: updated.originY,
                cursorX: updated.cursorX,
                cursorY: updated.cursorY,
                x: updated.originX,
                y: updated.originY,
                direction: updated.direction,
                rotationRad: (updated.direction ?? 0) * (Math.PI / 180),
                distance: updated.distance,
                width: updated.width,
                angle: updated.angle
            });
        }, BROADCAST_INTERVAL_MS);
    }

    /**
     * Stop periodic broadcasting and emit final completion/cancellation payload.
     * @param {string} [reason="placed"] - Termination reason ("placed" or "canceled")
     * @returns {void}
     */
    stop(reason = "placed") {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        this.lastState = null;

        if (this.placementId) {
            const shape = this.shape;
            const finalOriginX = (shape.sequencerCrosshair && Number.isFinite(shape.sequencerCrosshair.x)) ? shape.sequencerCrosshair.x : shape.x;
            const finalOriginY = (shape.sequencerCrosshair && Number.isFinite(shape.sequencerCrosshair.y)) ? shape.sequencerCrosshair.y : shape.y;
            const finalCursorX = (canvas?.mousePosition && Number.isFinite(canvas.mousePosition.x)) ? canvas.mousePosition.x : finalOriginX;
            const finalCursorY = (canvas?.mousePosition && Number.isFinite(canvas.mousePosition.y)) ? canvas.mousePosition.y : finalOriginY;
            let finalDirection = shape.config?.currentDirection ?? shape.direction ?? 0;
            if (shape.sequencerCrosshair && Number.isFinite(shape.sequencerCrosshair.direction)) {
                finalDirection = shape.sequencerCrosshair.direction;
            } else if (shape.sequencerCrosshair && Number.isFinite(shape.sequencerCrosshair.rotation)) {
                finalDirection = shape.sequencerCrosshair.rotation * (180 / Math.PI);
            }
            const finalRotationRad = finalDirection * (Math.PI / 180);

            log.debug(`[Bakana Crosshair Final Broadcast] Sender: "${game?.user?.id}" | Reason: "${reason}" | Final Origin: (${finalOriginX}, ${finalOriginY}) | Final Cursor: (${finalCursorX}, ${finalCursorY}) | Final Direction: ${finalDirection}° | PIXI Container Rotation: ${finalRotationRad.toFixed(4)} rad`);

            socketlib.emit({
                type: "CROSSHAIR_END",
                placementId: this.placementId,
                senderUserId: game.user.id,
                reason,
                originX: finalOriginX,
                originY: finalOriginY,
                cursorX: finalCursorX,
                cursorY: finalCursorY,
                x: finalOriginX,
                y: finalOriginY,
                direction: finalDirection,
                rotationRad: finalRotationRad,
                distance: shape.distance,
                width: shape.width,
                angle: shape.angle
            });
            this.placementId = null;
            shape.placementId = null;
        }
    }
}
