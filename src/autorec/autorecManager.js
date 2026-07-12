import { MODULE_ID } from '../lib/constants.js';
import { log } from '../lib/logger.js';
import { systemAdapter } from '../adapter/system/index.js';
import { crosshairAdapter } from '../adapter/foundry/index.js';
import { socketlib } from '../integration/index.js';
import { localize } from '../lib/utils.js';

/**
 * Canonical default configuration schema for an automatic recognition (autorec) registration entry.
 * @type {Object}
 */
export const DEFAULT_AUTOREC_ENTRY = {
    id: "DEFAULT",
    itemName: "DEFAULT",
    isDefault: true,
    enabled: true,
    stickToToken: "default",
    showLine: true,
    borderColor: "#ffffff",
    borderAlpha: 0,
    fillColor: "#000000",
    fillAlpha: 0,
    circleFile: "eskie.crosshair.circle.fantasy_01.white.full",
    coneFile: "eskie.crosshair.cone.thin.fantasy_01.white.full",
    rayFile: "eskie.crosshair.ray.fantasy_01.white",
    squareFile: "eskie.crosshair.square.fantasy_01.white",
    lineFile: "eskie.crosshair.line.generic_01.white",
    placedFillColor: "#000000",
    placedFillAlpha: 0,
    placedBorderColor: "#ffffff",
    placedBorderAlpha: 0,

    enablePrePlacement: false,
    enableAnimation: false,
    enablePlacedStyling: false,
    enablePostPlacement: false,

    concurrentCode: "",
    postPlacementCode: "",
    icon: "eskie.crosshair.reticle.generic_02.white"
};

/**
 * AutorecManager manages automatic recognition (autorec) registrations for template/region items.
 * Encapsulated as a class instead of free-floating module-level functions.
 */
export class AutorecManager {
    /**
     * Initialize the AutorecManager instance with default registrations and bind methods.
     * @returns {void}
     */
    constructor() {
        this.registeredHandlers = new Map([
            ["DEFAULT", { ...DEFAULT_AUTOREC_ENTRY }]
        ]);
        this.fastLookupMap = new Map();
        this.persistedItemNames = new Set();
        this.readySyncInitialized = false;
        this._onRegisterCallback = null;

        this.resolveItemAndActivity = this.resolveItemAndActivity.bind(this);
        this.indexRegistration = this.indexRegistration.bind(this);
        this.rebuildFastLookupMap = this.rebuildFastLookupMap.bind(this);
        this.getEntriesForItem = this.getEntriesForItem.bind(this);
        this.getEntryByName = this.getEntryByName.bind(this);
        this.getEntryForDocument = this.getEntryForDocument.bind(this);
        this.onRegister = this.onRegister.bind(this);
        this.initializeReadySync = this.initializeReadySync.bind(this);
        this.persistRegistration = this.persistRegistration.bind(this);
        this.persistUnregistration = this.persistUnregistration.bind(this);
        this.loadSavedRegistrations = this.loadSavedRegistrations.bind(this);
        this.register = this.register.bind(this);
        this.unregister = this.unregister.bind(this);
        this.unregisterMany = this.unregisterMany.bind(this);
        this.registerMany = this.registerMany.bind(this);
        this.overwrite = this.overwrite.bind(this);
        this.has = this.has.bind(this);
        this.get = this.get.bind(this);
        this.list = this.list.bind(this);
        this.getAllEntries = this.getAllEntries.bind(this);
        this.getDefaultConfig = this.getDefaultConfig.bind(this);
        this.getDefault = this.getDefaultConfig;
        this.customize = this.customize.bind(this);
        this.broadcastSync = this.broadcastSync.bind(this);
    }

    /**
     * Set a callback to be invoked when registration occurs (e.g. to initialize placement hooks).
     * @param {Function} callback - Callback function to execute on registration
     * @returns {void}
     */
    onRegister(callback) {
        if (typeof callback === "function") {
            this._onRegisterCallback = callback;
        }
    }

