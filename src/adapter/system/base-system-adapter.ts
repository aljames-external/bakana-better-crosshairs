import { MODULE_ID } from "../../lib/constants.js";
import { log } from "../../lib/logger.js";
import { slugify } from "../../lib/utils.js";

/**
 * Base System Adapter for system-agnostic decision on whether to replace the default crosshair.
 * Makes no assumptions about placeable document types (template vs region).
 */
export class BaseSystemAdapter {
    systemId: string;
    supportsActivities: boolean;
    defaultsMap: Map<string, any>;
    declare _rawBaseDefaults?: any;

    /**
     * Initialize base system adapter properties (`systemId`, `supportsActivities`, and `defaultsMap`).
     */
    constructor() {
        this.systemId = "base";
        this.supportsActivities = false;
        this.defaultsMap = new Map();
    }

    /**
     * Replaced at runtime by initializeSystemAdapter on prototype.
     */
    initialize(): any {
        return this;
    }

    /**
     * Return list of custom PlaceableObject subclass names introduced by this game system.
     * @returns {string[]} Array of custom placeable class names
     */
    getCustomPlaceableClassNames(): string[] {
        return [];
    }

    /**
     * Return list of custom Document type names introduced by this game system for placement creation hooks.
     * @returns {string[]} Array of custom document type names
     */
    getCustomDocumentTypes(): string[] {
        return [];
    }

    /**
     * Optional lifecycle hook enabling system adapters to customize or extend placement hooks.
     * @param {Array<{event: string, handler: Function, category: string, targetName: string}>} hooks - Default hooks from Foundry adapter
     * @param {Object} callbacks - Placement hook callbacks (`{ onDrawPreview, onPreCreate, onCreate }`)
     * @returns {Array<{event: string, handler: Function, category: string, targetName: string}>} Modified or filtered array of hook descriptor objects
     */
    modifyPlacementHooks(hooks: any, callbacks: any): any {
        return hooks;
    }

    /**
     * Return whether mouse wheel rotation of a crosshair requires holding the Control / Command modifier key.
     * Base implementation returns false (normal mouse wheel scrolling rotates crosshair unless overridden by system).
     * @returns {boolean} True if the Control / Command key must be held to rotate the crosshair via mouse wheel.
     */
    requiresWheelModifier(): boolean {
        return false;
    }

