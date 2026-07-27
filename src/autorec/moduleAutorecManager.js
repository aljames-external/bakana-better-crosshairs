import { autorecManager, computeRegistrationKey } from "./autorecManager.js";
import { log } from "../lib/logger.js";

/**
 * Module-scoped manager wrapper for automatic recognition (autorec) registrations on items and activities.
 * Allows external content and pack modules to register their crosshair sequences by passing arrays of items
 * without needing to manually specify module attribution on every single registration.
 */
export class ModuleAutorecManager {
    /**
     * Construct a module-scoped autorec manager for a specific module identifier.
     * Single concrete string argument type expected (Rule 5).
     * @param {string} moduleId - Unique identifier of the calling module (e.g. "eskie-content-pack")
     * @param {Object} [parentManager=autorecManager] - Underlying global AutorecManager instance
     * @throws {Error} If valid non-empty string moduleId is not provided
     */
    constructor(moduleId, parentManager = autorecManager) {
        const cleanId = String(moduleId ?? "").trim();
        if (!cleanId) {
            log.error("ModuleAutorecManager.constructor | Missing required 'moduleId' string.");
            throw new Error("ModuleAutorecManager requires a non-empty module-id string.");
        }
        if (cleanId.toLowerCase() === "world") {
            log.error("ModuleAutorecManager.constructor | Reserved module-id 'world' is not permitted.");
            throw new Error("ModuleAutorecManager cannot use reserved module-id 'world'. Scope attribution 'world' is restricted to game settings.");
        }
        this.moduleId = cleanId;
        this._parent = parentManager;

        this.register = this.register.bind(this);
        this.unregister = this.unregister.bind(this);
        this.get = this.get.bind(this);
        this.getEntriesForItem = this.getEntriesForItem.bind(this);
        this.has = this.has.bind(this);
        this.list = this.list.bind(this);
        this.getAllEntries = this.getAllEntries.bind(this);
        this.export = this.export.bind(this);
        this.import = this.import.bind(this);
    }

    /**
     * Register multiple item/activity crosshair definitions tagged with this module's ID.
     * Strictly requires an Array of entry objects (Rule 5). Single item object form is rejected.
     * @param {Array<{itemName: string, config?: Object, local?: boolean}>} entries - Array of registration entries
     * @param {Object} [options={}] - Registration options (`{ persist: boolean }`)
     * @returns {Promise<void>}
     * @throws {Error} If entries parameter is not an Array
     */
    async register(entries, { persist = true, isHydration = false, isImport = false, suppressWarn = false } = {}) {
        if (!Array.isArray(entries)) {
            log.error(`ModuleAutorecManager[${this.moduleId}].register | Argument 'entries' must be an Array.`);
            throw new Error("ModuleAutorecManager.register requires an array of registration entries.");
        }
        if (entries.length === 0) {
            return {
                success: true,
                code: "OK",
                registeredCount: 0,
                rejectedCount: 0,
                rejected: []
            };
        }

        const prepared = [];
        const rejected = [];
        for (const item of entries) {
            if (!item || typeof item !== "object") continue;
            const baseConfig = (item.config && typeof item.config === "object") ? item.config : item;
            const itemName = String(item.itemName ?? baseConfig.itemName ?? "").trim();
            if (!itemName) continue;

            const actName = String(item.activityName ?? baseConfig.activityName ?? "").trim();
            const actId = String(item.activityId ?? baseConfig.activityId ?? "").trim();
            const regKey = computeRegistrationKey(itemName, actName, actId);

            const existing = this._parent.registeredHandlers?.get(regKey);
            const existingModule = String(existing?.sourceModule ?? existing?.module ?? "world").trim();

            const isConflict = Boolean(
                !isHydration &&
                !isImport &&
                !suppressWarn &&
                existing &&
                !existing.isDefault &&
                existingModule !== "world" &&
                existingModule.toLowerCase() !== this.moduleId.toLowerCase()
            );

            if (isConflict) {
                const actLabel = actName !== "" ? actName : (actId !== "" ? actId : "default");
                const warnMsg = `An overwrite attempt on (${itemName} / ${actLabel} / ${existingModule}) was attempted by ${this.moduleId}.`;
                if (typeof ui !== "undefined" && ui?.notifications?.warn) {
                    ui.notifications.warn(warnMsg);
                }
                log.warn(`ModuleAutorecManager[${this.moduleId}].register | ${warnMsg}`);
                rejected.push({
                    itemName,
                    activityName: actName,
                    activityId: actId,
                    regKey,
                    existingModule,
                    callingModule: this.moduleId,
                    reason: "MODULE_OVERWRITE_FORBIDDEN",
                    code: "ERR_MODULE_OVERWRITE_REJECTED"
                });
                continue;
            }

            const preparedConfig = {
                ...baseConfig,
                itemName,
                activityName: actName || undefined,
                activityId: actId || undefined,
                sourceModule: this.moduleId
            };

            prepared.push({
                itemName: regKey,
                config: preparedConfig,
                local: item.local ?? false
            });
        }

        if (prepared.length > 0) {
            log.debug(`ModuleAutorecManager[${this.moduleId}].register | Registering ${prepared.length} items.`);
            await this._parent.registerMany(prepared, { persist, isHydration: false });
        }

        const isSuccess = rejected.length === 0;
        return {
            success: isSuccess,
            code: isSuccess ? "OK" : "ERR_MODULE_OVERWRITE_REJECTED",
            registeredCount: prepared.length,
            rejectedCount: rejected.length,
            rejected
        };
    }

