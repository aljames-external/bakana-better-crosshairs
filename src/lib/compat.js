/**
 * Namespace compatibility shim for Foundry VTT API updates across versions.
 */

/**
 * Reference to the Foundry VTT Token placeable class.
 * @type {typeof foundry.canvas.placeables.Token}
 */
export const Token = foundry.canvas.placeables.Token;

/**
 * Reference to the Foundry VTT Ray geometry class.
 */
export const Ray = foundry.canvas?.geometry?.Ray ?? Ray;

/**
 * Clears the specified grid highlight layer.
 *
 * @param {string} id - The identifier of the highlight layer to clear.
 * @returns {void}
 */
export function clearHighlightLayer(id) {
    return canvas.interface.grid.clearHighlightLayer(id);
}
