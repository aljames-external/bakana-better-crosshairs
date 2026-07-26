import { MODULE_ID } from "../lib/constants.js";
import { log } from "../lib/logger.js";
import { saveDataToFile } from "../lib/compat.js";
import { DEFAULT_AUTOREC_ENTRY } from "./autorecManager.js";

/**
 * Current supported schema version for exported autorec JSON exchange bundles.
 * Used for compatibility check on import.
 * @type {string}
 */
export const AUTOREC_EXCHANGE_VERSION = "1.0.0";

/**
 * List of non-configuration metadata keys stripped when comparing configurations for conflict detection.
 * @type {Set<string>}
 */
const STRIPPED_COMPARE_KEYS = new Set([
    "id",
    "regKey",
    "isDefault",
    "hasActivity",
    "activityDisplay",
    "supportsActivities",
    "type",
    "typeKey",
    "isAutoDetect",
    "isCustomFunction",
    "isLocal",
    "distanceDisplay",
    "widthDisplay",
    "angleDisplay",
    "stickToTokenMode",
    "isStickDefault",
    "isStickOn",
    "isStickOff",
    "hasCustomStyling",
    "hasPlacedStyling",
    "borderColorPicker",
    "fillColorPicker",
    "placedFillColorPicker",
    "placedBorderColorPicker"
]);

/**
 * Clean and strip dynamic transient runtime metadata from an entry configuration object for JSON exchange.
 * Single-responsibility concrete parameter type (Rule 5).
 * @param {Object} entry - Raw autorec entry configuration object
 * @returns {Object} Explicit schema content dictionary suitable for serialization
 */
export function sanitizeEntryForExchange(entry) {
    if (!entry || typeof entry !== "object") {
        return {};
    }

    const raw = entry.config ?? entry;
    const itemName = String(raw.itemName ?? raw.regKey ?? "").trim();
    const activityId = String(raw.activityId ?? "").trim();
    const activityName = String(raw.activityName ?? "").trim();
    const sourceModule = String(raw.sourceModule ?? "BBC").trim();
    const enabled = raw.enabled !== false;

    const sanitized = {
        itemName,
        activityId,
        activityName,
        sourceModule,
        enabled,
        local: Boolean(raw.local),
        stickToToken: raw.stickToToken ?? DEFAULT_AUTOREC_ENTRY.stickToToken,
        showLine: raw.showLine ?? DEFAULT_AUTOREC_ENTRY.showLine,
        showRange: raw.showRange ?? DEFAULT_AUTOREC_ENTRY.showRange,
        limitRange: raw.limitRange ?? DEFAULT_AUTOREC_ENTRY.limitRange,
        borderColor: raw.borderColor ?? DEFAULT_AUTOREC_ENTRY.borderColor,
        borderAlpha: raw.borderAlpha ?? DEFAULT_AUTOREC_ENTRY.borderAlpha,
        fillColor: raw.fillColor ?? DEFAULT_AUTOREC_ENTRY.fillColor,
        fillAlpha: raw.fillAlpha ?? DEFAULT_AUTOREC_ENTRY.fillAlpha,
        circleFile: raw.circleFile ?? DEFAULT_AUTOREC_ENTRY.circleFile,
        coneFile: raw.coneFile ?? DEFAULT_AUTOREC_ENTRY.coneFile,
        rayFile: raw.rayFile ?? DEFAULT_AUTOREC_ENTRY.rayFile,
        squareFile: raw.squareFile ?? DEFAULT_AUTOREC_ENTRY.squareFile,
        lineFile: raw.lineFile ?? DEFAULT_AUTOREC_ENTRY.lineFile,
        placedFillColor: raw.placedFillColor ?? DEFAULT_AUTOREC_ENTRY.placedFillColor,
        placedFillAlpha: raw.placedFillAlpha ?? DEFAULT_AUTOREC_ENTRY.placedFillAlpha,
        placedBorderColor: raw.placedBorderColor ?? DEFAULT_AUTOREC_ENTRY.placedBorderColor,
        placedBorderAlpha: raw.placedBorderAlpha ?? DEFAULT_AUTOREC_ENTRY.placedBorderAlpha,
        enablePrePlacement: Boolean(raw.enablePrePlacement),
        enableAnimation: Boolean(raw.enableAnimation),
        enablePlacedStyling: Boolean(raw.enablePlacedStyling),
        enablePostPlacement: Boolean(raw.enablePostPlacement),
        concurrentCode: String(raw.concurrentCode ?? "").trim(),
        postPlacementCode: String(raw.postPlacementCode ?? "").trim(),
        icon: raw.icon ?? DEFAULT_AUTOREC_ENTRY.icon
    };

    if (raw.distance !== undefined && raw.distance !== null) {
        sanitized.distance = Number(raw.distance);
    }
    if (raw.width !== undefined && raw.width !== null) {
        sanitized.width = Number(raw.width);
    }
    if (raw.angle !== undefined && raw.angle !== null) {
        sanitized.angle = Number(raw.angle);
    }

    return sanitized;
}

