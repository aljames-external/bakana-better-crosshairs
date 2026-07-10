import { MODULE_ID } from './constants.js';
import { log } from './logger.js';
import { crosshair } from '../crosshair/_crosshairs.js';
import { Token } from './compat.js';
import { crosshairAdapter } from '../adapter/foundry/index.js';

const registeredHandlers = new Map();
const fastLookupMap = new Map();
const pendingPlacements = new Map();
const persistedItemNames = new Set();
let hooksInitialized = false;
let readySyncInitialized = false;

/**
 * Resolve the parent Item and Activity (if present) from a template/region target.
 */
function resolveItemAndActivity(target) {
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

function indexRegistration(registeredKey, handler) {
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
                fastLookupMap.set(`${ik}|${ak}`, entry);
                fastLookupMap.set(`${ik}:${ak}`, entry);
            }
        }
    } else {
        fastLookupMap.set(reqItem, entry);
        fastLookupMap.set(reqItem.toLowerCase(), entry);
    }
}

function rebuildFastLookupMap() {
    fastLookupMap.clear();
    for (const [key, handler] of registeredHandlers.entries()) {
        indexRegistration(key, handler);
    }
}

/**
 * Helper to match a template/region document or placeable to a registered item name in O(1) time.
 * Supports:
 * - Item name or ID alone (e.g. "Longbow") -> matches all activities on Longbow
 * - Item and Activity name (e.g. "Longbow | Special Attack" or "Longbow: Special Attack") -> matches only that activity on Longbow
 */
function getRegisteredEntry(target) {
    if (!target) return null;
    if (typeof target === "string") {
        return fastLookupMap.get(target) || fastLookupMap.get(target.toLowerCase()) || null;
    }

    const { item, itemName, itemId, activity, activityName, activityId } = resolveItemAndActivity(target);
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
        const match = fastLookupMap.get(key);
        if (match) {
            log.debug(`getRegisteredEntry | Fast O(1) match "${match.itemName}" found for lookup key "${key}"`);
            return { ...match, item };
        }
    }

    return null;
}

/**
 * Check if the current user is the owner/author of the document or preview.
 */
function isOwner(doc) {
    if (!doc.id) return true; // Preview templates on canvas are always local to the drawing client
    const userId = doc.author?.id ?? doc.author ?? doc.user?.id ?? doc.user ?? game.user.id;
    return userId === game.user.id;
}

/**
 * Detect shape type and dimensions from a template or region placeable/document.
 */
function detectTemplateProperties(target) {
    const doc = target.document ?? target;
    const props = crosshairAdapter.detectProperties(doc);
    return { ...props, radius: props.distance };
}

/**
 * Handle preview drawing (v13 drawMeasuredTemplate / v14 drawRegion).
 */
