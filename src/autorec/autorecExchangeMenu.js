import { MODULE_ID } from "../lib/constants.js";
import { autorecManager } from "./autorecManager.js";
import { localize, notify } from "../lib/utils.js";
import { log } from "../lib/logger.js";

const { ApplicationV2 } = foundry.applications.api;

/**
 * Game settings dialog window for exporting and importing global autorec JSON packages.
 * Registered in Foundry module settings under "Import / Export Autorecs".
 */
export class AutorecExchangeMenuApplication extends ApplicationV2 {
    /**
     * Application configuration options.
     * @type {object}
     */
    static DEFAULT_OPTIONS = {
        id: "bbc-autorec-exchange-menu",
        tag: "div",
        window: {
            title: "BBC.settings.autorecExchangeMenu.title",
            icon: "fa-solid fa-file-import",
            modal: true,
            resizable: false
        },
        position: {
            width: 480,
            height: "auto"
        },
        classes: ["bbc-app", "bbc-exchange-setting-menu"]
    };

    /**
     * Render the application HTML content directly without external handlebars template dependence.
     * Framework-native escaping and safe element construction (Rule & Skill).
     * @protected
     * @param {object} options - Render options
     * @returns {Promise<string>} HTML string representation
     */
    async _renderHTML(options) {
        const count = autorecManager.list().length;
        const titleStr = localize("BBC.settings.autorecExchangeMenu.heading", "Global Autorec Import / Export");
        const descStr = localize("BBC.settings.autorecExchangeMenu.desc", "Backup or share crosshair automatic recognition (autorec) configurations as portable JSON files.");
        const exportLabel = localize("BBC.settings.autorecExchangeMenu.exportBtn", "Export Autorecs to JSON");
        const importLabel = localize("BBC.settings.autorecExchangeMenu.importBtn", "Import Autorecs from JSON");
        const countMsg = localize("BBC.settings.autorecExchangeMenu.countMsg", `${count} global autorec configuration(s) active.`);

        return `
            <div style="padding: 16px; display: flex; flex-direction: column; gap: 14px; background: linear-gradient(135deg, #11141d 0%, #171a26 100%); color: #e2e8f0; font-family: sans-serif;">
                <header style="border-bottom: 1px solid rgba(99, 102, 241, 0.3); padding-bottom: 10px;">
                    <h3 style="margin: 0 0 6px 0; font-size: 1.05rem; color: #ffffff;"><i class="fa-solid fa-file-import" style="color: #818cf8; margin-right: 8px;"></i>${titleStr}</h3>
                    <p style="margin: 0; font-size: 0.82rem; color: #94a3b8;">${descStr}</p>
                    <span style="display: inline-block; margin-top: 8px; padding: 2px 8px; font-size: 0.74rem; font-weight: 600; color: #a5b4fc; background: rgba(99, 102, 241, 0.15); border-radius: 12px;">${countMsg}</span>
                </header>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <button type="button" class="bbc-setting-export-btn" style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; font-size: 0.88rem; font-weight: 700; color: #ffffff; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); border: 1px solid rgba(99, 102, 241, 0.5); border-radius: 6px; cursor: pointer;">
                        <i class="fa-solid fa-file-export"></i> ${exportLabel}
                    </button>
                    <button type="button" class="bbc-setting-import-btn" style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; font-size: 0.88rem; font-weight: 700; color: #e2e8f0; background: rgba(30, 41, 59, 0.85); border: 1px solid rgba(148, 163, 184, 0.3); border-radius: 6px; cursor: pointer;">
                        <i class="fa-solid fa-file-import"></i> ${importLabel}
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Replace content of root element safely.
     * @protected
     */
    _replaceHTML(result, content, options) {
        content.innerHTML = result;
    }

    /**
     * Attach click event handlers for settings exchange window.
     * @protected
     */
    _attachCustomEventListeners(root, context, options) {
        const rootEl = root instanceof HTMLElement ? root : (root?.element ?? null);
        if (!rootEl) return;

        const exportBtn = rootEl.querySelector(".bbc-setting-export-btn");
        if (exportBtn) {
            exportBtn.addEventListener("click", () => {
                autorecManager.exportToFile({ sourceModule: "world" });
            });
        }

        const importBtn = rootEl.querySelector(".bbc-setting-import-btn");
        if (importBtn) {
            importBtn.addEventListener("click", () => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".json,application/json";
                input.addEventListener("change", async (ev) => {
                    const file = ev.target?.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = async (e) => {
                        const text = e.target?.result;
                        if (typeof text !== "string") return;
                        try {
                            const res = await autorecManager.importAutorecs(text, { sourceModule: "world", interactive: true });
                            if (res) {
                                this.render(false);
                            }
                        } catch (err) {
                            log.error("AutorecExchangeMenuApplication | Import error:", err);
                            notify.error(localize("BBC.autorecExchange.notify.importError", `Import failed: ${err.message}`));
                        }
                    };
                    reader.readAsText(file);
                });
                input.click();
            });
        }
    }
}
