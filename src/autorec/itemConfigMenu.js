import { MODULE_ID } from "../lib/constants.js";
import { DEFAULT_AUTOREC_ENTRY, autorecManager } from "./autorecManager.js";
import { log } from "../lib/logger.js";
import { localize, notify } from "../lib/utils.js";
import { crosshairAdapter } from "../adapter/foundry/index.js";


const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Normalize a hex color string, returning a valid 6-digit hex string or the provided fallback.
 * @param {unknown} val - Input color value to validate
 * @param {string} [fallback="#000000"] - Fallback hex color if validation fails
 * @returns {string} Normalized 6-digit hex color string
 */
function normalizeHexColor(val, fallback = "#000000") {
    if (typeof val === "string" && /^#[0-9A-Fa-f]{6}$/.test(val)) return val;
    return fallback;
}

/**
 * Form application for configuring item-specific Better Crosshairs (BBC) settings stored on item flags.
 * Allows any item owner to view badge status (CUSTOM vs AUTOREC vs DEFAULT) and modify or delete custom item overrides.
 */
export class ItemCrosshairConfigApplication extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "bbc-item-crosshair-config",
        tag: "form",
        window: {
            title: "BBC.itemConfigMenu.title",
            icon: "fa-solid fa-crosshairs",
            resizable: true
        },
        position: {
            width: 760,
            height: 640
        },
        classes: ["bbc-app", "bbc-autorec-form", "bbc-item-config-form"]
    };

    static PARTS = {
        main: {
            template: `modules/${MODULE_ID}/src/autorec/itemConfigMenu.html`
        }
    };

    /**
     * Construct an ItemCrosshairConfigApplication for a specific item document.
     * @param {object} [options={}] - Application instantiation options containing target item
     */
    constructor(options = {}) {
        super({
            ...options,
            id: `bbc-item-crosshair-config-${options.item?.id ?? "unknown"}`
        });
        this.item = options.item ?? null;
    }

    /**
     * Prepare the rendering context for the item crosshair configuration form template.
     * Evaluates custom flag state, AUTOREC candidate matches, and builds normalized settings.
     * @param {object} options - Application rendering options
     * @returns {Promise<object>} Context data object passed to the Handlebars template
     */
    async _prepareContext(options) {
        const item = this.item;
        const itemName = item?.name ?? "Unknown Item";
        const itemImg = item?.img ?? null;

        const customConfig = item?.getFlag(MODULE_ID, "customConfig") ?? null;
        const hasCustom = Boolean(customConfig);
        const isCustom = Boolean(customConfig && customConfig.enabled !== false);

        const autorecMatch = autorecManager.getEntryByName(itemName);
        const isAutorec = Boolean(!hasCustom && autorecMatch && !autorecMatch.isDefault && autorecMatch.enabled);

        const baseFallback = autorecMatch ?? DEFAULT_AUTOREC_ENTRY;
        const hasGranularFlags = Boolean(
            customConfig &&
            ("enableAnimation" in customConfig ||
             "enablePrePlacement" in customConfig ||
             "enablePlacedStyling" in customConfig ||
             "enablePostPlacement" in customConfig)
        );
        const enablePrePlacement = hasGranularFlags ? Boolean(customConfig.enablePrePlacement) : Boolean(customConfig?.concurrentCode);
        const enableAnimation = hasGranularFlags ? Boolean(customConfig.enableAnimation) : Boolean(customConfig && customConfig.enabled !== false);
        const enablePlacedStyling = hasGranularFlags ? Boolean(customConfig.enablePlacedStyling) : Boolean(customConfig?.placedFillColor || customConfig?.placedBorderColor);
        const enablePostPlacement = hasGranularFlags ? Boolean(customConfig.enablePostPlacement) : Boolean(customConfig?.postPlacementCode);

        const source = {
            ...DEFAULT_AUTOREC_ENTRY,
            ...baseFallback,
            ...(customConfig ?? {})
        };

        const mergedConfig = {
            ...source,
            enablePrePlacement,
            enableAnimation,
            enablePlacedStyling,
            enablePostPlacement,

            concurrentCode: source.concurrentCode ?? "",

            enabled: Boolean(source.enabled !== false),
            circleFile: Boolean(source.circleFile) ? source.circleFile : DEFAULT_AUTOREC_ENTRY.circleFile,
            coneFile: Boolean(source.coneFile) ? source.coneFile : DEFAULT_AUTOREC_ENTRY.coneFile,
            rayFile: Boolean(source.rayFile) ? source.rayFile : DEFAULT_AUTOREC_ENTRY.rayFile,
            squareFile: Boolean(source.squareFile) ? source.squareFile : DEFAULT_AUTOREC_ENTRY.squareFile,
            lineFile: Boolean(source.lineFile) ? source.lineFile : DEFAULT_AUTOREC_ENTRY.lineFile,
            stickToToken: source.stickToToken ?? "default",
            showLine: Boolean(source.showLine),
            borderColor: source.borderColor ?? "#ffffff",
            borderAlpha: source.borderAlpha ?? 0,
            fillColor: source.fillColor ?? "#000000",
            fillAlpha: source.fillAlpha ?? 0,
            icon: source.icon ?? "",

            placedFillColor: source.placedFillColor ?? "#000000",
            placedFillAlpha: source.placedFillAlpha ?? 0,
            placedBorderColor: source.placedBorderColor ?? "#ffffff",
            placedBorderAlpha: source.placedBorderAlpha ?? 0,

            postPlacementCode: source.postPlacementCode ?? "",

            borderColorPicker: normalizeHexColor(source.borderColor, "#ffffff"),
            fillColorPicker: normalizeHexColor(source.fillColor, "#000000"),
            placedFillColorPicker: normalizeHexColor(source.placedFillColor, "#000000"),
            placedBorderColorPicker: normalizeHexColor(source.placedBorderColor, "#000000")
        };

        const docTerm = crosshairAdapter.documentTerm;
        const prePlacementTitle = crosshairAdapter.prePlacementTitle;
        const placementSectionTitle = crosshairAdapter.placementSectionTitle;
        const postPlacementTitle = crosshairAdapter.postPlacementTitle;



        const labels = {
            badgeCustom: localize("BBC.itemConfigMenu.badges.custom", "CUSTOM"),
            badgeAutorec: localize("BBC.itemConfigMenu.badges.autorec", "AUTOREC"),
            badgeDefault: localize("BBC.itemConfigMenu.badges.default", "DEFAULT"),
            deleteCustomBtn: localize("BBC.itemConfigMenu.deleteCustomBtn", "Delete"),
            saveCustomBtn: localize("BBC.itemConfigMenu.saveCustomBtn", "Save"),

            overridePrePlacement: localize("BBC.itemConfigMenu.overridePrePlacement", "Override Pre-Placement Script"),
            overrideAnimation: localize("BBC.itemConfigMenu.overrideAnimation", "Override Animation Configuration"),
            overridePlacedStyling: localize("BBC.itemConfigMenu.overridePlacedStyling", "Override Placed Document Styling"),
            overridePostPlacement: localize("BBC.itemConfigMenu.overridePostPlacement", "Override Post-Placement Script"),
            overrideCheckboxLabel: localize("BBC.itemConfigMenu.overrideCheckboxLabel", "Override Global Autorec Settings"),

            badgeCustomOverride: localize("BBC.itemConfigMenu.badgeCustomOverride", "CUSTOM OVERRIDE"),
            badgeInherited: localize("BBC.itemConfigMenu.badgeInherited", "INHERITED"),

            preSectionDesc: localize("BBC.itemConfigMenu.preSectionDesc", `Executes custom Javascript code before starting ${docTerm} placement selection.`),
            animationDesc: localize("BBC.itemConfigMenu.animationDesc", "Sequencer crosshair graphic asset and interactive rendering properties."),
            placedSectionDesc: localize("BBC.itemConfigMenu.placedSectionDesc", `Configure fill and border highlight colors applied to the created ${docTerm}.`),
            postSectionDesc: localize("BBC.itemConfigMenu.postSectionDesc", `Executes custom Javascript code immediately after the ${docTerm} document is created on the canvas.`),

            animationTitle: localize("BBC.autorecMenu.labels.animationTitle", "Animation Configuration"),
            workflowEnabled: localize("BBC.autorecMenu.labels.workflowEnabled", "Workflow Enabled"),
            circleFile: localize("BBC.autorecMenu.labels.circleFile", "Circle Sequencer Filepath"),
            coneFile: localize("BBC.autorecMenu.labels.coneFile", "Cone Sequencer Filepath"),
            rayFile: localize("BBC.autorecMenu.labels.rayFile", "Ray Sequencer Filepath"),
            squareFile: localize("BBC.autorecMenu.labels.squareFile", "Square Sequencer Filepath"),
            lockToToken: localize("BBC.autorecMenu.labels.lockToToken", "Lock to Token (Stick)"),
            originLine: localize("BBC.autorecMenu.labels.originLine", "Origin Stretch Line"),
            showLineLabel: localize("BBC.autorecMenu.labels.showLine", "Show Line"),
            borderStyling: localize("BBC.autorecMenu.labels.borderStyling", "Border Styling (Tile Highlight)"),
            fillStyling: localize("BBC.autorecMenu.labels.fillStyling", "Fill Styling (Tile Highlight)"),
            customIcon: localize("BBC.autorecMenu.labels.customIcon", "Custom Cursor Icon"),
            placedFill: localize("BBC.autorecMenu.labels.placedFill", "Placed Fill Color"),
            placedBorder: localize("BBC.autorecMenu.labels.placedBorder", "Placed Border Color"),
            alphaLabel: localize("BBC.autorecMenu.labels.alpha", "Alpha:"),
            stickDefault: localize("BBC.autorecMenu.pills.stickDefault", "Default (Cone: On, Others: Off)"),
            stickOn: localize("BBC.autorecMenu.pills.stickOn", "On (Locked to Origin Token)"),
            stickOff: localize("BBC.autorecMenu.pills.stickOff", "Off (Free Cursor Placement)")
        };

        return {
            item,
            itemName,
            itemImg,
            hasCustom,
            isCustom,
            isAutorec,
            autorecMatchName: autorecMatch?.itemName ?? "",
            config: mergedConfig,
            prePlacementTitle,
            placementSectionTitle,
            postPlacementTitle,
            labels
        };
    }

    /**
     * Attach interactive DOM event listeners after rendering completes.
     * Binds Delete CUSTOM Configuration button and color inputs.
     * @param {object} context - Prepared rendering context data
     * @param {object} options - Render options provided during rendering
     * @returns {void}
     */
    _onRender(context, options) {
        super._onRender(context, options);
        this._attachEventListeners(this.element);
    }

    /**
     * Attach form controls and delete custom override handlers to application DOM root.
     * @param {HTMLElement} root - Rendered form root element
     * @returns {void}
     */
    _attachEventListeners(root) {
        if (!root) return;

        // Synchronize HTML color pickers with adjacent text inputs
        root.querySelectorAll("input[type='color'][data-color-target]").forEach(picker => {
            picker.addEventListener("input", (ev) => {
                const targetId = ev.currentTarget.getAttribute("data-color-target");
                const targetInput = root.querySelector(`#${targetId}`);
                if (targetInput) targetInput.value = ev.currentTarget.value;
            });
        });

        // Synchronize text inputs back to adjacent HTML color pickers when valid hex entered
        root.querySelectorAll("input[type='text'][id^='bbc-item-']").forEach(textInput => {
            textInput.addEventListener("input", (ev) => {
                const val = ev.currentTarget.value?.trim();
                const targetPicker = root.querySelector(`input[type='color'][data-color-target='${ev.currentTarget.id}']`);
                if (targetPicker && /^#[0-9A-Fa-f]{6}$/.test(val)) {
                    targetPicker.value = val;
                }
            });
        });

        // Handle Delete CUSTOM Configuration action button
        const deleteBtn = root.querySelector("button[data-action='delete-custom']");
        if (deleteBtn) {
            deleteBtn.addEventListener("click", async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (!this.item) return;

                log.debug(`ItemCrosshairConfigApplication | Deleting custom configuration from item "${this.item.name}" (${this.item.id})`);
                await this.item.unsetFlag(MODULE_ID, "customConfig");
                notify.info(`Removed custom BBC configuration from "${this.item.name}".`);

                this.render(false);
            });
        }

        // Handle Form Submission / Save CUSTOM Configuration
        const form = root.tagName === "FORM" ? root : root.querySelector("form");
        if (form) {
            form.addEventListener("submit", async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                await this._saveConfiguration(form);
            });
        }
    }

    /**
     * Extract form inputs and save the custom crosshair override configuration onto item flags.
     * @param {HTMLFormElement} form - Rendered form element
     * @returns {Promise<void>} Resolves when custom item flags are saved
     */
    async _saveConfiguration(form) {
        if (!this.item) return;

        const formData = new FormData(form);
        const config = {
            enablePrePlacement: formData.get("enablePrePlacement") === "on",
            enableAnimation: formData.get("enableAnimation") === "on",
            enablePlacedStyling: formData.get("enablePlacedStyling") === "on",
            enablePostPlacement: formData.get("enablePostPlacement") === "on",
            enabled: true,

            circleFile: String(formData.get("circleFile") ?? "").trim(),
            coneFile: String(formData.get("coneFile") ?? "").trim(),
            rayFile: String(formData.get("rayFile") ?? "").trim(),
            squareFile: String(formData.get("squareFile") ?? "").trim(),
            stickToToken: String(formData.get("stickToToken") ?? "default"),
            showLine: formData.get("showLine") === "on",
            borderColor: String(formData.get("borderColor") ?? "#ffffff").trim(),
            borderAlpha: parseFloat(formData.get("borderAlpha") ?? "0"),
            fillColor: String(formData.get("fillColor") ?? "#000000").trim(),
            fillAlpha: parseFloat(formData.get("fillAlpha") ?? "0"),
            placedFillColor: String(formData.get("placedFillColor") ?? "").trim(),
            placedFillAlpha: parseFloat(formData.get("placedFillAlpha") ?? "0"),
            placedBorderColor: String(formData.get("placedBorderColor") ?? "").trim(),
            placedBorderAlpha: parseFloat(formData.get("placedBorderAlpha") ?? "0"),
            concurrentCode: String(formData.get("concurrentCode") ?? ""),
            postPlacementCode: String(formData.get("postPlacementCode") ?? ""),
            icon: String(formData.get("icon") ?? "").trim()
        };

        log.debug(`ItemCrosshairConfigApplication | Saving custom configuration to item "${this.item.name}" flags:`, config);
        await this.item.setFlag(MODULE_ID, "customConfig", config);
        notify.info(`Saved custom BBC configuration for "${this.item.name}".`);

        this.render(false);
    }
}