    /**
     * Return a clean copy of the canonical default Better Crosshairs configuration entry schema.
     * Serves as a reference template for systems without built-in support to inspect required and available options.
     * @returns {Object} Clean copy of the canonical default crosshair configuration object
     */
    getDefaultConfig() {
        return { ...DEFAULT_AUTOREC_ENTRY };
    }

    /**
     * Customize item-specific crosshair override configuration stored on item flags.
     * Invokable by any user with ownership of the passed Item.
     * Passing config === undefined (or null) clears any existing custom item override.
     * @param {Document} item - Target Item document
     * @param {Object|undefined} [config] - Crosshair override configuration object or undefined to clear
     * @returns {Promise<boolean>} True if the item configuration was successfully set or cleared, false otherwise
     */
    async customize(item, config) {
        if (!item || typeof item.setFlag !== "function" || typeof item.unsetFlag !== "function") {
            log.warn("AutorecManager.customize | Invalid item document passed to customize.");
            return false;
        }

        const isOwner = Boolean(item.isOwner);
        if (!isOwner) {
            log.warn(`AutorecManager.customize | Current user does not have ownership of item "${item.name}".`);
            return false;
        }

        if (config === undefined || config === null) {
            log.debug(`AutorecManager.customize | Clearing custom BBC crosshair configuration from item "${item.name}"`);
            await item.unsetFlag(MODULE_ID, "customConfig");
            return true;
        }

        log.debug(`AutorecManager.customize | Storing custom BBC crosshair configuration on item "${item.name}":`, config);
        await item.setFlag(MODULE_ID, "customConfig", config);
        return true;
    }

    /**
     * Resolve the normalized calling Item and Activity context from a document and workflow payload.
     * Delegates directly to the active system adapter (`systemAdapter.extractCallingContext`).
     * @param {Document} document - Template or Region document
     * @param {Object} [baseContext={}] - Upstream workflow calling context
     * @returns {{item: Item|null, itemName: string, itemId: string, activity: Object|null, activityName: string, activityId: string}} Normalized calling context containing item and activity details
     */
    resolveItemAndActivity(document, baseContext = {}) {
        return systemAdapter.extractCallingContext(document, baseContext);
    }

    /**
     * Index a registered handler in the fast lookup map under its canonical lowercase keys.
     * Normalizes partial configuration objects against canonical DEFAULT_AUTOREC_ENTRY schema.
     * @param {string} registeredKey - Unique registration key (e.g. "Fireball" or "Fireball | 123")
     * @param {Object|Function} handler - Autorec configuration or callback
     * @returns {void}
     */
    indexRegistration(registeredKey, handler) {
        const itemName = handler?.itemName ?? registeredKey.split(" | ")[0].trim();
        const isDefault = Boolean(handler?.isDefault || registeredKey === "DEFAULT");
        const activityId = isDefault ? "" : (handler?.activityId ?? "").trim();
        const activityName = isDefault ? "" : (handler?.activityName ?? "").trim();
        const hasActivity = Boolean(activityId) || Boolean(activityName);
        const enabled = handler?.enabled !== false;
        const baseConfig = typeof handler === "function" ? { handler } : (handler ?? {});
        const entry = {
            ...DEFAULT_AUTOREC_ENTRY,
            ...baseConfig,
            id: registeredKey,
            regKey: registeredKey,
            itemName,
            activityId,
            activityName,
            hasActivity,
            isDefault,
            enabled
        };

        this.fastLookupMap.set(registeredKey.toLowerCase(), entry);

        if (itemName && !activityId && !activityName) {
            this.fastLookupMap.set(itemName.toLowerCase(), entry);
        }
        if (activityId || activityName) {
            const act = Boolean(activityId) ? activityId : activityName;
            this.fastLookupMap.set(`${itemName.toLowerCase()}|${act.toLowerCase()}`, entry);
        }
    }

