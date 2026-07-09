import { MODULE_ID } from "../lib/constants.js";
import { log } from "../lib/logger.js";
import { template } from "../lib/templates.js";
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
        const entries = template.getAllEntries();
        return {
            entries,
            count: entries.length,
            isEmpty: entries.length === 0,
            menuHint: localize("BBC.autorecMenu.menuHint")
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

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
    }

    async _updateObject(event, formData) {
        return;
    }
}
