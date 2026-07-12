import { MODULE_ID } from "../lib/constants.js";
import { DEFAULT_AUTOREC_ENTRY, autorecManager as manager } from "./autorecManager.js";
import { systemAdapter } from "../adapter/system/index.js";
import { localize, notify } from "../lib/utils.js";
import { crosshairAdapter } from "../adapter/foundry/index.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/**
 * Form application for viewing, modifying, adding, and removing automated crosshair recognition (autorec) workflows.
 * Extends the Foundry V2 Application API with Handlebars template rendering.
 */
export class AutorecMenuApplication extends HandlebarsApplicationMixin(ApplicationV2) {
    /**
     * Default application configuration options.
     * @type {object}
     */
    static DEFAULT_OPTIONS = {
        id: "bbc-autorec-menu",
        tag: "form",
        window: {
            title: "BBC.autorecMenu.title",
            icon: "fa-solid fa-crosshairs",
            resizable: true
        },
        position: {
            width: 860,
            height: 640
        },
        classes: ["bbc-app", "bbc-autorec-form"]
    };

    /**
     * Template parts rendered by the application.
     * @type {object}
     */
    static PARTS = {
        main: {
            template: `modules/${MODULE_ID}/src/autorec/autorecMenu.html`
        }
    };

    /**
     * Prepares the rendering context data for the Autorec menu template.
     * @param {object} options - Application rendering options.
     * @returns {Promise<object>} Context data object passed to the Handlebars template.
     */
    async _prepareContext(options) {
        /**
         * Normalizes a candidate color string to a valid 6-digit hex color or returns a fallback.
         * @param {unknown} val - Candidate color value.
         * @param {string} [fallback="#000000"] - Fallback hex string.
         * @returns {string} Valid 6-digit hex color string.
         */
        const normalizeHexColor = (val, fallback = "#000000") => {
            if (typeof val === "string" && /^#[0-9A-Fa-f]{6}$/.test(val)) return val;
            return fallback;
        };
        const rawEntries = manager.getAllEntries();
        const entries = rawEntries.map(e => ({
            ...e,
            circleFile: e.circleFile ?? DEFAULT_AUTOREC_ENTRY.circleFile,
            coneFile: e.coneFile ?? DEFAULT_AUTOREC_ENTRY.coneFile,
            rayFile: e.rayFile ?? DEFAULT_AUTOREC_ENTRY.rayFile,
            squareFile: e.squareFile ?? DEFAULT_AUTOREC_ENTRY.squareFile,
            lineFile: e.lineFile ?? DEFAULT_AUTOREC_ENTRY.lineFile,
            borderColorPicker: normalizeHexColor(e.borderColor, "#ffffff"),
            fillColorPicker: normalizeHexColor(e.fillColor, "#000000"),
            placedFillColorPicker: normalizeHexColor(e.placedFillColor, "#000000"),
            placedBorderColorPicker: normalizeHexColor(e.placedBorderColor, "#000000")
        }));

        const prePlacementTitle = crosshairAdapter.prePlacementTitle;
        const placementSectionTitle = crosshairAdapter.placementSectionTitle;
        const postPlacementTitle = crosshairAdapter.postPlacementTitle;
        const docTerm = crosshairAdapter.documentTerm;

        const labels = {
            searchPlaceholder: localize("BBC.autorecMenu.labels.searchPlaceholder", "Filter registered workflows (e.g. Fireball)..."),
            editMode: localize("BBC.autorecMenu.labels.editMode", "Edit Mode"),
            registeredWorkflows: localize("BBC.autorecMenu.labels.registeredWorkflows", "Registered Workflows"),
            addBtn: localize("BBC.autorecMenu.labels.addBtn", "Insert"),
            removeBtn: localize("BBC.autorecMenu.labels.removeBtn", "Remove"),
            deleteBtn: localize("BBC.autorecMenu.labels.deleteBtn", "Delete"),
            saveBtn: localize("BBC.autorecMenu.labels.saveBtn", "Save"),

            emptySidebar: localize("BBC.autorecMenu.labels.emptySidebar", "No crosshair animations registered yet."),

            selectWorkflowTitle: localize("BBC.autorecMenu.labels.selectWorkflowTitle", "Select a Registered Workflow"),
            selectWorkflowDesc: localize("BBC.autorecMenu.labels.selectWorkflowDesc", "Click on any item name in the sidebar to inspect its pre-animation, core animation, and post-animation configuration."),
            preSectionDesc: localize("BBC.autorecMenu.labels.preSectionDesc", `Executes custom Javascript code before starting ${docTerm} placement selection.`),

            noScript: localize("BBC.autorecMenu.labels.noScript", "No custom script configured"),
            animationTitle: localize("BBC.autorecMenu.labels.animationTitle", "Animation Configuration"),
            animationDesc: localize("BBC.autorecMenu.labels.animationDesc", "Sequencer crosshair graphic asset and interactive rendering properties."),
            workflowEnabled: localize("BBC.autorecMenu.labels.workflowEnabled", "Workflow Enabled"),
            callingItemName: localize("BBC.autorecMenu.labels.callingItemName", "Calling Item Name"),
            callingActivity: localize("BBC.autorecMenu.labels.callingActivity", "Calling Activity ID / Name (DnD5e)"),
            registrationScope: localize("BBC.autorecMenu.labels.registrationScope", "Registration Scope"),
            circleFile: localize("BBC.autorecMenu.labels.circleFile", "Circle Sequencer Filepath"),
            coneFile: localize("BBC.autorecMenu.labels.coneFile", "Cone Sequencer Filepath"),
            rayFile: localize("BBC.autorecMenu.labels.rayFile", "Ray Sequencer Filepath"),
            squareFile: localize("BBC.autorecMenu.labels.squareFile", "Square Sequencer Filepath"),
            customHandler: localize("BBC.autorecMenu.labels.customHandler", "Custom Function Handler"),
            lockToToken: localize("BBC.autorecMenu.labels.lockToToken", "Lock to Token (Stick)"),
            originLine: localize("BBC.autorecMenu.labels.originLine", "Origin Stretch Line"),
            borderStyling: localize("BBC.autorecMenu.labels.borderStyling", "Border Styling (Tile Highlight)"),
            fillStyling: localize("BBC.autorecMenu.labels.fillStyling", "Fill Styling (Tile Highlight)"),
            customIcon: localize("BBC.autorecMenu.labels.customIcon", "Custom Cursor Icon"),
            placedSectionDesc: localize("BBC.autorecMenu.labels.placedSectionDesc", `Configures the fill color, border color, and alpha opacities of the final placed ${docTerm} document on the canvas.`),
            placedFill: localize("BBC.autorecMenu.labels.placedFill", "Placed Fill Styling"),
            placedBorder: localize("BBC.autorecMenu.labels.placedBorder", "Placed Border Styling"),
            defaultPlacementNote: localize("BBC.autorecMenu.labels.defaultPlacementNote", "Using default Foundry / Game System placement colors (Enable Edit Mode to customize)."),
            postSectionDesc: localize("BBC.autorecMenu.labels.postSectionDesc", `Executes custom Javascript code after final ${docTerm} document creation.`),
            noPreScript: localize("BBC.autorecMenu.labels.noPreScript", "No custom pre-placement script configured"),
            noPostScript: localize("BBC.autorecMenu.labels.noPostScript", "No custom post-placement script configured"),
            enabledPill: localize("BBC.autorecMenu.pills.enabled", "Enabled"),
            disabledPill: localize("BBC.autorecMenu.pills.disabled", "Disabled"),
            allActivitiesPill: localize("BBC.autorecMenu.pills.allActivities", "All Activities"),
            localOnlyPill: localize("BBC.autorecMenu.pills.localOnly", "Local Only (Session Scope)"),
            worldSyncedPill: localize("BBC.autorecMenu.pills.worldSynced", "World Synced (Persisted)"),
            yesCustomScript: localize("BBC.autorecMenu.pills.yesCustomScript", "Yes (Custom Script)"),
            noDeclarative: localize("BBC.autorecMenu.pills.noDeclarative", "No (Declarative Config)"),
            stickOn: localize("BBC.autorecMenu.pills.stickOn", "On (Locked to Origin Token)"),
            stickOff: localize("BBC.autorecMenu.pills.stickOff", "Off (Free Cursor Placement)"),
            stickDefault: localize("BBC.autorecMenu.pills.stickDefault", "Default (Cone: On, Others: Off)"),
            showLineLabel: localize("BBC.autorecMenu.labels.showLine", "Show Line"),
            alphaLabel: localize("BBC.autorecMenu.labels.alpha", "Alpha:"),
            selectToRemoveHint: localize("BBC.autorecMenu.hints.selectToRemove", "Select workflow to remove"),
            globalFallbackHint: localize("BBC.autorecMenu.hints.globalFallback", "Global Fallback Entry"),
            activityHintPrefix: localize("BBC.autorecMenu.hints.activityPrefix", "Activity: "),
            deleteWorkflowHint: localize("BBC.autorecMenu.hints.deleteWorkflow", "Delete Workflow"),
            localOnlyHint: localize("BBC.autorecMenu.hints.localOnly", "Local Only (Session Scope)"),
            globalFallbackBadge: localize("BBC.autorecMenu.badges.globalFallback", "Global Fallback"),
            localBadge: localize("BBC.autorecMenu.badges.local", "Local"),
            defaultBadge: localize("BBC.autorecMenu.badges.default", "DEFAULT")
        };

        return {
            entries,
            count: entries.length,
            isEmpty: entries.length === 0,
            isGM: typeof game !== "undefined" ? Boolean(game.user?.isGM) : true,
            supportsActivities: Boolean(systemAdapter.supportsActivities),
            prePlacementTitle,
            placementSectionTitle,
            postPlacementTitle,
            docTerm,
            labels,
            menuHint: localize("BBC.autorecMenu.menuHint")
        };
    }

    /**
     * Lifecycle hook executed after rendering completes. Attaches interactive DOM event listeners.
     * @param {object} context - Prepared rendering context data.
     * @param {object} options - Render options provided during rendering.
     * @returns {void}
     */
    _onRender(context, options) {
        super._onRender(context, options);
        this._attachEventListeners(this.element);
    }

    /**
     * Attaches interactive event handlers to elements within the rendered application DOM.
     * @param {HTMLElement} root - Root HTML element of the rendered application form.
     * @returns {void}
     */
    _attachEventListeners(root) {
        if (!root) return;

        // Restore Edit Mode state across re-renders
        const editToggle = root.querySelector("#bbc-edit-mode-toggle");
        const container = root.querySelector(".bbc-autorec-container");
        if (editToggle && container) {
            if (this._editModeActive) {
                editToggle.checked = true;
                container.classList.add("edit-mode");
            }

            editToggle.addEventListener("change", (ev) => {
                const turningOn = Boolean(ev.currentTarget.checked);
                this._editModeActive = turningOn;
                container.classList.toggle("edit-mode", turningOn);
            });
        }

        // Add New Workflow Button
        const addWorkflowBtn = root.querySelector(".bbc-add-workflow-btn");
        if (addWorkflowBtn) {
            addWorkflowBtn.addEventListener("click", async () => {
                let result = null;
                const supportsActivities = Boolean(systemAdapter.supportsActivities);

                try {
                    result = await DialogV2.prompt({
                        window: { title: localize("BBC.autorecMenu.addWorkflow.title", "Add New Crosshair Workflow") },
                        content: `
                            <form>
                                <div class="form-group">
                                    <label>${localize("BBC.autorecMenu.addWorkflow.itemName", "Workflow Item Name:")}</label>
                                    <input type="text" name="workflowName" placeholder="${localize("BBC.autorecMenu.addWorkflow.itemNameHint", "e.g. Fireball or Longbow")}" autofocus />
                                </div>
                                ${supportsActivities ? `
                                <div class="form-group">
                                    <label>${localize("BBC.autorecMenu.addWorkflow.activityName", "Activity ID or Name (Optional):")}</label>
                                    <input type="text" name="activityName" placeholder="${localize("BBC.autorecMenu.addWorkflow.activityNameHint", "e.g. Attack or Save")}" />
                                </div>` : ""}
                            </form>
                        `,
                        ok: {
                            label: localize("BBC.autorecMenu.addWorkflow.label", "Add Workflow"),
                            callback: (event, button, html) => {
                                const rootEl = button.form ?? html;
                                const itemInput = rootEl.querySelector ? rootEl.querySelector("input[name='workflowName']") : null;
                                const actInput = supportsActivities && rootEl.querySelector ? rootEl.querySelector("input[name='activityName']") : null;
                                const trimmedName = itemInput?.value?.trim() ?? "";
                                const itemName = trimmedName !== "" ? trimmedName : null;
                                const activity = actInput?.value?.trim() ?? "";
                                return itemName ? { itemName, activity } : null;
                            }
                        }
                    });
                } catch (e) {
                    result = null;
                }

                if (!result || !result.itemName) return;
                const { itemName, activity } = result;
                const regKey = activity ? `${itemName} | ${activity}` : itemName;

                if (!manager.has(regKey)) {
                    const config = activity ? { itemName, activityId: activity, activityName: activity } : { itemName };
                    manager.register(regKey, config, { persist: true });
                    manager.broadcastSync();
                    notify.info(localize("BBC.autorecMenu.notify.added", `Added workflow: "${regKey}".`));
                }

                this.selectItem(root, regKey);
                this.render(false);
            });
        }

        // Prevent checkbox click from switching sidebar tab
        root.querySelectorAll(".bbc-item-select-checkbox").forEach(chk => {
            chk.addEventListener("click", (ev) => ev.stopPropagation());
        });

        // Batch Remove Selected Workflows
        const removeSelectedBtn = root.querySelector(".bbc-remove-selected-btn");
        if (removeSelectedBtn) {
            removeSelectedBtn.addEventListener("click", async () => {
                const checked = root.querySelectorAll(".bbc-item-select-checkbox:checked");
                if (checked.length === 0) {
                    notify.warn(localize("BBC.autorecMenu.notify.selectRemove", "Please select one or more workflows to remove."));
                    return;
                }
                const names = [];
                checked.forEach(el => names.push(el.dataset.itemName));
                await manager.unregisterMany(names, { persist: true });
                notify.info(localize("BBC.autorecMenu.notify.removedMany", `Removed ${names.length} workflow(s).`));
                this.render(false);
            });
        }

        // Single Save Workflow button in header and footer
        root.querySelectorAll(".bbc-save-single-btn").forEach(btn => {
            btn.addEventListener("click", async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const itemName = ev.currentTarget.dataset.itemName;
                if (itemName) {
                    await this.saveSingleConfiguration(root, itemName);
                }
            });
        });

        // Single Remove Workflow button in header
        root.querySelectorAll(".bbc-delete-single-btn").forEach(btn => {
            btn.addEventListener("click", (ev) => {
                const itemName = ev.currentTarget.dataset.itemName;
                if (itemName) {
                    manager.unregister(itemName, { persist: true });
                    manager.broadcastSync();
                    notify.info(localize("BBC.autorecMenu.notify.removedOne", `Removed workflow "${itemName}".`));
                    this.render(false);
                }
            });
        });

        // 1. Search Filter
        const searchInput = root.querySelector("#bbc-autorec-search");
        const cards = root.querySelectorAll(".bbc-item-card");

        if (searchInput) {
            searchInput.addEventListener("input", (ev) => {
                const query = (ev.target.value ?? "").toLowerCase().trim();
                cards.forEach(el => {
                    const name = el.dataset.itemName?.toLowerCase() ?? "";
                    el.style.display = (!query || name.includes(query)) ? "flex" : "none";
                });
            });
        }

        // 2. Sidebar Item Selection
        cards.forEach(card => {
            card.addEventListener("click", (ev) => {
                const itemName = ev.currentTarget.dataset.itemName;
                this.selectItem(root, itemName);
            });
        });

        // Restore previously selected item across re-renders (including leaving Edit Mode)
        if (this._selectedItemName) {
            this.selectItem(root, this._selectedItemName);
        }

        // 3. Expandable Section Accordions
        root.querySelectorAll(".bbc-section-header").forEach(header => {
            header.addEventListener("click", (ev) => {
                const h = ev.currentTarget;
                const body = h.nextElementSibling;
                const icon = h.querySelector(".bbc-chevron");

                if (body && body.classList.contains("bbc-section-body")) {
                    const isHidden = body.style.display === "none";
                    body.style.display = isHidden ? "block" : "none";
                    if (icon) {
                        icon.style.transform = isHidden ? "rotate(0deg)" : "rotate(-90deg)";
                    }
                }
            });
        });

        // 4. Copy Path Action
        root.querySelectorAll(".bbc-copy-btn").forEach(btn => {
            btn.addEventListener("click", (ev) => {
                const text = ev.currentTarget.dataset.copyText;
                if (text && navigator.clipboard) {
                    navigator.clipboard.writeText(text);
                    notify.info(localize("BBC.autorecMenu.notify.copied", `Copied "${text}" to clipboard.`));
                }
            });
        });

        // 5. Initialize Color Swatches
        root.querySelectorAll(".bbc-color-swatch").forEach(el => {
            if (el.dataset.color) {
                el.style.backgroundColor = el.dataset.color;
            }
        });

        // 6. Synchronize HTML color pickers with adjacent text inputs across both input and change events
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

        // 7. Synchronize text inputs back to adjacent HTML color pickers when valid hex entered
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
    }