/**
 * Construct a standardized export JSON package object from current registered autorec entries.
 * Normalizes caller map or array parameter before formatting (Rule 5).
 * @param {Array<Object>|Map<string, Object>} entriesInput - List or Map of registration objects
 * @param {Object} [options={}] - Export configuration options
 * @param {string} [options.sourceModule="world"] - Default source module name attributed to the export
 * @param {boolean} [options.includeDefault=false] - Whether to include the CANONICAL DEFAULT fallback registration
 * @param {string} [options.description=""] - Optional human readable tag or description
 * @returns {Object} Explicit schema structure of the full exported package
 */
export function buildExportPackage(entriesInput, { sourceModule = "world", includeDefault = false, description = "" } = {}) {
    const list = Array.isArray(entriesInput)
        ? entriesInput
        : (entriesInput instanceof Map ? Array.from(entriesInput.values()) : []);

    const exportedEntries = [];
    for (const rawEntry of list) {
        if (!rawEntry || typeof rawEntry === "function") {
            continue;
        }
        const isDefaultEntry = Boolean(rawEntry.isDefault || rawEntry.itemName === "DEFAULT");
        if (isDefaultEntry && !includeDefault) {
            continue;
        }

        const sanitized = sanitizeEntryForExchange(rawEntry);
        if (!sanitized.itemName) {
            continue;
        }
        sanitized.sourceModule = String(rawEntry.sourceModule ?? sourceModule ?? "world").trim();
        exportedEntries.push(sanitized);
    }

    const foundryVersion = String(game?.version ?? "unknown");
    const exportedAt = new Date().toISOString();

    return {
        version: AUTOREC_EXCHANGE_VERSION,
        exportedAt,
        foundryVersion,
        description: String(description ?? "").trim(),
        sourceModule: String(sourceModule ?? "world").trim(),
        entries: exportedEntries
    };
}

/**
 * Validate an incoming raw JSON string or object package against exchange contract requirements.
 * Throws concrete validation errors for missing version or malformed entries.
 * Single concrete parameter input type after normalization (Rule 5).
 * @param {string|Object} rawInput - Raw parsed JSON object or raw JSON string payload
 * @returns {Object} Validated and parsed package object
 * @throws {Error} If package format or any individual entry fails validation
 */
