import { log } from './logger.js';
import { crosshair } from '../crosshair/_crosshairs.js';

const registeredHandlers = new Map();
const pendingPlacements = new Map();
let hooksInitialized = false;

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

/**
 * Helper to match a template/region document or placeable to a registered item name.
 * Supports:
 * - Item name or ID alone (e.g. "Longbow") -> matches all activities on Longbow
 * - Item and Activity name (e.g. "Longbow | Special Attack" or "Longbow: Special Attack") -> matches only that activity on Longbow
 */
function getRegisteredEntry(target) {
    const { item, itemName, itemId, activity, activityName, activityId } = resolveItemAndActivity(target);

    if (!itemName && !itemId) return null;

    let bestMatch = null;
    let bestSpecificity = -1;

    for (const [registeredKey, handler] of registeredHandlers.entries()) {
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

        const itemMatches = (reqItem.toLowerCase() === itemName?.toLowerCase()) || (reqItem === itemId);
        if (!itemMatches) continue;

        // 2. Check Activity match if requested
        if (reqActivity) {
            const activityMatches = (reqActivity.toLowerCase() === activityName?.toLowerCase()) || (reqActivity === activityId);
            if (activityMatches && bestSpecificity < 2) {
                bestMatch = { itemName: registeredKey, handler, item };
                bestSpecificity = 2; // Specific item + activity match
            }
        } else {
            // Item-only match (applies to all activities on that item)
            if (bestSpecificity < 1) {
                bestMatch = { itemName: registeredKey, handler, item };
                bestSpecificity = 1;
            }
        }
    }

    if (bestMatch) {
        log.debug(`getRegisteredEntry | Matched template handler "${bestMatch.itemName}" for "${itemName}"`);
    }

    return bestMatch;
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
}

/**
 * Register a template placement handler for an item.
 * Turning off any previous registration for that item name and registering the new one.
 *
 * @param {string} itemName - Name of the item/spell (e.g., 'Fireball')
 * @param {Function|Object|string} [handlerOrConfig={}] - Optional string file path, config object (e.g. { file: '...' }), or custom async function(token, autoConfig)
 */
function register(itemName, handlerOrConfig = {}) {
    initializeHooks();
    if (typeof handlerOrConfig === "string") {
        handlerOrConfig = { file: handlerOrConfig };
    }
    if (registeredHandlers.has(itemName)) {
        log.info(`Re-registering template sequence for item: ${itemName}`);
    } else {
        log.info(`Registering template sequence for item: ${itemName}`);
    }
    registeredHandlers.set(itemName, handlerOrConfig);
}

/**
 * Unregister a template placement handler for an item.
 *
 * @param {string} itemName - Name of the item/spell
 */
function unregister(itemName) {
    if (registeredHandlers.delete(itemName)) {
        log.info(`Unregistered template sequence for item: ${itemName}`);
        return true;
    }
    return false;
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
 * List all currently registered item names.
 */
function list() {
    return Array.from(registeredHandlers.keys());
}

export const template = {
    getPosition,
    register,
    unregister,
    list,
};

export const templates = template;
