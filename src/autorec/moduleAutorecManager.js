import { autorecManager } from "./autorecManager.js";
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
        this.moduleId = cleanId;
        this._parent = parentManager;

        this.register = this.register.bind(this);
        this.unregister = this.unregister.bind(this);
        this.get = this.get.bind(this);
        this.has = this.has.bind(this);
        this.list = this.list.bind(this);
        this.getAllEntries = this.getAllEntries.bind(this);
        this.exportAutorecs = this.exportAutorecs.bind(this);
        this.exportToFile = this.exportToFile.bind(this);
        this.importAutorecs = this.importAutorecs.bind(this);
    }

    /**
     * Register multiple item/activity crosshair definitions tagged with this module's ID.
     * Strictly requires an Array of entry objects (Rule 5). Single item object form is rejected.
     * @param {Array<{itemName: string, config?: Object, local?: boolean}>} entries - Array of registration entries
     * @param {Object} [options={}] - Registration options (`{ persist: boolean }`)
     * @returns {Promise<void>}
     * @throws {Error} If entries parameter is not an Array
     */
    async register(entries, { persist = true } = {}) {
        if (!Array.isArray(entries)) {
            log.error(`ModuleAutorecManager[${this.moduleId}].register | Argument 'entries' must be an Array.`);
            throw new Error("ModuleAutorecManager.register requires an array of registration entries.");
        }
        if (entries.length === 0) return;

        const prepared = [];
        for (const item of entries) {
            if (!item || typeof item !== "object") continue;
            const itemName = String(item.itemName ?? "").trim();
            if (!itemName) continue;

            const rawConfig = item.config ?? item;
            const config = typeof rawConfig === "object" && rawConfig !== null
                ? { ...rawConfig, itemName: rawConfig.itemName ?? itemName, sourceModule: this.moduleId }
                : rawConfig;

            prepared.push({
                itemName,
                config,
                local: Boolean(item.local)
            });
        }

        log.debug(`ModuleAutorecManager[${this.moduleId}].register | Registering ${prepared.length} items.`);
        await this._parent.registerMany(prepared, { persist });
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
     * Retrieve active autorec configuration for a given item or spell name.
     * @param {string} itemName - Target item/spell name
     * @returns {Object|null} Active autorec entry configuration or null
     */
    get(itemName) {
        const cleanItemName = String(itemName ?? "").trim();
        return this._parent.get(cleanItemName);
    }

    /**
     * Check if an active registration exists for a given item or spell name.
     * @param {string} itemName - Target item/spell name
     * @returns {boolean} True if registration exists
     */
    has(itemName) {
        const cleanItemName = String(itemName ?? "").trim();
        return this._parent.has(cleanItemName);
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
                matching.push(entry.regKey ?? entry.itemName);
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
    exportAutorecs({ includeDefault = false, description = "" } = {}) {
        const moduleEntries = this.getAllEntries().map(e => e.config ?? e);
        return this._parent.exportAutorecs({
            sourceModule: this.moduleId,
            includeDefault,
            description,
            entriesInput: moduleEntries
        });
    }

    /**
     * Export this module's registered autorec definitions to a downloadable JSON file.
     * @param {Object} [options={}] - Export file configuration options
     * @returns {void}
     */
    exportToFile({ filename = null, includeDefault = false, description = "" } = {}) {
        const defaultName = `${this.moduleId}-autorec-export-${new Date().toISOString().slice(0, 10)}.json`;
        this._parent.exportToFile({
            filename: filename ?? defaultName,
            sourceModule: this.moduleId,
            includeDefault,
            description
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
    async importAutorecs(jsonOrString, { interactive = true, overwrite = true } = {}) {
        log.info(`ModuleAutorecManager[${this.moduleId}].importAutorecs | Importing bundle with module-id tag set to "${this.moduleId}".`);
        return this._parent.importAutorecs(jsonOrString, {
            sourceModule: this.moduleId,
            overrideSourceModule: this.moduleId,
            interactive,
            overwrite
        });
    }
}