export function validateImportPackage(rawInput, { overrideSourceModule = null } = {}) {
    let parsed = rawInput;
    if (typeof rawInput === "string") {
        try {
            parsed = JSON.parse(rawInput);
        } catch (err) {
            log.error("AutorecExchange.validateImportPackage | Failed to parse JSON string payload.", err);
            throw new Error(`Invalid JSON format: ${err.message}`);
        }
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        log.error("AutorecExchange.validateImportPackage | Payload is not a top-level object.");
        throw new Error("Invalid autorec import payload: top-level object container expected.");
    }

    const packageVersion = String(parsed.version ?? "").trim();
    if (!packageVersion) {
        log.error("AutorecExchange.validateImportPackage | Missing 'version' attribute in package.");
        throw new Error("Invalid autorec package: missing required 'version' field.");
    }

    const [majorSupported] = AUTOREC_EXCHANGE_VERSION.split(".");
    const [majorPackage] = packageVersion.split(".");
    if (majorPackage !== majorSupported) {
        log.warn(`AutorecExchange.validateImportPackage | Schema version mismatch: package="${packageVersion}", supported="${AUTOREC_EXCHANGE_VERSION}".`);
        throw new Error(`Incompatible package version "${packageVersion}". Expected compatible major version "${majorSupported}.x".`);
    }

    if (!Array.isArray(parsed.entries)) {
        log.error("AutorecExchange.validateImportPackage | 'entries' attribute is missing or not an array.");
        throw new Error("Invalid autorec package: 'entries' must be an array.");
    }

    const cleanOverride = overrideSourceModule !== null && overrideSourceModule !== undefined
        ? String(overrideSourceModule).trim()
        : null;

    const validatedEntries = [];
    for (let i = 0; i < parsed.entries.length; i++) {
        const item = parsed.entries[i];
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            log.error(`AutorecExchange.validateImportPackage | Entry at index ${i} is not a valid object.`);
            throw new Error(`Invalid autorec entry at index ${i}: object required.`);
        }

        const itemName = String(item.itemName ?? "").trim();
        if (!itemName) {
            log.error(`AutorecExchange.validateImportPackage | Entry at index ${i} is missing non-empty 'itemName'.`);
            throw new Error(`Invalid autorec entry at index ${i}: missing required 'itemName' string.`);
        }

        const sanitized = sanitizeEntryForExchange(item);
        const entrySourceModule = cleanOverride !== null
            ? cleanOverride
            : String(item.sourceModule ?? parsed.sourceModule ?? "world").trim();
        sanitized.sourceModule = entrySourceModule;
        validatedEntries.push(sanitized);
    }

    const packageSourceModule = cleanOverride !== null
        ? cleanOverride
        : String(parsed.sourceModule ?? "world").trim();

    log.debug(`AutorecExchange.validateImportPackage | Package version "${packageVersion}" validated successfully (${validatedEntries.length} entries).`);

    return {
        version: packageVersion,
        exportedAt: parsed.exportedAt ?? null,
        foundryVersion: parsed.foundryVersion ?? null,
        description: parsed.description ?? "",
        sourceModule: packageSourceModule,
        entries: validatedEntries
    };
}

/**
 * Generate canonical unique identity key for matching entries during import diffing.
 * Single concrete arguments (Rule 5).
 * @param {string} itemName - Item/spell name
 * @param {string} activityId - Activity ID
 * @param {string} activityName - Activity label
 * @returns {string} Normalized lowercase lookup token
 */
export function getEntryLookupToken(itemName, activityId = "", activityName = "") {
    const cleanItem = String(itemName ?? "").trim().toLowerCase();
    const cleanActId = String(activityId ?? "").trim().toLowerCase();
    const cleanActName = String(activityName ?? "").trim().toLowerCase();
    const actToken = cleanActId !== "" ? cleanActId : cleanActName;
    return actToken !== "" ? `${cleanItem}|${actToken}` : cleanItem;
}

/**
 * Compare an incoming sanitized import entry against an existing active runtime entry configuration.
 * Determines whether two configuration objects differ meaningfully.
 * @param {Object} importedEntry - Sanitized import entry object
 * @param {Object} existingEntry - Active registered runtime configuration object
 * @returns {Array<{field: string, importedValue: any, existingValue: any}>} List of dynamic field differences
 */
export function computeFieldDifferences(importedEntry, existingEntry) {
    const differences = [];
    if (!existingEntry || typeof existingEntry !== "object") {
        return differences;
    }

    const sanitizedExisting = sanitizeEntryForExchange(existingEntry);
    const checkedKeys = new Set([
        ...Object.keys(importedEntry),
        ...Object.keys(sanitizedExisting)
    ]);

    for (const key of checkedKeys) {
        if (STRIPPED_COMPARE_KEYS.has(key) || key === "sourceModule" || key === "itemName" || key === "activityId" || key === "activityName") {
            continue;
        }
        const valImported = importedEntry[key];
        const valExisting = sanitizedExisting[key];

        if (valImported !== valExisting) {
            differences.push({
                field: key,
                importedValue: valImported,
                existingValue: valExisting
            });
        }
    }

    return differences;
}

