import { MODULE_ID } from './constants.js';
import { log } from './logger.js';
import { crosshair } from '../crosshair/_crosshairs.js';
import { Token } from './compat.js';
import { crosshairAdapter } from '../adapter/foundry/index.js';
import { autorecManager } from '../autorec/autorecManager.js';

const pendingPlacements = new Map();
let hooksInitialized = false;

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

    const entry = autorecManager.getRegisteredEntry(placeable);
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

    const entry = autorecManager.getRegisteredEntry(doc);
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

    const entry = autorecManager.getRegisteredEntry(doc);
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

function initializeHooks() {
    if (hooksInitialized) return;
    hooksInitialized = true;

    crosshairAdapter.registerPlacementHooks({
        onDrawPreview: (placeable) => handleDrawPreview(placeable),
        onPreCreate: (doc, data, options, userId) => handlePreCreate(doc, data, options, userId),
        onCreate: (doc, options, userId) => handleCreateDocument(doc, options, userId)
    });

    if (game.ready) {
        autorecManager.initializeReadySync();
    } else {
        Hooks.once("ready", () => autorecManager.initializeReadySync());
    }
}

// Connect autorec registration to hook initialization
autorecManager.onRegister(() => initializeHooks());

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

export const manager = {
    getPosition,
    register: (...args) => autorecManager.register(...args),
    registerMany: (...args) => autorecManager.registerMany(...args),
    unregister: (...args) => autorecManager.unregister(...args),
    unregisterMany: (...args) => autorecManager.unregisterMany(...args),
    overwrite: (...args) => autorecManager.overwrite(...args),
    has: (...args) => autorecManager.has(...args),
    get: (...args) => autorecManager.get(...args),
    list: (...args) => autorecManager.list(...args),
    getAllEntries: (...args) => autorecManager.getAllEntries(...args),
    loadSavedRegistrations: (...args) => autorecManager.loadSavedRegistrations(...args),
    initializeReadySync: (...args) => autorecManager.initializeReadySync(...args),
    broadcastSync: (...args) => autorecManager.broadcastSync(...args),
    autorec: autorecManager
};
