import { log } from './logger.js';
import { crosshair } from '../crosshair/_crosshairs.js';
import { Token } from './compat.js';
import { crosshairAdapter } from '../adapter/foundry/index.js';
import { autorecManager } from '../autorec/autorecManager.js';

const pendingPlacements = new Map();
let hooksInitialized = false;

/**
 * Check if the current user is the author or owner of the document or preview.
 * @param {Document} doc - Template or Region document
 * @returns {boolean} True if the current user owns or authored the document
 */
function isOwner(doc) {
    if (!doc.id) return true; // Preview templates on canvas are always local to the drawing client
    const userId = doc.author?.id ?? doc.author ?? doc.user?.id ?? doc.user ?? game.user.id;
    return userId === game.user.id;
}

/**
 * Detect shape type and dimensions from a template or region placeable on canvas.
 * @param {PlaceableObject} placeable - Canvas PlaceableObject (MeasuredTemplate or Region)
 * @returns {{type: string, distance: number, width: number, angle: number, x: number, y: number}}
 */
function detectTemplateProperties(placeable) {
    return crosshairAdapter.detectProperties(placeable.document);
}


/**
 * Handle preview drawing (v13 drawMeasuredTemplate / v14 drawRegion).
 */
async function handleDrawPreview(placeable) {
    const doc = placeable.document;
    const isPreview = Boolean(placeable.isPreview);

    log.debug(`handleDrawPreview | Hook fired:`, {
        docId: doc.id,
        isPreview,
        isOwner: isOwner(doc),
        placeable
    });

    if (!isPreview || !isOwner(doc)) {
        log.debug(`handleDrawPreview | Skipping non-preview or non-owned placeable:`, { docId: doc.id, isPreview });
        return;
    }

    const entry = autorecManager.getEntryForDocument(doc);
    if (!entry) {
        log.debug(`handleDrawPreview | No registered handler matched for preview.`);
        return;
    }

    log.debug(`handleDrawPreview | Intercepting template preview for "${entry.itemName}"`);

    // 1. Immediately hide the Foundry template/region preview graphic completely so custom Sequencer visuals take over
    crosshairAdapter.hidePreview(placeable);

    // 2. Resolve token and item context deterministically through version adapter
    const callingContext = crosshairAdapter.extractCallingContext(doc);
    const item = entry.item ?? callingContext.item;
    let rawToken = item?.parent?.getActiveTokens?.()[0] ?? canvas.tokens?.controlled?.[0];
    const token = rawToken instanceof Token ? rawToken : (rawToken?.object instanceof Token ? rawToken.object : rawToken);
    const actor = token?.actor ?? item?.actor;

    log.debug(`handleDrawPreview | Using token context:`, token?.name);

    const placementKey = `${entry.itemName}_${game.user.id}`;
    const entryConfig = typeof entry.handler === "object" && entry.handler !== null ? entry.handler : entry;
    const pending = {
        itemName: entry.itemName,
        resolved: false,
        cancelled: false,
        coords: null,
        config: entryConfig
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
        async resolve(coords = {}) {
            log.debug(`context.resolve | Sequencer crosshair PLACED at (${coords.x}, ${coords.y}):`, coords);
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

                if (pending.deferredCreateData && canvas.scene) {
                    log.debug(`context.resolve | Resuming deferred document creation on scene "${canvas.scene.name}"`);
                    const deferredData = foundry.utils.deepClone(pending.deferredCreateData);
                    delete deferredData._id;
                    const docName = previewDoc?.documentName ?? (deferredData.shapes ? "Region" : "MeasuredTemplate");
                    try {
                        await canvas.scene.createEmbeddedDocuments(docName, [deferredData]);
                    } catch (err) {
                        log.error(`context.resolve | Failed to create deferred ${docName} document on placement:`, err);
                    }
                }
            }
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
            pendingPlacements.delete(placementKey);
        }
    };

    try {
        // 3. Auto-detect template properties and assemble sequence config
        const detected = detectTemplateProperties(placeable);
        const autoConfig = {
            ...detected,
            context,
            icon: doc.item?.img ?? doc.flags?.['midi-qol']?.itemImg,
            item,
            actor,
            scope: { item, actor, token, doc }
        };

        if (typeof entry.handler === "function") {
            await entry.handler(token, autoConfig);
        } else {
            const mergedConfig = {
                ...autoConfig,
                ...entryConfig,
                context: autoConfig.context,
                scope: autoConfig.scope
            };
            const explicitType = entryConfig.type;
            const isKnownType = ["circle", "cone", "ray", "square", "rect"].includes(String(explicitType ?? "").toLowerCase());
            const crosshairType = isKnownType
                ? (String(explicitType).toLowerCase() === "rect" ? "square" : String(explicitType).toLowerCase())
                : (detected.type ?? "circle");
            const builder = crosshair[crosshairType] ?? crosshair.circle;

            const shapeFileKey = `${crosshairType}File`;
            const shapeSpecificFile = entryConfig[shapeFileKey]
                ?? (typeof entryConfig.file === "string" && entryConfig.file.includes(crosshairType) ? entryConfig.file : null);

            const finalConfig = {
                ...mergedConfig,
                type: crosshairType,
                file: shapeSpecificFile ?? mergedConfig.file
            };

            log.debug(`handleDrawPreview | Playing "${crosshairType}" crosshair for "${entry.itemName}" with config:`, finalConfig);
            await builder.play(token, finalConfig);
        }
        log.debug(`handleDrawPreview | Sequencer crosshair sequence completed for "${entry.itemName}".`);
    } catch (err) {
        log.error(`handleDrawPreview | Error running sequencer sequence for "${entry.itemName}":`, err);
        pending.cancelled = true;
        pending.resolved = true;
    }
}

