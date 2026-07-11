/**
 * Namespace compatibility shim for Foundry VTT API updates across versions.
 */

export const Token = foundry.canvas.placeables.Token;
export const Ray = foundry.canvas.geometry.Ray;

export function clearHighlightLayer(id) {
    if (!id) return;
    const layer = canvas?.interface?.grid ?? canvas?.grid;
    if (typeof layer?.clearHighlightLayer === "function") {
        layer.clearHighlightLayer(id);
    }
}
