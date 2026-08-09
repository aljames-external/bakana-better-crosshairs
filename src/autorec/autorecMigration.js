/**
 * Standalone migration pipeline for upgrading historical BBC Autorec schema versions.
 * Isolated in a separate file so it can be cleanly excised once legacy beta versions are sunset.
 */
import { log } from "../lib/logger.js";
import { DEFAULT_AUTOREC_ENTRY } from "./autorecManager.js";
import { AUTOREC_EXCHANGE_VERSION } from "./autorecExchange.js";

/**
 * Normalizes a single raw v1.0.0 entry object into a canonical v2.0.0 hierarchical entry.
 *
 * @param {Object} legacyEntry - Historical flat v1.0.0 entry
 * @returns {Object} Upgraded v2.0.0 entry structure
 */
export function migrateV1ToV2Entry(legacyEntry) {
    if (!legacyEntry || typeof legacyEntry !== "object") {
        return {};
    }

    const itemName = String(legacyEntry.itemName ?? legacyEntry.regKey ?? "").trim();
    const activityId = String(legacyEntry.activityId ?? "").trim() || undefined;
    const activityName = String(legacyEntry.activityName ?? "").trim() || undefined;
    const sourceMod = String(legacyEntry.module ?? legacyEntry.sourceModule ?? "world").trim();
    const enabled = legacyEntry.enabled !== false;

    // File mapping: circleFile/coneFile/... -> file.{circle, cone, ...}
    const fileObj = legacyEntry.file ?? {};
    const circle = String(fileObj.circle ?? legacyEntry.circleFile ?? DEFAULT_AUTOREC_ENTRY.circleFile);
    const cone = String(fileObj.cone ?? legacyEntry.coneFile ?? DEFAULT_AUTOREC_ENTRY.coneFile);
    const ray = String(fileObj.ray ?? legacyEntry.rayFile ?? DEFAULT_AUTOREC_ENTRY.rayFile);
    const rectangle = String(fileObj.rectangle ?? fileObj.square ?? legacyEntry.rectangleFile ?? legacyEntry.squareFile ?? DEFAULT_AUTOREC_ENTRY.rectangleFile);
    const line = String(fileObj.line ?? legacyEntry.lineFile ?? DEFAULT_AUTOREC_ENTRY.lineFile);

    // Options mapping: stickToToken -> options.attachMode, etc.
    const optionsObj = legacyEntry.options ?? {};
    const attachMode = String(optionsObj.attachMode ?? legacyEntry.stickToToken ?? DEFAULT_AUTOREC_ENTRY.stickToToken);
    const showLine = optionsObj.showLine !== undefined
        ? Boolean(optionsObj.showLine)
        : Boolean(legacyEntry.showLine ?? DEFAULT_AUTOREC_ENTRY.showLine);
    const showRange = optionsObj.showRange !== undefined
        ? Boolean(optionsObj.showRange)
        : Boolean(legacyEntry.showRange ?? DEFAULT_AUTOREC_ENTRY.showRange);
    const limitRange = optionsObj.limitRange !== undefined
        ? Boolean(optionsObj.limitRange)
        : Boolean(legacyEntry.limitRange ?? DEFAULT_AUTOREC_ENTRY.limitRange);
    const enablePrePlacement = Boolean(optionsObj.enablePrePlacement ?? legacyEntry.enablePrePlacement);
    const enableAnimation = Boolean(optionsObj.enableAnimation ?? legacyEntry.enableAnimation);
    const enablePlacedStyling = Boolean(optionsObj.enablePlacedStyling ?? legacyEntry.enablePlacedStyling);
    const enablePostPlacement = Boolean(optionsObj.enablePostPlacement ?? legacyEntry.enablePostPlacement);
    const persist = optionsObj.persist !== undefined
        ? Boolean(optionsObj.persist)
        : Boolean(placedObj.persist ?? legacyEntry.persist ?? DEFAULT_AUTOREC_ENTRY.persist);

    // Preview preview.fill.* and preview.border.*
    const previewObj = legacyEntry.preview ?? {};
    const previewFillObj = previewObj.fill ?? {};
    const previewBorderObj = previewObj.border ?? {};
    const previewFillColor = String(previewFillObj.color ?? legacyEntry.fillColor ?? DEFAULT_AUTOREC_ENTRY.fillColor);
    const previewFillAlpha = Number(previewFillObj.alpha ?? legacyEntry.fillAlpha ?? DEFAULT_AUTOREC_ENTRY.fillAlpha);
    const previewBorderColor = String(previewBorderObj.color ?? legacyEntry.borderColor ?? DEFAULT_AUTOREC_ENTRY.borderColor);
    const previewBorderAlpha = Number(previewBorderObj.alpha ?? legacyEntry.borderAlpha ?? DEFAULT_AUTOREC_ENTRY.borderAlpha);

    // Placed placed.fill.* and placed.border.*
    const placedObj = legacyEntry.placed ?? {};
    const placedFillObj = placedObj.fill ?? {};
    const placedBorderObj = placedObj.border ?? {};
    const placedFillColor = String(placedFillObj.color ?? legacyEntry.placedFillColor ?? DEFAULT_AUTOREC_ENTRY.placedFillColor);
    const placedFillAlpha = Number(placedFillObj.alpha ?? legacyEntry.placedFillAlpha ?? DEFAULT_AUTOREC_ENTRY.placedFillAlpha);
    const placedBorderColor = String(placedBorderObj.color ?? legacyEntry.placedBorderColor ?? DEFAULT_AUTOREC_ENTRY.placedBorderColor);
    const placedBorderAlpha = Number(placedBorderObj.alpha ?? legacyEntry.placedBorderAlpha ?? DEFAULT_AUTOREC_ENTRY.placedBorderAlpha);

    // Macro macro.pre and macro.post
    const macroObj = legacyEntry.macro ?? {};
    const preMacro = String(macroObj.pre ?? legacyEntry.concurrentCode ?? "").trim();
    const postMacro = String(macroObj.post ?? legacyEntry.postPlacementCode ?? "").trim();

    const migrated = {
        itemName,
        activityId,
        activityName,
        module: sourceMod,
        enabled,
        options: {
            attachMode,
            showLine,
            showRange,
            limitRange,
            enablePrePlacement,
            enableAnimation,
            enablePlacedStyling,
            enablePostPlacement,
            persist
        },
        file: {
            circle,
            cone,
            ray,
            rectangle,
            square: rectangle,
            line
        },
        preview: {
            fill: { color: previewFillColor, alpha: previewFillAlpha },
            border: { color: previewBorderColor, alpha: previewBorderAlpha }
        },
        placed: {
            fill: { color: placedFillColor, alpha: placedFillAlpha },
            border: { color: placedBorderColor, alpha: placedBorderAlpha },
            persist
        },
        macro: {
            pre: preMacro,
            post: postMacro
        }
    };

    if (legacyEntry.persist !== undefined || optionsObj.persist !== undefined || placedObj.persist !== undefined) migrated.persist = persist;
    if (legacyEntry.distance !== undefined && legacyEntry.distance !== null) migrated.distance = Number(legacyEntry.distance);
    if (legacyEntry.width !== undefined && legacyEntry.width !== null) migrated.width = Number(legacyEntry.width);
    if (legacyEntry.angle !== undefined && legacyEntry.angle !== null) migrated.angle = Number(legacyEntry.angle);
    if (legacyEntry.local !== undefined && legacyEntry.local !== null) migrated.local = Boolean(legacyEntry.local);

    return migrated;
}

