import { MODULE_ID } from "../../lib/constants.js";
import { log } from "../../lib/logger.js";
import { slugify } from "../../lib/utils.js";
import { ItemCrosshairConfigApplication } from "../../autorec/itemConfigMenu.js";

/**
 * Base System Adapter for system-agnostic decision on whether to replace the default crosshair.
 * Makes no assumptions about placeable document types (template vs region).
 */
export class BaseSystemAdapter {
    /**
     * Initialize base system adapter properties (`systemId`, `supportsActivities`, and `defaultsMap`).
     */
    constructor() {
        this.systemId = "base";
        this.supportsActivities = false;
        this.defaultsMap = new Map();
    }

    /**
     * Return list of custom PlaceableObject subclass names introduced by this game system.
     * @returns {string[]} Array of custom placeable class names
     */
    getCustomPlaceableClassNames() {
        return [];
    }

    /**
     * Return list of custom Document type names introduced by this game system for placement creation hooks.
     * @returns {string[]} Array of custom document type names
     */
    getCustomDocumentTypes() {
        return [];
    }

    /**
     * Modify or refine the generated list of placement hook descriptors for the active game system.
     * Allows the system adapter layer to modify elements of hook generation (such as adding, replacing, or filtering hooks).
     * @param {Array<{event: string, handler: Function, category: string, targetName: string}>} hooks - Array of generated hook descriptor objects
     * @param {Object} callbacks - Placement hook callbacks (`{ onDrawPreview, onPreCreate, onCreate }`)
     * @param {Object|null} [foundryAdapter=null] - Active Foundry VTT generation adapter instance
     * @returns {Array<{event: string, handler: Function, category: string, targetName: string}>} Modified or filtered array of hook descriptor objects
     */
    modifyPlacementHooks(hooks, callbacks, foundryAdapter = null) {
        if (!Array.isArray(hooks)) return [];
        return hooks;
    }

    /**
     * Return whether mouse wheel rotation of a crosshair requires holding the Control / Command modifier key.
     * Base implementation returns false (normal mouse wheel scrolling rotates crosshair unless overridden by system).
     * @returns {boolean} True if the Control / Command key must be held to rotate the crosshair via mouse wheel.
     */
    requiresWheelModifier() {
        return false;
    }

    /**
     * Extract or refine calling context for the specific game system.
     * Base implementation normalizes calling context to explicit domain schema contract.
     * @param {Document|null} doc - Template or Region document placed on canvas
     * @param {Object} [baseContext={}] - Initial calling context (`{ item, itemName, itemId, activity, activityName, activityId }`)
     * @returns {{item: Item|null, itemName: string, itemId: string, activity: Object|null, activityName: string, activityId: string}} Refined calling context object
     */
    extractCallingContext(doc, baseContext = {}) {
        const itemObj = baseContext?.item ?? null;
        const activityObj = baseContext?.activity ?? null;

        return {
            item: itemObj,
            itemName: itemObj?.name ?? baseContext?.itemName ?? "",
            itemId: itemObj?.id ?? baseContext?.itemId ?? "",
            activity: activityObj,
            activityName: activityObj?.name ?? baseContext?.activityName ?? "",
            activityId: activityObj?.id ?? baseContext?.activityId ?? ""
        };
    }

    /**
     * Evaluate whether a calling context matches a candidate autorec entry.
     * Compares exact canonical item name (`itemName`) or item id (`itemId`).
     * @param {{item?: Item, itemName?: string, itemId?: string}} context - Normalized calling item context
     * @param {Object} entry - Registered autorec entry configuration (`{ itemName, itemId }`)
     * @returns {boolean} True if the calling context matches candidate entry item rules
     */
    isMatch(context, entry) {
        if (!context || !entry) return false;
        if (entry.isDefault) return true;

        const callingName = (context.itemName ?? "").trim().toLowerCase();
        const callingId = (context.itemId ?? "").trim();
        const entryName = (entry.itemName ?? "").trim().toLowerCase();
        const entryId = (entry.itemId ?? "").trim();

        const match = Boolean(
            (entryName && callingName && entryName === callingName) ||
            (entryId && callingId && entryId === callingId)
        );

        if (!match) {
            log.debug(`BaseSystemAdapter.isMatch | Item match FAILED: calling ("${callingName}" / "${callingId}") vs entry ("${entryName}" / "${entryId}")`);
        }
        return match;
    }