    /**
     * Rebuild the fast O(1) lookup map from all currently registered handlers.
     * @returns {void}
     */
    rebuildFastLookupMap() {
        this.fastLookupMap.clear();
        for (const [key, handler] of this.registeredHandlers.entries()) {
            this.indexRegistration(key, handler);
        }
    }

    /**
     * Get all registered candidate entries for a given item name, ordered:
     * - Entries WITH an activity filter specified come first (most specific).
     * - Entries WITHOUT an activity filter come last (general item fallback).
     * - Within tiebreaks, order is preserved front-to-back (first registered wins).
     * @param {string} itemName - Target item/spell name
     * @returns {Array<Object>} Ordered candidate autorec entries
     */
    getEntriesForItem(itemName) {
        if (!itemName) return [];
        const cleanName = String(itemName).trim().toLowerCase();
        const candidates = [];
        for (const entry of this.registeredHandlers.values()) {
            if (entry.isDefault || !entry.enabled) continue;
            if ((entry.itemName ?? "").trim().toLowerCase() === cleanName) {
                candidates.push(entry);
            }
        }
        candidates.sort((a, b) => {
            if (a.hasActivity && !b.hasActivity) return -1;
            if (!a.hasActivity && b.hasActivity) return 1;
            return 0;
        });
        return candidates;
    }

    /**
     * Look up a registered autorec entry by exact or case-insensitive item name.
     * @param {string} itemName - Target item/spell name (`"Fireball"`)
     * @returns {Object|null} Registered autorec configuration or null
     */
    getEntryByName(itemName) {
        if (!itemName) return null;
        return this.fastLookupMap.get(itemName.toLowerCase()) ?? null;
    }

    /**
     * Match a canvas Template or Region Document to a registered autorec workflow.
     * Delegates document inspection to the Foundry Adapter (`crosshairAdapter.matchAutorecEntry`).
     * @param {Document} doc - Target candidate Document
     * @returns {Object|null} Registered autorec configuration or null
     */
    getEntryForDocument(doc) {
        if (!doc) return null;
        return crosshairAdapter.matchAutorecEntry(doc, this.registeredHandlers);
    }

    /**
     * Initialize world settings listener hooks and socket synchronization for autorec registrations.
     * @returns {void}
     */
    initializeReadySync() {
        if (this.readySyncInitialized) return;
        this.readySyncInitialized = true;

        socketlib.on((data) => {
            if (!data || typeof data !== "object") return;
            if (data.type === "REGISTER_TEMPLATE") {
                if (game.user?.isGM) {
                    this.register(data.itemName, data.config, { persist: true });
                }
            } else if (data.type === "UNREGISTER_TEMPLATE") {
                if (game.user?.isGM) {
                    this.unregister(data.itemName, { persist: true });
                }
            } else if (data.type === "SYNC_AUTORECS") {
                try {
                    const saved = game.settings?.get(MODULE_ID, "registeredTemplates");
                    if (saved) this.loadSavedRegistrations(saved);
                } catch (e) {
                    log.error("Failed to load saved registeredTemplates setting", e);
                }
                Object.values(ui.windows ?? {}).forEach(w => {
                    if (w && w.id === "bbc-autorec-menu") w.render(false);
                });
            }
        });

        try {
            const saved = game.settings?.get(MODULE_ID, "registeredTemplates");
            if (saved) this.loadSavedRegistrations(saved);
        } catch (e) {
            log.error("Failed to load saved registeredTemplates setting", e);
        }
    }

    /**
     * Persist an autorec configuration to world settings and broadcast socket sync to all connected clients.
     * @param {string} itemName - Registered item/spell name
     * @param {Object} config - Autorec entry configuration
     * @returns {void}
     */
    persistRegistration(itemName, config) {
        if (!game.ready) {
            Hooks.once("ready", () => this.persistRegistration(itemName, config));
            return;
        }

        if (game.user?.isGM) {
            try {
                const saved = foundry.utils.deepClone(game.settings.get(MODULE_ID, "registeredTemplates") ?? {});
                saved[itemName] = config;
                game.settings.set(MODULE_ID, "registeredTemplates", saved);
                this.persistedItemNames.add(itemName);
                this.broadcastSync();
            } catch (e) {
                log.error(`Failed to persist registered template setting for: ${itemName}`, e);
            }
        } else {
            socketlib.emit({ type: "REGISTER_TEMPLATE", itemName, config });
        }
    }