/**
 * Analyze diff results between a validated import package and current existing runtime registrations.
 * @param {Object} validatedPackage - Result of validateImportPackage
 * @param {Map<string, Object>} currentRegistrations - Active registeredHandlers map from AutorecManager
 * @param {Object} [options={}] - Diff calculation options
 * @param {string} [options.defaultSourceModule="world"] - Default source module override if omitted in file
 * @param {string|null} [options.overrideSourceModule=null] - Mandatory explicit source module override if specified
 * @returns {Object} Structured diff analysis contract
 */
export function analyzeImportDiff(validatedPackage, currentRegistrations, { defaultSourceModule = "world", overrideSourceModule = null } = {}) {
    const existingTokenMap = new Map();
    for (const [regKey, handler] of currentRegistrations.entries()) {
        if (!handler || typeof handler === "function") {
            continue;
        }
        if (Boolean(handler.isDefault || regKey === "DEFAULT")) {
            continue;
        }
        const itemName = handler.itemName ?? regKey.split(" | ")[0].trim();
        const actId = handler.activityId ?? "";
        const actName = handler.activityName ?? "";
        const token = getEntryLookupToken(itemName, actId, actName);
        existingTokenMap.set(token, { regKey, handler });
    }

    const newEntries = [];
    const conflictEntries = [];
    const identicalEntries = [];

    const cleanOverride = overrideSourceModule !== null && overrideSourceModule !== undefined
        ? String(overrideSourceModule).trim()
        : null;

    for (let index = 0; index < validatedPackage.entries.length; index++) {
        const item = validatedPackage.entries[index];
        const token = getEntryLookupToken(item.itemName, item.activityId, item.activityName);
        const match = existingTokenMap.get(token);
        const entrySourceModule = cleanOverride !== null
            ? cleanOverride
            : (item.sourceModule ?? validatedPackage.sourceModule ?? defaultSourceModule);
        const entryWithSource = {
            ...item,
            sourceModule: entrySourceModule,
            importIndex: index
        };

        if (!match) {
            newEntries.push({
                ...entryWithSource,
                isNew: true,
                isConflict: false,
                isIdentical: false,
                selectedByDefault: true,
                differences: []
            });
        } else {
            const fieldDiffs = computeFieldDifferences(item, match.handler);
            const hasConflict = fieldDiffs.length > 0;
            const targetRegKey = match.regKey;

            if (hasConflict) {
                conflictEntries.push({
                    ...entryWithSource,
                    isNew: false,
                    isConflict: true,
                    isIdentical: false,
                    selectedByDefault: true,
                    targetRegKey,
                    differences: fieldDiffs
                });
            } else {
                identicalEntries.push({
                    ...entryWithSource,
                    isNew: false,
                    isConflict: false,
                    isIdentical: true,
                    selectedByDefault: false,
                    targetRegKey,
                    differences: []
                });
            }
        }
    }

    log.debug(`AutorecExchange.analyzeImportDiff | Analysis complete: ${newEntries.length} new, ${conflictEntries.length} conflict (overwrites), ${identicalEntries.length} identical.`);

    return {
        version: validatedPackage.version,
        metadata: {
            exportedAt: validatedPackage.exportedAt,
            foundryVersion: validatedPackage.foundryVersion,
            description: validatedPackage.description,
            sourceModule: validatedPackage.sourceModule
        },
        newEntries,
        conflictEntries,
        identicalEntries,
        allImportable: [...conflictEntries, ...newEntries]
    };
}

/**
 * Trigger browser file save/download of a JSON string payload.
 * Single concrete string parameters (Rule 5).
 * @param {string} jsonString - Stringified JSON payload
 * @param {string} [filename="bbc-autorec-export.json"] - Output filename
 * @returns {void}
 */
export function triggerFileDownload(jsonString, filename = "bbc-autorec-export.json") {
    try {
        const saved = saveDataToFile(jsonString, "text/json", filename);
        if (saved) {
            log.info(`AutorecExchange.triggerFileDownload | Export file "${filename}" saved via Foundry saveDataToFile.`);
            return;
        }
    } catch (err) {
        log.warn("AutorecExchange.triggerFileDownload | Native saveDataToFile failed, falling back to data URI:", err);
    }

    const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(jsonString);
    const anchor = document.createElement("a");
    anchor.href = dataUri;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    log.info(`AutorecExchange.triggerFileDownload | Export file "${filename}" saved via Data-URI download.`);
}
