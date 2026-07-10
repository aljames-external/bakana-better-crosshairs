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
    return crosshairAdapter.detectProperties(doc);
}


/**
 * Handle preview drawing (v13 drawMeasuredTemplate / v14 drawRegion).
 */
async function handleDrawPreview(placeable) {
    const doc = placeable.document ?? placeable;
    const isPreview = placeable.isPreview || (canvas.templates?.preview?.children || []).includes(placeable) || (canvas.regions?.preview?.children || []).includes(placeable) || !canvas.scene?.templates?.has(doc.id);

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
        config: (typeof entry.handler === "object" && entry.handler !== null ? entry.handler : (typeof entry === "object" && entry !== null ? entry : {}))
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
                    const docName = previewDoc?.documentName || (deferredData.shapes ? "Region" : "MeasuredTemplate");
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

            if (placeable) {
                if (typeof placeable._onRightClick === "function") {
                    try {
                        placeable._onRightClick({ preventDefault: () => {}, stopPropagation: () => {} });
                    } catch (e) {
                        log.debug("context.cancel | Error triggering placeable._onRightClick:", e);
                    }
                } else if (typeof placeable.destroy === "function") {
                    try {
                        placeable.destroy({ children: true });
                    } catch (e) {
                        log.debug("context.cancel | Error destroying placeable:", e);
                    }
                }
            }
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
        log.debug(`handleDrawPreview | Config for "${entry.itemName}":`, autoConfig);

        if (typeof entry.handler === "function") {
            await entry.handler(token, autoConfig);
        } else {
            const entryConfig = (typeof entry.handler === "object" && entry.handler !== null ? entry.handler : (typeof entry === "object" && entry !== null ? entry : {}));
            const mergedConfig = {
                ...autoConfig,
                ...entryConfig,
                context: autoConfig.context,
                item: autoConfig.item || entryConfig.item,
                actor: autoConfig.actor || entryConfig.actor,
                activity: entryConfig.activity || entry.activity,
                scope: autoConfig.scope
            };
            const explicitType = entryConfig.type;
            const isKnownType = ["circle", "cone", "ray", "square", "rect"].includes(String(explicitType || "").toLowerCase());
            const crosshairType = isKnownType
                ? (String(explicitType).toLowerCase() === "rect" ? "square" : String(explicitType).toLowerCase())
                : (detected.type || "circle");
            const builder = crosshair[crosshairType] || crosshair.circle;

            const shapeFileKey = `${crosshairType}File`;
            const shapeSpecificFile = entryConfig[shapeFileKey]
                || (typeof entryConfig.file === "string" && entryConfig.file.includes(crosshairType) ? entryConfig.file : null);

            const finalConfig = {
                ...mergedConfig,
                type: crosshairType,
                file: shapeSpecificFile || mergedConfig.file
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
    log.info(`handlePreCreate | [ENTRY] preCreate hook triggered for docName=${doc.documentName}, id=${doc.id}, userId=${userId}, localUser=${game.user.id}`);

    if (userId !== game.user.id) {
        log.info(`handlePreCreate | [SKIP] Skipping document from remote user ${userId}`);
        return true;
    }

    let entry = autorecManager.getRegisteredEntry(doc);
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
                log.info(`handlePreCreate | [FALLBACK MATCH] Matched active pending placement "${val.itemName}" (key=${key})`);
                break;
            }
        }
    }

    log.info(`handlePreCreate | [LOOKUP RESULT] entry="${entry?.itemName || null}", hasPending=${Boolean(pending)}, pending.resolved=${pending?.resolved}, pending.coords=`, pending?.coords);

    if (!entry || !pending) {
        log.info(`handlePreCreate | [PASS] No matching autorec entry or active pending placement. Allowing standard creation.`);
        return true;
    }

    // If the sequencer sequence was right-click cancelled, abort placement
    if (pending.cancelled) {
        log.info(`handlePreCreate | [ABORT] Placement was cancelled by user ("${entry.itemName}"). Returning false.`);
        pendingPlacements.delete(placementKey);
        return false;
    }

    // If the sequencer sequence has resolved with coordinates, update the document
    if (pending.resolved && pending.coords) {
        log.info(`handlePreCreate | [APPLY] Sequencer placement resolved for "${entry.itemName}". Formatting updateData with coords:`, pending.coords);
        const updateData = crosshairAdapter.formatDocumentUpdate(doc, pending.coords, pending.config || {});
        log.info(`handlePreCreate | [APPLY] Formatted updateData payload:`, updateData);
        doc.updateSource(updateData);
        pendingPlacements.delete(placementKey);
        log.info(`handlePreCreate | [APPLY COMPLETE] Document source after updateSource:`, doc._source || doc.toObject?.() || doc);
        return true;
    }

    // If sequence is still interactive/running, defer creation until sequence resolves
    pending.deferredCreateData = doc.toObject();
    log.info(`handlePreCreate | [DEFER] Sequencer crosshair is still interactive ("${entry.itemName}"). Deferring document creation until click.`);
    return false;
}

/**
 * Handle document post-creation hook (v13 createMeasuredTemplate / v14 createRegion).
 * Executes user-configured post-placement Javascript inside a try/catch block with standard context variables.
 */
async function handleCreateDocument(doc, _options, userId) {
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

