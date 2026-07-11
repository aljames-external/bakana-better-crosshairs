/**
 * Namespace compatibility shim for Foundry VTT API updates across versions.
 */

export const Token = foundry.canvas.placeables.Token;
export const Ray = foundry.canvas.geometry.Ray;

/**
 * Clears the specified grid highlight layer.
 *
 * @param {string} id - The identifier of the highlight layer to clear.
 * @returns {void}
 */
export function clearHighlightLayer(id) {
    return canvas.interface.grid.clearHighlightLayer(id);
}
