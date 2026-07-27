import { MODULE_ID } from "../lib/constants.js";
import { DEFAULT_AUTOREC_ENTRY, autorecManager } from "./autorecManager.js";
import { log } from "../lib/logger.js";
import { localize, notify } from "../lib/utils.js";
import { systemAdapter } from "../adapter/system/index.js";
import { BaseCrosshairMenuApplication, normalizeHexColor } from "./BaseCrosshairMenuApplication.js";

/**
 * Form application for configuring item-specific Better Crosshairs (BBC) settings stored on item flags.
 * Allows any item owner to view badge status (CUSTOM vs AUTOREC vs DEFAULT) and modify or delete custom item overrides.
 * Extends BaseCrosshairMenuApplication for ApplicationV2 and template method compliance.
 */
export class ItemCrosshairConfigApplication extends BaseCrosshairMenuApplication {
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
     * Enforces entry-boundary normalization for item input (Rule 5).
     * @param {object} [options={}] - Application instantiation options containing target item
     * @returns {ItemCrosshairConfigApplication} Form application instance
     */
    constructor(options = {}) {
        const itemDoc = options.item?.document ?? options.item ?? null;
        super({
            ...options,
            id: `bbc-item-crosshair-config-${itemDoc?.id ?? "unknown"}`
        });
        this.item = itemDoc;
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
        const isEditMode = this.isEditMode;

        const selectedScope = this.selectedScope ?? "item";
        const itemCustomConfig = item?.getFlag(MODULE_ID, "customConfig") ?? null;
        const activityConfigs = item?.getFlag(MODULE_ID, "activityConfigs") ?? {};

        const activities = [];
        if (systemAdapter.supportsActivities && item?.system?.activities) {
            for (const act of item.system.activities.values()) {
                if (!act?.id) continue;
                activities.push({
                    id: act.id,
                    name: act.name ?? act.id,
                    hasCustom: Boolean(activityConfigs[act.id])
                });
            }
        }
        const showActivityDropdown = systemAdapter.supportsActivities && activities.length > 0;

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
        this.hasCustom = hasCustom;
        const isCustom = Boolean(customConfig?.enabled ?? true);

        const autorecMatch = autorecManager.getEntryByName(itemName);
        const isAutorec = !hasCustom && Boolean(autorecMatch) && !autorecMatch.isDefault && autorecMatch.enabled;

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
        const enableAnimation = hasGranularFlags ? Boolean(customConfig.enableAnimation) : Boolean(customConfig?.enabled ?? true);
        const enablePlacedStyling = hasGranularFlags ? Boolean(customConfig.enablePlacedStyling) : (Boolean(customConfig?.placedFillColor) || Boolean(customConfig?.placedBorderColor));
        const enablePostPlacement = hasGranularFlags ? Boolean(customConfig.enablePostPlacement) : Boolean(customConfig?.postPlacementCode);

        const source = {
            ...DEFAULT_AUTOREC_ENTRY,
            ...baseFallback,
            ...(customConfig ?? {})
        };

        const stickToTokenValue = source.stickToToken ?? "default";

        const mergedConfig = {
            ...source,
            enablePrePlacement,
            enableAnimation,
            enablePlacedStyling,
            enablePostPlacement,

            concurrentCode: (source.concurrentCode ?? "").trim(),

            enabled: Boolean(source.enabled ?? true),
            circleFile: source.circleFile ?? DEFAULT_AUTOREC_ENTRY.circleFile,
            coneFile: source.coneFile ?? DEFAULT_AUTOREC_ENTRY.coneFile,
            rayFile: source.rayFile ?? DEFAULT_AUTOREC_ENTRY.rayFile,
            squareFile: source.squareFile ?? DEFAULT_AUTOREC_ENTRY.squareFile,
            lineFile: source.lineFile ?? DEFAULT_AUTOREC_ENTRY.lineFile,
            stickToToken: stickToTokenValue,
            showLine: Boolean(source.showLine),
            showRange: Boolean(source.showRange),
            limitRange: Boolean(source.limitRange),
            borderColor: source.borderColor ?? "#ffffff",
            borderAlpha: source.borderAlpha ?? 0,
            fillColor: source.fillColor ?? "#000000",
            fillAlpha: source.fillAlpha ?? 0,
            icon: source.icon ?? "",

            placedFillColor: source.placedFillColor ?? "#000000",
            placedFillAlpha: source.placedFillAlpha ?? 0.25,
            placedBorderColor: source.placedBorderColor ?? "#ffffff",
            placedBorderAlpha: source.placedBorderAlpha ?? 0.25,

            postPlacementCode: (source.postPlacementCode ?? "").trim(),

            borderColorPicker: normalizeHexColor(source.borderColor, "#ffffff"),
            fillColorPicker: normalizeHexColor(source.fillColor, "#000000"),
            placedFillColorPicker: normalizeHexColor(source.placedFillColor, "#000000"),
            placedBorderColorPicker: normalizeHexColor(source.placedBorderColor, "#000000"),

            isStickDefault: stickToTokenValue === "default",
            isStickOn: stickToTokenValue === "true",
            isStickOff: stickToTokenValue === "false",
            hasCustomStyling: Boolean(
                (source.borderColor && source.borderColor !== "#ffffff") ||
                (source.borderAlpha !== undefined && source.borderAlpha !== 0) ||
                (source.fillColor && source.fillColor !== "#000000") ||
                (source.fillAlpha !== undefined && source.fillAlpha !== 0)
            ),
            hasPlacedStyling: Boolean(
                (source.placedFillColor && source.placedFillColor !== "#000000") ||
                (source.placedFillAlpha !== undefined && source.placedFillAlpha !== 0.25) ||
                (source.placedBorderColor && source.placedBorderColor !== "#ffffff") ||
                (source.placedBorderAlpha !== undefined && source.placedBorderAlpha !== 0.25)
            )
        };

        const { docTerm, prePlacementTitle, placementSectionTitle, postPlacementTitle } = this._getAdapterTitles();

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
            showRange: localize("BBC.autorecMenu.labels.showRange", "Show Detached Distance"),
            showRangeLabel: localize("BBC.autorecMenu.labels.showRangeLabel", "Display live distance measurement at cursor"),
            limitRange: localize("BBC.autorecMenu.labels.limitRange", "Limit Placement Range"),
            limitRangeLabel: localize("BBC.autorecMenu.labels.limitRangeLabel", "Restrict crosshair placement within calling item's maximum range"),
            borderStyling: localize("BBC.autorecMenu.labels.borderStyling", "Border Styling (Tile Highlight)"),
            fillStyling: localize("BBC.autorecMenu.labels.fillStyling", "Fill Styling (Tile Highlight)"),
            customIcon: localize("BBC.autorecMenu.labels.customIcon", "Custom Cursor Icon"),
            placedFill: localize("BBC.autorecMenu.labels.placedFill", "Placed Fill Color"),
            placedBorder: localize("BBC.autorecMenu.labels.placedBorder", "Placed Border Color"),
            alphaLabel: localize("BBC.autorecMenu.labels.alpha", "Alpha:"),
            enabledPill: localize("BBC.autorecMenu.pills.enabled", "Enabled"),
            disabledPill: localize("BBC.autorecMenu.pills.disabled", "Disabled"),
            nonePill: localize("BBC.autorecMenu.pills.none", "None"),
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
     * Attach form controls and delete custom override handlers to application DOM root.
     * Extends template method workflow from BaseCrosshairMenuApplication.
     * @protected
     * @param {HTMLElement} root - Rendered form root element
     * @param {object} context - Prepared rendering context data
     * @param {object} options - Render options
     * @returns {void}
     */
    _attachCustomEventListeners(root, context, options) {
        const rootEl = this._normalizeElement(root);
        if (!rootEl) return;

        // Restore and handle Edit Mode state across re-renders and toggles
        const editToggle = rootEl.querySelector("#bbc-item-edit-mode-toggle");
        const container = rootEl.querySelector(".bbc-autorec-container");
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
                rootEl.querySelectorAll("input:not(#bbc-item-edit-mode-toggle), select:not([name='overrideScope']), textarea, button[type='submit']").forEach(el => {
                    el.disabled = !turningOn;
                });
            };

            syncEditModeControls(this.isEditMode);

            editToggle.addEventListener("change", (ev) => {
                const turningOn = Boolean(ev.currentTarget.checked);
                this.isEditMode = turningOn;
                const hasEmptyCard = Boolean(rootEl.querySelector(".bbc-inspector-empty"));
                if (!turningOn || hasEmptyCard || !this.hasCustom) {
                    this.render(false);
                } else {
                    syncEditModeControls(true);
                }
            });

            // Live-toggle child configuration options and badge text when an override checkbox changes in edit mode
            rootEl.querySelectorAll("input[type='checkbox'][name^='enable']").forEach(chk => {
                chk.addEventListener("change", (ev) => {
                    const fieldName = ev.currentTarget.name;
                    const isChecked = Boolean(ev.currentTarget.checked);
                    rootEl.querySelectorAll(`[data-override-child='${fieldName}']`).forEach(el => {
                        el.style.display = isChecked ? "" : "none";
                    });
                    rootEl.querySelectorAll(`[data-override-badge='${fieldName}']`).forEach(el => {
                        el.textContent = isChecked
                            ? localize("BBC.itemConfigMenu.badgeCustomOverride", "CUSTOM OVERRIDE")
                            : localize("BBC.itemConfigMenu.badgeInherited", "INHERITED");
                    });
                });
            });
        }

