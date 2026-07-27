import { localize, notify } from "../lib/utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Normalizes a candidate color string to a valid 6-digit hex color or returns a fallback.
 * @param {unknown} val - Candidate color value.
 * @param {string} [fallback="#000000"] - Fallback hex string.
 * @returns {string} Valid 6-digit hex color string.
 */
export function normalizeHexColor(val, fallback = "#000000") {
    if (typeof val === "string" && /^#[0-9A-Fa-f]{6}$/.test(val)) return val;
    return fallback;
}

/**
 * Base ApplicationV2 class for crosshair configuration menus.
 * Implements common template method workflow, adapter title access, and interactive DOM bindings.
 * @extends HandlebarsApplicationMixin(ApplicationV2)
 */
export class BaseCrosshairMenuApplication extends HandlebarsApplicationMixin(ApplicationV2) {
    /**
     * Normalizes polymorphic target input to an HTMLElement.
     * Safe across browser and Node.js testing environments.
     * @protected
     * @param {unknown} target - Target element, event, or application.
     * @returns {HTMLElement|null} Normalized HTMLElement or null.
     */
    _normalizeElement(target) {
        if (!target) return null;
        if (typeof HTMLElement !== "undefined" && target instanceof HTMLElement) return target;
        if (typeof target === "object" && target.nodeType === 1 && typeof target.tagName === "string") {
            return target;
        }
        if (typeof Event !== "undefined" && target instanceof Event) {
            const currentTarget = target.currentTarget ?? target.target;
            if (typeof HTMLElement !== "undefined" && currentTarget instanceof HTMLElement) return currentTarget;
            if (currentTarget && typeof currentTarget === "object") return currentTarget;
        }
        if (typeof target === "object" && target.element) {
            return this._normalizeElement(target.element);
        }
        if (typeof target === "object" && (typeof target.querySelector === "function" || typeof target.querySelectorAll === "function")) {
            return target;
        }
        return null;
    }

    /**
     * Helper to retrieve common section titles and document terms from crosshairAdapter.
     * Evaluates adapter dynamically to avoid circular module dependencies.
     * @protected
     * @returns {{prePlacementTitle: string, placementSectionTitle: string, postPlacementTitle: string, docTerm: string}} Normalized adapter titles.
     */
    _getAdapterTitles() {
        const adapter = game.modules?.get("bakana-better-crosshairs")?.api?.crosshairAdapter;
        if (adapter) {
            return {
                prePlacementTitle: adapter.prePlacementTitle,
                placementSectionTitle: adapter.placementSectionTitle,
                postPlacementTitle: adapter.postPlacementTitle,
                docTerm: adapter.documentTerm
            };
        }
        return {
            prePlacementTitle: localize("BBC.itemConfigMenu.prePlacementTitle", "Pre-Placement Script"),
            placementSectionTitle: localize("BBC.itemConfigMenu.placementSectionTitle", "Placement Configuration"),
            postPlacementTitle: localize("BBC.itemConfigMenu.postPlacementTitle", "Post-Placement Script"),
            docTerm: localize("BBC.itemConfigMenu.docTerm", "Template")
        };
    }

    /**
     * Template Method pattern for ApplicationV2 rendering lifecycle.
     * Executes common DOM bindings first, then delegates to protected subclass hook.
     * @protected
     * @param {object} context - Prepared rendering context data.
     * @param {object} options - Rendering options.
     * @returns {void}
     */
    _onRender(context, options) {
        super._onRender(context, options);
        const root = this._normalizeElement(this.element);
        if (!root) return;

        this._attachCommonEventListeners(root);
        this._attachCustomEventListeners(root, context, options);
    }

    /**
     * Attaches shared UI event listeners (color sync, accordions, copy buttons, color swatches).
     * @protected
     * @param {HTMLElement} root - Normalized root DOM element.
     * @returns {void}
     */
    _attachCommonEventListeners(root) {
        if (!root) return;

        // 1. Color swatches initial background color setup
        root.querySelectorAll(".bbc-color-swatch").forEach(el => {
            if (el.dataset.color) {
                el.style.backgroundColor = el.dataset.color;
            }
        });

        // 2. Synchronize HTML color pickers with adjacent text inputs across input and change events
        root.querySelectorAll("input[type='color'].bbc-edit-color, input[type='color'][data-color-target]").forEach(picker => {
            const syncToText = (ev) => {
                const targetEl = ev.currentTarget;
                const row = targetEl.closest(".bbc-edit-color-row");
                const colorTargetId = targetEl.getAttribute("data-color-target") ?? "";
                const targetInput = row?.querySelector("input[type='text']")
                    ?? (colorTargetId !== "" ? root.querySelector(`#${CSS.escape(colorTargetId)}`) : null);
                if (targetInput && targetInput.value !== targetEl.value) {
                    targetInput.value = targetEl.value;
                    targetInput.dispatchEvent(new Event("input", { bubbles: true }));
                    targetInput.dispatchEvent(new Event("change", { bubbles: true }));
                }
            };
            picker.addEventListener("input", syncToText);
            picker.addEventListener("change", syncToText);
        });

        // 3. Synchronize text inputs back to adjacent HTML color pickers when valid hex entered
        root.querySelectorAll(".bbc-edit-color-row input[type='text'], input[type='text'][id^='bbc-item-']").forEach(textInput => {
            const syncToPicker = (ev) => {
                const targetEl = ev.currentTarget;
                const val = (targetEl.value ?? "").trim();
                const row = targetEl.closest(".bbc-edit-color-row");
                const targetId = targetEl.id ?? "";
                const targetPicker = row?.querySelector("input[type='color']")
                    ?? (targetId !== "" ? root.querySelector(`input[type='color'][data-color-target='${CSS.escape(targetId)}']`) : null);
                if (targetPicker && /^#[0-9A-Fa-f]{6}$/.test(val) && targetPicker.value !== val) {
                    targetPicker.value = val;
                }
            };
            textInput.addEventListener("input", syncToPicker);
            textInput.addEventListener("change", syncToPicker);
        });

        // 4. Expandable section accordions
        root.querySelectorAll(".bbc-section-header").forEach(header => {
            header.addEventListener("click", (ev) => {
                const h = ev.currentTarget;
                const body = h.nextElementSibling;
                const icon = h.querySelector(".bbc-chevron");

                if (body && body.classList.contains("bbc-section-body")) {
                    const isHidden = body.style.display === "none";
                    body.style.display = isHidden ? "block" : "none";
                    if (icon) {
                        icon.style.transform = isHidden ? "rotate(0deg)" : "rotate(-90deg)";
                    }
                }
            });
        });

        // 5. Copy text button action
        root.querySelectorAll(".bbc-copy-btn").forEach(btn => {
            btn.addEventListener("click", (ev) => {
                const text = ev.currentTarget.dataset.copyText;
                if (text && typeof navigator?.clipboard?.writeText === "function") {
                    navigator.clipboard.writeText(text);
                    notify.info(localize("BBC.autorecMenu.notify.copied", `Copied "${text}" to clipboard.`));
                }
            });
        });

        // 6. Live-toggle child configuration fields marked with data-override-child when enabling checkboxes toggle
        root.querySelectorAll("input[type='checkbox'][name^='enable']").forEach(chk => {
            chk.addEventListener("change", (ev) => {
                const fieldName = ev.currentTarget.name;
                const isChecked = Boolean(ev.currentTarget.checked);
                root.querySelectorAll(`[data-override-child='${fieldName}']`).forEach(el => {
                    el.style.display = isChecked ? "" : "none";
                });
                root.querySelectorAll(`[data-override-badge='${fieldName}']`).forEach(el => {
                    el.textContent = isChecked
                        ? localize("BBC.itemConfigMenu.badgeCustomOverride", "CUSTOM OVERRIDE")
                        : localize("BBC.itemConfigMenu.badgeInherited", "INHERITED");
                });
            });
        });
    }

    /**
     * Subclass hook method for attaching application-specific event listeners.
     * @protected
     * @param {HTMLElement} root - Normalized root DOM element.
     * @param {object} context - Prepared rendering context data.
     * @param {object} options - Rendering options.
     * @returns {void}
     */
    _attachCustomEventListeners(root, context, options) {
        // Overridden by subclasses
    }
}
