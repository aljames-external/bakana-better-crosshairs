import { DEFAULT_AUTOREC_ENTRY } from "./autorecManager.js";

/**
 * Canonical domain model representing a fully resolved crosshair placement and animation configuration.
 * Enforces strict property schema contracts and authoritative normalization across all layers.
 */
export class CrosshairConfiguration {
    /**
     * Construct a new CrosshairConfiguration instance with strict normalization against schema defaults.
     * @param {Object} [source={}] - Partial or complete source configuration dictionary
     */
    constructor(source = {}) {
        const defaults = DEFAULT_AUTOREC_ENTRY;

        this.itemName = String(source.itemName ?? defaults.itemName).trim();
        this.id = String(source.id ?? defaults.id);
        this.isDefault = Boolean(source.isDefault);
        this.isCustom = Boolean(source.isCustom);
        this.enabled = Boolean(source.enabled ?? defaults.enabled);

        const options = source.options ?? {};
        const file = source.file ?? {};
        const preview = source.preview ?? {};
        const previewFill = preview.fill ?? {};
        const previewBorder = preview.border ?? {};
        const placed = source.placed ?? {};
        const placedFill = placed.fill ?? {};
        const placedBorder = placed.border ?? {};
        const macro = source.macro ?? {};

        // Animation shape filepaths
        this.circleFile = String(source.circleFile ?? file.circle ?? defaults.circleFile).trim();
        this.coneFile = String(source.coneFile ?? file.cone ?? defaults.coneFile).trim();
        this.rayFile = String(source.rayFile ?? file.ray ?? defaults.rayFile).trim();
        this.squareFile = String(source.squareFile ?? file.square ?? defaults.squareFile).trim();
        this.lineFile = String(source.lineFile ?? file.line ?? defaults.lineFile).trim();

        // Lock to Token option ("true" | "false" | "default")
        this.stickToToken = String(source.stickToToken ?? options.attachMode ?? defaults.stickToToken);

        // Core animation rendering options
        this.showLine = Boolean(source.showLine ?? options.showLine ?? defaults.showLine);
        this.showRange = Boolean(source.showRange ?? options.showRange ?? defaults.showRange);
        this.limitRange = Boolean(source.limitRange ?? options.limitRange ?? defaults.limitRange);
        this.borderColor = String(source.borderColor ?? previewBorder.color ?? defaults.borderColor).trim();
        const borderAlphaVal = Number(source.borderAlpha ?? previewBorder.alpha ?? defaults.borderAlpha);
        this.borderAlpha = Number.isFinite(borderAlphaVal) ? borderAlphaVal : defaults.borderAlpha;
        this.fillColor = String(source.fillColor ?? previewFill.color ?? defaults.fillColor).trim();
        const fillAlphaVal = Number(source.fillAlpha ?? previewFill.alpha ?? defaults.fillAlpha);
        this.fillAlpha = Number.isFinite(fillAlphaVal) ? fillAlphaVal : defaults.fillAlpha;
        this.icon = String(source.icon ?? file.reticle ?? defaults.icon).trim();

        // Placed document styling options
        this.placedFillColor = String(source.placedFillColor ?? placedFill.color ?? defaults.placedFillColor).trim();
        const placedFillAlphaVal = Number(source.placedFillAlpha ?? placedFill.alpha ?? defaults.placedFillAlpha);
        this.placedFillAlpha = Number.isFinite(placedFillAlphaVal) ? placedFillAlphaVal : defaults.placedFillAlpha;
        this.placedBorderColor = String(source.placedBorderColor ?? placedBorder.color ?? defaults.placedBorderColor).trim();
        const placedBorderAlphaVal = Number(source.placedBorderAlpha ?? placedBorder.alpha ?? defaults.placedBorderAlpha);
        this.placedBorderAlpha = Number.isFinite(placedBorderAlphaVal) ? placedBorderAlphaVal : defaults.placedBorderAlpha;

        // Custom script hooks
        this.concurrentCode = String(source.concurrentCode ?? macro.pre ?? "").trim();
        this.postPlacementCode = String(source.postPlacementCode ?? macro.post ?? "").trim();

        // Granular section override enablement toggles
        this.enablePrePlacement = Boolean(source.enablePrePlacement ?? options.enablePrePlacement);
        this.enableAnimation = Boolean(source.enableAnimation ?? options.enableAnimation);
        this.enablePlacedStyling = Boolean(source.enablePlacedStyling ?? options.enablePlacedStyling);
        this.enablePostPlacement = Boolean(source.enablePostPlacement ?? options.enablePostPlacement);

        // Context associations
        this.item = source.item ?? null;
        this.activity = source.activity ?? null;
        this.sourceModule = String(source.sourceModule ?? source.module ?? "world").trim();
    }

    /**
     * Resolve the animation asset filepath configured for a specific shape type.
     * @param {string} shapeType - Canonical shape type ('circle' | 'cone' | 'ray' | 'square' | 'rect')
     * @returns {string} Configured file path
     */
    getFileForShape(shapeType = "circle") {
        const normType = String(shapeType).toLowerCase() === "rect" ? "square" : String(shapeType).toLowerCase();
        switch (normType) {
            case "cone": return this.coneFile;
            case "ray": return this.rayFile;
            case "square": return this.squareFile;
            case "circle":
            default:
                return this.circleFile;
        }
    }

