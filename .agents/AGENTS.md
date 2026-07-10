# bakana-better-crosshairs Engineering Rules

## 1. Strict Foundry Application V2 Usage
- **No Application V1 Support**: Application V1 (`FormApplication`, `Application`, `Dialog`) is deprecated. Never write fallback logic or inheritance targeting V1 classes.
- **Applications & Menus**: Directly extend `HandlebarsApplicationMixin(ApplicationV2)` (from `foundry.applications.api`).
- **Configuration**: Use static properties `DEFAULT_OPTIONS` and `PARTS`. Never define legacy `static get defaultOptions()`, `getData()`, or `activateListeners()`.
- **Dialogs & Prompts**: Strictly use `foundry.applications.api.DialogV2` (e.g. `DialogV2.prompt`, `DialogV2.confirm`). Do not use `window.Dialog` or fallback `window.prompt`.

## 2. Template & Region Placement Lifecycle
- **No Direct Document Creation**: Never call `canvas.scene.createEmbeddedDocuments("MeasuredTemplate", ...)` or `"Region"` from Sequencer crosshair placement resolution (`context.resolve`).
- **Modify Document Data in PreCreate Hooks**: Allow Foundry core hooks (`#onLeftClick`, item workflows, MidiQOL) to create the document. Intercept the `preCreateMeasuredTemplate` / `preCreateRegion` hook (`handlePreCreate`) to apply `doc.updateSource(updateData)` containing the exact placement coordinates (`x`, `y`, `direction`/`rotation`, `distance`/`radius`) and custom styling (`fillColor`, `borderColor`, flags).
