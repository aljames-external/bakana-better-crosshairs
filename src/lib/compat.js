/**
 * Namespace compatibility shim for Foundry VTT API updates across versions.
 */

/**
 * Reference to the Foundry VTT Token placeable class.
 * @type {typeof foundry.canvas.placeables.Token}
 */
export const Token = foundry?.canvas?.placeables?.Token ?? Token;

/**
 * Reference to the Foundry VTT MeasuredTemplate placeable class.
 * @type {typeof foundry.canvas.placeables.MeasuredTemplate}
 */
export const MeasuredTemplate = foundry?.canvas?.placeables?.MeasuredTemplate ?? MeasuredTemplate;

/**
 * Reference to the Foundry VTT Region placeable class.
 * @type {typeof foundry.canvas.placeables.Region}
 */
export const Region = foundry?.canvas?.placeables?.Region ?? Region;

/**
 * Reference to the Foundry VTT Ray geometry class.
 */
export const Ray = foundry?.canvas?.geometry?.Ray ?? Ray;

/**
 * Reference to Foundry's mergeObject utility.
 */
export const mergeObject = foundry?.utils?.mergeObject ?? mergeObject;

/**
 * Reference to Foundry's deepClone utility.
 */
export const deepClone = foundry?.utils?.deepClone ?? deepClone;

/**
 * Clears the specified grid highlight layer across Foundry canvas versions.
 *
 * @param {string} id - The identifier of the highlight layer to clear.
 * @returns {void}
 */
export function clearHighlightLayer(id) {
    return canvas.interface.grid.clearHighlightLayer(id);
}

/**
 * Safely saves text or JSON string data to a file across Foundry VTT API versions.
 * Checks namespaced foundry.utils.saveDataToFile first to prevent global accessor deprecation warnings.
 * @param {string} data - String payload to save
 * @param {string} type - MIME type (e.g. "text/json")
 * @param {string} filename - Output filename
 * @returns {boolean} True if native Foundry save helper handled the request
 */
export function saveDataToFile(data, type, filename) {
    const saveFn = foundry?.utils?.saveDataToFile ?? saveDataToFile;
    return saveFn(data, type, filename);
}

