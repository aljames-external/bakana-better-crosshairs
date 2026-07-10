import { MODULE_ID } from "../lib/constants.js";
import { log } from "../lib/logger.js";
import { manager } from "../lib/templates.js";
import { localize } from "../lib/utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications?.api || {};

const BaseApplication = (ApplicationV2 && HandlebarsApplicationMixin)
    ? HandlebarsApplicationMixin(ApplicationV2)
    : (window.FormApplication || window.Application);

export class AutorecMenuApplication extends BaseApplication {
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

    static get defaultOptions() {
        if (super.defaultOptions) {
            return foundry.utils.mergeObject(super.defaultOptions, {
                id: "bbc-autorec-menu",
                title: "BBC.autorecMenu.title",
                template: `modules/${MODULE_ID}/src/autorec/autorecMenu.html`,
                classes: ["bbc-app", "bbc-autorec-form"],
                width: 860,
                height: 640,
                resizable: true,
                closeOnSubmit: false
            });
        }
        return {};
    }

    render(force = false, options = {}) {
        if (typeof force === "object" && force !== null) {
            options = force;
            force = options.force ?? false;
        } else if (typeof force === "boolean") {
            options = { ...options, force };
        }
        return super.render(options);
    }

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
            isV14,
            prePlacementTitle,
            placementSectionTitle,
            postPlacementTitle,
            placementSectionTag,
            docTerm,
            menuHint: localize("BBC.autorecMenu.menuHint")
        };
    }

    async getData(options) {
        return this._prepareContext(options);
    }

    _onRender(context, options) {
        if (super._onRender) super._onRender(context, options);
        this._attachEventListeners(this.element);
    }

    activateListeners(html) {
        if (super.activateListeners) super.activateListeners(html);
        const root = html && html[0] ? html[0] : (this.element || html);
        this._attachEventListeners(root);
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
                const DialogClass = window.Dialog || foundry.applications?.api?.DialogV2;
                let newName = null;

                if (typeof DialogClass === "function" && DialogClass.prompt) {
                    try {
                        newName = await DialogClass.prompt({
                            title: "Add New Crosshair Workflow",
                            content: `
                                <form>
                                    <div class="form-group">
                                        <label>Workflow Item Name:</label>
                                        <input type="text" name="workflowName" placeholder="e.g. Fireball or Longbow" autofocus />
                                    </div>
                                </form>
                            `,
                            label: "Add Workflow",
                            callback: (html) => {
                                const input = html[0]?.querySelector ? html[0].querySelector("input[name='workflowName']") : (html.querySelector ? html.querySelector("input[name='workflowName']") : null);
                                return input?.value?.trim() || null;
                            }
                        });
                    } catch (e) {
                        newName = null;
                    }
                } else {
                    newName = window.prompt("Enter new crosshair workflow Item Name:");
                }

                if (!newName || !newName.trim()) return;
                newName = newName.trim();

                if (!manager.has(newName)) {
                    manager.register(newName, {}, { persist: true });
                    manager.broadcastSync();
                    ui.notifications?.info(`Added workflow: "${newName}".`);
                }

                this.selectItem(root, newName);
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
                    ui.notifications?.warn("Please select one or more workflows to remove.");
                    return;
                }
                const names = [];
                checked.forEach(el => names.push(el.dataset.itemName));
                await manager.unregisterMany(names, { persist: true });
                ui.notifications?.info(`Removed ${names.length} workflow(s).`);
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
                    ui.notifications?.info(`Removed workflow "${itemName}".`);
                    this.render(false);
                }
            });
        });

        // 1. Search Filter
        const searchInput = root.querySelector("#bbc-autorec-search");
        const cards = root.querySelectorAll(".bbc-item-card");
        const details = root.querySelectorAll(".bbc-inspector-detail");
        const emptyState = root.querySelector(".bbc-inspector-empty");

        if (searchInput) {
            searchInput.addEventListener("input", (ev) => {
                const query = (ev.target.value || "").toLowerCase().trim();
                cards.forEach(el => {
                    const name = el.dataset.itemName?.toLowerCase() || "";
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
                    ui.notifications?.info(`Copied "${text}" to clipboard.`);
                }
            });
        });

        // 5. Initialize Color Swatches
        root.querySelectorAll(".bbc-color-swatch").forEach(el => {
            if (el.dataset.color) {
                el.style.backgroundColor = el.dataset.color;
            }
        });

        // 6. Remove Custom Property in All Configured Properties
        root.querySelectorAll(".bbc-remove-config-key-btn").forEach(btn => {
            btn.addEventListener("click", (ev) => {
                const key = ev.currentTarget.dataset.configKey;
                const detailEl = ev.currentTarget.closest(".bbc-inspector-detail");
                const itemName = detailEl?.dataset.itemName;
                if (!itemName || !key) return;

                const existingEntry = manager.get(itemName) || {};
                const config = foundry.utils.deepClone(existingEntry.config || {});
                delete config[key];

                const persist = !config.local;
                manager.register(itemName, config, { persist, local: Boolean(config.local) });
                manager.broadcastSync();
                ui.notifications?.info(`Removed property "${key}" from workflow "${itemName}".`);
                this.render(false);
            });
        });

        // 7. Add Custom Property in All Configured Properties
        root.querySelectorAll(".bbc-add-config-key-btn").forEach(btn => {
            btn.addEventListener("click", (ev) => {
                const detailEl = ev.currentTarget.closest(".bbc-inspector-detail");
                const itemName = detailEl?.dataset.itemName;
                const row = ev.currentTarget.closest(".bbc-add-property-row");
                const keyInput = row?.querySelector(".bbc-new-config-key");
                const valInput = row?.querySelector(".bbc-new-config-val");

                const key = keyInput?.value?.trim();
                const rawVal = valInput?.value;
                if (!itemName || !key) {
                    ui.notifications?.warn("Please specify a property key name.");
                    return;
                }

                let parsedVal = rawVal;
                try {
                    parsedVal = JSON.parse(rawVal);
                } catch (e) {
                    parsedVal = rawVal;
                }
                if (typeof parsedVal === "string" && /^-?\d+(\.\d+)?$/.test(parsedVal)) {
                    const n = parseFloat(parsedVal);
                    if (!isNaN(n)) parsedVal = n;
                }

                const existingEntry = manager.get(itemName) || {};
                const config = foundry.utils.deepClone(existingEntry.config || {});
                config[key] = parsedVal;

                const persist = !config.local;
                manager.register(itemName, config, { persist, local: Boolean(config.local) });
                manager.broadcastSync();
                ui.notifications?.info(`Added property "${key}" to workflow "${itemName}".`);
                this.render(false);
            });
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
        const entriesToSave = [];
        root.querySelectorAll(".bbc-inspector-detail").forEach(detailEl => {
            const itemName = detailEl.dataset.itemName;
            if (!itemName) return;

            const existingEntry = manager.get(itemName) || {};
            const config = foundry.utils.deepClone(existingEntry.config || {});
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
                    if (val === "") val = undefined;
                }

                if (config[field] !== val) {
                    if (val === undefined) delete config[field];
                    else config[field] = val;
                    modified = true;
                }
            });

            // Arbitrary custom properties [data-config-key]
            detailEl.querySelectorAll("[data-config-key]").forEach(inputEl => {
                const key = inputEl.dataset.configKey;
                if (!key) return;

                const rawVal = inputEl.value;
                let parsedVal = rawVal;
                try {
                    parsedVal = JSON.parse(rawVal);
                } catch (e) {
                    parsedVal = rawVal;
                }
                if (typeof parsedVal === "string" && /^-?\d+(\.\d+)?$/.test(parsedVal)) {
                    const n = parseFloat(parsedVal);
                    if (!isNaN(n)) parsedVal = n;
                }

                if (config[key] !== parsedVal) {
                    config[key] = parsedVal;
                    modified = true;
                }
            });

            if (modified) {
                entriesToSave.push({ itemName, config, local: Boolean(config.local) });
            }
        });

        if (entriesToSave.length > 0) {
            await manager.registerMany(entriesToSave, { persist: true });
            ui.notifications?.info(`Saved ${entriesToSave.length} workflow configuration(s) and synced across all clients.`);
            this.render(false);
        }
    }

    async _updateObject(event, formData) {
        return;
    }
}