        // Handle Target Scope Dropdown Change
        const scopeSelect = rootEl.querySelector("select[name='overrideScope']");
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
        const deleteBtn = rootEl.querySelector("button[data-action='delete-custom']");
        if (deleteBtn) {
            deleteBtn.addEventListener("click", async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (!this.item) {
                    log.warn("ItemCrosshairConfigApplication | Cannot delete custom config: target item is missing.");
                    return;
                }

                const scope = this.selectedScope ?? "item";
                try {
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
                } catch (e) {
                    log.error(`ItemCrosshairConfigApplication | Failed to delete custom configuration from "${this.item.name}":`, e);
                }

                this.render(false);
            });
        }
    }

    /**
     * Extract form inputs and save the custom crosshair override configuration onto item flags.
     * Entry boundary normalized for form input.
     * @param {HTMLFormElement|object} target - Rendered form element or object containing form
     * @returns {Promise<void>} Resolves when custom item flags are saved
     */
    async _saveConfiguration(target) {
        if (!this.item) {
            log.warn("ItemCrosshairConfigApplication | Cannot save configuration: target item is missing.");
            return;
        }

        const form = target instanceof HTMLFormElement ? target : (target?.querySelector?.("form") ?? target);
        if (!(form instanceof HTMLFormElement)) {
            log.warn("ItemCrosshairConfigApplication | Invalid form element passed to _saveConfiguration.");
            return;
        }

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
            showRange: formData.get("showRange") === "on",
            limitRange: formData.get("limitRange") === "on",
            borderColor: String(formData.get("borderColor") ?? "#ffffff").trim(),
            borderAlpha: parseFloat(String(formData.get("borderAlpha") ?? "0")),
            fillColor: String(formData.get("fillColor") ?? "#000000").trim(),
            fillAlpha: parseFloat(String(formData.get("fillAlpha") ?? "0")),
            placedFillColor: String(formData.get("placedFillColor") ?? "").trim(),
            placedFillAlpha: parseFloat(String(formData.get("placedFillAlpha") ?? "0.25")),
            placedBorderColor: String(formData.get("placedBorderColor") ?? "").trim(),
            placedBorderAlpha: parseFloat(String(formData.get("placedBorderAlpha") ?? "0.25")),
            concurrentCode: String(formData.get("concurrentCode") ?? "").trim(),
            postPlacementCode: String(formData.get("postPlacementCode") ?? "").trim(),
            icon: String(formData.get("icon") ?? "").trim()
        };

        const scope = this.selectedScope ?? "item";
        try {
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
        } catch (e) {
            log.error(`ItemCrosshairConfigApplication | Failed to save custom configuration for "${this.item.name}":`, e);
        }

        this.render(false);
    }
}
