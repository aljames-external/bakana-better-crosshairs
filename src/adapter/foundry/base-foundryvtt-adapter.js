export class BaseFoundryVTTAdapter {
    constructor() {
        this.version = 0;
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

