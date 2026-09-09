import { MODULE_ID } from "../lib/constants.js";
import { remoteCrosshairManager } from "../crosshair/remoteCrosshairManager.js";
import { adapter } from "../adapter/index.js";

/**
 * Socket integration utility encapsulating Foundry VTT socket communications (`game.socket`).
 * Eliminates repetitive module channel strings (`module.${MODULE_ID}`) across domain managers.
 */
export const socketlib = {
    /**
     * Emit a structured payload over the module socket channel to all other connected clients.
     * @param {Object} payload - Socket message dictionary (`{ type: string, ... }`)
     * @returns {void}
     */
    emit(payload: any) {
        if (!payload || typeof payload !== "object") return;
        if (!game?.socket) return;
        game.socket.emit(`module.${MODULE_ID}`, payload);
    },

    /**
     * Register a callback listener on the module socket channel.
     * @param {Function} handler - Callback function invoked when a module socket payload is received
     * @returns {void}
     */
    on(handler: any) {
        if (typeof handler !== "function") return;
        if (!game?.socket) return;
        game.socket.on(`module.${MODULE_ID}`, handler);
    },

    /**
     * Unregister a callback listener from the module socket channel.
     * @param {Function} handler - Callback function to remove
     * @returns {void}
     */
    off(handler: any) {
        if (typeof handler !== "function") return;
        if (!game?.socket) return;
        game.socket.off(`module.${MODULE_ID}`, handler);
    }
};

const tileTrackers = new Map();

/**
 * Wait for a created tile to replicate to all other active connected peer clients.
 * Sends a ping verification message over the socket and resolves when all peers confirm receipt.
 * @param {string} tileId - ID of the created Tile document
 * @param {number} [timeoutMs=5000] - Safety timeout in milliseconds
 * @returns {Promise<void>}
 */
export async function waitForTileReplication(tileId: any, timeoutMs = 5000) {
    if (!tileId || !game?.users || !game?.socket) return;
    const activeUsers = game.users.filter((u) => u.active && !u.isSelf);
    if (activeUsers.length === 0) return;

    const expectedUserIds = activeUsers.map((u) => u.id);
    const trackerId = adapter.randomID();

    return new Promise<void>((resolve) => {
        const timeoutId = setTimeout(() => {
            tileTrackers.delete(trackerId);
            resolve();
        }, timeoutMs);

        tileTrackers.set(trackerId, {
            expected: new Set(expectedUserIds),
            received: new Set(),
            resolve: () => {
                clearTimeout(timeoutId);
                tileTrackers.delete(trackerId);
                resolve();
            }
        });

        socketlib.emit({
            type: "VERIFY_TILE_REPLICATION",
            tileId,
            senderUserId: game.user?.id,
            trackerId
        });
    });
}

/**
 * Internal listener for socket messages handling peer replication handshakes and crosshair synchronization.
 * @param {Object} payload - Received socket payload
 * @returns {void}
 */
export function handleSocketMessage(payload: any) {
    if (!payload || typeof payload !== "object") return;

    const type = String(payload.type ?? "");
    if (type.startsWith("CROSSHAIR_")) {
        remoteCrosshairManager.handleSocketMessage(payload);
        return;
    }

    if (type === "VERIFY_TILE_REPLICATION") {
        const { tileId, senderUserId, trackerId } = payload;
        const checkReplication = async () => {
            const hasTile = () => Boolean(canvas?.tiles?.get(tileId));
            let attempts = 0;
            while (!hasTile() && attempts < 50) {
                await new Promise((r) => setTimeout(r, 50));
                attempts++;
            }
            socketlib.emit({
                type: "REPORT_TILE_RECEIVED",
                tileId,
                recipientUserId: senderUserId,
                reportingUserId: game.user?.id,
                trackerId
            });
        };
        checkReplication();
    } else if (type === "REPORT_TILE_RECEIVED") {
        const { recipientUserId, reportingUserId, trackerId } = payload;
        if (recipientUserId !== game.user?.id) return;
        const tracker = tileTrackers.get(trackerId);
        if (tracker) {
            tracker.received.add(reportingUserId);
            const allCompleted = [...tracker.expected].every((id) => tracker.received.has(id));
            if (allCompleted) {
                tracker.resolve();
            }
        }
    }
}


