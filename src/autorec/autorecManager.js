import { MODULE_ID } from '../lib/constants.js';
import { log } from '../lib/logger.js';

/**
 * AutorecManager manages automatic recognition (autorec) registrations for template/region items.
 * Encapsulated as a class instead of free-floating module-level functions.
 */
export class AutorecManager {
    constructor() {
        this.registeredHandlers = new Map();
        this.fastLookupMap = new Map();
        this.persistedItemNames = new Set();
        this.readySyncInitialized = false;
        this._onRegisterCallback = null;

        this.resolveItemAndActivity = this.resolveItemAndActivity.bind(this);
        this.indexRegistration = this.indexRegistration.bind(this);
        this.rebuildFastLookupMap = this.rebuildFastLookupMap.bind(this);
        this.getRegisteredEntry = this.getRegisteredEntry.bind(this);
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
        this.broadcastSync = this.broadcastSync.bind(this);
    }

    /**
     * Set a callback to be invoked when registration occurs (e.g. to initialize placement hooks).
     * @param {Function} callback
     */
    onRegister(callback) {
        if (typeof callback === "function") {
            this._onRegisterCallback = callback;
        }
    }

    /**
     * Resolve the parent Item and Activity (if present) from a template/region target.
     */
    resolveItemAndActivity(target) {
        const doc = target.document ?? target;
        let itemObj = doc.item;
        let activityObj = null;

        if (!itemObj && doc.flags?.dnd5e?.origin && typeof fromUuidSync === "function") {
            try { itemObj = fromUuidSync(doc.flags.dnd5e.origin); } catch (e) {}
        }
        if (!itemObj && doc.flags?.['midi-qol']?.itemUuid && typeof fromUuidSync === "function") {
            try { itemObj = fromUuidSync(doc.flags['midi-qol'].itemUuid); } catch (e) {}
        }

        // Check if itemObj is actually an Activity (has parent Item in .item or .parent)
        if (itemObj && (itemObj.item || (itemObj.parent && itemObj.parent.documentName === "Item"))) {
            activityObj = itemObj;
            itemObj = itemObj.item || itemObj.parent;
        }

        return {
            item: itemObj,
            itemName: itemObj?.name,
            itemId: itemObj?.id,
            activity: activityObj,
            activityName: activityObj?.name,
            activityId: activityObj?.id
        };
    }

    indexRegistration(registeredKey, handler) {
        let reqItem = registeredKey;
        let reqActivity = handler?.activity;

        if (registeredKey.includes("|")) {
            const parts = registeredKey.split("|").map(p => p.trim());
            reqItem = parts[0];
            reqActivity = reqActivity || parts[1];
        } else if (registeredKey.includes(":")) {
            const parts = registeredKey.split(":").map(p => p.trim());
            reqItem = parts[0];
            reqActivity = reqActivity || parts[1];
        }

        const entry = { itemName: registeredKey, handler };

        if (reqActivity) {
            const iKeys = [reqItem, reqItem.toLowerCase()];
            const aKeys = [reqActivity, reqActivity.toLowerCase()];
            for (const ik of iKeys) {
                for (const ak of aKeys) {
                    this.fastLookupMap.set(`${ik}|${ak}`, entry);
                    this.fastLookupMap.set(`${ik}:${ak}`, entry);
                }
            }
        } else {
            this.fastLookupMap.set(reqItem, entry);
            this.fastLookupMap.set(reqItem.toLowerCase(), entry);
        }
    }

    rebuildFastLookupMap() {
        this.fastLookupMap.clear();
        for (const [key, handler] of this.registeredHandlers.entries()) {
            this.indexRegistration(key, handler);
        }
    }

    /**
     * Helper to match a template/region document or placeable to a registered item name in O(1) time.
     * Supports:
     * - Item name or ID alone (e.g. "Longbow") -> matches all activities on Longbow
     * - Item and Activity name (e.g. "Longbow | Special Attack" or "Longbow: Special Attack") -> matches only that activity on Longbow
     */
    getRegisteredEntry(target) {
        if (!target) return null;
        if (typeof target === "string") {
            return this.fastLookupMap.get(target) || this.fastLookupMap.get(target.toLowerCase()) || null;
        }

        const { item, itemName, itemId, activityName, activityId } = this.resolveItemAndActivity(target);

        if (!itemName && !itemId) return null;

        const lookupKeys = [];

        // 1. Most specific: Item + Activity combinations
        if (activityName || activityId) {
            const iKeys = [itemId, itemName, itemName?.toLowerCase()].filter(Boolean);
            const aKeys = [activityId, activityName, activityName?.toLowerCase()].filter(Boolean);
            for (const ik of iKeys) {
                for (const ak of aKeys) {
                    lookupKeys.push(`${ik}|${ak}`);
                    lookupKeys.push(`${ik}:${ak}`);
                }
            }
        }

        // 2. Item-only combinations
        if (itemId) lookupKeys.push(itemId);
        if (itemName) {
            lookupKeys.push(itemName);
            lookupKeys.push(itemName.toLowerCase());
        }

        for (const key of lookupKeys) {
            const match = this.fastLookupMap.get(key);
            if (match) {
                log.debug(`getRegisteredEntry | Fast O(1) match "${match.itemName}" found for lookup key "${key}"`);
                return { ...match, item };
            }
        }

        return null;
    }

