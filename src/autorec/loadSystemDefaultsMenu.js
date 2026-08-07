import { MODULE_ID } from "../lib/constants.js";
import { log } from "../lib/logger.js";
import { notify, localize } from "../lib/utils.js";
import { systemAdapter } from "../adapter/system/index.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Confirmation and loader dialog application for game system defaults.
 * Registered as a Foundry module setting menu under "Load System Defaults".
 */
export class LoadSystemDefaultsApplication extends HandlebarsApplicationMixin(ApplicationV2) {
    /**
     * Application configuration options.
     * @type {object}
     */
    static DEFAULT_OPTIONS = {
        id: "bbc-load-system-defaults-menu",
        tag: "div",
        window: {
            title: "BBC.settings.loadSystemDefaults.name",
            icon: "fa-solid fa-arrows-rotate",
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
            template: `modules/${MODULE_ID}/src/autorec/loadSystemDefaultsMenu.html`
        }
    };

    /**
     * Prepare context data for Handlebars template rendering.
     * @protected
     * @param {object} options - Application rendering options
     * @returns {Promise<object>} Context data passed to the template
     */
    async _prepareContext(options) {
        const systemId = String(systemAdapter.systemId ?? game?.system?.id ?? "dnd5e").trim();
        const rawDesc = localize("BBC.settings.loadSystemDefaults.confirmContent", "Are you sure you want to load default crosshair configurations for {system}? Existing custom configurations will be preserved.");
        const desc = game?.i18n?.format?.("BBC.settings.loadSystemDefaults.confirmContent", { system: systemId })
            ?? rawDesc.replace("{system}", systemId);

        return {
            systemId,
            desc
        };
    }

    /**
     * Official ApplicationV2 post-render lifecycle hook.
     * Attaches click event listeners for the confirmation and cancel buttons.
     * @protected
     * @param {object} context - Prepared context data
     * @param {object} options - Options
     * @returns {void}
     */
    _onRender(context, options) {
        super._onRender?.(context, options);
        const rootEl = this.element;
        if (!rootEl) return;

        const confirmBtn = rootEl.querySelector(".bbc-load-defaults-confirm-btn");
        if (confirmBtn) {
            confirmBtn.addEventListener("click", async () => {
                const systemId = String(systemAdapter.systemId ?? game?.system?.id ?? "dnd5e").trim().toLowerCase();
                log.debug(`LoadSystemDefaultsApplication | User triggered reload of defaults for system "${systemId}".`);
                this.close();
                const res = await systemAdapter.loadDefaults({ interactive: false, overwrite: true });
                if (res?.success) {
                    const rawSuccess = localize("BBC.settings.loadSystemDefaults.reloadSuccess", "Successfully loaded {count} system defaults for {system}.");
                    const msg = game?.i18n?.format?.("BBC.settings.loadSystemDefaults.reloadSuccess", {
                        count: res.mergedCount,
                        system: systemId
                    }) ?? rawSuccess.replace("{count}", String(res.mergedCount)).replace("{system}", systemId);
                    notify.info(msg);
                } else {
                    notify.error(res?.error ?? "Failed to load system defaults.");
                }
            });
        }

        const cancelBtn = rootEl.querySelector(".bbc-load-defaults-cancel-btn");
        if (cancelBtn) {
            cancelBtn.addEventListener("click", () => this.close());
        }
    }
}