    /**
     * Delete a persisted autorec registration from world settings and broadcast socket sync.
     * @param {string} itemName - Item/spell name to unpersist
     * @returns {void}
     */
    persistUnregistration(itemName) {
        if (!game.ready) {
            Hooks.once("ready", () => this.persistUnregistration(itemName));
            return;
        }

        if (game.user?.isGM) {
            try {
                const saved = foundry.utils.deepClone(game.settings.get(MODULE_ID, "registeredTemplates") ?? {});
                if (itemName in saved) {
                    delete saved[itemName];
                    game.settings.set(MODULE_ID, "registeredTemplates", saved);
                    this.persistedItemNames.delete(itemName);
                    this.broadcastSync();
                }
            } catch (e) {
                log.error(`Failed to unpersist template setting for: ${itemName}`, e);
            }
        } else {
            socketlib.emit({ type: "UNREGISTER_TEMPLATE", itemName });
        }
    }

    /**
     * Load and synchronize saved registrations from world settings into the active runtime registry.
     * @param {Object<string, Object>} [savedRegistrations={}] - Dictionary of saved registrations keyed by item name
     * @returns {void}
     */
    loadSavedRegistrations(savedRegistrations = {}) {
        if (!savedRegistrations || typeof savedRegistrations !== "object") {
            savedRegistrations = {};
        }

        for (const itemName of Array.from(this.persistedItemNames)) {
            const current = this.registeredHandlers.get(itemName);
            if (current?.isDefault) continue;
            if (!(itemName in savedRegistrations)) {
                const isCurrentLocal = Boolean(current?.local);
                if (!isCurrentLocal) {
                    this.unregister(itemName, { persist: false });
                }
                this.persistedItemNames.delete(itemName);
            }
        }

        for (const [itemName, rawConfig] of Object.entries(savedRegistrations)) {
            const config = rawConfig?.handler ?? rawConfig;
            const current = this.registeredHandlers.get(itemName);
            const isCurrentLocal = Boolean(current?.local);
            if (!isCurrentLocal) {
                this.register(itemName, config, { persist: false });
                this.persistedItemNames.add(itemName);
            }
        }

        const currentDefault = this.registeredHandlers.get("DEFAULT") ?? {};
        this.register("DEFAULT", currentDefault, { persist: false });
    }

    /**
     * Register a template placement handler for an item.
     * Turning off any previous registration for that item name and registering the new one.
     *
     * @param {string} itemName - Name of the item/spell (e.g., 'Fireball')
     * @param {Object|Function} [handlerOrConfig={}] - Config object (`{ file: '...', local: true }`) or custom async function (`(token, autoConfig) => ...`)
     * @param {Object} [options={}] - Registration options
     * @param {boolean} [options.persist=true] - Whether to persist registration to world settings across reboots/clients
     * @param {boolean} [options.local=false] - Whether this registration should only exist locally on this client and not persist or sync
     * @returns {void}
     */
    register(itemName, handlerOrConfig = {}, { persist = true, local = false } = {}) {
        if (this._onRegisterCallback) {
            this._onRegisterCallback();
        }
        const isLocal = Boolean(local) || Boolean(handlerOrConfig?.local);

        if (itemName === "DEFAULT" && typeof handlerOrConfig !== "function") {
            handlerOrConfig = {
                ...DEFAULT_AUTOREC_ENTRY,
                ...handlerOrConfig,
                id: "DEFAULT",
                itemName: "DEFAULT",
                isDefault: true,
                activityId: "",
                activityName: "",
                hasActivity: false
            };
        }

        if (this.registeredHandlers.has(itemName)) {
            log.debug(`Re-registering template sequence for item: ${itemName}${isLocal ? " (local only)" : ""}`);
        } else {
            log.debug(`Registering template sequence for item: ${itemName}${isLocal ? " (local only)" : ""}`);
        }
        this.registeredHandlers.set(itemName, handlerOrConfig);
        const registered = this.registeredHandlers.get(itemName);
        this.indexRegistration(itemName, registered);

        if (isLocal) {
            if (this.persistedItemNames.has(itemName)) {
                this.persistUnregistration(itemName);
            }
        } else if (persist && typeof registered !== "function") {
            this.persistRegistration(itemName, registered);
        }
    }