async function handleDrawPreview(placeable) {
    const doc = placeable.document ?? placeable;
    log.debug(`handleDrawPreview | Hook fired for doc.id=${doc.id || "preview"}`);
    // Only intercept preview instances (uncreated documents) for the local owner
    if (doc.id || !isOwner(doc)) {
        log.debug(`handleDrawPreview | Skipping non-preview or non-owned placeable (doc.id=${doc.id})`);
        return;
    }

    const entry = getRegisteredEntry(placeable);
    if (!entry) {
        log.debug(`handleDrawPreview | No registered handler matched for preview.`);
        return;
    }

    log.info(`handleDrawPreview | Intercepting template preview for "${entry.itemName}"`);

    // 1. Immediately hide the Foundry template/region preview graphic completely so custom Sequencer visuals take over
    crosshairAdapter.hidePreview(placeable);

    // 2. Resolve token context
    let rawToken = entry.item?.parent?.getActiveTokens?.()[0] || doc.item?.parent?.getActiveTokens?.()[0] || canvas.tokens?.controlled?.[0] || undefined;
    const token = rawToken instanceof Token ? rawToken : (rawToken?.object instanceof Token ? rawToken.object : rawToken);
    log.debug(`handleDrawPreview | Using token context:`, token?.name);

    const placementKey = `${entry.itemName}_${game.user.id}`;
    const pending = {
        itemName: entry.itemName,
        resolved: false,
        cancelled: false,
        coords: null,
        originalTemplate: placeable,
        config: typeof entry.handler === "object" && entry.handler !== null ? entry.handler : {}
    };
    pendingPlacements.set(placementKey, pending);

    const context = {
        x: undefined,
        y: undefined,
        distance: undefined,
        direction: undefined,
        t: undefined,
        radius: undefined,
        rotation: undefined,
        type: undefined,
        cancelled: false,
        resolved: false,
        promise: null,
        resolve(coords = {}) {
            log.debug(`context.resolve | Sequencer crosshair PLACED at (${coords.x}, ${coords.y}). Allowing original workflow document creation...`, coords);
            Object.assign(this, coords);
            this.resolved = true;

            const pending = pendingPlacements.get(placementKey);
            if (pending) {
                pending.coords = coords;
                pending.resolved = true;

                const previewDoc = pending.originalTemplate?.document;
                if (previewDoc) {
                    crosshairAdapter.updatePreviewShape(previewDoc, coords);
                }
            }

            // Clean up any lingering preview placeables on the canvas
            crosshairAdapter.clearPreviewCanvas();
        },
        cancel() {
            log.debug(`context.cancel | Sequencer crosshair CANCELLED for "${entry.itemName}"`);
            this.cancelled = true;
            this.resolved = true;
            const pending = pendingPlacements.get(placementKey);
            if (pending) {
                pending.cancelled = true;
                pending.resolved = true;
            }
            crosshairAdapter.clearPreviewCanvas();
            pendingPlacements.delete(placementKey);
        }
    };

    try {
        // 3. Auto-detect template properties and assemble sequence config
        const detected = detectTemplateProperties(placeable);
        const item = doc.item || entry.item;
        const actor = token?.actor || item?.actor;
        const autoConfig = {
            ...detected,
            context,
            icon: doc.item?.img || doc.flags?.['midi-qol']?.itemImg,
            item,
            actor,
            scope: { item, actor, token, doc }
        };
        log.debug(`handleDrawPreview | Auto-detected sequence config for "${entry.itemName}":`, autoConfig);

        let result;
        if (typeof entry.handler === "function") {
            result = await entry.handler(token, autoConfig);
        } else {
            const mergedConfig = foundry.utils.mergeObject(autoConfig, entry.handler || {}, { inplace: false });
            const crosshairType = mergedConfig.type || "circle";
            const builder = crosshair[crosshairType] || crosshair.circle;
            log.debug(`handleDrawPreview | Playing default "${crosshairType}" crosshair for "${entry.itemName}" with config:`, mergedConfig);
            result = await builder.play(token, mergedConfig);
        }
        log.debug(`handleDrawPreview | Sequencer crosshair sequence initiated for "${entry.itemName}". Awaiting placement click...`);
    } catch (err) {
        log.error(`Error running sequencer sequence for ${entry.itemName}:`, err);
        pending.cancelled = true;
        pending.resolved = true;
    }
}

function formatRegionShapeUpdate(originalShape, coords) {
    return crosshairAdapter.formatShapeUpdate(originalShape, coords);
}

/**
 * Handle document preCreate (v13 preCreateMeasuredTemplate / v14 preCreateRegion).
 */
function handlePreCreate(doc, data, options, userId) {
    // Ensure only the hook owner processes their own creation
    if (userId !== game.user.id) return true;

    const entry = getRegisteredEntry(doc);
    if (!entry) return true;

    const placementKey = `${entry.itemName}_${game.user.id}`;
    const pending = pendingPlacements.get(placementKey);
    if (!pending) return true;

    // If the sequencer sequence was right-click cancelled, abort placement
    if (pending.cancelled) {
        log.debug(`handlePreCreate | Cancelling placement for key=${placementKey}`);
        pendingPlacements.delete(placementKey);
        return false;
    }

    log.debug(`handlePreCreate | Document inspect ->`, {
        documentName: doc.documentName,
        docObject: typeof doc.toObject === "function" ? doc.toObject() : doc,
        shapes: doc.shapes,
        pendingCoords: pending.coords
    });

    // If the sequencer sequence has resolved with coordinates, update the document
    if (pending.resolved && pending.coords) {
        const updateData = crosshairAdapter.formatDocumentUpdate(doc, pending.coords, pending.config || {});
        doc.updateSource(updateData);
        pendingPlacements.delete(placementKey);
        log.debug(`handlePreCreate | Updating workflow document source and allowing creation for key=${placementKey}`, updateData);
        return true;
    }

    // If sequence is still interactive/running, defer creation until sequence resolves
    pending.deferredCreateData = doc.toObject();
    log.debug(`handlePreCreate | Deferring original preview creation while Sequencer crosshair is active`);
    return false;
}

/**
 * Handle document post-creation hook (v13 createMeasuredTemplate / v14 createRegion).
 * Executes user-configured post-placement Javascript inside a try/catch block with standard context variables.
 */
