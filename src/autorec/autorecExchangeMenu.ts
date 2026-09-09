import { MODULE_ID } from "../lib/constants.js";
import { autorecManager } from "./autorecManager.js";
import { promptJsonFileImport } from "./autorecExchange.js";
import { localize, notify } from "../lib/utils.js";
import { log } from "../lib/logger.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Game settings dialog window for exporting and importing global autorec JSON packages.
 * Registered in Foundry module settings under "Import / Export Autorecs".
 */
export class AutorecExchangeMenuApplication extends HandlebarsApplicationMixin(ApplicationV2) {
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
     * Template parts rendered by the application.
     * @type {object}
     */
    static PARTS = {
        main: {
            template: `modules/${MODULE_ID}/src/autorec/autorecExchangeMenu.html`
        }
    };

    /**
     * Prepare context data for the Handlebars rendering lifecycle.
     * @protected
     * @param {object} options - Application rendering options
     * @returns {Promise<object>} Context data object passed to template
     */
    async _prepareContext(options) {
        const count = autorecManager.getAllEntries().filter(entry => !entry.isDefault).length;
        const rawCountMsg = localize("BBC.settings.autorecExchangeMenu.countMsg", "{count} global autorec configuration(s) active.");
        const countMsg = game?.i18n?.format?.("BBC.settings.autorecExchangeMenu.countMsg", { count }) ?? rawCountMsg.replace("{count}", String(count));

        return {
            countMsg
        };
    }

    /**
     * Official ApplicationV2 post-render lifecycle hook.
     * Attaches click event handlers for settings exchange window.
     * @protected
     * @param {object} context - Prepared context data
     * @param {object} options - Options
     * @returns {void}
     */
    _onRender(context, options) {
        super._onRender?.(context, options);
        const rootEl = this.element;
        if (!rootEl) return;

        const exportBtn = rootEl.querySelector(".bbc-setting-export-btn");
        if (exportBtn) {
            exportBtn.addEventListener("click", () => {
                log.debug("AutorecExchangeMenuApplication | Triggering global autorec file export.");
                autorecManager.exportToFile({ sourceModule: "world" });
            });
        }

        const importBtn = rootEl.querySelector(".bbc-setting-import-btn");
        if (importBtn) {
            importBtn.addEventListener("click", () => {
                log.debug("AutorecExchangeMenuApplication | Opening file browser picker for JSON import.");
                promptJsonFileImport(async (text) => {
                    try {
                        const res = await autorecManager.importAutorecs(text, { sourceModule: "world", overrideSourceModule: null, interactive: true });
                        if (res) {
                            this.render(false);
                        }
                    } catch (err) {
                        log.error("AutorecExchangeMenuApplication | Import error:", err);
                        notify.error(localize("BBC.autorecExchange.notify.importError", `Import failed: ${err.message}`));
                    }
                });
            });
        }
    }
}
