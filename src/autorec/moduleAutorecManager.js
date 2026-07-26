import { autorecManager } from "./autorecManager.js";
import { log } from "../lib/logger.js";

/**
 * Module-scoped manager wrapper for crosshair automatic recognition (autorec) registrations.
 * Allows external modules (e.g. macro packs) to register their crosshair sequences by passing
 * macro-ids without needing to manually specify module attribution on every single registration.
 */
export class ModuleAutorecManager {
    /**
     * Construct a module-scoped autorec manager for a specific module identifier.
     * Single concrete string argument type expected (Rule 5).
     * @param {string} moduleId - Unique identifier of the calling module (e.g. "eskie-macro-pack")
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
        this.registerMany = this.registerMany.bind(this);
        this.unregister = this.unregister.bind(this);
        this.unregisterMany = this.unregisterMany.bind(this);
        this.get = this.get.bind(this);
        this.has = this.has.bind(this);
        this.list = this.list.bind(this);
        this.getAllEntries = this.getAllEntries.bind(this);
        this.exportAutorecs = this.exportAutorecs.bind(this);
        this.exportToFile = this.exportToFile.bind(this);
        this.importAutorecs = this.importAutorecs.bind(this);
    }

    /**
     * Register a crosshair placement animation sequence for a macro ID.
     * Automatically tags the entry configuration with this module's identifier as sourceModule.
     * @param {string} macroId - Macro or item unique identification key
     * @param {Object|Function} [handlerOrConfig={}] - Declarative configuration object or callback handler
     * @param {Object} [options={}] - Registration persistence and scope options
     * @param {boolean} [options.persist=true] - Whether to persist registration to world settings
     * @param {boolean} [options.local=false] - Whether this registration exists in local session scope only
     * @returns {void}
     */
    register(macroId, handlerOrConfig = {}, { persist = true, local = false } = {}) {
        const cleanMacroId = String(macroId ?? "").trim();
        if (!cleanMacroId) {
            log.warn(`ModuleAutorecManager[${this.moduleId}].register | Invalid empty macroId passed.`);
            return;
        }

        let configPayload = handlerOrConfig;
        if (typeof handlerOrConfig === "object" && handlerOrConfig !== null) {
            configPayload = {
                ...handlerOrConfig,
                itemName: handlerOrConfig.itemName ?? cleanMacroId,
                sourceModule: this.moduleId
            };
        }

        log.debug(`ModuleAutorecManager[${this.moduleId}].register | Registering macro "${cleanMacroId}" tagged with module "${this.moduleId}".`);
        this._parent.register(cleanMacroId, configPayload, {
            persist,
            local,
            sourceModule: this.moduleId
        });
    }

    /**
     * Batch register multiple macro crosshair definitions tagged with this module's ID.
     * Entry boundary array normalized before batch execution (Rule 5).
     * @param {Array<{macroId?: string, itemName?: string, config?: Object, local?: boolean}>} entries - Candidate registrations
     * @param {Object} [options={}] - Batch options (`{ persist: boolean }`)
     * @returns {Promise<void>}
     */
    async registerMany(entries, { persist = true } = {}) {
        const list = Array.isArray(entries) ? entries : [];
        if (list.length === 0) return;

        const prepared = [];
        for (const item of list) {
            if (!item || typeof item !== "object") continue;
            const macroId = String(item.macroId ?? item.itemName ?? "").trim();
            if (!macroId) continue;

            const rawConfig = item.config ?? item;
            const config = typeof rawConfig === "object" && rawConfig !== null
                ? { ...rawConfig, itemName: rawConfig.itemName ?? macroId, sourceModule: this.moduleId }
                : rawConfig;

            prepared.push({
                itemName: macroId,
                config,
                local: Boolean(item.local)
            });
        }

        log.debug(`ModuleAutorecManager[${this.moduleId}].registerMany | Batch registering ${prepared.length} macro items.`);
        await this._parent.registerMany(prepared, { persist });
    }

    /**
     * Unregister a macro sequence handler previously registered by macro ID.
     * @param {string} macroId - Target macro identification key
     * @param {Object} [options={}] - Unregistration scope options
     * @returns {boolean} True if handler existed and was unregistered
     */
    unregister(macroId, options = {}) {
        const cleanMacroId = String(macroId ?? "").trim();
        log.debug(`ModuleAutorecManager[${this.moduleId}].unregister | Unregistering macro "${cleanMacroId}".`);
        return this._parent.unregister(cleanMacroId, options);
    }

    /**
     * Batch unregister multiple macro sequence handlers.
     * @param {Array<string>} macroIds - List of macro identifiers to unregister
     * @param {Object} [options={}] - Scope options
     * @returns {Promise<void>}
     */
    async unregisterMany(macroIds, options = {}) {
        const list = Array.isArray(macroIds) ? macroIds : [];
        log.debug(`ModuleAutorecManager[${this.moduleId}].unregisterMany | Batch unregistering ${list.length} items.`);
        await this._parent.unregisterMany(list, options);
    }

    /**
     * Retrieve active autorec configuration for a given macro ID.
     * @param {string} macroId - Target macro identification key
     * @returns {Object|null} Active autorec entry configuration or null
     */
    get(macroId) {
        const cleanMacroId = String(macroId ?? "").trim();
        return this._parent.get(cleanMacroId);
    }

    /**
     * Check if an active registration exists for a given macro ID.
     * @param {string} macroId - Target macro identification key
     * @returns {boolean} True if registration exists
     */
    has(macroId) {
        const cleanMacroId = String(macroId ?? "").trim();
        return this._parent.has(cleanMacroId);
    }

    /**
     * List all macro IDs registered under this module's module-id.
     * @returns {Array<string>} List of macro registration keys belonging to this module
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
