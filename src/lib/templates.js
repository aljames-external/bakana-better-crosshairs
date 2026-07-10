import { MODULE_ID } from './constants.js';
import { log } from './logger.js';
import { crosshair } from '../crosshair/_crosshairs.js';

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
    let type = "circle";
    let distance = 20;
    let angle = 53.13;
    let width = 5;

    if (doc.documentName === "Region" || doc.shapes) {
        const shape = doc.shapes?.[0] || {};
        const st = shape.type;
        if (st === "rectangle" || st === "polygon") {
            type = "rect";
        } else {
            type = "circle";
        }
        distance = shape.radius || shape.distance || 20;
    } else {
        const t = doc.t || "circle";
        if (t === "cone") type = "cone";
        else if (t === "ray") type = "ray";
        else type = "circle";

        distance = doc.distance || 20;
        angle = doc.angle || 53.13;
        width = doc.width || 5;
    }

    return { type, distance, radius: distance, angle, width };
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

    // 1. Immediately hide the Foundry template preview completely so we do Sequencer visuals instead
    placeable.visible = false;
    placeable.renderable = false;
    placeable.alpha = 0;
    if (placeable.template) placeable.template.visible = false;
    if (placeable.ruler) placeable.ruler.visible = false;
    if (placeable.controlIcon) placeable.controlIcon.visible = false;

    placeable.refresh = function() {
        this.visible = false;
        this.renderable = false;
        if (this.ruler) {
            this.ruler.visible = false;
            this.ruler.text = "";
        }
        if (this.template) this.template.visible = false;
        if (this.controlIcon) this.controlIcon.visible = false;
        return this;
    };
    placeable.highlightGrid = function() {};

    // 2. Resolve token context
    const token = entry.item?.parent?.getActiveTokens?.()[0] || doc.item?.parent?.getActiveTokens?.()[0] || canvas.tokens?.controlled?.[0] || undefined;
    log.debug(`handleDrawPreview | Using token context:`, token?.name);

    const placementKey = `${entry.itemName}_${game.user.id}`;
    const pending = {
        itemName: entry.itemName,
        resolved: false,
        cancelled: false,
        coords: null,
        originalTemplate: placeable
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

                // Populate original preview document immediately so v14 schema validation passes
                const previewDoc = pending.originalTemplate?.document;
                if (previewDoc) {
                    if (previewDoc.documentName === "Region" && Array.isArray(previewDoc.shapes) && previewDoc.shapes.length > 0) {
                        const orig = previewDoc.shapes[0]._source || previewDoc.shapes[0];
                        const updatedShape = formatRegionShapeUpdate(orig, coords);
                        if (typeof previewDoc.updateSource === "function") {
                            previewDoc.updateSource({ shapes: [updatedShape] });
                        }
                    } else if (typeof previewDoc.updateSource === "function") {
                        previewDoc.updateSource({
                            x: coords.x,
                            y: coords.y,
                            distance: coords.distance ?? coords.radius,
                            direction: coords.direction ?? coords.rotation
                        });
                    }
                }
            }

            // Clean up any lingering preview placeables on the canvas
            if (canvas.templates?.preview) canvas.templates.preview.removeChildren();
            if (canvas.regions?.preview) canvas.regions.preview.removeChildren();
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
            if (canvas.templates?.preview) canvas.templates.preview.removeChildren();
            if (canvas.regions?.preview) canvas.regions.preview.removeChildren();
            pendingPlacements.delete(placementKey);
        }
    };

    try {
        // 3. Auto-detect template properties and assemble sequence config
        const detected = detectTemplateProperties(placeable);
        const autoConfig = {
            ...detected,
            context,
            icon: doc.item?.img || doc.flags?.['midi-qol']?.itemImg
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
    const shapeType = originalShape.type;
    switch (shapeType) {
        case "circle":
            return {
                type: "circle",
                x: coords.x ?? originalShape.x,
                y: coords.y ?? originalShape.y,
                radius: coords.radius ?? coords.distance ?? originalShape.radius,
                hole: originalShape.hole ?? false
            };
        case "line":
            return {
                type: "line",
                x: coords.x ?? originalShape.x,
                y: coords.y ?? originalShape.y,
                length: coords.distance ?? coords.radius ?? originalShape.length,
                width: coords.width ?? originalShape.width,
                rotation: coords.direction ?? coords.rotation ?? originalShape.rotation,
                hole: originalShape.hole ?? false
            };
        case "cone":
            return {
                type: "cone",
                x: coords.x ?? originalShape.x,
                y: coords.y ?? originalShape.y,
                radius: coords.distance ?? coords.radius ?? originalShape.radius,
                rotation: coords.direction ?? coords.rotation ?? originalShape.rotation,
                angle: coords.angle ?? originalShape.angle,
                curvature: originalShape.curvature ?? "round",
                hole: originalShape.hole ?? false
            };
        default:
            return foundry.utils.mergeObject(foundry.utils.deepClone(originalShape), {
                x: coords.x ?? originalShape.x,
                y: coords.y ?? originalShape.y
            });
    }
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
        const updateData = {};

        // Support v14 Region update
        if (doc.documentName === 'Region' && Array.isArray(doc.shapes) && doc.shapes.length > 0) {
            const originalShape = foundry.utils.deepClone(
                doc.shapes[0]._source || (typeof doc.shapes[0].toObject === "function" ? doc.shapes[0].toObject() : doc.shapes[0])
            );
            const newShape = formatRegionShapeUpdate(originalShape, pending.coords);

            delete newShape._id;
            updateData.shapes = [newShape];
            log.debug(`handlePreCreate | Formatted v14 Region shape update ->`, { originalShape, newShape });
        } else {
            // Support MeasuredTemplate update (v13 and v14)
            if (pending.coords.x !== undefined) updateData.x = pending.coords.x;
            if (pending.coords.y !== undefined) updateData.y = pending.coords.y;
            if (pending.coords.distance !== undefined) updateData.distance = pending.coords.distance;
            if (pending.coords.direction !== undefined) updateData.direction = pending.coords.direction;
            if (pending.coords.width !== undefined) updateData.width = pending.coords.width;
            if (pending.coords.t !== undefined) updateData.t = pending.coords.t;
        }

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

function initializeReadySync() {
    if (readySyncInitialized) return;
    readySyncInitialized = true;

    if (typeof game !== "undefined" && game.socket) {
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

    // Core MeasuredTemplate placement hooks (v13 and v14)
    Hooks.on("drawMeasuredTemplate", (template) => handleDrawPreview(template));
    Hooks.on("preCreateMeasuredTemplate", (doc, data, options, userId) => handlePreCreate(doc, data, options, userId));

    const isV14 = typeof game !== "undefined" && typeof foundry !== "undefined" && foundry.utils.isNewerVersion(game.version, "14");
    if (isV14) {
        log.debug("initializeHooks | Foundry v14+ detected, also registering Region hooks.");
        Hooks.on("drawRegion", (region) => handleDrawPreview(region));
        Hooks.on("preCreateRegion", (doc, data, options, userId) => handlePreCreate(doc, data, options, userId));
    }

    if (typeof game !== "undefined" && game.ready) {
        initializeReadySync();
    } else if (typeof Hooks !== "undefined" && Hooks.once) {
        Hooks.once("ready", initializeReadySync);
    }
}

function persistRegistration(itemName, config) {
    if (typeof game === "undefined") return;
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
    if (typeof game === "undefined") return;
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

    for (const [itemName, config] of Object.entries(savedRegistrations)) {
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

async function getPosition(template, config = {}) {
    let position;
    if (template) {
        let primary, secondary;

        // Foundry V14 Region structures
        if (template.documentName === 'Region' || template.shapes) {
            const shape = template.shapes[0];
            primary = { x: shape.x, y: shape.y };

            // Calculate the furthest point based on shape rotation and radius
            let distance = shape.radius || shape.distance || 0;
            // Depending on the shape type, we find the farpoint along its rotation
            if (shape.rotation !== undefined && distance) {
                const rad = Math.toRadians(shape.rotation);
                secondary = {
                    x: primary.x + Math.cos(rad) * distance,
                    y: primary.y + Math.sin(rad) * distance
                };
            } else {
                // Fallback to origin if no direction is present (e.g. circles)
                secondary = { x: primary.x, y: primary.y };
            }
        } else {
            log.info(`getPosition: Falling back to legacy MeasuredTemplate support (pre-V14). This support will be removed in Foundry V16.`);
            // Legacy MeasuredTemplate support
            const farpoint = template.object.ray.B;
            secondary = { x: farpoint.x, y: farpoint.y };
            primary = { x: template.x, y: template.y };
        }

        return [primary, secondary];
    } else {
        position = await Sequencer.Crosshair.show();
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
        let type = "circle";
        let file = "";
        let isCustomFunction = false;
        let config = {};

        if (typeof handlerOrConfig === "function") {
            isCustomFunction = true;
            type = "Custom Script";
            file = "Function Handler";
        } else if (typeof handlerOrConfig === "string") {
            file = handlerOrConfig;
            type = "circle";
        } else if (typeof handlerOrConfig === "object" && handlerOrConfig !== null) {
            config = handlerOrConfig;
            type = handlerOrConfig.type || "circle";
            file = handlerOrConfig.file || handlerOrConfig.animationFile || "";
        }

        let isLocal = !persistedItemNames.has(itemName);
        if (typeof handlerOrConfig === "object" && handlerOrConfig !== null && handlerOrConfig.local === true) {
            isLocal = true;
        }

        const typeKey = type.toLowerCase();
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
        const fillAlpha = config.fillAlpha !== undefined ? config.fillAlpha : 0.1;
        const icon = config.icon || null;

        const configEntries = [];
        if (config && typeof config === "object") {
            for (const [k, v] of Object.entries(config)) {
                if (typeof v === "function") continue;
                configEntries.push({
                    key: k,
                    value: typeof v === "object" ? JSON.stringify(v) : String(v)
                });
            }
        }

        results.push({
            itemName,
            type: type.charAt(0).toUpperCase() + type.slice(1),
            typeKey,
            file: file || "Default Sequencer Asset",
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
            icon,
            configEntries,
        });
    }
    return results.sort((a, b) => a.itemName.localeCompare(b.itemName));
}

export const manager = {
    getPosition,
    register,
    unregister,
    has,
    get,
    list,
    getAllEntries,
    loadSavedRegistrations,
    initializeReadySync,
};