    initializeReadySync() {
        if (this.readySyncInitialized) return;
        this.readySyncInitialized = true;

        if (game.socket) {
            game.socket.on(`module.${MODULE_ID}`, (data) => {
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
                        log.warn("Failed to load saved registeredTemplates setting", e);
                    }
                    Object.values(ui.windows || {}).forEach(w => {
                        if (w && w.id === "bbc-autorec-menu") w.render(false);
                    });
                }
            });
        }

        try {
            const saved = game.settings?.get(MODULE_ID, "registeredTemplates");
            if (saved) this.loadSavedRegistrations(saved);
        } catch (e) {
            log.warn("Failed to load saved registeredTemplates setting", e);
        }
    }

    persistRegistration(itemName, config) {
        if (!game.ready) {
            Hooks.once("ready", () => this.persistRegistration(itemName, config));
            return;
        }

        if (game.user?.isGM) {
            try {
                const saved = foundry.utils.deepClone(game.settings.get(MODULE_ID, "registeredTemplates") || {});
                saved[itemName] = config;
                game.settings.set(MODULE_ID, "registeredTemplates", saved);
                this.persistedItemNames.add(itemName);
                this.broadcastSync();
            } catch (e) {
                log.warn(`Failed to persist registered template setting for: ${itemName}`, e);
            }
        } else if (game.socket) {
            game.socket.emit(`module.${MODULE_ID}`, {
                type: "REGISTER_TEMPLATE",
                itemName,
                config
            });
        }
    }

    persistUnregistration(itemName) {
        if (!game.ready) {
            Hooks.once("ready", () => this.persistUnregistration(itemName));
            return;
        }

        if (game.user?.isGM) {
            try {
                const saved = foundry.utils.deepClone(game.settings.get(MODULE_ID, "registeredTemplates") || {});
                if (itemName in saved) {
                    delete saved[itemName];
                    game.settings.set(MODULE_ID, "registeredTemplates", saved);
                    this.persistedItemNames.delete(itemName);
                    this.broadcastSync();
                }
            } catch (e) {
                log.warn(`Failed to unpersist template setting for: ${itemName}`, e);
            }
        } else if (game.socket) {
            game.socket.emit(`module.${MODULE_ID}`, {
                type: "UNREGISTER_TEMPLATE",
                itemName
            });
        }
    }

    loadSavedRegistrations(savedRegistrations = {}) {
        if (!savedRegistrations || typeof savedRegistrations !== "object") {
            savedRegistrations = {};
        }

        for (const itemName of Array.from(this.persistedItemNames)) {
            if (!(itemName in savedRegistrations)) {
                const current = this.registeredHandlers.get(itemName);
                const isCurrentLocal = typeof current === "object" && current !== null && current.local === true;
                if (!isCurrentLocal) {
                    this.unregister(itemName, { persist: false });
                }
                this.persistedItemNames.delete(itemName);
            }
        }

        for (const [itemName, rawConfig] of Object.entries(savedRegistrations)) {
            const config = rawConfig?.handler || rawConfig?.config || rawConfig;
            const current = this.registeredHandlers.get(itemName);
            const isCurrentLocal = typeof current === "object" && current !== null && current.local === true;
            if (!isCurrentLocal) {
                this.register(itemName, config, { persist: false });
                this.persistedItemNames.add(itemName);
            }
        }
    }

    /**
     * Register a template placement handler for an item.
     * Turning off any previous registration for that item name and registering the new one.
     *
     * @param {string} itemName - Name of the item/spell (e.g., 'Fireball')
     * @param {Function|Object|string} [handlerOrConfig={}] - Optional string file path, config object (e.g. { file: '...', local: true }), or custom async function(token, autoConfig)
     * @param {Object} [options={}]
     * @param {boolean} [options.persist=true] - Whether to persist registration to world settings across reboots/clients
     * @param {boolean} [options.local=false] - Whether this registration should only exist locally on this client and not persist or sync
     */
    register(itemName, handlerOrConfig = {}, { persist = true, local = false } = {}) {
        if (this._onRegisterCallback) {
            this._onRegisterCallback();
        }
        if (typeof handlerOrConfig === "string") {
            handlerOrConfig = { file: handlerOrConfig };
        }
        const isLocal = local || (typeof handlerOrConfig === "object" && handlerOrConfig !== null && handlerOrConfig.local === true);

        if (this.registeredHandlers.has(itemName)) {
            log.info(`Re-registering template sequence for item: ${itemName}${isLocal ? " (local only)" : ""}`);
        } else {
            log.info(`Registering template sequence for item: ${itemName}${isLocal ? " (local only)" : ""}`);
        }
        this.registeredHandlers.set(itemName, handlerOrConfig);
        this.indexRegistration(itemName, handlerOrConfig);

        if (isLocal) {
            if (this.persistedItemNames.has(itemName)) {
                this.persistUnregistration(itemName);
            }
        } else if (persist && typeof handlerOrConfig !== "function") {
            this.persistRegistration(itemName, handlerOrConfig);
        }
    }

    /**
     * Unregister a template placement handler for an item.
     *
     * @param {string} itemName - Name of the item/spell
     * @param {Object} [options={}]
     * @param {boolean} [options.persist=true] - Whether to remove registration from world settings across reboots/clients
     * @param {boolean} [options.local=false] - If true, only unregister locally
     */
    unregister(itemName, { persist = true, local = false } = {}) {
        const deleted = this.registeredHandlers.delete(itemName);
        const wasPersisted = this.persistedItemNames.has(itemName);
        if (deleted) {
            this.rebuildFastLookupMap();
            log.info(`Unregistered template sequence for item: ${itemName}`);
        }
        if (persist && !local && wasPersisted && typeof itemName === "string") {
            this.persistUnregistration(itemName);
        }
        return deleted;
    }

    async unregisterMany(itemNames, { persist = true, local = false } = {}) {
        if (!Array.isArray(itemNames)) return;
        for (const itemName of itemNames) {
            this.registeredHandlers.delete(itemName);
            this.persistedItemNames.delete(itemName);
            log.info(`Unregistered template sequence for item: ${itemName}`);
        }
        this.rebuildFastLookupMap();

        if (persist && !local) {
            const persistedDict = {};
            for (const [itemName, config] of this.registeredHandlers.entries()) {
                if (config && typeof config === "object" && !config.local && typeof config !== "function") {
                    persistedDict[itemName] = config;
                }
            }
            await this.overwrite(persistedDict);
        } else {
            this.broadcastSync();
        }
    }

    async registerMany(entries, { persist = true } = {}) {
        if (!Array.isArray(entries)) return;
        const toPersist = {};
        for (const { itemName, config, local } of entries) {
            this.registeredHandlers.set(itemName, config);
            this.indexRegistration(itemName, config);
            if (persist && !local && typeof config !== "function") {
                toPersist[itemName] = config;
                this.persistedItemNames.add(itemName);
            }
        }

        if (persist && Object.keys(toPersist).length > 0) {
            if (game.user?.isGM) {
                try {
                    const saved = foundry.utils.deepClone(game.settings.get(MODULE_ID, "registeredTemplates") || {});
                    Object.assign(saved, toPersist);
                    await game.settings.set(MODULE_ID, "registeredTemplates", saved);
                    this.broadcastSync();
                } catch (e) {
                    log.warn("Failed to batch persist template registrations:", e);
                }
            } else if (game.socket) {
                for (const [itemName, config] of Object.entries(toPersist)) {
                    game.socket.emit(`module.${MODULE_ID}`, { type: "REGISTER_TEMPLATE", itemName, config });
                }
            }
        }
    }

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
                log.warn("Failed to overwrite registeredTemplates setting:", e);
            }
        } else if (game.socket) {
            game.socket.emit(`module.${MODULE_ID}`, {
                type: "OVERWRITE_TEMPLATES",
                persistedDict
            });
        }
    }

    /**
     * Check if a registered template animation exists for a target document or item name in O(1) time.
     */
    has(targetOrName) {
        return this.getRegisteredEntry(targetOrName) !== null;
    }

    /**
     * Get the registered handler entry for a target document or item name in O(1) time.
     */
    get(targetOrName) {
        return this.getRegisteredEntry(targetOrName);
    }

    /**
     * List all currently registered item names.
     */
    list() {
        return Array.from(this.registeredHandlers.keys());
    }

    /**
     * Get all registered entries with structured metadata for UI inspection.
     */
    getAllEntries() {
        const results = [];
        for (const [itemName, handlerOrConfig] of this.registeredHandlers.entries()) {
            let type = "Auto-Detect";
            let file = "";
            let isCustomFunction = false;
            let config = {};

            if (typeof handlerOrConfig === "function") {
                isCustomFunction = true;
                type = "Custom Script";
                file = "Function Handler";
            } else if (typeof handlerOrConfig === "string") {
                file = handlerOrConfig;
                type = "Auto-Detect";
            } else if (typeof handlerOrConfig === "object" && handlerOrConfig !== null) {
                config = handlerOrConfig.handler || handlerOrConfig.config || handlerOrConfig;
                type = config.type || "Auto-Detect";
                file = config.file || config.animationFile || "";
            }

            let isLocal = !this.persistedItemNames.has(itemName);
            if (typeof handlerOrConfig === "object" && handlerOrConfig !== null && handlerOrConfig.local === true) {
                isLocal = true;
            }

            const circleFile = config.circleFile || config.file || "eskie.crosshair.circle.fantasy_01.white.full";
            const coneFile = config.coneFile || config.file || "eskie.crosshair.cone.thin.fantasy_01.white.full";
            const rayFile = config.rayFile || config.file || "eskie.crosshair.ray.fantasy_01.white";
            const squareFile = config.squareFile || config.rayFile || config.file || "eskie.crosshair.ray.fantasy_01.white";

            const typeKey = "auto-detect";
            const distVal = config.distance ?? config.radius ?? config.length;
            const distanceDisplay = distVal !== undefined ? `${distVal} ft` : null;
            const widthVal = config.width;
            const widthDisplay = widthVal !== undefined ? `${widthVal} ft` : null;
            const angleVal = config.angle;
            const angleDisplay = angleVal !== undefined ? `${angleVal}°` : null;
            const stickToToken = Boolean(config.stickToToken ?? config.attachToToken ?? config.lockToToken ?? (typeKey === "cone"));
            const showLine = config.showLine !== false;
            const lineFile = config.lineFile || "eskie.crosshair.line.generic_01.white";
            const borderColor = config.borderColor || "#ffffff";
            const borderAlpha = config.borderAlpha !== undefined ? config.borderAlpha : 0;
            const fillColor = config.fillColor || "#000000";
            const fillAlpha = config.fillAlpha !== undefined ? config.fillAlpha : 0;
            const hasCustomStyling = Boolean(
                config.borderColor ||
                config.borderAlpha !== undefined ||
                config.fillColor ||
                config.fillAlpha !== undefined
            );
            const icon = config.icon || null;

            const placedFillColor = config.placedFillColor || config.templateFillColor || "#0099ff";
            const placedFillAlpha = config.placedFillAlpha !== undefined ? config.placedFillAlpha : (config.templateFillAlpha !== undefined ? config.templateFillAlpha : 0.25);
            const placedBorderColor = config.placedBorderColor || config.templateBorderColor || "#000000";
            const placedBorderAlpha = config.placedBorderAlpha !== undefined ? config.placedBorderAlpha : (config.templateBorderAlpha !== undefined ? config.templateBorderAlpha : 1);
            const hasPlacedStyling = Boolean(
                config.placedFillColor ||
                config.placedFillAlpha !== undefined ||
                config.templateFillColor ||
                config.templateFillAlpha !== undefined ||
                config.placedBorderColor ||
                config.placedBorderAlpha !== undefined ||
                config.templateBorderColor ||
                config.templateBorderAlpha !== undefined
            );

            const concurrentCode = config.concurrentCode || config.preAnimationCode || config.customCode || "";
            const postPlacementCode = config.postPlacementCode || config.postCode || config.postRegionCode || config.postTemplateCode || "";
            results.push({
                itemName,
                type: "Auto-Detect",
                typeKey: "auto-detect",
                isAutoDetect: true,
                circleFile,
                coneFile,
                rayFile,
                squareFile,
                file: circleFile,
                isCustomFunction,
                isLocal,
                config,
                distanceDisplay,
                widthDisplay,
                angleDisplay,
                stickToToken,
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
        return results.sort((a, b) => a.itemName.localeCompare(b.itemName));
    }

    broadcastSync() {
        if (game.socket) {
            game.socket.emit(`module.${MODULE_ID}`, { type: "SYNC_AUTORECS" });
        }
    }
}

export const autorecManager = new AutorecManager();
globalThis.autorecManager = autorecManager;

