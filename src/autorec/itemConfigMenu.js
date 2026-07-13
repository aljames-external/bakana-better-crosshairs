import { MODULE_ID } from "../lib/constants.js";
import { DEFAULT_AUTOREC_ENTRY, autorecManager } from "./autorecManager.js";
import { log } from "../lib/logger.js";
import { localize, notify } from "../lib/utils.js";
import { crosshairAdapter } from "../adapter/foundry/index.js";
import { systemAdapter } from "../adapter/system/index.js";

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
    /**
     * Default application configuration options.
     * @type {object}
     */
    static DEFAULT_OPTIONS = {
        id: "bbc-item-crosshair-config",
        tag: "form",
        form: {
            handler: ItemCrosshairConfigApplication.#onSubmitForm,
            submitOnChange: false,
            closeOnSubmit: false
        },
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

    /**
     * Handle declarative form submission via ApplicationV2 lifecycle.
     * @param {Event} event - Form submit event
     * @param {HTMLFormElement} form - Rendered form element
     * @param {FormData} formData - Form submission payload
     * @returns {Promise<void>}
     */
    static async #onSubmitForm(event, form, formData) {
        await this._saveConfiguration(form);
    }

    /**
     * Application rendering template parts.
     * @type {object}
     */
    static PARTS = {
        main: {
            template: `modules/${MODULE_ID}/src/autorec/itemConfigMenu.html`
        }
    };

    /**
     * Construct an ItemCrosshairConfigApplication for a specific item document.
     * @param {object} [options={}] - Application instantiation options containing target item
     * @returns {ItemCrosshairConfigApplication} Form application instance
     */
    constructor(options = {}) {
        super({
            ...options,
            id: `bbc-item-crosshair-config-${options.item?.id ?? "unknown"}`
        });
        this.item = options.item ?? null;
        this.selectedScope = options.selectedScope ?? "item";
        this.isEditMode = Boolean(options.isEditMode ?? false);
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
        const isEditMode = Boolean(this.isEditMode);

        const selectedScope = this.selectedScope ?? "item";
        const itemCustomConfig = item?.getFlag(MODULE_ID, "customConfig") ?? null;
        const activityConfigs = item?.getFlag(MODULE_ID, "activityConfigs") ?? {};

        const activities = [];
        if (Boolean(systemAdapter.supportsActivities) && item?.system?.activities) {
            for (const act of item.system.activities.values()) {
                if (!act?.id) continue;
                activities.push({
                    id: act.id,
                    name: act.name ?? act.id,
                    hasCustom: Boolean(activityConfigs[act.id])
                });
            }
        }
        const showActivityDropdown = Boolean(systemAdapter.supportsActivities) && activities.length > 0;

        const hasItemCustom = Boolean(itemCustomConfig);
        const overrideScopes = [
            {
                value: "item",
                label: `Item-Level Overrides${hasItemCustom ? " [CUSTOM]" : ""}`,
                selected: selectedScope === "item"
            }
        ];
        for (const act of activities) {
            overrideScopes.push({
                value: act.id,
                label: `Activity: ${act.name}${act.hasCustom ? " [CUSTOM]" : ""}`,
                selected: selectedScope === act.id
            });
        }

        const customConfig = selectedScope === "item"
            ? itemCustomConfig
            : (activityConfigs[selectedScope] ?? null);
        const hasCustom = Boolean(customConfig);
        this.hasCustom = Boolean(hasCustom);
        const isCustom = Boolean(customConfig && customConfig.enabled !== false);

        const autorecMatch = autorecManager.getEntryByName(itemName);
        const isAutorec = Boolean(!hasCustom && autorecMatch && !autorecMatch.isDefault && autorecMatch.enabled);

        const baseFallback = selectedScope === "item"
            ? (autorecMatch ?? DEFAULT_AUTOREC_ENTRY)
            : { ...(autorecMatch ?? DEFAULT_AUTOREC_ENTRY), ...(itemCustomConfig ?? {}) };

        const scopeHint = selectedScope === "item"
            ? localize("BBC.itemConfigMenu.scopeHintItem", "Configuring default overrides for this entire item.")
            : localize("BBC.itemConfigMenu.scopeHintActivity", "Configuring granular overrides specific to this activity (takes priority over item overrides).");

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

            concurrentCode: (source.concurrentCode ?? "").trim(),

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

            postPlacementCode: (source.postPlacementCode ?? "").trim(),

            borderColorPicker: normalizeHexColor(source.borderColor, "#ffffff"),
            fillColorPicker: normalizeHexColor(source.fillColor, "#000000"),
            placedFillColorPicker: normalizeHexColor(source.placedFillColor, "#000000"),
            placedBorderColorPicker: normalizeHexColor(source.placedBorderColor, "#000000"),

            isStickDefault: Boolean((source.stickToToken ?? "default") === "default" || !source.stickToToken),
            isStickOn: Boolean((source.stickToToken ?? "default") === "true"),
            isStickOff: Boolean((source.stickToToken ?? "default") === "false"),
            hasCustomStyling: Boolean(
                (source.borderColor && source.borderColor !== "#ffffff") ||
                (source.borderAlpha !== undefined && source.borderAlpha !== 0) ||
                (source.fillColor && source.fillColor !== "#000000") ||
                (source.fillAlpha !== undefined && source.fillAlpha !== 0)
            ),
            hasPlacedStyling: Boolean(
                (source.placedFillColor && source.placedFillColor !== "#000000") ||
                (source.placedFillAlpha !== undefined && source.placedFillAlpha !== 0) ||
                (source.placedBorderColor && source.placedBorderColor !== "#ffffff") ||
                (source.placedBorderAlpha !== undefined && source.placedBorderAlpha !== 0)
            )
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
            editMode: localize("BBC.autorecMenu.labels.editMode", "Edit Mode"),

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
            noPreScript: localize("BBC.itemConfigMenu.noPreScript", "No custom pre-placement script configured"),
            noPostScript: localize("BBC.itemConfigMenu.noPostScript", "No custom post-placement script configured"),

            inheritingAutorecTitle: localize("BBC.itemConfigMenu.inheritingAutorecTitle", "Inheriting Global Autorec"),
            inheritingAutorecDesc: localize("BBC.itemConfigMenu.inheritingAutorecDesc", `This ${selectedScope === "item" ? "item" : "activity"} is currently inheriting configuration from the registered Global Autorec workflow "${autorecMatch?.itemName ?? "Unknown"}". Toggle Edit Mode above to customize overrides.`),
            noCustomOverridesTitle: localize("BBC.itemConfigMenu.noCustomOverridesTitle", "No Custom Overrides Set"),
            noCustomOverridesDesc: localize("BBC.itemConfigMenu.noCustomOverridesDesc", `This ${selectedScope === "item" ? "item" : "activity"} is currently using default crosshair placement settings. Toggle Edit Mode above to configure custom overrides.`),

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
            stickDefault: localize("BBC.autorecMenu.pills.stickDefault", "Default behavior per module's System adapter"),
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
            isEditMode,
            autorecMatchName: autorecMatch?.itemName ?? "",
            config: mergedConfig,
            showActivityDropdown,
            overrideScopes,
            scopeHint,
            selectedScope,
            showOverrides: true,
            showActivityIdentification: false,

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

        // Restore and handle Edit Mode state across re-renders and toggles
        const editToggle = root.querySelector("#bbc-item-edit-mode-toggle");
        const container = root.querySelector(".bbc-autorec-container");
        if (editToggle && container) {
            if (this.isEditMode) {
                editToggle.checked = true;
                container.classList.add("edit-mode");
            } else {
                editToggle.checked = false;
                container.classList.remove("edit-mode");
            }

            const syncEditModeControls = (turningOn) => {
                this.isEditMode = turningOn;
                container.classList.toggle("edit-mode", turningOn);
                root.querySelectorAll("input:not(#bbc-item-edit-mode-toggle), select:not([name='overrideScope']), textarea, button[type='submit']").forEach(el => {
                    el.disabled = !turningOn;
                });
            };

            syncEditModeControls(this.isEditMode);

            editToggle.addEventListener("change", (ev) => {
                const turningOn = Boolean(ev.currentTarget.checked);
                this.isEditMode = turningOn;
                const hasEmptyCard = Boolean(root.querySelector(".bbc-inspector-empty"));
                if (!turningOn || hasEmptyCard || !this.hasCustom) {
                    this.render(false);
                } else {
                    syncEditModeControls(true);
                }
            });

            // Live-toggle child configuration options and badge text when an override checkbox changes in edit mode
            root.querySelectorAll("input[type='checkbox'][name^='enable']").forEach(chk => {
                chk.addEventListener("change", (ev) => {
                    const fieldName = ev.currentTarget.name;
                    const isChecked = Boolean(ev.currentTarget.checked);
                    root.querySelectorAll(`[data-override-child='${fieldName}']`).forEach(el => {
                        el.style.display = isChecked ? "" : "none";
                    });
                    root.querySelectorAll(`[data-override-badge='${fieldName}']`).forEach(el => {
                        el.textContent = isChecked
                            ? localize("BBC.itemConfigMenu.badgeCustomOverride", "CUSTOM OVERRIDE")
                            : localize("BBC.itemConfigMenu.badgeInherited", "INHERITED");
                    });
                });
            });
        }

        // Synchronize HTML color pickers with adjacent text inputs across both input and change events
        root.querySelectorAll("input[type='color'].bbc-edit-color, input[type='color'][data-color-target]").forEach(picker => {
            const syncToText = (ev) => {
                const row = ev.currentTarget.closest(".bbc-edit-color-row");
                const targetInput = row?.querySelector("input[type='text']")
                    ?? root.querySelector(`#${CSS.escape(ev.currentTarget.getAttribute("data-color-target") || "")}`);
                if (targetInput && targetInput.value !== ev.currentTarget.value) {
                    targetInput.value = ev.currentTarget.value;
                    targetInput.dispatchEvent(new Event("input", { bubbles: true }));
                    targetInput.dispatchEvent(new Event("change", { bubbles: true }));
                }
            };
            picker.addEventListener("input", syncToText);
            picker.addEventListener("change", syncToText);
        });

        // Synchronize text inputs back to adjacent HTML color pickers when valid hex entered
        root.querySelectorAll(".bbc-edit-color-row input[type='text'], input[type='text'][id^='bbc-item-']").forEach(textInput => {
            const syncToPicker = (ev) => {
                const val = ev.currentTarget.value?.trim();
                const row = ev.currentTarget.closest(".bbc-edit-color-row");
                const targetPicker = row?.querySelector("input[type='color']")
                    ?? root.querySelector(`input[type='color'][data-color-target='${CSS.escape(ev.currentTarget.id || "")}']`);
                if (targetPicker && /^#[0-9A-Fa-f]{6}$/.test(val) && targetPicker.value !== val) {
                    targetPicker.value = val;
                }
            };
            textInput.addEventListener("input", syncToPicker);
            textInput.addEventListener("change", syncToPicker);
        });

        // Handle Target Scope Dropdown Change
        const scopeSelect = root.querySelector("select[name='overrideScope']");
        if (scopeSelect) {
            const onScopeChange = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const newVal = ev.currentTarget.value ?? "item";
                if (this.selectedScope !== newVal) {
                    this.selectedScope = newVal;
                    this.render(false);
                }
            };
            scopeSelect.addEventListener("change", onScopeChange);
            scopeSelect.addEventListener("input", onScopeChange);
        }

        // Handle Delete CUSTOM Configuration action button
        const deleteBtn = root.querySelector("button[data-action='delete-custom']");
        if (deleteBtn) {
            deleteBtn.addEventListener("click", async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (!this.item) return;

                const scope = this.selectedScope ?? "item";
                if (scope === "item") {
                    log.debug(`ItemCrosshairConfigApplication | Deleting custom item-level configuration from "${this.item.name}"`);
                    await this.item.unsetFlag(MODULE_ID, "customConfig");
                    notify.info(localize("BBC.itemConfigMenu.removedItemCustom", `Removed custom Item-level crosshair configuration from "${this.item.name}".`));
                } else {
                    log.debug(`ItemCrosshairConfigApplication | Deleting custom activity-level configuration (${scope}) from "${this.item.name}"`);
                    const existingMap = foundry.utils.deepClone(this.item.getFlag(MODULE_ID, "activityConfigs") ?? {});
                    delete existingMap[scope];
                    if (Object.keys(existingMap).length === 0) {
                        await this.item.unsetFlag(MODULE_ID, "activityConfigs");
                    } else {
                        await this.item.setFlag(MODULE_ID, "activityConfigs", existingMap);
                    }
                    notify.info(localize("BBC.itemConfigMenu.removedActivityCustom", `Removed custom Activity-level crosshair configuration on "${this.item.name}".`));
                }

                this.render(false);
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
            concurrentCode: String(formData.get("concurrentCode") ?? "").trim(),
            postPlacementCode: String(formData.get("postPlacementCode") ?? "").trim(),
            icon: String(formData.get("icon") ?? "").trim()
        };

        const scope = this.selectedScope ?? "item";
        if (scope === "item") {
            log.debug(`ItemCrosshairConfigApplication | Saving custom item-level configuration for "${this.item.name}":`, config);
            await this.item.setFlag(MODULE_ID, "customConfig", config);
            notify.info(localize("BBC.itemConfigMenu.savedItemCustom", `Saved custom Item-level crosshair configuration for "${this.item.name}".`));
        } else {
            log.debug(`ItemCrosshairConfigApplication | Saving custom activity-level configuration (${scope}) for "${this.item.name}":`, config);
            const existingMap = foundry.utils.deepClone(this.item.getFlag(MODULE_ID, "activityConfigs") ?? {});
            existingMap[scope] = config;
            await this.item.setFlag(MODULE_ID, "activityConfigs", existingMap);
            notify.info(localize("BBC.itemConfigMenu.savedActivityCustom", `Saved custom Activity-level crosshair configuration for "${this.item.name}".`));
        }

        this.render(false);
    }
}
