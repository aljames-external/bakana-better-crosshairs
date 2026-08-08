/**
 * Utility for applying customized BBC placed border and fill styles onto PIXI graphics containers
 * for MeasuredTemplate and Region canvas placeables.
 */
export class PixiGraphicsStyler {
    /**
     * Convert color string (hex or named) or number into numeric color value.
     * @param {string|number|null|undefined} col - Input color
     * @returns {number|undefined} Numeric color value or undefined
     */
    static toColorNumber(col) {
        if (typeof col === "number" && !Number.isNaN(col)) return col;
        if (typeof col === "string" && col.length) {
            if (typeof foundry?.utils?.Color?.from === "function") {
                try { return foundry.utils.Color.from(col).valueOf(); } catch (e) {}
            }
            try { return parseInt(col.replace(/^#/, ""), 16); } catch (e) {}
        }
        return undefined;
    }

    /**
     * Synchronize and apply BBC placed fill and border styles onto a placeable's PIXI graphics children.
     * @param {PlaceableObject} template - The canvas placeable object (MeasuredTemplate or Region)
     * @param {boolean} [isPreview=false] - Whether the placeable is an unpersisted preview
     * @returns {void}
     */
    static applyPlacedStyling(template, isPreview = false) {
        if (!template?.document || isPreview) return;
        const doc = template.document;
        const bbcFlags = doc.flags?.bbc ?? {};
        const docFillColor = "fillColor" in doc ? doc.fillColor : doc.color;
        const docFillAlpha = "fillAlpha" in doc ? doc.fillAlpha : doc.alpha;

        const placedBorderColor = bbcFlags.placedBorderColor ?? doc.borderColor;
        const placedBorderAlpha = bbcFlags.placedBorderAlpha ?? doc.borderAlpha;
        const placedFillColor = bbcFlags.placedFillColor ?? docFillColor;
        const placedFillAlpha = bbcFlags.placedFillAlpha ?? docFillAlpha;

        if (bbcFlags.placedBorderColor !== undefined && bbcFlags.placedBorderColor !== null && doc.borderColor !== bbcFlags.placedBorderColor) {
            try { doc.borderColor = bbcFlags.placedBorderColor; } catch (e) {}
        }
        if (bbcFlags.placedBorderAlpha !== undefined && doc.borderAlpha !== bbcFlags.placedBorderAlpha) {
            try { doc.borderAlpha = bbcFlags.placedBorderAlpha; } catch (e) {}
        }
        if (bbcFlags.placedFillColor !== undefined && bbcFlags.placedFillColor !== null && doc.fillColor !== bbcFlags.placedFillColor) {
            try { doc.fillColor = bbcFlags.placedFillColor; } catch (e) {}
        }
        if (bbcFlags.placedFillAlpha !== undefined && doc.fillAlpha !== bbcFlags.placedFillAlpha) {
            try { doc.fillAlpha = bbcFlags.placedFillAlpha; } catch (e) {}
        }
        if (bbcFlags.placedFillColor !== undefined && bbcFlags.placedFillColor !== null && doc.color !== bbcFlags.placedFillColor) {
            try { doc.color = bbcFlags.placedFillColor; } catch (e) {}
        }
        if (bbcFlags.placedFillAlpha !== undefined && doc.alpha !== bbcFlags.placedFillAlpha) {
            try { doc.alpha = bbcFlags.placedFillAlpha; } catch (e) {}
        }

        const borderNum = this.toColorNumber(placedBorderColor);
        const borderAlphaNum = typeof placedBorderAlpha === "number" && !Number.isNaN(placedBorderAlpha) ? placedBorderAlpha : undefined;
        const fillNum = this.toColorNumber(placedFillColor);
        const fillAlphaNum = typeof placedFillAlpha === "number" && !Number.isNaN(placedFillAlpha) ? placedFillAlpha : undefined;

        const applyGraphicsData = (gfx) => {
            if (!gfx) return false;
            let dirty = false;
            if (Array.isArray(gfx.geometry?.graphicsData)) {
                for (const gd of gfx.geometry.graphicsData) {
                    if (!gd) continue;
                    if (gd.lineStyle && gd.lineStyle.width > 0) {
                        if (borderNum !== undefined && gd.lineStyle.color !== borderNum) { gd.lineStyle.color = borderNum; dirty = true; }
                        if (borderAlphaNum !== undefined && gd.lineStyle.alpha !== borderAlphaNum) { gd.lineStyle.alpha = borderAlphaNum; dirty = true; }
                    }
                    if (gd.fillStyle && gd.fillStyle.alpha > 0) {
                        if (fillNum !== undefined && gd.fillStyle.color !== fillNum) { gd.fillStyle.color = fillNum; dirty = true; }
                        if (fillAlphaNum !== undefined && gd.fillStyle.alpha !== fillAlphaNum) { gd.fillStyle.alpha = fillAlphaNum; dirty = true; }
                    }
                }
                if (dirty && typeof gfx.geometry.invalidate === "function") gfx.geometry.invalidate();
            }
            const instructions = gfx.instructions ?? gfx.context?.instructions;
            if (Array.isArray(instructions)) {
                for (const inst of instructions) {
                    if (!inst) continue;
                    if (inst.action === "stroke" || (inst.data && inst.data.width > 0) || (inst.style && inst.style.width > 0)) {
                        const target = inst.data ?? inst.style ?? inst;
                        if (borderNum !== undefined && target.color !== borderNum) { target.color = borderNum; dirty = true; }
                        if (borderAlphaNum !== undefined && target.alpha !== borderAlphaNum) { target.alpha = borderAlphaNum; dirty = true; }
                    }
                    if (inst.action === "fill" || (inst.data && inst.data.color !== undefined && !inst.data.width) || (inst.style && inst.style.color !== undefined && !inst.style.width)) {
                        const target = inst.data ?? inst.style ?? inst;
                        if (fillNum !== undefined && target.color !== fillNum) { target.color = fillNum; dirty = true; }
                        if (fillAlphaNum !== undefined && target.alpha !== fillAlphaNum) { target.alpha = fillAlphaNum; dirty = true; }
                    }
                }
            }
            return dirty;
        };

        const targets = [template.template, template.border, template.shape, template.mesh, ...(Array.isArray(template.children) ? template.children : [])];
        for (const target of targets) {
            applyGraphicsData(target);
        }
    }
}
