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
        this.id = String(source.id ?? this.itemName);
        this.isDefault = Boolean(source.isDefault);
        this.isCustom = Boolean(source.isCustom);
        this.enabled = source.enabled !== undefined ? Boolean(source.enabled) : defaults.enabled;

        // Animation shape filepaths
        this.circleFile = String(source.circleFile ?? defaults.circleFile).trim();
        this.coneFile = String(source.coneFile ?? defaults.coneFile).trim();
        this.rayFile = String(source.rayFile ?? defaults.rayFile).trim();
        this.squareFile = String(source.squareFile ?? defaults.squareFile).trim();
        this.lineFile = String(source.lineFile ?? defaults.lineFile).trim();

        // Lock to Token option ("true" | "false" | "default")
        this.stickToToken = String(source.stickToToken ?? defaults.stickToToken);

        // Core animation rendering options
        this.showLine = source.showLine !== undefined ? Boolean(source.showLine) : defaults.showLine;
        this.borderColor = String(source.borderColor ?? defaults.borderColor).trim();
        this.borderAlpha = Number.isFinite(Number(source.borderAlpha)) ? Number(source.borderAlpha) : defaults.borderAlpha;
        this.fillColor = String(source.fillColor ?? defaults.fillColor).trim();
        this.fillAlpha = Number.isFinite(Number(source.fillAlpha)) ? Number(source.fillAlpha) : defaults.fillAlpha;
        this.icon = String(source.icon ?? defaults.icon).trim();

        // Placed document styling options
        this.placedFillColor = String(source.placedFillColor ?? defaults.placedFillColor).trim();
        this.placedFillAlpha = Number.isFinite(Number(source.placedFillAlpha)) ? Number(source.placedFillAlpha) : defaults.placedFillAlpha;
        this.placedBorderColor = String(source.placedBorderColor ?? defaults.placedBorderColor).trim();
        this.placedBorderAlpha = Number.isFinite(Number(source.placedBorderAlpha)) ? Number(source.placedBorderAlpha) : defaults.placedBorderAlpha;

        // Custom script hooks
        this.concurrentCode = String(source.concurrentCode ?? "").trim();
        this.postPlacementCode = String(source.postPlacementCode ?? "").trim();

        // Granular section override enablement toggles
        this.enablePrePlacement = Boolean(source.enablePrePlacement);
        this.enableAnimation = Boolean(source.enableAnimation);
        this.enablePlacedStyling = Boolean(source.enablePlacedStyling);
        this.enablePostPlacement = Boolean(source.enablePostPlacement);

        // Context associations
        this.item = source.item ?? null;
        this.activity = source.activity ?? null;
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
            merged.concurrentCode = customSource.concurrentCode ?? "";
            merged.enablePrePlacement = true;
        }

        if (isAnimOverride) {
            merged.enabled = true;
            merged.enableAnimation = true;
            merged.circleFile = Boolean(customSource.circleFile) ? customSource.circleFile : DEFAULT_AUTOREC_ENTRY.circleFile;
            merged.coneFile = Boolean(customSource.coneFile) ? customSource.coneFile : DEFAULT_AUTOREC_ENTRY.coneFile;
            merged.rayFile = Boolean(customSource.rayFile) ? customSource.rayFile : DEFAULT_AUTOREC_ENTRY.rayFile;
            merged.squareFile = Boolean(customSource.squareFile) ? customSource.squareFile : DEFAULT_AUTOREC_ENTRY.squareFile;

            merged.stickToToken = (customSource.stickToToken && customSource.stickToToken !== "default")
                ? customSource.stickToToken
                : this.stickToToken;

            merged.showLine = Boolean(customSource.showLine);
            merged.lineFile = Boolean(customSource.lineFile) ? customSource.lineFile : DEFAULT_AUTOREC_ENTRY.lineFile;
            merged.borderColor = customSource.borderColor ?? DEFAULT_AUTOREC_ENTRY.borderColor;
            merged.borderAlpha = customSource.borderAlpha ?? DEFAULT_AUTOREC_ENTRY.borderAlpha;
            merged.fillColor = customSource.fillColor ?? DEFAULT_AUTOREC_ENTRY.fillColor;
            merged.icon = Boolean(customSource.icon) ? customSource.icon : DEFAULT_AUTOREC_ENTRY.icon;
        }

        if (isPlacedOverride) {
            merged.enablePlacedStyling = true;
            merged.placedFillColor = customSource.placedFillColor ?? DEFAULT_AUTOREC_ENTRY.placedFillColor;
            merged.placedFillAlpha = customSource.placedFillAlpha ?? DEFAULT_AUTOREC_ENTRY.placedFillAlpha;
            merged.placedBorderColor = customSource.placedBorderColor ?? DEFAULT_AUTOREC_ENTRY.placedBorderColor;
            merged.placedBorderAlpha = customSource.placedBorderAlpha ?? DEFAULT_AUTOREC_ENTRY.placedBorderAlpha;
        }

        if (isPostOverride) {
            merged.enablePostPlacement = true;
            merged.postPlacementCode = customSource.postPlacementCode ?? "";
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