    /**
     * Create a normalized CrosshairConfiguration instance from any raw source object.
     * @param {Object} [source={}] - Raw configuration object
     * @returns {CrosshairConfiguration} Normalized configuration instance
     */
    static fromSource(source = {}) {
        if (source instanceof CrosshairConfiguration) return source;
        return new CrosshairConfiguration(source);
    }

    /**
     * Layer a custom override configuration onto this base configuration.
     * Respects granular section enablement flags (`enableAnimation`, `enablePrePlacement`, etc.).
     * @param {Object} [customSource={}] - Custom configuration object (e.g. from item flags)
     * @returns {CrosshairConfiguration} New merged CrosshairConfiguration instance
     */
    overrideWith(customSource = {}) {
        if (!customSource || typeof customSource !== "object") {
            return this;
        }

        const hasGranularFlags = "enableAnimation" in customSource
            || "enablePrePlacement" in customSource
            || "enablePlacedStyling" in customSource
            || "enablePostPlacement" in customSource;

        const isPreOverride = hasGranularFlags ? Boolean(customSource.enablePrePlacement) : Boolean(customSource.concurrentCode);
        const isAnimOverride = hasGranularFlags ? Boolean(customSource.enableAnimation) : Boolean(customSource.enabled !== false);
        const isPlacedOverride = hasGranularFlags ? Boolean(customSource.enablePlacedStyling) : (Boolean(customSource.placedFillColor) || Boolean(customSource.placedBorderColor));
        const isPostOverride = hasGranularFlags ? Boolean(customSource.enablePostPlacement) : Boolean(customSource.postPlacementCode);

        if (!isPreOverride && !isAnimOverride && !isPlacedOverride && !isPostOverride) {
            return this;
        }

        const merged = { ...this, isCustom: true };

        if (isPreOverride) {
            merged.concurrentCode = customSource.concurrentCode ?? this.concurrentCode;
            merged.enablePrePlacement = true;
        }

        if (isAnimOverride) {
            merged.enabled = true;
            merged.enableAnimation = true;
            merged.circleFile = customSource.circleFile ?? this.circleFile;
            merged.coneFile = customSource.coneFile ?? this.coneFile;
            merged.rayFile = customSource.rayFile ?? this.rayFile;
            merged.squareFile = customSource.squareFile ?? this.squareFile;

            const stickToTokenVal = String(customSource.stickToToken ?? "default");
            merged.stickToToken = stickToTokenVal !== "default" ? stickToTokenVal : this.stickToToken;

            merged.showLine = Boolean(customSource.showLine ?? this.showLine);
            merged.showRange = Boolean(customSource.showRange ?? this.showRange);
            merged.limitRange = Boolean(customSource.limitRange ?? this.limitRange);
            merged.lineFile = customSource.lineFile ?? this.lineFile;
            merged.borderColor = customSource.borderColor ?? this.borderColor;
            merged.borderAlpha = customSource.borderAlpha ?? this.borderAlpha;
            merged.fillColor = customSource.fillColor ?? this.fillColor;
            merged.fillAlpha = customSource.fillAlpha ?? this.fillAlpha;
            merged.icon = customSource.icon ?? this.icon;
        }

        if (isPlacedOverride) {
            merged.enablePlacedStyling = true;
            merged.placedFillColor = customSource.placedFillColor ?? this.placedFillColor;
            merged.placedFillAlpha = customSource.placedFillAlpha ?? this.placedFillAlpha;
            merged.placedBorderColor = customSource.placedBorderColor ?? this.placedBorderColor;
            merged.placedBorderAlpha = customSource.placedBorderAlpha ?? this.placedBorderAlpha;
        }

        if (isPostOverride) {
            merged.enablePostPlacement = true;
            merged.postPlacementCode = customSource.postPlacementCode ?? this.postPlacementCode;
        }

        return new CrosshairConfiguration(merged);
    }

    /**
     * Convert this instance to a clean plain Object schema for serialization or UI preparation.
     * @returns {Object} Plain object dictionary representing this configuration
     */
    toJSON() {
        return {
            itemName: this.itemName,
            id: this.id,
            isDefault: this.isDefault,
            isCustom: this.isCustom,
            enabled: this.enabled,
            circleFile: this.circleFile,
            coneFile: this.coneFile,
            rayFile: this.rayFile,
            squareFile: this.squareFile,
            lineFile: this.lineFile,
            stickToToken: this.stickToToken,
            showLine: this.showLine,
            showRange: this.showRange,
            limitRange: this.limitRange,
            borderColor: this.borderColor,
            borderAlpha: this.borderAlpha,
            fillColor: this.fillColor,
            fillAlpha: this.fillAlpha,
            icon: this.icon,
            placedFillColor: this.placedFillColor,
            placedFillAlpha: this.placedFillAlpha,
            placedBorderColor: this.placedBorderColor,
            placedBorderAlpha: this.placedBorderAlpha,
            concurrentCode: this.concurrentCode,
            postPlacementCode: this.postPlacementCode,
            enablePrePlacement: this.enablePrePlacement,
            enableAnimation: this.enableAnimation,
            enablePlacedStyling: this.enablePlacedStyling,
            enablePostPlacement: this.enablePostPlacement
        };
    }
}