/**
 * Migration step upgrading a full package or array of entries from v1.0.0 to v2.0.0.
 * Emits a deprecation warning as required.
 *
 * @param {Object|Array<Object>} payload - Input exchange package or entries list
 * @returns {Object|Array<Object>} Upgraded package or entries
 */
export function migrateV1ToV2(payload) {
    log.warn("AutorecMigration | Legacy v1.0.0 schema detected and automatically upgraded to v2.0.0.");

    if (Array.isArray(payload)) {
        return payload.map(e => migrateV1ToV2Entry(e));
    }

    if (payload && typeof payload === "object") {
        const rawEntries = Array.isArray(payload.entries) ? payload.entries : [];
        const migratedEntries = rawEntries.map(e => migrateV1ToV2Entry(e));
        const moduleName = String(payload.module ?? payload.sourceModule ?? "world").trim();
        const timestamp = String(payload.timestamp ?? payload.exportedAt ?? new Date().toISOString());
        const foundryVer = String(payload.foundry ?? payload.foundryVersion ?? game?.version ?? "unknown");
        const systemId = String(payload.system ?? game?.system?.id ?? "generic");

        return {
            ...payload,
            version: AUTOREC_EXCHANGE_VERSION,
            timestamp,
            foundry: foundryVer,
            system: systemId,
            module: moduleName,
            entries: migratedEntries
        };
    }

    return payload;
}

/**
 * Detects whether a given package payload or entry array conforms to legacy v1.0.0 structure.
 *
 * @param {Object|Array<Object>} payload - Raw package or entries array
 * @returns {boolean} True if payload requires v1.0.0 -> v2.0.0 migration
 */
function isV1Schema(payload) {
    if (!payload || typeof payload !== "object") {
        return false;
    }

    if (Array.isArray(payload)) {
        return payload.some(e => Boolean(e && (e.circleFile || e.borderColor || e.concurrentCode || e.stickToToken)));
    }

    const versionStr = String(payload.version ?? "").trim();
    if (versionStr === "1.0.0") {
        return true;
    }

    // Unversioned legacy packages or packages with exportedAt / sourceModule headers
    if (!versionStr && (payload.exportedAt || payload.foundryVersion || Array.isArray(payload.entries))) {
        const entries = Array.isArray(payload.entries) ? payload.entries : [];
        return entries.some(e => Boolean(e && (e.circleFile || e.borderColor || e.concurrentCode || e.stickToToken || !e.file)));
    }

    return false;
}

/**
 * Chainable entrypoint for upgrading Autorec entries or packages through versioned schema migration steps.
 * Designed to chain sequential migrations (e.g. v1.0.0 -> v2.0.0 -> v3.0.0 in future releases).
 *
 * @param {Object|Array<Object>} packageOrEntries - Raw package object or entries collection
 * @returns {Object|Array<Object>} Upgraded schema payload ready for consumption by v2.0.0 handlers
 */
export function autorecCompatibilityUpdate(packageOrEntries) {
    if (!packageOrEntries) {
        return packageOrEntries;
    }

    let current = packageOrEntries;

    // Step 1: Upgrade v1.0.0 -> v2.0.0
    if (isV1Schema(current)) {
        current = migrateV1ToV2(current);
    }

    // Step 2: Future version migrations can be chained sequentially below:
    // if (isV2Schema(current)) {
    //     current = migrateV2ToV3(current);
    // }

    return current;
}
