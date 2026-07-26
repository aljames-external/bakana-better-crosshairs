import { MODULE_ID } from "../lib/constants.js";
import { localize } from "../lib/utils.js";
import { log } from "../lib/logger.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Interactive popup modal application allowing users to inspect imported Autorec package changes.
 * Displays conflicts ("will cause overwrites") vs brand new entries with granular checkboxes.
 */
export class AutorecImportDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /**
     * Application rendering options configuration.
     * @type {object}
     */
    static DEFAULT_OPTIONS = {
        id: "bbc-autorec-import-dialog",
        tag: "div",
        window: {
            title: "BBC.autorecExchange.importDialog.title",
            icon: "fa-solid fa-file-import",
            modal: true,
            resizable: true
        },
        position: {
            width: 720,
            height: 560
        },
        classes: ["bbc-app", "bbc-import-dialog"]
    };

    /**
     * Handlebars partial templates specification.
     * @type {object}
     */
    static PARTS = {
        main: {
            template: `modules/${MODULE_ID}/src/autorec/autorecImportDialog.html`
        }
    };

    /**
     * Create an interactive Autorec import selection modal.
     * @param {Object} diffAnalysis - Output from `analyzeImportDiff`
     * @param {Object} [options={}] - Application options
     */
    constructor(diffAnalysis, options = {}) {
        super(options);
        this.diffAnalysis = diffAnalysis;
        this.selectedIndices = new Set();

        const allImportable = diffAnalysis?.allImportable ?? [];
        for (const entry of allImportable) {
            if (entry.selectedByDefault) {
                this.selectedIndices.add(entry.importIndex);
            }
        }

        this._resolvePromise = null;
        this.promise = new Promise((resolve) => {
            this._resolvePromise = resolve;
        });

        this.selectItemByIndex = this.selectItemByIndex.bind(this);
        this.deselectItemByIndex = this.deselectItemByIndex.bind(this);
        this.updateCountsDisplay = this.updateCountsDisplay.bind(this);
    }

    /**
     * Prepare application view context data.
     * @param {object} options - Application rendering options
     * @returns {Promise<object>} Template parameters data
     */
    async _prepareContext(options) {
        const newEntries = (this.diffAnalysis.newEntries ?? []).map(e => ({
            ...e,
            selectedByDefault: this.selectedIndices.has(e.importIndex)
        }));

        const conflictEntries = (this.diffAnalysis.conflictEntries ?? []).map(e => ({
            ...e,
            selectedByDefault: this.selectedIndices.has(e.importIndex)
        }));

        const identicalEntries = this.diffAnalysis.identicalEntries ?? [];
        const totalImportable = newEntries.length + conflictEntries.length;

        const labels = {
            packageVersion: localize("BBC.autorecExchange.labels.packageVersion", "Schema Version"),
            sourceModule: localize("BBC.autorecExchange.labels.sourceModule", "Source Module"),
            system: localize("BBC.autorecExchange.labels.system", "Game System"),
            exportedAt: localize("BBC.autorecExchange.labels.exportedAt", "Exported Date"),
            instructionText: localize("BBC.autorecExchange.labels.instructionText", "Review the detected autorec workflow changes below. Selected entries will be merged into global registration (overwriting existing items with matching Item Name and Activity)."),
            selectAll: localize("BBC.autorecExchange.labels.selectAll", "Select All"),
            selectNewOnly: localize("BBC.autorecExchange.labels.selectNewOnly", "Select New Only"),
            deselectAll: localize("BBC.autorecExchange.labels.deselectAll", "Deselect All"),
            selectedSuffix: localize("BBC.autorecExchange.labels.selectedSuffix", "selected for merge"),
            conflictsTitle: localize("BBC.autorecExchange.labels.conflictsTitle", "Conflicting Workflows (Will Cause Overwrite)"),
            willOverwriteBadge: localize("BBC.autorecExchange.labels.willOverwriteBadge", "overwrite conflict(s)"),
            willOverwriteTag: localize("BBC.autorecExchange.labels.willOverwriteTag", "WILL OVERWRITE"),
            conflictsSubtext: localize("BBC.autorecExchange.labels.conflictsSubtext", "These entries already exist with different visual or timing options. Merging will replace the existing configuration."),
            diffPreviewTitle: localize("BBC.autorecExchange.labels.diffPreviewTitle", "Modified Field Diffs"),
            newEntriesTitle: localize("BBC.autorecExchange.labels.newEntriesTitle", "New Autorec Workflows"),
            newBadge: localize("BBC.autorecExchange.labels.newBadge", "new workflow(s)"),
            newTag: localize("BBC.autorecExchange.labels.newTag", "NEW"),
            newSubtext: localize("BBC.autorecExchange.labels.newSubtext", "These items are not registered yet and will be added as new global rules."),
            identicalTitle: localize("BBC.autorecExchange.labels.identicalTitle", "Identical Workflows (Skipped)"),
            identicalSubtext: localize("BBC.autorecExchange.labels.identicalSubtext", "Workflows that already exist with exact identical settings are omitted from merging."),
            cancelBtn: localize("BBC.autorecExchange.labels.cancelBtn", "Cancel"),
            mergeBtn: localize("BBC.autorecExchange.labels.mergeBtn", "Merge Selected")
        };

        return {
            metadata: this.diffAnalysis.metadata ?? {},
            newEntries,
            conflictEntries,
            identicalEntries,
            hasNew: newEntries.length > 0,
            hasConflicts: conflictEntries.length > 0,
            hasIdentical: identicalEntries.length > 0,
            summary: {
                selectedCount: this.selectedIndices.size,
                totalImportable
            },
            labels
        };
    }

    /**
     * Official ApplicationV2 post-render lifecycle hook.
     * Executes custom DOM listener attachments.
     * @protected
     * @param {object} context - Prepared context data
     * @param {object} options - Rendering options
     * @returns {void}
     */
    _onRender(context, options) {
        super._onRender?.(context, options);
        const rootEl = this.element;
        if (!rootEl) return;
        this._attachCustomEventListeners(rootEl, context, options);
    }

    /**
     * Bind application UI click and checkbox change event handlers.
     * @protected
     * @param {HTMLElement} root - Root HTML element of application
     * @param {object} context - Prepared rendering context
     * @param {object} options - Options
     * @returns {void}
     */
    _attachCustomEventListeners(root, context, options) {
        const rootEl = root instanceof HTMLElement ? root : (root?.element ?? null);
        if (!rootEl) return;

        // Checkbox modification
        rootEl.querySelectorAll(".bbc-entry-checkbox").forEach(chk => {
            chk.addEventListener("change", (ev) => {
                const idxStr = ev.currentTarget.dataset.importIndex;
                const idx = parseInt(idxStr, 10);
                if (isNaN(idx)) return;

                if (ev.currentTarget.checked) {
                    this.selectItemByIndex(idx);
                } else {
                    this.deselectItemByIndex(idx);
                }
                this.updateCountsDisplay(rootEl);
            });
        });

        // Select All button
        const selectAllBtn = rootEl.querySelector(".bbc-select-all-btn");
        if (selectAllBtn) {
            selectAllBtn.addEventListener("click", () => {
                rootEl.querySelectorAll(".bbc-entry-checkbox").forEach(chk => {
                    chk.checked = true;
                    const idx = parseInt(chk.dataset.importIndex, 10);
                    if (!isNaN(idx)) this.selectedIndices.add(idx);
                });
                this.updateCountsDisplay(rootEl);
            });
        }

        // Select New Only button
        const selectNewBtn = rootEl.querySelector(".bbc-select-new-btn");
        if (selectNewBtn) {
            selectNewBtn.addEventListener("click", () => {
                const newIndices = new Set(
                    (this.diffAnalysis.newEntries ?? []).map(e => e.importIndex)
                );
                rootEl.querySelectorAll(".bbc-entry-checkbox").forEach(chk => {
                    const idx = parseInt(chk.dataset.importIndex, 10);
                    const shouldCheck = newIndices.has(idx);
                    chk.checked = shouldCheck;
                    if (shouldCheck) this.selectedIndices.add(idx);
                    else this.selectedIndices.delete(idx);
                });
                this.updateCountsDisplay(rootEl);
            });
        }

        // Deselect All button
        const deselectAllBtn = rootEl.querySelector(".bbc-deselect-all-btn");
        if (deselectAllBtn) {
            deselectAllBtn.addEventListener("click", () => {
                rootEl.querySelectorAll(".bbc-entry-checkbox").forEach(chk => {
                    chk.checked = false;
                });
                this.selectedIndices.clear();
                this.updateCountsDisplay(rootEl);
            });
        }

        // Confirm Merge button
        const confirmBtn = rootEl.querySelector(".bbc-confirm-merge-btn");
        if (confirmBtn) {
            confirmBtn.addEventListener("click", () => {
                const selectedList = this._gatherSelectedEntries();
                log.info(`AutorecImportDialog | Confirmed merge for ${selectedList.length} selected entries.`);
                this._finish(selectedList);
            });
        }

        // Cancel button
        const cancelBtn = rootEl.querySelector(".bbc-cancel-import-btn");
        if (cancelBtn) {
            cancelBtn.addEventListener("click", () => {
                log.debug("AutorecImportDialog | Import flow cancelled by user.");
                this._finish(null);
            });
        }
    }

    /**
     * Mark item index as selected.
     * Single concrete integer parameter (Rule 5).
     * @param {number} importIndex - Index of the importable item
     * @returns {void}
     */
    selectItemByIndex(importIndex) {
        if (typeof importIndex === "number" && !isNaN(importIndex)) {
            this.selectedIndices.add(importIndex);
        }
    }

    /**
     * Mark item index as unselected.
     * Single concrete integer parameter (Rule 5).
     * @param {number} importIndex - Index of the importable item
     * @returns {void}
     */
    deselectItemByIndex(importIndex) {
        if (typeof importIndex === "number" && !isNaN(importIndex)) {
            this.selectedIndices.delete(importIndex);
        }
    }

    /**
     * Update dynamic live selected counter elements in popup UI without full page redraw.
     * Single concrete HTMLElement parameter (Rule 5).
     * @param {HTMLElement} root - Dialog root HTML element
     * @returns {void}
     */
    updateCountsDisplay(root) {
        if (!root) return;
        const count = this.selectedIndices.size;
        root.querySelectorAll(".bbc-selected-count, .bbc-merge-count").forEach(el => {
            el.textContent = String(count);
        });
    }

    /**
     * Compile array of selected entry configurations.
     * @private
     * @returns {Array<Object>} Selected configuration object array
     */
    _gatherSelectedEntries() {
        const allImportable = this.diffAnalysis?.allImportable ?? [];
        return allImportable.filter(e => this.selectedIndices.has(e.importIndex));
    }

    /**
     * Clean window close callback.
     * @override
     */
    _onClose(options) {
        super._onClose(options);
        if (this._resolvePromise) {
            this._resolvePromise(null);
            this._resolvePromise = null;
        }
    }

    /**
     * Internal termination helper.
     * @private
     * @param {Array<Object>|null} result - Selected merge entries or null if cancelled
     * @returns {void}
     */
    _finish(result) {
        const resolveFn = this._resolvePromise;
        this._resolvePromise = null;
        this.close();
        if (resolveFn) {
            resolveFn(result);
        }
    }

    /**
     * Convenience method to prompt user with diff dialog and wait for confirmation.
     * @param {Object} diffAnalysis - Diff analysis calculation object
     * @returns {Promise<Array<Object>|null>} Array of selected entries to merge, or null if cancelled
     */
    static async promptMerge(diffAnalysis) {
        const dialog = new AutorecImportDialog(diffAnalysis);
        dialog.render(true);
        return dialog.promise;
    }
}
