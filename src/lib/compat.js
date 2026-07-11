/**
 * Namespace compatibility shim for Foundry VTT API updates across versions.
 */

export const Token = foundry.canvas.placeables.Token;
export const Ray = foundry.canvas.geometry.Ray;

export function clearHighlightLayer(id) {
    return canvas.interface.grid.clearHighlightLayer(id);
}