    /**
     * Unregister multiple item/activity autorec workflows by item name.
     * Strictly requires an Array of item name strings.
     * @param {Array<string>} itemNames - Array of item/spell names to unregister
     * @param {Object} [options={}] - Scope options
     * @returns {Promise<void>}
     * @throws {Error} If itemNames parameter is not an Array
     */
    async unregister(itemNames, options = {}) {
        if (!Array.isArray(itemNames)) {
            log.error(`ModuleAutorecManager[${this.moduleId}].unregister | Argument 'itemNames' must be an Array.`);
            throw new Error("ModuleAutorecManager.unregister requires an array of item names.");
        }
        log.debug(`ModuleAutorecManager[${this.moduleId}].unregister | Unregistering ${itemNames.length} items.`);
        await this._parent.unregisterMany(itemNames, options);
    }

    /**
     * Retrieve active autorec configuration for a given item or spell name (optional activity scope).
     * @param {string} itemName - Target item/spell name
     * @param {string|null} [activityNameOrId=null] - Optional sub-activity name or activity ID filter
     * @returns {Object|null} Active autorec entry configuration or null
     */
    get(itemName, activityNameOrId = null) {
        const cleanItemName = String(itemName ?? "").trim();
        if (!cleanItemName) return null;
        const cleanActivity = String(activityNameOrId ?? "").trim();
        const targetKey = cleanActivity !== "" && !cleanItemName.includes(" | ") && !cleanItemName.includes("#")
            ? computeRegistrationKey(cleanItemName, cleanActivity)
            : cleanItemName;
        return this._parent.get(targetKey);
    }

    /**
     * Retrieve all candidate active configurations registered under this module for a given item name.
     * Activity-filtered entries come first, general fallback entries come last.
     * @param {string} itemName - Target item/spell name
     * @returns {Array<Object>} Ordered array of candidate configurations belonging to this module
     */
    getEntriesForItem(itemName) {
        const cleanItemName = String(itemName ?? "").trim();
        if (!cleanItemName) return [];
        return this._parent.getEntriesForItem(cleanItemName)
            .filter(entry => entry.sourceModule === this.moduleId);
    }

    /**
     * Check if an active registration exists for a given item/spell name and optional activity filter.
     * @param {string} itemName - Target item/spell name
     * @param {string|null} [activityNameOrId=null] - Optional sub-activity name or activity ID filter
     * @returns {boolean} True if registration exists
     */
    has(itemName, activityNameOrId = null) {
        const cleanItemName = String(itemName ?? "").trim();
        if (!cleanItemName) return false;
        const cleanActivity = String(activityNameOrId ?? "").trim();
        const targetKey = cleanActivity !== "" && !cleanItemName.includes(" | ") && !cleanItemName.includes("#")
            ? computeRegistrationKey(cleanItemName, cleanActivity)
            : cleanItemName;
        return this._parent.has(targetKey);
    }

    /**
     * List all item/spell names registered under this module's module-id.
     * @returns {Array<string>} List of item registration keys belonging to this module
     */
    list() {
        const all = this._parent.getAllEntries();
        const matching = [];
        for (const entry of all) {
            if (entry.sourceModule === this.moduleId) {
                matching.push(entry.regKey);
            }
        }
        return matching;
    }

    /**
     * Retrieve all full UI-formatted registration entries belonging to this module.
     * @returns {Array<Object>} List of registration entry representations tagged with this module's ID
     */
    getAllEntries() {
        return this._parent.getAllEntries().filter(entry => entry.sourceModule === this.moduleId);
    }

    /**
     * Export all registrations tagged with this module's ID into a versioned JSON exchange bundle.
     * @param {Object} [options={}] - Export options
     * @returns {Object} Exchange package object
     */
    export({ includeDefault = false, description = "" } = {}) {
        const moduleEntries = this.getAllEntries().map(e => e.config);
        return this._parent.exportAutorecs({
            sourceModule: this.moduleId,
            includeDefault,
            description,
            entriesInput: moduleEntries
        });
    }

    /**
     * Import a JSON exchange payload and update all imported entries with this module's module-id
     * so that they appear in autorec tagged with this module-id.
     * @param {string|Object} jsonOrString - Raw JSON payload string or parsed package container
     * @param {Object} [options={}] - Import flow control parameters
     * @param {boolean} [options.interactive=true] - Whether to display confirmation modal UI
     * @param {boolean} [options.overwrite=true] - Default conflict strategy when non-interactive
     * @returns {Promise<{mergedCount: number, importedEntries: Array<Object>}|null>} Result summary or null if cancelled
     */
    async import(jsonOrString, { interactive = true, overwrite = true } = {}) {
        log.debug(`ModuleAutorecManager[${this.moduleId}].import | Importing bundle with module-id tag set to "${this.moduleId}".`);
        return this._parent.importAutorecs(jsonOrString, {
            sourceModule: this.moduleId,
            overrideSourceModule: this.moduleId,
            interactive,
            overwrite
        });
    }
}
