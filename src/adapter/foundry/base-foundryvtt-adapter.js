import { systemAdapter } from "../system/index.js";

export class BaseFoundryVTTAdapter {
    constructor() {
        this.version = 0;
    }

    /**
     * Extract normalized calling item and activity context from a Foundry placeable or document.
     * @param {Document|PlaceableObject} target
     * @returns {{item: Item|null, itemName: string, itemId: string, activity: Object|null, activityName: string, activityId: string}}
     */
    extractCallingContext(target) {
        const doc = target.document ?? target;
        let itemObj = doc.item;
        let activityObj = null;

        if (itemObj && (itemObj.item || (itemObj.parent && itemObj.parent.documentName === "Item"))) {
            activityObj = itemObj;
            itemObj = itemObj.item || itemObj.parent;
        }

        if (!itemObj && doc.flags?.dnd5e?.origin && typeof fromUuidSync === "function") {
            try { itemObj = fromUuidSync(doc.flags.dnd5e.origin); } catch (e) {}
        }
        if (!itemObj && doc.flags?.['midi-qol']?.itemUuid && typeof fromUuidSync === "function") {
            try { itemObj = fromUuidSync(doc.flags['midi-qol'].itemUuid); } catch (e) {}
        }
        if (!itemObj && doc.flags?.core?.sourceId && typeof fromUuidSync === "function") {
            try { itemObj = fromUuidSync(doc.flags.core.sourceId); } catch (e) {}
        }

        if (itemObj && !activityObj) {
            const actIdentifier = doc.flags?.dnd5e?.activity || doc.flags?.dnd5e?.activityUuid || doc.flags?.dnd5e?.activityId || doc.flags?.['midi-qol']?.activityId;
            if (actIdentifier) {
                if (typeof fromUuidSync === "function" && typeof actIdentifier === "string" && actIdentifier.includes(".")) {
                    try { activityObj = fromUuidSync(actIdentifier); } catch (e) {}
                }
                if (!activityObj && itemObj.system?.activities) {
                    activityObj = itemObj.system.activities.get?.(actIdentifier)
                        || (typeof itemObj.system.activities.find === "function" ? itemObj.system.activities.find(a => a.id === actIdentifier || a._id === actIdentifier || a.uuid === actIdentifier || a.name === actIdentifier) : null);
                }
            }
        }

        return {
            item: itemObj,
            itemName: itemObj?.name || "",
            itemId: itemObj?.id || "",
            activity: activityObj,
            activityName: activityObj?.name || "",
            activityId: activityObj?.id || activityObj?._id || ""
        };
    }

    /**
     * Filter and match autorec candidates for a Foundry document (MeasuredTemplate / Region)
     * by calling the system adapter to decide whether an entry should replace the default crosshair.
     * @param {Document|PlaceableObject} target - The template/region placeable or document
     * @param {Array<Object>|Map<string, Object>} entries - Registered autorec entries
     * @returns {Object|null} The matching autorec entry or null
     */
    matchAutorecEntry(target, entries) {
        const context = this.extractCallingContext(target);
        if (!context.itemName && !context.itemId) return null;

        const list = entries instanceof Map ? Array.from(entries.values()) : entries;

        for (const entry of list) {
            if (systemAdapter.shouldReplace(context, entry)) {
                return { ...(typeof entry === "object" ? entry : { itemName: entry }), item: context.item, activity: context.activity };
            }
        }
        return null;
    }


    /**
     * Hide a live placeable preview graphic during interactive drawing.

     * Common across Foundry v12..v14+ placement previews.
     * @param {PlaceableObject} placeable
     */
    hidePreview(placeable) {
        placeable.visible = false;
        placeable.renderable = false;
        placeable.alpha = 0;
        if (placeable.template) placeable.template.visible = false;
        if (placeable.ruler) placeable.ruler.visible = false;
        if (placeable.controlIcon) placeable.controlIcon.visible = false;

        placeable.refresh = function() {
            this.visible = false;
            this.renderable = false;
            if (this.ruler) {
                this.ruler.visible = false;
                this.ruler.text = "";
            }
            if (this.template) this.template.visible = false;
            if (this.controlIcon) this.controlIcon.visible = false;
            return this;
        };
        placeable.highlightGrid = function() {};
    }

    /**
     * Extract normalized placed fill/border styling values and flags from workflow configuration.
     * Shared across V12 and V14 document updates.
     * @param {Object} [config={}]
     * @returns {{placedFillColor?: string, placedFillAlpha?: number, placedBorderColor?: string, placedBorderAlpha?: number, flags: Object}}
     */
    extractPlacedStylingFlags(config = {}) {
        const placedFillColor = config.placedFillColor || config.templateFillColor;
        const placedFillAlpha = config.placedFillAlpha !== undefined ? config.placedFillAlpha : config.templateFillAlpha;
        const placedBorderColor = config.placedBorderColor || config.templateBorderColor;
        const placedBorderAlpha = config.placedBorderAlpha !== undefined ? config.placedBorderAlpha : config.templateBorderAlpha;

        const flags = {
            bbc: { placedFillColor, placedFillAlpha, placedBorderColor, placedBorderAlpha }
        };

        return { placedFillColor, placedFillAlpha, placedBorderColor, placedBorderAlpha, flags };
    }

    registerPlacementHooks(callbacks) {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement registerPlacementHooks(callbacks).");
    }

    detectProperties(doc) {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement detectProperties(doc).");
    }

    updatePreviewShape(previewDoc, coords) {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement updatePreviewShape(previewDoc, coords).");
    }

    clearPreviewCanvas() {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement clearPreviewCanvas().");
    }

    formatDocumentUpdate(doc, coords, config) {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement formatDocumentUpdate(doc, coords, config).");
    }
}