    /**
     * Highlights the selected item in the sidebar and displays its configuration panel in the inspector view.
     * @param {HTMLElement} root - Root HTML element of the rendered application form.
     * @param {string} itemName - Registration key or name of the workflow item to select.
     * @returns {void}
     */
    selectItem(root, itemName) {
        if (!root || !itemName) return;
        this._selectedItemName = itemName;

        const cards = root.querySelectorAll(".bbc-item-card");
        const details = root.querySelectorAll(".bbc-inspector-detail");
        const emptyState = root.querySelector(".bbc-inspector-empty");

        let found = false;
        cards.forEach(c => {
            if (c.dataset.itemName === itemName) {
                c.classList.add("active");
                found = true;
            } else {
                c.classList.remove("active");
            }
        });

        if (found) {
            if (emptyState) emptyState.style.display = "none";
            details.forEach(d => {
                d.style.display = (d.dataset.itemName === itemName) ? "flex" : "none";
            });
        }
    }

    /**
     * Saves configuration changes for only the currently specified workflow item and syncs across connected clients.
     * @param {HTMLElement} root - Root HTML element of the rendered application form.
     * @param {string} regKey - Registration key or item name to save.
     * @returns {Promise<void>}
     */
    async saveSingleConfiguration(root, regKey) {
        if (!root || !regKey) return;
        const detailEl = root.querySelector(`.bbc-inspector-detail[data-item-name="${CSS.escape(regKey)}"]`);
        if (!detailEl) return;

        const existingEntry = manager.registeredHandlers.get(regKey) ?? manager.get(regKey) ?? {};
        const existingHandler = existingEntry.handler ?? existingEntry.config ?? existingEntry;
        const config = foundry.utils.deepClone(typeof existingHandler === "object" ? existingHandler : {});
        let modified = false;

        detailEl.querySelectorAll("[data-field]").forEach(inputEl => {
            const field = inputEl.dataset.field;
            if (!field) return;

            let val;
            if (inputEl.type === "checkbox") {
                val = Boolean(inputEl.checked);
            } else if (inputEl.type === "number") {
                const parsed = parseFloat(inputEl.value);
                val = isNaN(parsed) ? undefined : parsed;
            } else {
                val = inputEl.value ?? "";
                if (typeof val === "string" && (field === "concurrentCode" || field === "postPlacementCode")) {
                    val = val.trim();
                }
                if (inputEl.tagName === "SELECT" && val === "default") val = undefined;
                else if (val === "true") val = true;
                else if (val === "false") val = false;
            }

            if (config[field] !== val) {
                config[field] = val;
                modified = true;
            }
        });

        if (modified) {
            manager.register(regKey, config, { persist: false, local: Boolean(config.local) });
        }

        const persistedDict = {};
        for (const k of manager.list()) {
            const entry = manager.registeredHandlers.get(k) ?? manager.get(k);
            const handler = entry?.handler ?? entry?.config ?? entry;
            if (handler && typeof handler === "object" && !handler.local && typeof handler !== "function") {
                persistedDict[k] = handler;
            }
        }
        await manager.overwrite(persistedDict);
        notify.info(localize("BBC.autorecMenu.notify.savedOne", `Saved workflow "${regKey}".`));
        this.render(false);
    }

    /**
     * Handles standard form submission lifecycle. Configuration changes are saved explicitly on Edit Mode exit.
     * @param {Event} [event] - Form submission event.
     * @param {object} [formData] - Form submission data object.
     * @returns {Promise<void>}
     */
    async _updateObject(event, formData) {
        return;
    }
}