    /**
     * Unregister a template placement handler for an item.
     *
     * @param {string} itemName - Name of the item/spell
     * @param {Object} [options={}] - Unregistration options
     * @param {boolean} [options.persist=true] - Whether to remove registration from world settings across reboots/clients
     * @param {boolean} [options.local=false] - If true, only unregister locally
     * @returns {boolean} True if the item registration was successfully deleted, false otherwise
     */
    unregister(itemName, { persist = true, local = false } = {}) {
        const existing = this.registeredHandlers.get(itemName);
        if (existing?.isDefault) {
            log.warn("AutorecManager | Cannot delete canonical default fallback entry (isDefault: true). You may disable it by setting enabled: false.");
            return false;
        }
        const deleted = this.registeredHandlers.delete(itemName);
        const wasPersisted = this.persistedItemNames.has(itemName);
        if (deleted) {
            this.rebuildFastLookupMap();
            log.debug(`Unregistered template sequence for item: ${itemName}`);
        }
        if (persist && !local && wasPersisted && typeof itemName === "string") {
            this.persistUnregistration(itemName);
        }
        return deleted;
    }

    /**
     * Batch unregister multiple template placement handlers by item name.
     * @param {Array<string>} itemNames - List of item names to unregister
     * @param {Object} [options={}] - Options (`{ persist: boolean, local: boolean }`)
     * @param {boolean} [options.persist=true] - Whether to persist unregistration to world settings
     * @param {boolean} [options.local=false] - Whether to only unregister locally
     * @returns {Promise<void>}
     */
    async unregisterMany(itemNames, { persist = true, local = false } = {}) {
        if (!Array.isArray(itemNames)) return;
        for (const itemName of itemNames) {
            const existing = this.registeredHandlers.get(itemName);
            if (existing?.isDefault) continue;
            this.registeredHandlers.delete(itemName);
            this.persistedItemNames.delete(itemName);
            log.debug(`Unregistered template sequence for item: ${itemName}`);
        }
        this.rebuildFastLookupMap();

        if (persist && !local) {
            const persistedDict = {};
            for (const [itemName, config] of this.registeredHandlers.entries()) {
                if (typeof config !== "function" && !config?.local) {
                    persistedDict[itemName] = config;
                }
            }
            await this.overwrite(persistedDict);
        } else {
            this.broadcastSync();
        }
    }

    /**
     * Batch register multiple template placement handlers.
     * @param {Array<{itemName: string, config: Object, local?: boolean}>} entries - Array of registration entries
     * @param {Object} [options={}] - Registration options (`{ persist: boolean }`)
     * @param {boolean} [options.persist=true] - Whether to persist registrations to world settings
     * @returns {Promise<void>}
     */
    async registerMany(entries, { persist = true } = {}) {
        if (!Array.isArray(entries)) return;
        const toPersist = {};
        for (const { itemName, config, local } of entries) {
            this.register(itemName, config, { persist: false, local });
            const registered = this.registeredHandlers.get(itemName);
            if (persist && !local && typeof registered !== "function") {
                toPersist[itemName] = registered;
                this.persistedItemNames.add(itemName);
            }
        }

        if (persist && Object.keys(toPersist).length > 0) {
            if (game.user?.isGM) {
                try {
                    const saved = foundry.utils.deepClone(game.settings.get(MODULE_ID, "registeredTemplates") ?? {});
                    Object.assign(saved, toPersist);
                    await game.settings.set(MODULE_ID, "registeredTemplates", saved);
                    this.broadcastSync();
                } catch (e) {
                    log.error("Failed to batch persist template registrations:", e);
                }
            } else {
                for (const [itemName, config] of Object.entries(toPersist)) {
                    socketlib.emit({ type: "REGISTER_TEMPLATE", itemName, config });
                }
            }
        }
    }

