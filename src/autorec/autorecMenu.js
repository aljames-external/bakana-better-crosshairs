import { MODULE_ID } from "../lib/constants.js";
import { log } from "../lib/logger.js";
import { manager } from "../lib/templates.js";
import { localize } from "../lib/utils.js";

export class AutorecMenuApplication extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "bbc-autorec-menu",
            title: "BBC.autorecMenu.title",
            template: `modules/${MODULE_ID}/src/autorec/autorecMenu.html`,
            classes: ["bbc-app", "bbc-autorec-form"],
            width: 780,
            height: 580,
            resizable: true,
            closeOnSubmit: false
        });
    }

    async getData(options) {
        const entries = manager.getAllEntries();
        return {
            entries,
            count: entries.length,
            isEmpty: entries.length === 0,
            isGM: typeof game !== "undefined" ? Boolean(game.user?.isGM) : true,
            menuHint: localize("BBC.autorecMenu.menuHint")
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Restore Edit Mode state across re-renders
        const editToggle = html.find("#bbc-edit-mode-toggle");
        if (this._editModeActive) {
            editToggle.prop("checked", true);
            html.find(".bbc-autorec-container").addClass("edit-mode");
        }

        // Toggle GM Edit Mode
        editToggle.on("change", (ev) => {
            const turningOn = ev.currentTarget.checked;
            this._editModeActive = turningOn;
            html.find(".bbc-autorec-container").toggleClass("edit-mode", turningOn);

            // When switching back to non-edit mode, save the page and sync all clients
            if (!turningOn) {
                this.saveAllEditedConfigurations(html);
            }
        });

        // Prevent checkbox click from switching sidebar tab
        html.find(".bbc-item-select-checkbox").on("click", (ev) => {
            ev.stopPropagation();
        });

        // Batch Remove Selected Workflows
        html.find(".bbc-remove-selected-btn").on("click", () => {
            const checked = html.find(".bbc-item-select-checkbox:checked");
            if (checked.length === 0) {
                ui.notifications?.warn("Please select one or more workflows to remove.");
                return;
            }
            const names = [];
            checked.each((_, el) => names.push(el.dataset.itemName));
            for (const itemName of names) {
                manager.unregister(itemName, { persist: true });
            }
            manager.broadcastSync();
            ui.notifications?.info(`Removed ${names.length} workflow(s).`);
            this.render(false);
        });

        // Single Remove Workflow button in header
        html.find(".bbc-delete-single-btn").on("click", (ev) => {
            const itemName = ev.currentTarget.dataset.itemName;
            if (itemName) {
                manager.unregister(itemName, { persist: true });
                manager.broadcastSync();
                ui.notifications?.info(`Removed workflow "${itemName}".`);
                this.render(false);
            }
        });

        // 1. Search Filter
        const searchInput = html.find("#bbc-autorec-search");
        const cards = html.find(".bbc-item-card");
        const details = html.find(".bbc-inspector-detail");
        const emptyState = html.find(".bbc-inspector-empty");

        searchInput.on("input", (ev) => {
            const query = (ev.target.value || "").toLowerCase().trim();
            cards.each((_, el) => {
                const name = el.dataset.itemName?.toLowerCase() || "";
                if (!query || name.includes(query)) {
                    el.style.display = "flex";
                } else {
                    el.style.display = "none";
                }
            });
        });

        // 2. Sidebar Item Selection
        cards.on("click", (ev) => {
            const card = ev.currentTarget;
            const itemName = card.dataset.itemName;

            cards.removeClass("active");
            card.classList.add("active");

            emptyState.hide();
            details.hide();

            const targetDetail = html.find(`.bbc-inspector-detail[data-item-name="${CSS.escape(itemName)}"]`);
            if (targetDetail.length) {
                targetDetail.css("display", "flex");
            }
        });

        // 3. Expandable Section Accordions
        html.find(".bbc-section-header").on("click", (ev) => {
            const header = ev.currentTarget;
            const body = header.nextElementSibling;
            const icon = header.querySelector(".bbc-chevron");

            if (body && body.classList.contains("bbc-section-body")) {
                const isHidden = body.style.display === "none";
                body.style.display = isHidden ? "block" : "none";
                if (icon) {
                    icon.style.transform = isHidden ? "rotate(0deg)" : "rotate(-90deg)";
                }
            }
        });

        // 4. Copy Path Action
        html.find(".bbc-copy-btn").on("click", (ev) => {
            const btn = ev.currentTarget;
            const text = btn.dataset.copyText;
            if (text && navigator.clipboard) {
                navigator.clipboard.writeText(text);
                ui.notifications?.info(`Copied "${text}" to clipboard.`);
            }
        });

        // 5. Initialize Color Swatches
        html.find(".bbc-color-swatch").each((_, el) => {
            if (el.dataset.color) {
                el.style.backgroundColor = el.dataset.color;
            }
        });
    }

    saveAllEditedConfigurations(html) {
        let savedCount = 0;
        html.find(".bbc-inspector-detail").each((_, detailEl) => {
            const itemName = detailEl.dataset.itemName;
            if (!itemName) return;

            const existingEntry = manager.get(itemName) || {};
            const config = foundry.utils.deepClone(existingEntry.config || {});
            let modified = false;

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

                if (field === "type" && val === "Auto-Detect") {
                    val = undefined;
                }

                if (config[field] !== val) {
                    if (val === undefined) delete config[field];
                    else config[field] = val;
                    modified = true;
                }
            });

            if (modified) {
                const persist = !config.local;
                manager.register(itemName, config, { persist, local: Boolean(config.local) });
                savedCount++;
            }
        });

        if (savedCount > 0) {
            manager.broadcastSync();
            ui.notifications?.info(`Saved ${savedCount} workflow configuration(s) and synced across all clients.`);
            this.render(false);
        }
    }

    async _updateObject(event, formData) {
        return;
    }
}