/**
 * Open the Item Crosshair Configuration application for a target item.
 * Accessible to any user who owns the item.
 * @param {Document} item - Target Item document
 * @returns {void}
 */
export function openItemCrosshairConfig(item) {
    if (!item) return;
    new ItemCrosshairConfigApplication({ item }).render(true);
}

/**
 * Register Foundry VTT ApplicationV2 Item sheet header controls (`getHeaderControlsItemSheet5e`,
 * `getHeaderControlsItemSheet5e2`, `dnd5e.getItemContextOptions`, and ApplicationV2 render hooks)
 * so item owners see a BBC top-bar / menu control to configure item crosshairs.
 * @returns {void}
 */
export function registerItemSheetHooks() {
    /**
     * Add a Better Crosshairs header control to ApplicationV2 item sheets for item owners.
     * @param {foundry.applications.api.ApplicationV2} app - Item sheet application instance
     * @param {Array<object>} controls - Array of header control button items
     * @returns {void}
     */
    function addApplicationV2HeaderControl(app, controls) {
        const item = app.document;
        if (!item || !Boolean(item.isOwner)) return;
        if (controls.some(c => c.label?.startsWith("BBC") || c.icon === "fa-solid fa-crosshairs")) return;

        const customConfig = item.getFlag(MODULE_ID, "customConfig") ?? null;
        const autorecMatch = autorecManager.getEntryByName(item.name);
        const statusLabel = Boolean(customConfig) ? " [CUSTOM]" : (autorecMatch ? " [AUTOREC]" : "");

        controls.push({
            label: `BBC${statusLabel}`,
            icon: "fa-solid fa-crosshairs",
            onClick: () => openItemCrosshairConfig(item)
        });
    }

    Hooks.on("getHeaderControlsItemSheet5e", addApplicationV2HeaderControl);
    Hooks.on("getHeaderControlsItemSheet5e2", addApplicationV2HeaderControl);

    Hooks.on("dnd5e.getItemContextOptions", (item, options) => {
        if (!item || !Boolean(item.isOwner)) return;
        if (options.some(o => o.name?.startsWith("BBC Crosshair"))) return;

        const customConfig = item.getFlag(MODULE_ID, "customConfig") ?? null;
        const autorecMatch = autorecManager.getEntryByName(item.name);
        const statusLabel = Boolean(customConfig) ? " [CUSTOM]" : (autorecMatch ? " [AUTOREC]" : "");

        options.push({
            name: `BBC Crosshair Configuration${statusLabel}`,
            icon: "<i class='fa-solid fa-crosshairs'></i>",
            callback: () => openItemCrosshairConfig(item)
        });
    });
}