    /**
     * Overwrite the entire persisted template registration dictionary in world settings.
     * @param {Object<string, Object>} [persistedDict={}] - Entire dictionary of configurations to save
     * @returns {Promise<void>}
     */
    async overwrite(persistedDict = {}) {
        if (game.user?.isGM) {
            try {
                await game.settings.set(MODULE_ID, "registeredTemplates", persistedDict);
                this.persistedItemNames.clear();
                for (const itemName of Object.keys(persistedDict)) {
                    this.persistedItemNames.add(itemName);
                }
                this.broadcastSync();
            } catch (e) {
                log.error("Failed to overwrite registeredTemplates setting:", e);
            }
        } else {
            socketlib.emit({ type: "OVERWRITE_TEMPLATES", persistedDict });
        }
    }

    /**
     * Check if a registered template animation exists for a target Document or item name.
     * @param {string|Document} targetOrName - Item name or candidate Document
     * @returns {boolean} True if a registered handler exists for the target or name
     */
    has(targetOrName) {
        return Boolean(this.get(targetOrName));
    }

    /**
     * Get the registered handler entry for a target item name or Document.
     * Normalizes caller entry boundary before dispatching to single-responsibility lookup helpers (Rule 5).
     * @param {string|Document} targetOrName - Item name or candidate Document
     * @returns {Object|null} Registered autorec entry configuration or null if not found
     */
    get(targetOrName) {
        if (typeof targetOrName === "string") {
            return this.getEntryByName(targetOrName);
        }
        return this.getEntryForDocument(targetOrName);
    }

    /**
     * List all currently registered item names.
     * @returns {Array<string>} Array of registered item/spell names
     */
    list() {
        return Array.from(this.registeredHandlers.keys());
    }

