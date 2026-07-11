import { MODULE_ID } from "../lib/constants.js";
import { autorecManager as manager } from "./autorecManager.js";
import { systemAdapter } from "../adapter/system/index.js";
import { localize } from "../lib/utils.js";


const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class AutorecMenuApplication extends HandlebarsApplicationMixin(ApplicationV2) {
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

    static PARTS = {
        main: {
            template: `modules/${MODULE_ID}/src/autorec/autorecMenu.html`
        }
    };

    async _prepareContext(options) {
        const entries = manager.getAllEntries();
        const isV14 = typeof game !== "undefined" && (game.release?.generation >= 14 || parseInt(game.version) >= 14);
        const prePlacementTitle = isV14 ? "Pre-Region Placement" : "Pre-Template Placement";
        const placementSectionTitle = isV14 ? "Region Placement Configuration" : "Template Placement Configuration";
        const postPlacementTitle = isV14 ? "Post-Region Placement" : "Post-Template Placement";
        const placementSectionTag = isV14 ? "V14+ Region" : "V13- MeasuredTemplate";
        const docTerm = isV14 ? "region" : "template";

        return {
            entries,
            count: entries.length,
            isEmpty: entries.length === 0,
            isGM: typeof game !== "undefined" ? Boolean(game.user?.isGM) : true,
            supportsActivities: systemAdapter.supportsActivities,
            isV14,

            prePlacementTitle,
            placementSectionTitle,
            postPlacementTitle,
            placementSectionTag,
            docTerm,
            menuHint: localize("BBC.autorecMenu.menuHint")
        };
    }

    _onRender(context, options) {
        super._onRender(context, options);
        this._attachEventListeners(this.element);
    }

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
                const turningOn = ev.currentTarget.checked;
                this._editModeActive = turningOn;
                container.classList.toggle("edit-mode", turningOn);

                // When switching back to non-edit mode, save the page and sync all clients
                if (!turningOn) {
                    this.saveAllEditedConfigurations(root);
                }
            });
        }

        // Add New Workflow Button
        const addWorkflowBtn = root.querySelector(".bbc-add-workflow-btn");
        if (addWorkflowBtn) {
            addWorkflowBtn.addEventListener("click", async () => {
                let result = null;
                const supportsActivities = systemAdapter.supportsActivities;

                try {
                    result = await DialogV2.prompt({
                        window: { title: "Add New Crosshair Workflow" },
                        content: `
                            <form>
                                <div class="form-group">
                                    <label>Workflow Item Name:</label>
                                    <input type="text" name="workflowName" placeholder="e.g. Fireball or Longbow" autofocus />
                                </div>
                                ${supportsActivities ? `
                                <div class="form-group">
                                    <label>Activity ID or Name (Optional):</label>
                                    <input type="text" name="activityName" placeholder="e.g. Attack or Save" />
                                </div>` : ""}
                            </form>
                        `,
                        ok: {
                            label: localize("BBC.autorecMenu.addWorkflow.label", "Add Workflow"),
                            callback: (event, button, html) => {
                                const rootEl = button.form ?? html;
                                const itemInput = rootEl.querySelector ? rootEl.querySelector("input[name='workflowName']") : null;
                                const actInput = supportsActivities && rootEl.querySelector ? rootEl.querySelector("input[name='activityName']") : null;
                                const itemName = itemInput?.value?.trim() || null;
                                const activity = actInput?.value?.trim() || "";
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
                    ui.notifications?.info(localize("BBC.autorecMenu.notify.added", `Added workflow: "${regKey}".`));
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
                    ui.notifications?.warn(localize("BBC.autorecMenu.notify.selectRemove", "Please select one or more workflows to remove."));
                    return;
                }
                const names = [];
                checked.forEach(el => names.push(el.dataset.itemName));
                await manager.unregisterMany(names, { persist: true });
                ui.notifications?.info(localize("BBC.autorecMenu.notify.removedMany", `Removed ${names.length} workflow(s).`));
                this.render(false);
            });
        }

        // Single Remove Workflow button in header
        root.querySelectorAll(".bbc-delete-single-btn").forEach(btn => {
            btn.addEventListener("click", (ev) => {
                const itemName = ev.currentTarget.dataset.itemName;
                if (itemName) {
                    manager.unregister(itemName, { persist: true });
                    manager.broadcastSync();
                    ui.notifications?.info(localize("BBC.autorecMenu.notify.removedOne", `Removed workflow "${itemName}".`));
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
                    ui.notifications?.info(localize("BBC.autorecMenu.notify.copied", `Copied "${text}" to clipboard.`));
                }
            });
        });

        // 5. Initialize Color Swatches
        root.querySelectorAll(".bbc-color-swatch").forEach(el => {
            if (el.dataset.color) {
                el.style.backgroundColor = el.dataset.color;
            }
        });
    }

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

    async saveAllEditedConfigurations(root) {
        let modifiedAny = false;
        root.querySelectorAll(".bbc-inspector-detail").forEach(detailEl => {
            const regKey = detailEl.dataset.itemName;
            if (!regKey) return;

            const existingEntry = manager.registeredHandlers.get(regKey) ?? manager.get(regKey) ?? {};
            const existingHandler = existingEntry.handler ?? existingEntry.config ?? existingEntry;
            const config = foundry.utils.deepClone(typeof existingHandler === "object" ? existingHandler : {});
            let modified = false;

            // Fixed schema properties [data-field]
            detailEl.querySelectorAll("[data-field]").forEach(inputEl => {
                const field = inputEl.dataset.field;
                if (!field) return;

                let val;
                if (inputEl.type === "checkbox") {
                    val = inputEl.checked;
                } else if (inputEl.type === "number") {
                    const parsed = parseFloat(inputEl.value);
                    val = isNaN(parsed) ? undefined : parsed;
                } else {
                    val = inputEl.value;
                    if (val === "" || val === "default") val = undefined;
                    else if (val === "true") val = true;
                    else if (val === "false") val = false;
                }

                if (config[field] !== val) {
                    if (val === undefined) delete config[field];
                    else config[field] = val;
                    modified = true;
                }
            });

            if (modified) {
                manager.register(regKey, config, { persist: false, local: Boolean(config.local) });
                modifiedAny = true;
            }
        });

        if (modifiedAny) {
            const persistedDict = {};
            for (const regKey of manager.list()) {
                const entry = manager.registeredHandlers.get(regKey) ?? manager.get(regKey);
                const handler = entry?.handler ?? entry?.config ?? entry;
                if (handler && typeof handler === "object" && !handler.local && typeof handler !== "function") {
                    persistedDict[regKey] = handler;
                }
            }
            await manager.overwrite(persistedDict);
            ui.notifications?.info(localize("BBC.autorecMenu.notify.saved", "Saved workflow configurations and synced across all clients."));
            this.render(false);
        }
    }

    async _updateObject() {
        return;
    }

}