    /**
     * Load built-in system defaults dataset for this game system into memory.
     * Fetches `modules/${MODULE_ID}/src/autorec/system-defaults/${this.systemId}.json`
     * and discovers all available multi-lingual translation bundles (`lang/<lang>/${this.systemId}.json`).
     * @returns {Promise<void>}
     */
    async loadSystemDefaultsData() {
        if (this.defaultsMap.size > 0) return;
        try {
            const bundlePath = `modules/${MODULE_ID}/src/autorec/system-defaults/${this.systemId}.json`;
            const response = await fetch(bundlePath);
            if (response.ok) {
                const data = await response.json();
                this.setDefaultsData(data ?? {});
                await this.loadAllSystemLanguages(data ?? {});
                log.debug(`BaseSystemAdapter | Loaded ${this.defaultsMap.size} system default definitions for "${this.systemId}".`);
            }
        } catch (e) {
            log.debug(`BaseSystemAdapter | No system defaults bundle found for "${this.systemId}":`, e);
        }
    }

    /**
     * Discover and load all registered language translation bundles for this game system.
     * Indexes translated names across all configured languages (e.g. en, es, ja) simultaneously,
     * enabling mixed-language item recognition within the same game world.
     * @param {Object<string, boolean>} baseDefaults - Canonical slug to boolean stickiness map
     * @returns {Promise<void>}
     */
    async loadAllSystemLanguages(baseDefaults) {
        if (!baseDefaults || typeof baseDefaults !== "object") return;
        const targetSuffix = `/${this.systemId}.json`;
        const candidatePaths = new Set();

        // 1. Check registered language paths in module manifest/metadata if available
        if (typeof game !== "undefined" && game?.modules) {
            const mod = game.modules.get(MODULE_ID);
            const languages = mod?.languages ?? mod?.manifest?.languages ?? [];
            for (const entry of languages) {
                const p = entry?.path;
                if (typeof p === "string" && p.endsWith(targetSuffix)) {
                    candidatePaths.add(`modules/${MODULE_ID}/${p}`);
                }
            }
        }

        // 2. Fallback check for common language directories if module manifest is unpopulated
        if (candidatePaths.size === 0) {
            for (const lang of ["en", "es", "ja", "de", "fr", "pt-BR", "it", "pl", "ko", "zh-tw", "zh-cn"]) {
                candidatePaths.add(`modules/${MODULE_ID}/lang/${lang}/${this.systemId}.json`);
            }
        }

        for (const langPath of candidatePaths) {
            try {
                const res = await fetch(langPath);
                if (res.ok) {
                    const langData = await res.json();
                    const translations = langData?.BBC?.defaults?.[this.systemId];
                    if (translations && typeof translations === "object") {
                        this.registerLocalizedDefaults(translations, baseDefaults);
                    }
                }
            } catch {
                // Silently skip non-existent language bundles
            }
        }
    }

    /**
     * Set a system default entry in the lookup map with collision and conflict detection.
     * Logs a warning if an identical key is registered with conflicting stickiness values.
     * @param {string} key - Normalized lookup key (slug or lowercase item name)
     * @param {boolean} boolStick - Stickiness value (true for token attachment, false for free placement)
     * @param {string} slug - Originating canonical slug
     * @returns {void}
     */
    _setDefaultsEntry(key, boolStick, slug) {
        if (!key) return;
        if (this.defaultsMap.has(key)) {
            const existing = this.defaultsMap.get(key);
            if (existing !== boolStick) {
                log.warn(`BaseSystemAdapter | Key collision conflict on "${key}": incoming slug "${slug}" sets stick=${boolStick}, but key was already mapped to stick=${existing}.`);
            }
            return;
        }
        this.defaultsMap.set(key, boolStick);
    }

    /**
     * Register a dictionary of localized translations for canonical system default slugs.
     * @param {Object<string, string>} translations - Dictionary mapping slugs to localized item names
     * @param {Object<string, boolean>} [baseDefaults={}] - Canonical slug to boolean stickiness map
     * @returns {void}
     */
    registerLocalizedDefaults(translations, baseDefaults = {}) {
        if (!translations || typeof translations !== "object") return;
        for (const [slug, localizedName] of Object.entries(translations)) {
            if (!slug || !localizedName) continue;
            const cleanSlug = slugify(slug);
            const rawStick = baseDefaults[cleanSlug] ?? baseDefaults[slug] ?? this.defaultsMap.get(cleanSlug) ?? this.defaultsMap.get(slug);
            if (rawStick === undefined || rawStick === null) continue;
            const boolStick = Boolean(rawStick);
            const rawLower = String(localizedName).trim().toLowerCase();
            const localizedSlug = slugify(localizedName);

            this._setDefaultsEntry(rawLower, boolStick, cleanSlug);
            if (localizedSlug && localizedSlug !== rawLower) {
                this._setDefaultsEntry(localizedSlug, boolStick, cleanSlug);
            }
        }
    }

