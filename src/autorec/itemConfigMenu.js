import { MODULE_ID } from "../lib/constants.js";
import { DEFAULT_AUTOREC_ENTRY, autorecManager } from "./autorecManager.js";
import { log } from "../lib/logger.js";
import { localize, notify } from "../lib/utils.js";
import { systemAdapter } from "../adapter/system/index.js";
import { BaseCrosshairMenuApplication, normalizeHexColor } from "./BaseCrosshairMenuApplication.js";

/**
 * Inspect a custom configuration object to determine active override flags and override count.
 * Disabled by default for all sections when configuration is empty or fresh.
 * @param {object|null} customConfig - Stored custom configuration object or null
 * @returns {{hasCustom: boolean, enablePrePlacement: boolean, enableAnimation: boolean, enablePlacedStyling: boolean, enablePostPlacement: boolean, overrideCount: number}} Inspected override state
 */
function inspectScopeCustomState(customConfig) {
    if (!customConfig || typeof customConfig !== "object") {
        return {
            hasCustom: false,
            enablePrePlacement: false,
            enableAnimation: false,
            enablePlacedStyling: false,
            enablePostPlacement: false,
            overrideCount: 0
        };
    }

    const hasGranularFlags = Boolean(
        "enableAnimation" in customConfig ||
        "enablePrePlacement" in customConfig ||
        "enablePlacedStyling" in customConfig ||
        "enablePostPlacement" in customConfig
    );

    const enablePrePlacement = hasGranularFlags
        ? Boolean(customConfig.enablePrePlacement)
        : Boolean(customConfig.concurrentCode);

    const enableAnimation = hasGranularFlags
        ? Boolean(customConfig.enableAnimation)
        : Boolean(
            customConfig.enabled &&
            (customConfig.circleFile ||
                customConfig.coneFile ||
                customConfig.rayFile ||
                customConfig.rectangleFile ||
                customConfig.squareFile ||
                customConfig.showLine !== undefined ||
                customConfig.stickToToken !== undefined)
        );

    const enablePlacedStyling = hasGranularFlags
        ? Boolean(customConfig.enablePlacedStyling)
        : Boolean(customConfig.placedFillColor || customConfig.placedBorderColor || customConfig.persist);

    const enablePostPlacement = hasGranularFlags
        ? Boolean(customConfig.enablePostPlacement)
        : Boolean(customConfig.postPlacementCode);

    const overrideCount = (enablePrePlacement ? 1 : 0) +
        (enableAnimation ? 1 : 0) +
        (enablePlacedStyling ? 1 : 0) +
        (enablePostPlacement ? 1 : 0);

    return {
        hasCustom: overrideCount > 0,
        enablePrePlacement,
        enableAnimation,
        enablePlacedStyling,
        enablePostPlacement,
        overrideCount
    };
}

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
            width: 820,
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

        const itemCustomConfig = item?.getFlag(MODULE_ID, "customConfig") ?? null;
        const activityConfigs = item?.getFlag(MODULE_ID, "activityConfigs") ?? {};
        const autorecMatch = autorecManager.getEntryByName(itemName);
        const isGlobalAutorec = Boolean(autorecMatch) && !autorecMatch.isDefault && autorecMatch.enabled;

        const itemCustomState = inspectScopeCustomState(itemCustomConfig);
        const itemScope = {
            id: "item",
            name: itemName,
            type: "item",
            subLabel: localize("BBC.itemConfigMenu.itemLevelScope", "Item Level"),
            icon: "fa-solid fa-cube",
            hasCustom: itemCustomState.hasCustom,
            isAutorec: !itemCustomState.hasCustom && isGlobalAutorec,
            isDefault: !itemCustomState.hasCustom && !isGlobalAutorec,
            overrideCount: itemCustomState.overrideCount,
            isSelected: this.selectedScope === "item"
        };

        const scopes = [itemScope];
        if (systemAdapter.supportsActivities && item?.system?.activities) {
            for (const act of item.system.activities.values()) {
                if (!act?.id) continue;
                const actCustomConfig = activityConfigs[act.id] ?? null;
                const actCustomState = inspectScopeCustomState(actCustomConfig);
                const actType = act.type ? `${act.type.charAt(0).toUpperCase() + act.type.slice(1)} Activity` : "Activity";
                scopes.push({
                    id: act.id,
                    name: act.name ?? act.id,
                    type: "activity",
                    subLabel: actType,
                    icon: "fa-solid fa-bolt",
                    hasCustom: actCustomState.hasCustom,
                    isAutorec: !actCustomState.hasCustom && isGlobalAutorec,
                    isDefault: !actCustomState.hasCustom && !isGlobalAutorec,
                    overrideCount: actCustomState.overrideCount,
                    isSelected: this.selectedScope === act.id
                });
            }
        }

        let currentScope = scopes.find(s => s.id === this.selectedScope);
        if (!currentScope) {
            this.selectedScope = "item";
            currentScope = itemScope;
            itemScope.isSelected = true;
        }

        const hasAnyCustom = scopes.some(s => s.hasCustom);
        const isAutorec = !hasAnyCustom && isGlobalAutorec;

        const currentCustomConfig = currentScope.id === "item"
            ? itemCustomConfig
            : (activityConfigs[currentScope.id] ?? null);
        const currentCustomState = inspectScopeCustomState(currentCustomConfig);
        this.hasCustom = currentCustomState.hasCustom;

        const baseFallback = currentScope.id === "item"
            ? (autorecMatch ?? DEFAULT_AUTOREC_ENTRY)
            : { ...(autorecMatch ?? DEFAULT_AUTOREC_ENTRY), ...(itemCustomConfig ?? {}) };

        const scopeHint = currentScope.id === "item"
            ? localize("BBC.itemConfigMenu.scopeHintItem", "Configuring default overrides for this entire item.")
            : localize("BBC.itemConfigMenu.scopeHintActivity", `Configuring granular overrides specific to "${currentScope.name}" (takes priority over item overrides).`);

        const source = {
            ...DEFAULT_AUTOREC_ENTRY,
            ...baseFallback,
            ...(currentCustomConfig ?? {})
        };

        const stickToTokenValue = source.stickToToken ?? "default";

        const mergedConfig = {
            ...source,
            enablePrePlacement: currentCustomState.enablePrePlacement,
            enableAnimation: currentCustomState.enableAnimation,
            enablePlacedStyling: currentCustomState.enablePlacedStyling,
            enablePostPlacement: currentCustomState.enablePostPlacement,

            concurrentCode: (source.concurrentCode ?? "").trim(),
            postPlacementCode: (source.postPlacementCode ?? "").trim(),

            enabled: Boolean(source.enabled ?? true),
            circleFile: source.circleFile ?? DEFAULT_AUTOREC_ENTRY.circleFile,
            coneFile: source.coneFile ?? DEFAULT_AUTOREC_ENTRY.coneFile,
            rayFile: source.rayFile ?? DEFAULT_AUTOREC_ENTRY.rayFile,
            rectangleFile: source.rectangleFile ?? source.squareFile ?? DEFAULT_AUTOREC_ENTRY.rectangleFile,
            lineFile: source.lineFile ?? DEFAULT_AUTOREC_ENTRY.lineFile,
            stickToToken: stickToTokenValue,
            showLine: Boolean(source.showLine),
            showRange: Boolean(source.showRange),
            limitRange: Boolean(source.limitRange),
            borderColor: source.borderColor ?? "#ffffff",
            borderAlpha: source.borderAlpha ?? 0,
            fillColor: source.fillColor ?? "#000000",
            fillAlpha: source.fillAlpha ?? 0,

            placedFillColor: source.placedFillColor ?? "#000000",
            placedFillAlpha: source.placedFillAlpha ?? 0.25,
            placedBorderColor: source.placedBorderColor ?? "#ffffff",
            placedBorderAlpha: source.placedBorderAlpha ?? 0.25,
            persist: Boolean(source.persist),

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
                (source.placedBorderAlpha !== undefined && source.placedBorderAlpha !== 0.25) ||
                Boolean(source.persist)
            )
        };

        const { docTerm, prePlacementTitle, placementSectionTitle, postPlacementTitle } = this._getAdapterTitles();

        const labels = {
            badgeCustom: localize("BBC.itemConfigMenu.badges.custom", "CUSTOM"),
            badgeAutorec: localize("BBC.itemConfigMenu.badges.autorec", "AUTOREC"),
            badgeDefault: localize("BBC.itemConfigMenu.badges.default", "DEFAULT"),
            badgeInherited: localize("BBC.itemConfigMenu.badgeInherited", "INHERITED"),
            deleteCustomBtn: localize("BBC.itemConfigMenu.deleteCustomBtn", "Delete Custom Override"),
            saveCustomBtn: localize("BBC.itemConfigMenu.saveCustomBtn", "Save"),
            editMode: localize("BBC.autorecMenu.labels.editMode", "Edit Mode"),

            overridePrePlacement: localize("BBC.itemConfigMenu.overridePrePlacement", "Override Pre-Placement Script"),
            overrideAnimation: localize("BBC.itemConfigMenu.overrideAnimation", "Override Animation Configuration"),
            overridePlacedStyling: localize("BBC.itemConfigMenu.overridePlacedStyling", "Override Placed Document Styling"),
            overridePostPlacement: localize("BBC.itemConfigMenu.overridePostPlacement", "Override Post-Placement Script"),
            overrideCheckboxLabel: localize("BBC.itemConfigMenu.overrideCheckboxLabel", "Override Global Autorec Settings"),

            badgeCustomOverride: localize("BBC.itemConfigMenu.badgeCustomOverride", "CUSTOM OVERRIDE"),

            preSectionDesc: localize("BBC.itemConfigMenu.preSectionDesc", `Executes custom Javascript code before starting ${docTerm} placement selection.`),
            animationDesc: localize("BBC.itemConfigMenu.animationDesc", "Sequencer crosshair graphic asset and interactive rendering properties."),
            placedSectionDesc: localize("BBC.itemConfigMenu.placedSectionDesc", `Configure fill and border highlight colors applied to the created ${docTerm}.`),
            postSectionDesc: localize("BBC.itemConfigMenu.postSectionDesc", `Executes custom Javascript code immediately after the ${docTerm} document is created on the canvas.`),
            noPreScript: localize("BBC.itemConfigMenu.noPreScript", "No custom pre-placement script configured"),
            noPostScript: localize("BBC.itemConfigMenu.noPostScript", "No custom post-placement script configured"),

            inheritingAutorecTitle: localize("BBC.itemConfigMenu.inheritingAutorecTitle", "Inheriting Global Autorec"),
            inheritingAutorecDesc: localize("BBC.itemConfigMenu.inheritingAutorecDesc", `This ${currentScope.type === "item" ? "item" : "activity"} is currently inheriting configuration from the registered Global Autorec workflow "${autorecMatch?.itemName ?? "Unknown"}". Toggle Edit Mode above to customize overrides.`),
            noCustomOverridesTitle: localize("BBC.itemConfigMenu.noCustomOverridesTitle", "No Custom Overrides Set"),
            noCustomOverridesDesc: localize("BBC.itemConfigMenu.noCustomOverridesDesc", `This ${currentScope.type === "item" ? "item" : "activity"} is currently using default crosshair placement settings. Toggle Edit Mode above to configure custom overrides.`),

            animationTitle: localize("BBC.autorecMenu.labels.animationTitle", "Animation Configuration"),
            workflowDetails: localize("BBC.autorecMenu.labels.workflowDetails", "Workflow Details"),
            workflowEnabled: localize("BBC.autorecMenu.labels.workflowEnabled", "Workflow Enabled"),
            enableBtn: localize("BBC.autorecMenu.labels.enableBtn", "Enable"),
            circleFile: localize("BBC.autorecMenu.labels.circleFile", "Circle Sequencer Filepath"),
            coneFile: localize("BBC.autorecMenu.labels.coneFile", "Cone Sequencer Filepath"),
            rayFile: localize("BBC.autorecMenu.labels.rayFile", "Ray Sequencer Filepath"),
            rectangleFile: localize("BBC.autorecMenu.labels.rectangleFile", "Rectangle Sequencer Filepath"),
            lockToToken: localize("BBC.autorecMenu.labels.lockToToken", "Lock to Token (Stick)"),
            originLine: localize("BBC.autorecMenu.labels.originLine", "Origin Stretch Line"),
            showLineLabel: localize("BBC.autorecMenu.labels.showLine", "Show Line"),
            showRange: localize("BBC.autorecMenu.labels.showRange", "Show Detached Distance"),
            showRangeLabel: localize("BBC.autorecMenu.labels.showRangeLabel", "Display live distance measurement at cursor"),
            limitRange: localize("BBC.autorecMenu.labels.limitRange", "Limit Placement Range"),
            limitRangeLabel: localize("BBC.autorecMenu.labels.limitRangeLabel", "Restrict crosshair placement within calling item's maximum range"),
            borderStyling: localize("BBC.autorecMenu.labels.borderStyling", "Border Styling (Tile Highlight)"),
            fillStyling: localize("BBC.autorecMenu.labels.fillStyling", "Fill Styling (Tile Highlight)"),
            placedFill: localize("BBC.autorecMenu.labels.placedFill", "Placed Fill Color"),
            placedBorder: localize("BBC.autorecMenu.labels.placedBorder", "Placed Border Color"),
            persistEffect: localize("BBC.autorecMenu.labels.persistEffect", "Persistent Animation"),
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
            hasAnyCustom,
            isAutorec,
            isEditMode,
            scopes,
            currentScope,
            autorecMatchName: autorecMatch?.itemName ?? "",
            config: mergedConfig,
            scopeHint,
            selectedScope: this.selectedScope,
            showOverrides: true,
            showActivityIdentification: false,

            prePlacementTitle,
            placementSectionTitle,
            postPlacementTitle,
            labels
        };
    }

    /**
     * Attach form controls, sidebar scope selection, and delete override handlers to application DOM root.
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
                rootEl.querySelectorAll("input:not(#bbc-item-edit-mode-toggle), textarea, button[type='submit']").forEach(el => {
                    el.disabled = !turningOn;
                });
            };

            syncEditModeControls(this.isEditMode);

            editToggle.addEventListener("change", (ev) => {
                this.isEditMode = Boolean(ev.currentTarget.checked);
                this.render(false);
            });
        }

        // Handle Sidebar Scope Card Selection Click
        rootEl.querySelectorAll(".bbc-item-card[data-scope]").forEach(card => {
            card.addEventListener("click", (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const scope = card.getAttribute("data-scope");
                if (scope && scope !== this.selectedScope) {
                    this.selectedScope = scope;
                    this.render(false);
                }
            });
        });

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
        const enablePrePlacement = formData.get("enablePrePlacement") === "on";
        const enableAnimation = formData.get("enableAnimation") === "on";
        const enablePlacedStyling = formData.get("enablePlacedStyling") === "on";
        const enablePostPlacement = formData.get("enablePostPlacement") === "on";
        const hasAnyOverride = enablePrePlacement || enableAnimation || enablePlacedStyling || enablePostPlacement;

        const config = {
            enablePrePlacement,
            enableAnimation,
            enablePlacedStyling,
            enablePostPlacement,
            enabled: true,

            circleFile: String(formData.get("circleFile") ?? "").trim(),
            coneFile: String(formData.get("coneFile") ?? "").trim(),
            rayFile: String(formData.get("rayFile") ?? "").trim(),
            rectangleFile: String(formData.get("rectangleFile") ?? formData.get("squareFile") ?? "").trim(),
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
            persist: formData.get("persist") === "on",
            concurrentCode: String(formData.get("concurrentCode") ?? "").trim(),
            postPlacementCode: String(formData.get("postPlacementCode") ?? "").trim()
        };

        const scope = this.selectedScope ?? "item";
        try {
            if (scope === "item") {
                if (!hasAnyOverride) {
                    log.debug(`ItemCrosshairConfigApplication | All overrides disabled for "${this.item.name}", removing custom item-level flag.`);
                    await this.item.unsetFlag(MODULE_ID, "customConfig");
                } else {
                    log.debug(`ItemCrosshairConfigApplication | Saving custom item-level configuration for "${this.item.name}":`, config);
                    await this.item.setFlag(MODULE_ID, "customConfig", config);
                }
                notify.info(localize("BBC.itemConfigMenu.savedItemCustom", `Saved custom Item-level crosshair configuration for "${this.item.name}".`));
            } else {
                const existingMap = foundry.utils.deepClone(this.item.getFlag(MODULE_ID, "activityConfigs") ?? {});
                if (!hasAnyOverride) {
                    log.debug(`ItemCrosshairConfigApplication | All overrides disabled for activity "${scope}" on "${this.item.name}", removing custom activity flag.`);
                    delete existingMap[scope];
                    if (Object.keys(existingMap).length === 0) {
                        await this.item.unsetFlag(MODULE_ID, "activityConfigs");
                    } else {
                        await this.item.setFlag(MODULE_ID, "activityConfigs", existingMap);
                    }
                } else {
                    log.debug(`ItemCrosshairConfigApplication | Saving custom activity-level configuration (${scope}) for "${this.item.name}":`, config);
                    existingMap[scope] = config;
                    await this.item.setFlag(MODULE_ID, "activityConfigs", existingMap);
                }
                notify.info(localize("BBC.itemConfigMenu.savedActivityCustom", `Saved custom Activity-level crosshair configuration for "${this.item.name}".`));
            }
        } catch (e) {
            log.error(`ItemCrosshairConfigApplication | Failed to save custom configuration for "${this.item.name}":`, e);
        }

        this.render(false);
    }
}