    /**
     * Get all registered entries with structured metadata for UI display and inspection.
     * @returns {Array<Object>} Array of UI-formatted autorec entry dictionaries
     */
    getAllEntries() {
        const results = [];
        for (const [itemName, handlerOrConfig] of this.registeredHandlers.entries()) {
            let type = "Auto-Detect";
            let file = "";
            let isCustomFunction = false;
            let config = {};

            let rawType = "Auto-Detect";
            if (typeof handlerOrConfig === "function") {
                isCustomFunction = true;
                rawType = "Custom Script";
                type = localize("BBC.Autorec.Type.CustomScript", "Custom Script");
                file = localize("BBC.Autorec.File.FunctionHandler", "Function Handler");
            } else {
                config = handlerOrConfig ?? {};
                rawType = config.type ?? "Auto-Detect";
                type = rawType === "Auto-Detect" ? localize("BBC.Autorec.Type.AutoDetect", "Auto-Detect") : rawType;
                file = config.file ?? "";
            }

            const isLocal = Boolean(handlerOrConfig?.local || !this.persistedItemNames.has(itemName));

            const isDefault = Boolean(config.isDefault);
            const circleFile = config.circleFile ?? "eskie.crosshair.circle.fantasy_01.white.full";
            const coneFile = config.coneFile ?? "eskie.crosshair.cone.thin.fantasy_01.white.full";
            const rayFile = config.rayFile ?? "eskie.crosshair.ray.fantasy_01.white";
            const squareFile = config.squareFile ?? "eskie.crosshair.square.fantasy_01.white";

            const unitFt = localize("BBC.Units.Feet", "ft");
            const distVal = config.distance ?? config.radius;
            const distanceDisplay = distVal !== undefined ? `${distVal} ${unitFt}` : null;
            const widthVal = config.width;
            const widthDisplay = widthVal !== undefined ? `${widthVal} ${unitFt}` : null;
            const angleVal = config.angle;
            const angleDisplay = angleVal !== undefined ? `${angleVal}°` : null;
            const stickToToken = Boolean(config.stickToToken);
            const stickToTokenMode = stickToToken ? "true" : "false";
            const isStickOn = stickToToken;
            const isStickOff = !stickToToken;
            const isStickDefault = false;
            const showLine = config.showLine !== false;
            const lineFile = config.lineFile ?? "eskie.crosshair.line.generic_01.white";
            const borderColor = config.borderColor ?? "#ffffff";
            const borderAlpha = config.borderAlpha ?? 0;
            const fillColor = config.fillColor ?? "#000000";
            const fillAlpha = config.fillAlpha ?? 0;
            const hasCustomStyling = Boolean(
                config.borderColor ||
                (config.borderAlpha !== undefined && config.borderAlpha !== 0) ||
                config.fillColor ||
                (config.fillAlpha !== undefined && config.fillAlpha !== 0)
            );
            const icon = config.icon ?? null;

            const placedFillColor = config.placedFillColor ?? "#0099ff";
            const placedFillAlpha = config.placedFillAlpha ?? 0.25;
            const placedBorderColor = config.placedBorderColor ?? "#000000";
            const placedBorderAlpha = config.placedBorderAlpha ?? 1;
            const hasPlacedStyling = Boolean(
                config.placedFillColor ||
                (config.placedFillAlpha !== undefined && config.placedFillAlpha !== 0.25) ||
                config.placedBorderColor ||
                (config.placedBorderAlpha !== undefined && config.placedBorderAlpha !== 1)
            );

            const concurrentCode = (config.concurrentCode ?? "").trim();
            const postPlacementCode = (config.postPlacementCode ?? "").trim();
            const cleanItemName = config.itemName ?? itemName;
            const activityId = isDefault ? "" : (config.activityId ?? "");
            const activityName = isDefault ? "" : (config.activityName ?? "");
            const hasActivity = Boolean(activityId || activityName);
            const activityDisplay = activityName !== "" ? activityName : activityId;
            const enabled = config.enabled !== false;

            results.push({
                regKey: itemName,
                itemName: isDefault ? "DEFAULT" : cleanItemName,
                isDefault,
                enabled,
                activityId,
                activityName,
                hasActivity,
                activityDisplay,
                supportsActivities: systemAdapter.supportsActivities,
                type,
                typeKey: rawType.toLowerCase(),
                isAutoDetect: rawType === "Auto-Detect",
                circleFile,
                coneFile,
                rayFile,
                squareFile,
                file,
                isCustomFunction,
                isLocal,
                config,
                distanceDisplay,
                widthDisplay,
                angleDisplay,
                stickToToken,
                stickToTokenMode,
                isStickDefault,
                isStickOn,
                isStickOff,
                showLine,
                lineFile,
                borderColor,
                borderAlpha,
                fillColor,
                fillAlpha,
                hasCustomStyling,
                placedFillColor,
                placedFillAlpha,
                placedBorderColor,
                placedBorderAlpha,
                hasPlacedStyling,
                concurrentCode,
                postPlacementCode,
                icon,
            });
        }
        return results.sort((a, b) => {
            if (a.isDefault && !b.isDefault) return -1;
            if (!a.isDefault && b.isDefault) return 1;
            return a.itemName.localeCompare(b.itemName);
        });
    }

    /**
     * Broadcast a socket synchronization event (`SYNC_AUTORECS`) to all connected clients.
     * @returns {void}
     */
    broadcastSync() {
        socketlib.emit({ type: "SYNC_AUTORECS" });
    }
}

/**
 * Singleton instance of AutorecManager for managing template and region autorec registrations.
 * @type {AutorecManager}
 */
export const autorecManager = new AutorecManager();