/**
 * Handle document preCreate (v13 preCreateMeasuredTemplate / v14 preCreateRegion).
 */
function handlePreCreate(doc, _data, _options, userId) {
    log.debug(`handlePreCreate | [ENTRY] preCreate hook triggered for docName=${doc.documentName}, id=${doc.id}, userId=${userId}, localUser=${game.user.id}`);

    if (userId !== game.user.id) {
        log.debug(`handlePreCreate | [SKIP] Skipping document from remote user ${userId}`);
        return true;
    }

    let entry = autorecManager.getEntryForDocument(doc);
    let placementKey = null;
    let pending = null;

    if (entry) {
        placementKey = `${entry.itemName}_${game.user.id}`;
        pending = pendingPlacements.get(placementKey);
    } else {
        // Fallback: match any active uncancelled pending placement for the local user
        for (const [key, val] of pendingPlacements.entries()) {
            if (key.endsWith(`_${game.user.id}`) && !val.cancelled) {
                pending = val;
                placementKey = key;
                entry = { itemName: val.itemName, handler: val.config };
                log.debug(`handlePreCreate | [FALLBACK MATCH] Matched active pending placement "${val.itemName}" (key=${key})`);
                break;
            }
        }
    }

    log.debug(`handlePreCreate | [LOOKUP RESULT] entry="${entry?.itemName ?? null}", hasPending=${Boolean(pending)}, pending.resolved=${pending?.resolved}, pending.coords=`, pending?.coords);

    if (!entry || !pending) {
        log.debug(`handlePreCreate | [PASS] No matching autorec entry or active pending placement. Allowing standard creation.`);
        return true;
    }

    // If the sequencer sequence was right-click cancelled, abort placement
    if (pending.cancelled) {
        log.debug(`handlePreCreate | [ABORT] Placement was cancelled by user ("${entry.itemName}"). Returning false.`);
        pendingPlacements.delete(placementKey);
        return false;
    }

    // If the sequencer sequence has resolved with coordinates, update the document
    if (pending.resolved && pending.coords) {
        log.debug(`handlePreCreate | [APPLY] Sequencer placement resolved for "${entry.itemName}". Applying placement onto document:`, pending.coords);
        crosshairAdapter.applyDocumentPlacement(doc, pending.coords, pending.config);
        pendingPlacements.delete(placementKey);
        log.debug(`handlePreCreate | [APPLY COMPLETE] Document updated successfully.`);
        return true;
    }

    // If sequence is still interactive/running, defer creation until sequence resolves
    pending.deferredCreateData = doc.toObject();
    log.debug(`handlePreCreate | [DEFER] Sequencer crosshair is still interactive ("${entry.itemName}"). Deferring document creation until click.`);
    return false;
}

/**
 * Handle document post-creation hook (v13 createMeasuredTemplate / v14 createRegion).
 * Executes user-configured post-placement Javascript inside a try/catch block with standard context variables.
 */
async function handleCreateDocument(doc, _options, userId) {
    if (userId !== game.user?.id) return;

    const flagsConfig = doc.flags?.bbc;
    const entry = autorecManager.getEntryForDocument(doc);
    const config = {
        ...entry,
        ...flagsConfig
    };

    const code = config.postPlacementCode;
    log.debug(`handleCreateDocument | Evaluated post-placement hook for ${doc.documentName} (${doc.id}):`, { hasCode: Boolean(code), code, flagsConfig });
    if (!code || typeof code !== "string" || !code.trim()) return;

    const callingContext = crosshairAdapter.extractCallingContext(doc);
    const item = config.item ?? callingContext.item;
    const token = item?.parent?.getActiveTokens?.()[0] ?? canvas.tokens?.controlled?.[0];
    const actor = token?.actor ?? item?.actor;
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
        onPreCreate: (doc, _data, _options, userId) => handlePreCreate(doc, _data, _options, userId),
        onCreate: (doc, _options, userId) => handleCreateDocument(doc, _options, userId)
    });

    if (game.ready) {
        autorecManager.initializeReadySync();
    } else {
        Hooks.once("ready", () => autorecManager.initializeReadySync());
    }
}

// Connect autorec registration to hook initialization
autorecManager.onRegister(() => initializeHooks());

export { initializeHooks };

