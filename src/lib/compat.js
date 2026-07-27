/**
 * Namespace compatibility shim for Foundry VTT API updates across versions.
 */
import { log } from "./logger.js";

/**
 * Reference to the Foundry VTT Token placeable class.
 * @type {typeof foundry.canvas.placeables.Token}
 */
export const Token = foundry?.canvas?.placeables?.Token ?? globalThis.Token;

/**
 * Reference to the Foundry VTT MeasuredTemplate placeable class.
 * @type {typeof foundry.canvas.placeables.MeasuredTemplate}
 */
export const MeasuredTemplate = foundry?.canvas?.placeables?.MeasuredTemplate ?? globalThis.MeasuredTemplate;

/**
 * Reference to the Foundry VTT Region placeable class.
 * @type {typeof foundry.canvas.placeables.Region}
 */
export const Region = foundry?.canvas?.placeables?.Region ?? globalThis.Region;

/**
 * Reference to the Foundry VTT Ray geometry class.
 */
export const Ray = foundry?.canvas?.geometry?.Ray ?? globalThis.Ray;

/**
 * Reference to Foundry's mergeObject utility.
 */
export const mergeObject = foundry?.utils?.mergeObject ?? globalThis.mergeObject;

/**
 * Reference to Foundry's deepClone utility.
 */
export const deepClone = foundry?.utils?.deepClone ?? globalThis.deepClone;

/**
 * Clears the specified grid highlight layer across Foundry canvas versions.
 *
 * @param {string} id - The identifier of the highlight layer to clear.
 * @returns {void}
 */
export function clearHighlightLayer(id) {
    if (typeof id !== "string" || !id.trim()) {
        log.warn("compat.clearHighlightLayer | Called with invalid or empty identifier.");
        return;
    }
    const cleanId = id.trim();
    const gridApi = canvas?.interface?.grid ?? canvas?.grid;

    if (typeof gridApi?.clearHighlightLayer === "function") {
        return gridApi.clearHighlightLayer(cleanId);
    }

    const legacyLayer = canvas?.grid?.highlightLayers?.[cleanId];
    if (legacyLayer && typeof legacyLayer.clear === "function") {
        legacyLayer.clear();
        return;
    }

    log.warn(`compat.clearHighlightLayer | No highlight layer available for key "${cleanId}".`);
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
    const nameStr = String(filename ?? "").replace(/[/\\]/g, "_").trim();
    const cleanFilename = nameStr.length > 0 ? nameStr : "export.json";
    const typeStr = String(type ?? "").trim();
    const cleanType = typeStr.length > 0 ? typeStr : "application/json";
    const cleanData = typeof data === "string" ? data : JSON.stringify(data ?? {});

    try {
        const utilsFn = foundry?.utils?.saveDataToFile;
        if (typeof utilsFn === "function") {
            utilsFn(cleanData, cleanType, cleanFilename);
            log.debug(`compat.saveDataToFile | File "${cleanFilename}" saved via foundry.utils.saveDataToFile.`);
            return true;
        }
    } catch (err) {
        log.warn(`compat.saveDataToFile | Error calling foundry.utils.saveDataToFile for "${cleanFilename}". Falling back.`, err);
    }

    try {
        const globalFn = globalThis.saveDataToFile;
        if (typeof globalFn === "function") {
            globalFn(cleanData, cleanType, cleanFilename);
            log.debug(`compat.saveDataToFile | File "${cleanFilename}" saved via globalThis.saveDataToFile.`);
            return true;
        }
    } catch (err) {
        log.warn(`compat.saveDataToFile | Error calling globalThis.saveDataToFile for "${cleanFilename}".`, err);
    }

    log.error(`compat.saveDataToFile | Failed to save file "${cleanFilename}": zero valid file writers available.`);
    return false;
}