    /**
     * Populate the in-memory system defaults map from a dictionary or array of entries.
     * Indexes both canonical slug keys and localized item names registered in `game.i18n`.
     * @param {Object<string, boolean>|Array<Object>} data - Dictionary mapping spell names/slugs to stick booleans, or array of entry objects
     * @returns {void}
     */
    setDefaultsData(data) {
        if (!data || typeof data !== "object") return;
        const entries = Array.isArray(data)
            ? data.map(entry => [entry.itemName, Boolean(entry.options?.attachMode === "true" || entry.stickToToken === "true" || entry.stickToToken === true)])
            : Object.entries(data);

        for (const [nameOrSlug, stick] of entries) {
            if (!nameOrSlug) continue;
            const boolStick = Boolean(stick);
            const slug = slugify(nameOrSlug);
            const rawLower = String(nameOrSlug).trim().toLowerCase();

            this._setDefaultsEntry(slug, boolStick, slug);
            if (rawLower !== slug) {
                this._setDefaultsEntry(rawLower, boolStick, slug);
            }

            // Check if active localization has a translated string for this default key
            if (typeof game !== "undefined" && game?.i18n?.has) {
                const i18nKey = `BBC.defaults.${this.systemId}.${slug}`;
                if (game.i18n.has(i18nKey)) {
                    const localized = game.i18n.localize(i18nKey);
                    if (localized) {
                        const rawLocalized = localized.trim().toLowerCase();
                        const localizedSlug = slugify(localized);
                        this._setDefaultsEntry(rawLocalized, boolStick, slug);
                        if (localizedSlug && localizedSlug !== rawLocalized) {
                            this._setDefaultsEntry(localizedSlug, boolStick, slug);
                        }
                    }
                }
            }
        }
    }

    /**
     * Retrieve the authoritative system default stick setting for a calling item/spell.
     * Evaluates item system identifiers, canonical slugs, and localized names.
     * @param {Object|string} [context={}] - Calling context or item name
     * @returns {boolean|null} True if spell attaches to token, false if free placement, null if unlisted
     */
    getSystemDefault(context) {
        if (!context) return null;
        const itemObj = typeof context === "object" ? (context.item ?? (context.documentName === "Item" ? context : null)) : null;
        const rawName = typeof context === "string" ? context : (context.itemName ?? itemObj?.name ?? "");

        // 1. Check item system identifier / slug if item document is present
        const itemIdentifier = (itemObj?.system?.identifier ?? itemObj?.identifier ?? itemObj?.flags?.[this.systemId]?.identifier ?? "").trim().toLowerCase();
        if (itemIdentifier) {
            const slugIdentifier = slugify(itemIdentifier);
            if (this.defaultsMap.has(slugIdentifier)) return this.defaultsMap.get(slugIdentifier);
            if (this.defaultsMap.has(itemIdentifier)) return this.defaultsMap.get(itemIdentifier);
        }

        // 2. Check canonical item name and normalized slug
        const lowerName = rawName.trim().toLowerCase();
        if (lowerName && this.defaultsMap.has(lowerName)) {
            return this.defaultsMap.get(lowerName);
        }

        const nameSlug = slugify(rawName);
        if (nameSlug && this.defaultsMap.has(nameSlug)) {
            return this.defaultsMap.get(nameSlug);
        }

        return null;
    }

    /**
     * Determine the system default for whether a crosshair shape should stick to its source token
     * when no explicit item/autorec override (`stickToToken`) is defined.
     * Checks built-in system defaults dataset first, then falls back to shape defaults (cones stick).
     * @param {string} shapeType - The template or crosshair shape (`"cone"`, `"circle"`, `"ray"`, `"rect"`, `"square"`)
     * @param {object} [config={}] - Optional crosshair configuration object
     * @returns {boolean} Whether the crosshair shape defaults to sticking to the token
     */
    getDefaultStickToToken(shapeType, config = {}) {
        const itemDefault = this.getSystemDefault(config);
        if (itemDefault !== null && itemDefault !== undefined) {
            return Boolean(itemDefault);
        }
        return shapeType === "cone";
    }