async function handleCreateDocument(doc, options, userId) {
    if (userId !== game.user?.id) return;

    const entry = getRegisteredEntry(doc);
    const flagsConfig = doc.flags?.bbc;
    const config = (entry?.handler && typeof entry.handler === "object" ? entry.handler : (flagsConfig || {}));

    const code = config.postPlacementCode || config.postCode || config.postRegionCode || config.postTemplateCode;
    if (!code || typeof code !== "string" || !code.trim()) return;

    const token = canvas.tokens?.controlled?.[0] || undefined;
    const item = config.item || doc.item;
    const actor = token?.actor || item?.actor || config.actor;
    const scope = { doc, token, actor, item, config };

    try {
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        const fn = new AsyncFunction(
            "doc",
            "token",
            "actor",
            "item",
            "scope",
            "config",
            "canvas",
            "game",
            code
        );
        await fn(doc, token, actor, item, scope, config, canvas, game);
    } catch (e) {
        log.error(`Error executing post-placement script for ${doc.documentName}:`, e);
    }
}

function initializeReadySync() {
    if (readySyncInitialized) return;
    readySyncInitialized = true;

    if (game.socket) {
        game.socket.on(`module.${MODULE_ID}`, (data) => {
            if (!data || typeof data !== "object") return;
            if (data.type === "REGISTER_TEMPLATE") {
                if (game.user?.isGM) {
                    register(data.itemName, data.config, { persist: true });
                }
            } else if (data.type === "UNREGISTER_TEMPLATE") {
                if (game.user?.isGM) {
                    unregister(data.itemName, { persist: true });
                }
            } else if (data.type === "SYNC_AUTORECS") {
                try {
                    const saved = game.settings?.get(MODULE_ID, "registeredTemplates");
                    if (saved) loadSavedRegistrations(saved);
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
        if (saved) loadSavedRegistrations(saved);
    } catch (e) {
        log.warn("Failed to load saved registeredTemplates setting", e);
    }
}

function initializeHooks() {
    if (hooksInitialized) return;
    hooksInitialized = true;

    crosshairAdapter.registerPlacementHooks({
        onDrawPreview: (placeable) => handleDrawPreview(placeable),
        onPreCreate: (doc, data, options, userId) => handlePreCreate(doc, data, options, userId),
        onCreate: (doc, options, userId) => handleCreateDocument(doc, options, userId)
    });

    if (game.ready) {
        initializeReadySync();
    } else {
        Hooks.once("ready", initializeReadySync);
    }
}

function persistRegistration(itemName, config) {
    if (!game.ready) {
        Hooks.once("ready", () => persistRegistration(itemName, config));
        return;
    }

    if (game.user?.isGM) {
        try {
            const saved = foundry.utils.deepClone(game.settings.get(MODULE_ID, "registeredTemplates") || {});
            saved[itemName] = config;
            game.settings.set(MODULE_ID, "registeredTemplates", saved);
            persistedItemNames.add(itemName);
            broadcastSync();
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

function persistUnregistration(itemName) {
    if (!game.ready) {
        Hooks.once("ready", () => persistUnregistration(itemName));
        return;
    }

    if (game.user?.isGM) {
        try {
            const saved = foundry.utils.deepClone(game.settings.get(MODULE_ID, "registeredTemplates") || {});
            if (itemName in saved) {
                delete saved[itemName];
                game.settings.set(MODULE_ID, "registeredTemplates", saved);
                persistedItemNames.delete(itemName);
                broadcastSync();
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

function loadSavedRegistrations(savedRegistrations = {}) {
    if (!savedRegistrations || typeof savedRegistrations !== "object") {
        savedRegistrations = {};
    }

    for (const itemName of Array.from(persistedItemNames)) {
        if (!(itemName in savedRegistrations)) {
            const current = registeredHandlers.get(itemName);
            const isCurrentLocal = typeof current === "object" && current !== null && current.local === true;
            if (!isCurrentLocal) {
                unregister(itemName, { persist: false });
            }
            persistedItemNames.delete(itemName);
        }
    }

    for (const [itemName, rawConfig] of Object.entries(savedRegistrations)) {
        const config = rawConfig?.handler || rawConfig?.config || rawConfig;
        const current = registeredHandlers.get(itemName);
        const isCurrentLocal = typeof current === "object" && current !== null && current.local === true;
        if (!isCurrentLocal) {
            register(itemName, config, { persist: false });
            persistedItemNames.add(itemName);
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
function register(itemName, handlerOrConfig = {}, { persist = true, local = false } = {}) {
    initializeHooks();
    if (typeof handlerOrConfig === "string") {
        handlerOrConfig = { file: handlerOrConfig };
    }
    const isLocal = local || (typeof handlerOrConfig === "object" && handlerOrConfig !== null && handlerOrConfig.local === true);

    if (registeredHandlers.has(itemName)) {
        log.info(`Re-registering template sequence for item: ${itemName}${isLocal ? " (local only)" : ""}`);
    } else {
        log.info(`Registering template sequence for item: ${itemName}${isLocal ? " (local only)" : ""}`);
    }
    registeredHandlers.set(itemName, handlerOrConfig);
    indexRegistration(itemName, handlerOrConfig);

    if (isLocal) {
        if (persistedItemNames.has(itemName)) {
            persistUnregistration(itemName);
        }
    } else if (persist && typeof handlerOrConfig !== "function") {
        persistRegistration(itemName, handlerOrConfig);
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
function unregister(itemName, { persist = true, local = false } = {}) {
    const deleted = registeredHandlers.delete(itemName);
    const wasPersisted = persistedItemNames.has(itemName);
    if (deleted) {
        rebuildFastLookupMap();
        log.info(`Unregistered template sequence for item: ${itemName}`);
    }
    if (persist && !local && wasPersisted && typeof itemName === "string") {
        persistUnregistration(itemName);
    }
    return deleted;
}

async function unregisterMany(itemNames, { persist = true, local = false } = {}) {
    if (!Array.isArray(itemNames)) return;
    for (const itemName of itemNames) {
        registeredHandlers.delete(itemName);
        persistedItemNames.delete(itemName);
        log.info(`Unregistered template sequence for item: ${itemName}`);
    }
    rebuildFastLookupMap();

    if (persist && !local) {
        const persistedDict = {};
        for (const [itemName, config] of registeredHandlers.entries()) {
            if (config && typeof config === "object" && !config.local && typeof config !== "function") {
                persistedDict[itemName] = config;
            }
        }
        await overwrite(persistedDict);
    } else {
        broadcastSync();
    }
}

async function registerMany(entries, { persist = true } = {}) {
    if (!Array.isArray(entries)) return;
    const toPersist = {};
    for (const { itemName, config, local } of entries) {
        registeredHandlers.set(itemName, config);
        indexRegistration(itemName, config);
        if (persist && !local && typeof config !== "function") {
            toPersist[itemName] = config;
            persistedItemNames.add(itemName);
        }
    }

    if (persist && Object.keys(toPersist).length > 0) {
        if (game.user?.isGM) {
            try {
                const saved = foundry.utils.deepClone(game.settings.get(MODULE_ID, "registeredTemplates") || {});
                Object.assign(saved, toPersist);
                await game.settings.set(MODULE_ID, "registeredTemplates", saved);
                broadcastSync();
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

async function overwrite(persistedDict = {}) {
    if (game.user?.isGM) {
        try {
            await game.settings.set(MODULE_ID, "registeredTemplates", persistedDict);
            persistedItemNames.clear();
            for (const itemName of Object.keys(persistedDict)) {
                persistedItemNames.add(itemName);
            }
            broadcastSync();
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

async function getPosition(template, config = {}) {
    if (template) {
        const { primary, secondary } = crosshairAdapter.getPosition(template);
        return [primary, secondary];
    } else {
        const position = await Sequencer.Crosshair.show();
        if (position.cancelled) { return []; }
        return [position, undefined];
    }
}

/**
 * Check if a registered template animation exists for a target document or item name in O(1) time.
 */
function has(targetOrName) {
    return getRegisteredEntry(targetOrName) !== null;
}

/**
 * Get the registered handler entry for a target document or item name in O(1) time.
 */
function get(targetOrName) {
    return getRegisteredEntry(targetOrName);
}

/**
 * List all currently registered item names.
 */
function list() {
    return Array.from(registeredHandlers.keys());
}

/**
 * Get all registered entries with structured metadata for UI inspection.
 */
function getAllEntries() {
    const results = [];
    for (const [itemName, handlerOrConfig] of registeredHandlers.entries()) {
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

        let isLocal = !persistedItemNames.has(itemName);
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

function broadcastSync() {
    if (game.socket) {
        game.socket.emit(`module.${MODULE_ID}`, { type: "SYNC_AUTORECS" });
    }
}

export const manager = {
    getPosition,
    register,
    registerMany,
    unregister,
    unregisterMany,
    overwrite,
    has,
    get,
    list,
    getAllEntries,
    loadSavedRegistrations,
    initializeReadySync,
    broadcastSync,
};