    /**
     * Extract or refine calling context for the specific game system.
     * Base implementation normalizes calling context to explicit domain schema contract.
     * @param {Document|null} doc - Template or Region document placed on canvas
     * @param {Object} [baseContext={}] - Initial calling context (`{ item, itemName, itemId, activity, activityName, activityId }`)
     * @returns {{item: Item|null, itemName: string, itemId: string, activity: Object|null, activityName: string, activityId: string}} Refined calling context object
     */
    extractCallingContext(doc: any, baseContext: any = {}) {
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
    isMatch(context: any, entry: any) {
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
     * and registers active multi-lingual translation bundles from `game.i18n`.
     * @returns {Promise<void>}
     */
    async loadSystemDefaultsData() {
        if (this.defaultsMap.size > 0) {
            log.debug(`BaseSystemAdapter.loadSystemDefaultsData | Defaults map already initialized (${this.defaultsMap.size} entries) for "${this.systemId}".`);
            return;
        }
        try {
            const bundlePath = `modules/${MODULE_ID}/src/autorec/system-defaults/${this.systemId}.json`;
            log.debug(`BaseSystemAdapter.loadSystemDefaultsData | Fetching system defaults definition bundle: "${bundlePath}"`);
            const response = await fetch(bundlePath);
            if (response.ok) {
                const data = await response.json();
                this.setDefaultsData(data ?? {});
                this.refreshLocalizedDefaults("loadSystemDefaultsData");
                log.debug(`BaseSystemAdapter.loadSystemDefaultsData | Successfully loaded ${this.defaultsMap.size} system default definitions for "${this.systemId}".`);
            } else {
                log.debug(`BaseSystemAdapter.loadSystemDefaultsData | Fetch for "${bundlePath}" returned HTTP status: ${response.status}`);
            }
        } catch (e) {
            log.debug(`BaseSystemAdapter.loadSystemDefaultsData | No system defaults bundle found for "${this.systemId}":`, e);
        }
    }

    /**
     * Refresh localized translations from game.i18n into system defaults map.
     * Called on i18nInit and ready hooks when Foundry core localization is fully initialized.
     * @param {string} [trigger="manual"] - Originating lifecycle hook or trigger name for debug logging
     * @returns {void}
     */
    refreshLocalizedDefaults(trigger = "manual") {
        const baseDefaults = this._rawBaseDefaults;
        if (!baseDefaults || typeof baseDefaults !== "object") {
            log.debug(`BaseSystemAdapter.refreshLocalizedDefaults | [Trigger: ${trigger}] No raw base defaults available to localize.`);
            return;
        }

        log.debug(`BaseSystemAdapter.refreshLocalizedDefaults | [Trigger: ${trigger}] Refreshing localized defaults from game.i18n for "${this.systemId}"...`);

        if (game?.i18n?.translations) {
            const activeTranslations = (game.i18n.translations as any)?.BBC?.defaults?.[this.systemId];
            if (activeTranslations && typeof activeTranslations === "object") {
                const countBefore = this.defaultsMap.size;
                this.registerLocalizedDefaults(activeTranslations, baseDefaults);
                log.debug(`BaseSystemAdapter.refreshLocalizedDefaults | Registered ${Object.keys(activeTranslations).length} active translation keys from game.i18n.translations (map size: ${countBefore} -> ${this.defaultsMap.size}).`);
            } else {
                log.debug(`BaseSystemAdapter.refreshLocalizedDefaults | No translations found at game.i18n.translations.BBC.defaults.${this.systemId}.`);
            }
        }

        if (game?.i18n?.has) {
            const entries = Object.entries(baseDefaults);

            let registeredCount = 0;
            for (const [nameOrSlug, stick] of entries) {
                if (!nameOrSlug) continue;
                const slug = slugify(nameOrSlug);
                const i18nKey = `BBC.defaults.${this.systemId}.${slug}`;
                if (game.i18n.has(i18nKey)) {
                    const localized = game.i18n.localize(i18nKey);
                    if (localized) {
                        const boolStick = Boolean(stick);
                        const rawLocalized = localized.trim().toLowerCase();
                        const localizedSlug = slugify(localized);
                        this._setDefaultsEntry(rawLocalized, boolStick, slug);
                        if (localizedSlug && localizedSlug !== rawLocalized) {
                            this._setDefaultsEntry(localizedSlug, boolStick, slug);
                        }
                        registeredCount++;
                    }
                }
            }
            log.debug(`BaseSystemAdapter.refreshLocalizedDefaults | Localized ${registeredCount} keys via game.i18n.localize.`);
        }
    }

    /**
     * Discover and load all registered language translation bundles for this game system.
     * Indexes translated names across all configured languages simultaneously,
     * enabling mixed-language item recognition within the same game world.
     * @param {Object<string, boolean>} baseDefaults - Canonical slug to boolean stickiness map
     * @returns {Promise<void>}
     */
    async loadAllSystemLanguages(baseDefaults: any) {
        if (!baseDefaults || typeof baseDefaults !== "object") return;

        // 1. Immediately register active language translations from game.i18n if available
        if (game?.i18n?.translations) {
            const activeTranslations = (game.i18n.translations as any)?.BBC?.defaults?.[this.systemId];
            if (activeTranslations && typeof activeTranslations === "object") {
                this.registerLocalizedDefaults(activeTranslations, baseDefaults);
                log.debug(`BaseSystemAdapter.loadAllSystemLanguages | Registered ${Object.keys(activeTranslations).length} translations directly from active game.i18n.`);
            }
        }

        const targetSuffix = `/${this.systemId}.json`;
        const candidatePaths = new Set<string>();

        // 2. Discover registered language bundle paths explicitly declared in module metadata
        if (game?.modules) {
            const mod = game.modules.get(MODULE_ID);
            const rawLanguages = mod?.languages ?? mod?.manifest?.languages ?? [];
            const languagesList = rawLanguages.contents ?? (rawLanguages.values ? Array.from(rawLanguages.values()) : rawLanguages);

            for (const entry of languagesList) {
                const pathObj = entry?.[1] ?? entry;
                const p = pathObj?.path;
                if (p?.endsWith?.(targetSuffix)) {
                    const normalized = (p.startsWith("modules/") || p.startsWith("/"))
                        ? p.replace(/^\//, "")
                        : `modules/${MODULE_ID}/${p}`;
                    candidatePaths.add(normalized);
                }
            }
        }

        log.debug(`BaseSystemAdapter.loadAllSystemLanguages | Discovered ${candidatePaths.size} candidate language bundle paths:`, Array.from(candidatePaths));

        for (const langPath of candidatePaths) {
            try {
                log.debug(`BaseSystemAdapter.loadAllSystemLanguages | Fetching language bundle from: "${langPath}"`);
                const res = await fetch(langPath);
                log.debug(`BaseSystemAdapter.loadAllSystemLanguages | Fetch status for "${langPath}": ${res.status} (${res.ok ? "OK" : "FAILED"})`);
                if (res.ok) {
                    const langData = await res.json();
                    const translations = langData?.BBC?.defaults?.[this.systemId];
                    if (translations && typeof translations === "object") {
                        this.registerLocalizedDefaults(translations, baseDefaults);
                        log.debug(`BaseSystemAdapter.loadAllSystemLanguages | Registered ${Object.keys(translations).length} translations from "${langPath}".`);
                    }
                }
            } catch (err) {
                log.debug(`BaseSystemAdapter.loadAllSystemLanguages | Exception fetching "${langPath}":`, err);
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
    _setDefaultsEntry(key: any, boolStick: any, slug: any) {
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
    registerLocalizedDefaults(translations: any, baseDefaults: Record<string, any> = {}) {
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
    setDefaultsData(data: any) {
        if (!data) return;
        this._rawBaseDefaults = data;
        const entries = Object.entries(data);

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
            if (game?.i18n?.has) {
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
    getSystemDefault(context: any) {
        if (!context) return null;
        const itemObj = context?.item ?? (context?.documentName === "Item" ? context : null);
        const rawName = context?.itemName ?? itemObj?.name ?? (context?.name ?? (context?.documentName ? "" : String(context ?? "")));

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
     * Checks built-in system defaults dataset first; if completely unrecognized, defaults to detached (false).
     * @param {string} shapeType - The template or crosshair shape (`"cone"`, `"circle"`, `"ray"`, `"rect"`, `"square"`)
     * @param {object} [config={}] - Optional crosshair configuration object
     * @returns {boolean} Whether the crosshair shape defaults to sticking to the token
     */
    getDefaultStickToToken(shapeType: any, config = {}) {
        const itemDefault = this.getSystemDefault(config);
        if (itemDefault !== null && itemDefault !== undefined) {
            return Boolean(itemDefault);
        }
        return false;
    }

    /**
     * Extract maximum placement distance range from a calling item or activity document/schema.
     * Evaluates activity range first, falling back to calling item system range attributes.
     * @param {Document|null} item - Target calling item document
     * @param {Object|null} [activity=null] - Calling activity document or object
     * @returns {number|null} Max range in canvas distance units, or null if unrestricted/touch/self
     */
    getItemMaxRange(item: any, activity: any = null): number | null {
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
    handleProgrammaticPlacement(scene: any, doc: any, placeable: any, coords: any = {}, options: any = {}): void {
        return;
    }

    /**
     * Refresh system-specific template highlights or preview overlays.
     * Base implementation defaults to NOP stub to allow system adapter overrides.
     * @param {PlaceableObject} tmpl - Canvas preview placeable
     * @param {number} direction - Current rotation direction in degrees
     * @returns {void}
     */
    refreshTemplateHighlights(tmpl: any, direction: any) {
        return;
    }

    /**
     * Open the Item Crosshair Configuration application for a target item.
     * Accessible to any user who owns the item.
     * @param {Document} item - Target Item document
     * @returns {void} No return value
     */
    async openItemCrosshairConfig(item: any, options = {}) {
        if (!item) return;
        const itemDoc = item?.document ? item.document : item;
        const { ItemCrosshairConfigApplication } = await import("../../autorec/itemConfigMenu.js");
        new ItemCrosshairConfigApplication({ item: itemDoc, ...options }).render(true);
    }

    /**
     * Add a Better Crosshairs header control to an ApplicationV2 item sheet instance.
     * @param {foundry.applications.api.ApplicationV2} app - Item sheet application instance
     * @param {Array<object>} controls - Array of header control button items
     * @returns {void} No return value
     */
    addItemSheetHeaderControl(app: any, controls: any) {
        if (app?.activity || (app?.document && app.document.documentName !== "Item" && app.document.item)) {
            return this.addActivitySheetHeaderControl(app, controls);
        }

        const item = app?.document;
        if (!item || item.documentName !== "Item" || !item.isOwner) return;
        if (!Array.isArray(controls)) return;
        if (controls.some(c => c.label?.startsWith("BBC") || c.icon === "fa-solid fa-crosshairs")) return;

        const customConfig = item.getFlag("bakana-better-crosshairs", "customConfig") ?? null;
        const activityConfigs = item.getFlag("bakana-better-crosshairs", "activityConfigs") ?? null;
        const hasAnyCustom = Boolean(
            customConfig ||
            (Object.keys(activityConfigs ?? {}).length > 0)
        );

        controls.push({
            label: "BBC",
            icon: hasAnyCustom ? "fa-solid fa-crosshairs bbc-header-icon-custom" : "fa-solid fa-crosshairs",
            onClick: () => this.openItemCrosshairConfig(item)
        });
    }

    /**
     * Add a Better Crosshairs header control to an ApplicationV2 activity sheet instance.
     * @param {foundry.applications.api.ApplicationV2} app - Activity sheet application instance
     * @param {Array<object>} controls - Array of header control button items
     * @returns {void} No return value
     */
    addActivitySheetHeaderControl(app: any, controls: any) {
        const activity = app?.activity ?? (app?.document?.item ? app.document : null);
        const item = activity?.item ?? app?.item ?? null;
        if (!item || !activity?.id || !item.isOwner) return;
        if (!Array.isArray(controls)) return;
        if (controls.some(c => c.label?.startsWith("BBC") || c.icon === "fa-solid fa-crosshairs" || c.icon?.includes("fa-crosshairs"))) return;

        const activityConfigs = item.getFlag("bakana-better-crosshairs", "activityConfigs") ?? {};
        const hasCustom = Boolean(activityConfigs[activity.id]);

        controls.push({
            label: "BBC",
            icon: hasCustom ? "fa-solid fa-crosshairs bbc-header-icon-custom" : "fa-solid fa-crosshairs",
            onClick: () => this.openItemCrosshairConfig(item, { selectedScope: activity.id })
        });
    }

    /**
     * Add Better Crosshairs option to an Activity context menu or edit dropdown.
     * @param {object} activity - Target activity data model or document
     * @param {Array<object>} options - Array of context menu entry options
     * @returns {void} No return value
     */
    addActivityContextOption(activity: any, options: any) {
        if (!activity || !Array.isArray(options)) return;
        const item = activity.item ? activity.item : (activity.document?.item ? activity.document.item : null);
        if (!item || !activity.id || !item.isOwner) return;
        if (options.some(o => o.name === "BBC" || o.name === "BBC.itemConfigMenu.title" || o.icon?.includes("fa-crosshairs"))) return;

        const activityConfigs = item.getFlag("bakana-better-crosshairs", "activityConfigs") ?? {};
        const hasCustom = Boolean(activityConfigs[activity.id]);

        options.push({
            name: "BBC",
            icon: `<i class="fa-solid fa-crosshairs${hasCustom ? " bbc-header-icon-custom" : ""}"></i>`,
            callback: () => this.openItemCrosshairConfig(item, { selectedScope: activity.id })
        });
    }

    /**
     * Add Better Crosshairs option to an Item context menu or edit dropdown.
     * @param {object} item - Target item document
     * @param {Array<object>} options - Array of context menu entry options
     * @returns {void} No return value
     */
    addItemContextOption(item: any, options: any) {
        const itemDoc = item?.document ? item.document : item;
        if (!itemDoc || itemDoc.documentName !== "Item" || !itemDoc.isOwner || !Array.isArray(options)) return;
        if (options.some(o => o.name === "BBC" || o.name === "BBC.itemConfigMenu.title" || o.icon?.includes("fa-crosshairs"))) return;

        const customConfig = itemDoc.getFlag("bakana-better-crosshairs", "customConfig") ?? null;
        const activityConfigs = itemDoc.getFlag("bakana-better-crosshairs", "activityConfigs") ?? null;
        const hasAnyCustom = Boolean(
            customConfig ||
            (Object.keys(activityConfigs ?? {}).length > 0)
        );

        options.push({
            name: "BBC",
            icon: `<i class="fa-solid fa-crosshairs${hasAnyCustom ? " bbc-header-icon-custom" : ""}"></i>`,
            callback: () => this.openItemCrosshairConfig(itemDoc)
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
     * Return list of Hook names used for ApplicationV2 activity sheet header controls.
     * Protected hook for subclass override (Template Method Pattern).
     * @protected
     * @returns {string[]} Array of hook names
     */
    _getActivitySheetHookNames() {
        return ["getHeaderControlsActivitySheet", "getHeaderControlsActivitySheet5e"];
    }

    /**
     * Return list of Hook names used for item context menu options.
     * @protected
     * @returns {string[]} Array of hook names
     */
    _getItemContextHookNames() {
        return ["getItemContextOptions", "dnd5e.getItemContextOptions", "getItemEntryContext"];
    }

    /**
     * Return list of Hook names used for activity context menu options.
     * @protected
     * @returns {string[]} Array of hook names
     */
    _getActivityContextHookNames() {
        return ["getActivityContextOptions", "dnd5e.getActivityContextOptions", "getActivityEntryContext"];
    }

    /**
     * Register standard universal ApplicationV2 item sheet and activity sheet header & context hooks.
     * Template method executing common hook registration workflow.
     * @returns {void} No return value
     */
    registerItemSheetHooks() {
        if (!Hooks?.on) return;
        const itemSheetHandler = (app: any, controls: any) => this.addItemSheetHeaderControl(app, controls);
        for (const hookName of this._getItemSheetHookNames()) {
            Hooks.on(hookName as any, itemSheetHandler as any);
        }

        const activitySheetHandler = (app: any, controls: any) => this.addActivitySheetHeaderControl(app, controls);
        for (const hookName of this._getActivitySheetHookNames()) {
            Hooks.on(hookName as any, activitySheetHandler as any);
        }

        const itemContextHandler = (item: any, options: any) => this.addItemContextOption(item, options);
        for (const hookName of this._getItemContextHookNames()) {
            Hooks.on(hookName as any, itemContextHandler as any);
        }

        const activityContextHandler = (activity: any, options: any) => this.addActivityContextOption(activity, options);
        for (const hookName of this._getActivityContextHookNames()) {
            Hooks.on(hookName as any, activityContextHandler as any);
        }
    }
}
