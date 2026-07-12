import { MODULE_ID } from "../lib/constants.js";

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
    emit(payload) {
        if (!game.socket) return;
        game.socket.emit(`module.${MODULE_ID}`, payload);
    },

    /**
     * Register a callback listener on the module socket channel.
     * @param {Function} handler - Callback function invoked when a module socket payload is received
     * @returns {void}
     */
    on(handler) {
        if (typeof handler !== "function") return;
        if (!game.socket) return;
        game.socket.on(`module.${MODULE_ID}`, handler);
    },

    /**
     * Remove a previously registered callback listener from the module socket channel.
     * @param {Function} handler - Callback function to remove
     * @returns {void}
     */
    off(handler) {
        if (typeof handler !== "function") return;
        if (!game.socket) return;
        game.socket.off(`module.${MODULE_ID}`, handler);
    }
};
