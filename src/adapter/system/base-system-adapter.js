import { MODULE_ID } from "../../lib/constants.js";
import { log } from "../../lib/logger.js";
import { autorecManager } from "../../autorec/autorecManager.js";
import { ItemCrosshairConfigApplication } from "../../autorec/itemConfigMenu.js";

/**
 * Base System Adapter for system-agnostic decision on whether to replace the default crosshair.
 * Makes no assumptions about placeable document types (template vs region).
 */
export class BaseSystemAdapter {
    /**
     * Initialize base system adapter properties (`systemId` and `supportsActivities`).
     */
    constructor() {
        this.systemId = "base";
        this.supportsActivities = false;
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
     * Determine the system default for whether a crosshair shape should stick to its source token
     * when no explicit item/autorec override (`stickToToken`) is defined.
     * By default across most Foundry systems, cones stick to the token, while circles, rectangles, and rays are placed freely.
     * @param {string} shapeType - The template or crosshair shape (`"cone"`, `"circle"`, `"ray"`, `"rect"`, `"square"`)
     * @param {object} [config={}] - Optional crosshair configuration object
     * @returns {boolean} Whether the crosshair shape defaults to sticking to the token
     */
    getDefaultStickToToken(shapeType, config = {}) {
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

    /**
     * Load default crosshair configurations for this game system into the autorec registry.
     * Fetches the system default package `modules/${MODULE_ID}/src/autorec/system-defaults/${this.systemId}.json`.
     * Single concrete parameter contract with strict nullish coalescing defaults (Rule 1, Rule 4, Rule 5).
     *
     * @param {Object} [options={}] - Import options.
     * @param {boolean} [options.onlyFirstBoot=false] - If true, only loads if defaults have not yet been loaded in this world.
     * @param {boolean} [options.interactive=false] - Whether to show interactive import dialog.
     * @param {boolean} [options.overwrite=true] - Whether to overwrite existing registrations in silent mode.
     * @param {Object} [options.payload=null] - Optional pre-parsed bundle object to use directly instead of fetching.
     * @returns {Promise<{success: boolean, mergedCount: number, skipped?: boolean, error?: string}>} Summary of the loading operation.
     */
    async loadDefaults({
        onlyFirstBoot = false,
        interactive = false,
        overwrite = true,
        payload = null
    } = {}) {
        const targetSystem = String(this.systemId ?? game?.system?.id ?? "dnd5e").trim().toLowerCase();

        // Check first boot condition if onlyFirstBoot is requested
        if (onlyFirstBoot) {
            const isGM = Boolean(game?.user?.isGM);
            if (!isGM && typeof game !== "undefined" && game?.user) {
                return { success: false, mergedCount: 0, skipped: true, error: "Only the GM can initialize system defaults on first boot." };
            }

            let loadedMap = {};
            try {
                loadedMap = game?.settings?.get?.(MODULE_ID, "systemDefaultsLoaded") ?? {};
            } catch (e) {
                log.debug("BaseSystemAdapter.loadDefaults | Setting 'systemDefaultsLoaded' not yet registered.");
            }

            if (loadedMap[targetSystem]) {
                log.debug(`BaseSystemAdapter.loadDefaults | Defaults for "${targetSystem}" already initialized in this world. Skipping first boot load.`);
                return { success: true, mergedCount: 0, skipped: true };
            }
        }

        const bundleFilename = `${targetSystem}.json`;
        const moduleScopeId = `${targetSystem}-defaults`;
        const packManager = autorecManager.forModule(moduleScopeId);

        try {
            let packageData = payload;

            if (!packageData) {
                const bundlePath = `modules/${MODULE_ID}/src/autorec/system-defaults/${bundleFilename}`;
                log.debug(`BaseSystemAdapter.loadDefaults | Fetching default bundle for "${targetSystem}" from: ${bundlePath}`);
                const response = await fetch(bundlePath);
                if (!response.ok) {
                    throw new Error(`Failed to load bundle file from "${bundlePath}" (HTTP ${response.status})`);
                }
                packageData = await response.json();
            }

            const result = await packManager.import(packageData, {
                interactive: Boolean(interactive),
                overwrite: Boolean(overwrite)
            });

            const mergedCount = Number(result?.mergedCount ?? 0);
            log.info(`BaseSystemAdapter.loadDefaults | Loaded ${mergedCount} default crosshair configurations for system "${targetSystem}".`);

            if (typeof game !== "undefined" && game?.settings && game?.user?.isGM) {
                try {
                    const updated = foundry.utils.deepClone(game.settings.get(MODULE_ID, "systemDefaultsLoaded") ?? {});
                    updated[targetSystem] = true;
                    await game.settings.set(MODULE_ID, "systemDefaultsLoaded", updated);
                } catch (err) {
                    log.error("BaseSystemAdapter.loadDefaults | Failed to update 'systemDefaultsLoaded' setting:", err);
                }
            }

            return {
                success: true,
                mergedCount,
                skipped: false
            };
        } catch (err) {
            const errorMsg = `Failed to load default crosshair configurations for "${targetSystem}": ${err.message}`;
            log.error(`BaseSystemAdapter.loadDefaults | ${errorMsg}`, err);
            return {
                success: false,
                mergedCount: 0,
                skipped: false,
                error: err.message
            };
        }
    }
}