    /**
     * Extract maximum placement distance range from a calling item or activity document/schema.
     * Evaluates activity range first, falling back to calling item system range attributes.
     * @param {Document|null} item - Target calling item document
     * @param {Object|null} [activity=null] - Calling activity document or object
     * @returns {number|null} Max range in canvas distance units, or null if unrestricted/touch/self
     */
    getItemMaxRange(item, activity = null) {
        const rawVal = activity?.system?.range?.value ?? activity?.range?.value ?? item?.system?.range?.value;
        if (rawVal === undefined || rawVal === null || rawVal === "") return null;
        let num = NaN;
        if (typeof rawVal === "number") {
            num = rawVal;
        } else if (typeof rawVal === "string") {
            const lower = rawVal.trim().toLowerCase();
            if (lower === "touch" || lower === "self" || lower === "unlimited" || lower === "special") return null;
            num = parseFloat(rawVal);
        }
        return (Number.isFinite(num) && num > 0) ? num : null;
    }

    /**
     * Handle delayed single-click programmatic document creation when native placement listeners are blocked or deferred.
     * Base implementation defaults to NOP to preserve native placement behavior across standard game systems.
     * System subclasses that block pointer events on Click #1 (e.g. Pathfinder 2e) override this method.
     * @param {Scene} scene - Target Canvas Scene
     * @param {Document} doc - Preview Template or Region document
     * @param {PlaceableObject} placeable - Live canvas preview placeable
     * @param {Object} [coords={}] - Resolved placement coordinates (`{ x, y, direction, distance }`)
     * @param {Object} [options={}] - Execution dependencies (`{ crosshairAdapter, pendingPlacements, placementKey }`)
     * @returns {void} No return value
     */
    handleProgrammaticPlacement(scene, doc, placeable, coords = {}, options = {}) {
        return;
    }

    /**
     * Refresh system-specific template highlights or preview overlays.
     * Base implementation defaults to NOP stub to allow system adapter overrides.
     * @param {PlaceableObject} tmpl - Canvas preview placeable
     * @param {number} direction - Current rotation direction in degrees
     * @returns {void}
     */
    refreshTemplateHighlights(tmpl, direction) {
        return;
    }

    /**
     * Open the Item Crosshair Configuration application for a target item.
     * Accessible to any user who owns the item.
     * @param {Document} item - Target Item document
     * @returns {void} No return value
     */
    openItemCrosshairConfig(item) {
        if (!item) return;
        new ItemCrosshairConfigApplication({ item }).render(true);
    }

    /**
     * Add a Better Crosshairs header control to an ApplicationV2 item sheet instance.
     * @param {foundry.applications.api.ApplicationV2} app - Item sheet application instance
     * @param {Array<object>} controls - Array of header control button items
     * @returns {void} No return value
     */
    addItemSheetHeaderControl(app, controls) {
        const item = app?.document;
        if (!item || item.documentName !== "Item" || !item.isOwner) return;
        if (!Array.isArray(controls)) return;
        if (controls.some(c => c.label?.startsWith("BBC") || c.icon === "fa-solid fa-crosshairs")) return;

        const customConfig = item.getFlag("bakana-better-crosshairs", "customConfig") ?? null;
        const activityConfigs = item.getFlag("bakana-better-crosshairs", "activityConfigs") ?? null;
        const hasAnyCustom = Boolean(
            customConfig ||
            (activityConfigs && typeof activityConfigs === "object" && Object.keys(activityConfigs).length > 0)
        );

        controls.push({
            label: "BBC",
            icon: hasAnyCustom ? "fa-solid fa-crosshairs bbc-header-icon-custom" : "fa-solid fa-crosshairs",
            onClick: () => this.openItemCrosshairConfig(item)
        });
    }

    /**
     * Return list of Hook names used for ApplicationV2 item sheet header controls.
     * Protected hook for subclass override (Template Method Pattern).
     * @protected
     * @returns {string[]} Array of hook names
     */
    _getItemSheetHookNames() {
        return ["getHeaderControlsApplicationV2", "getHeaderControlsItemSheetV2"];
    }

    /**
     * Register standard universal ApplicationV2 item sheet header hooks (`ApplicationV2` / `ItemSheetV2`).
     * Template method executing common hook registration workflow.
     * @returns {void} No return value
     */
    registerItemSheetHooks() {
        if (typeof Hooks?.on === "function") {
            const handler = (app, controls) => this.addItemSheetHeaderControl(app, controls);
            for (const hookName of this._getItemSheetHookNames()) {
                Hooks.on(hookName, handler);
            }
        }
    }
}
