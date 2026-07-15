# Better Crosshairs: Chronological Placement & Debugging Guide

This document serves as an exhaustive, chronological manual for developers and agents troubleshooting template and region placement across Foundry VTT v13 and v14+. It traces the exact sequence of functions invoked from the initial item click to final document creation, detailing input/output expectations, hook lifecycles, and exact code locations where visual features and coordinates can be debugged.

---

## 1. Chronological Lifecycle Flowchart

The diagram below traces the end-to-end placement pipeline in strict chronological order.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FVTT as Foundry VTT Canvas
    participant Hook as BaseFoundryVTTAdapter<br/>(handleDrawPreview)
    participant Autorec as autorecManager
    participant Crosshair as BaseCrosshairShape<br/>(Circle / Cone / Ray / Square)
    participant Util as crosshair/util.js<br/>(Pointer & Wheel Tracking)
    participant Resolver as crosshair/util.js<br/>(resolveCrosshairPlacement)
    participant PreCreate as BaseFoundryVTTAdapter<br/>(handlePreCreate)
    participant Create as BaseFoundryVTTAdapter<br/>(handleCreateDocument)

    Note over User,FVTT: PHASE 1: PREVIEW DRAWING & INTERCEPTION
    User->>FVTT: Click Spell / Activity (Draw Template/Region Preview)
    FVTT->>Hook: Hook: drawMeasuredTemplate / drawRegion (placeable)
    Hook->>Hook: isOwner(doc) + isPreview(placeable)
    Hook->>Autorec: getEntryForDocument(placeable.document)
    Autorec-->>Hook: Return CrosshairConfiguration (or null)
    Hook->>Hook: hidePreview(placeable) (Hides default mesh/outline & clears grid highlights)
    Hook->>Hook: extractCallingContext(doc) + toToken(rawToken)
    Hook->>Hook: Store pending in this.pendingPlacements + create context { resolve, cancel }
    Hook->>Crosshair: crosshair[type].play(token, finalConfig)

    Note over Crosshair,Util: PHASE 2: SEQUENCER SPAWN & INTERACTIVE TRACKING
    Crosshair->>Crosshair: create() -> configureCrosshairShape(crosshairSeq)
    Crosshair->>Util: attachWheelRotation(crosshair, config) (Listens to pointermove & wheel)
    Crosshair->>Crosshair: playGraphicEffect(crosshair) (Spawns custom graphic chain)
    Crosshair-->>User: Animated Reticle + Connecting Line displayed on canvas
    loop Interactive Mouse Tracking & Rotation
        User->>Util: Pointer Move / Mousewheel (Ctrl+Wheel in PF2e)
        Util->>Util: snapCoordinates(x, y, mode) + alignCrosshairAndEffects(crosshair, config, rad)
        Util->>Util: refreshTemplateHighlights(placeable, dir, rad) (Updates preview shape coordinates)
    end

    Note over User,Resolver: PHASE 3: CLICK CONFIRMATION & COORDINATE RESOLUTION
    User->>Crosshair: Left-Click Canvas (Confirms Placement) / Right-Click (Cancels)
    alt Right-Click Cancel
        Crosshair->>Hook: CALLBACKS.CANCEL -> context.cancel() -> dismissPreview()
    else Left-Click Placed
        Crosshair->>Resolver: CALLBACKS.PLACED -> resolveCrosshairPlacement(crosshair, config, ...args)
        Resolver->>Resolver: detachWheelRotation()
        alt Attached Mode (stickToToken: true)
            Resolver->>Resolver: resolveAnchorPlacement(token, { x: clickX, y: clickY })
        else Detached Mode
            Resolver->>Resolver: snapCoordinates(clickX, clickY, snapMode)
        end
        Resolver->>Resolver: formatPlacementCoordinates(x, y, direction, config)
        Resolver->>Hook: context.resolve(coords) -> Mark pending.resolved = true & pending.coords = coords
    end

    Note over FVTT,Create: PHASE 4: DOCUMENT PRE-CREATE & POST-CREATE LIFECYCLE
    alt Normal Creation Flow (preCreate fires after context.resolve)
        FVTT->>PreCreate: Hook: preCreateMeasuredTemplate / preCreateRegion (doc, data, options, userId)
        PreCreate->>PreCreate: Lookup pending in this.pendingPlacements
        PreCreate->>PreCreate: applyDocumentPlacement(doc, pending.coords, pending.config)
        PreCreate->>PreCreate: dismissPreview(placeable) + pendingPlacements.delete()
        PreCreate-->>FVTT: return true (Document persists to database)
    else Deferred Creation Flow (preCreate fired before click)
        PreCreate-->>FVTT: return false (Document creation deferred; saved in pending.deferredCreateData)
        Resolver->>Hook: context.resolve(coords) triggers self.createDeferredDocument(scene, deferredData, coords)
        Hook->>FVTT: scene.createEmbeddedDocuments(docName, [formattedData])
    end
    FVTT->>Create: Hook: createMeasuredTemplate / createRegion (doc, options, userId)
    Create->>Create: Extract bbc flags + evaluate user postPlacementCode script
```

---

## 2. Chronological Phase & Function Execution Directory

### Phase 1: Draw Interception (`drawMeasuredTemplate` / `drawRegion`)
Fires when the user activates an item/spell in Foundry, initiating a canvas placement preview.

1. **[`BaseFoundryVTTAdapter.handleDrawPreview(placeable)`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/adapter/foundry/base-foundryvtt-adapter.js#L705)**
   - **Trigger**: `Hooks.on("drawMeasuredTemplate")` or `Hooks.on("drawRegion")`.
   - **Expected Input**: `placeable` (`PlaceableObject` whose `placeable.document.id` is `null`/`undefined` and `placeable.isPreview` is `true`).
   - **Expected Output**: `Promise<void>`. Intercepts the native preview, stores a pending state under `this.pendingPlacements`, and launches Sequencer.
   - **Internal Methods & Debug Breakpoints**:
     - [`this.isOwner(doc)`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/adapter/foundry/base-foundryvtt-adapter.js#L674): Checks `doc.author?.id ?? game.user.id`. Add debug log here if previews fail to intercept for GM/players.
     - [`autorecManager.getEntryForDocument(doc)`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/autorec/autorecManager.js#L241): Queries `crosshairAdapter.matchAutorecEntry(doc, registeredHandlers)`. Add debug breakpoint here to inspect which Autorec workflow or fallback matched.
     - [`this.hidePreview(placeable)`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/adapter/foundry/base-foundryvtt-adapter.js#L166): Immediately hides all PIXI containers (`template`, `mesh`, `shape`, `border`, `ruler`) and clears grid highlight layers. Add debug breakpoint here if native yellow circles/squares bleed through the custom crosshair.
     - [`this.extractCallingContext(doc)`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/adapter/foundry/base-foundryvtt-adapter.js#L59): Resolves item/activity context from document flags.
     - [`this.toToken(rawToken)`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/adapter/foundry/base-foundryvtt-adapter.js#L686): Normalizes `rawToken` to a concrete `Token` instance.
     - [`this.detectProperties(doc)`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/adapter/foundry/foundryvtt-v14-adapter.js#L130): Extracts `{ type, distance, radius, width, angle, x, y }` from the document.
     - [`builder.play(token, finalConfig)`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/crosshair/_crosshairs.js#L18): Delegates to `CircleCrosshair`, `ConeCrosshair`, `RayCrosshair`, or `SquareCrosshair`.

---

### Phase 2: Sequencer Animation & Interactive Pointer/Wheel Tracking
Fires immediately when `builder.play(...)` constructs the Sequencer reticle on canvas.

2. **[`BaseCrosshairShape.create()`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/crosshair/base.js#L203)** & **[`BaseCrosshairShape.playGraphicEffect(crosshair)`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/crosshair/base.js#L148)**
   - **Trigger**: Invoked during `handleDrawPreview` sequence setup.
   - **Expected Input**: `token` (`Token` instance or null) and `finalConfig` (merged `CrosshairConfiguration`).
   - **Expected Output**: A running `Sequence` instance with custom visual effects (`.attachTo(crosshair)`, `.anchor(this.animationAnchor)`).
   - **Internal Methods & Debug Breakpoints**:
     - [`this.getGraphicDimensions()`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/crosshair/base.js#L138): Calculates pixel dimensions and scaling factor (`getTemplatePixelFactor()`). Add breakpoint here if crosshairs appear too large/small or ignore grid unit scaling.
     - [`this.configureCrosshairShape(crosshairSeq)`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/crosshair/base.js#L247): Subclass-specific chain setup (`circle.js`, `cone.js`, `ray.js`, `square.js`).

3. **[`attachWheelRotation(crosshair, config)`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/crosshair/util.js#L248)**
   - **Trigger**: Called in `BaseCrosshairShape.create()` for shapes where `requiresWheelRotation === true` (`cone`, `ray`, `square`).
   - **Expected Input**: `crosshair` (Sequencer PIXI container) and `config`.
   - **Expected Output**: Registers window event listeners for `wheel` and `pointermove`.
   - **Internal Methods & Debug Breakpoints**:
     - `systemAdapter.requiresWheelModifier()`: Checks if the system requires holding Control/Command to rotate (e.g. `Pf2eSystemAdapter` returns `true`). Add debug point here if wheel scrolling zooms the canvas instead of rotating.
     - `activePointerHandler(event)`: Tracks pointer movement (`canvas.mousePosition`) on every tick.
     - [`alignCrosshairAndEffects(crosshair, config, rad)`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/crosshair/util.js#L338): Synchronizes rotation across the main container and all child `Sequencer.EffectManager` effects without fighting internal anchors. Add debug point here if cones/rays detach or drift away from the mouse during rotation.
     - [`refreshTemplateHighlights(tmpl, newDirDeg, rad)`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/crosshair/util.js#L69): Updates the underlying `PlaceableObject.document` shape coordinates during dragging via `crosshairAdapter.updatePreviewShape(...)`.

---

### Phase 3: Click Confirmation & Coordinate Resolution
Fires when the user clicks the canvas to finalize crosshair placement or right-clicks to cancel.

4. **[`resolveCrosshairPlacement(crosshair, config, ...extraArgs)`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/crosshair/util.js#L402)**
   - **Trigger**: Fired by `Sequencer.Crosshair.CALLBACKS.PLACED` inside `onPlacedCallback`.
   - **Expected Input**: `crosshair` (Sequencer placement payload), `config`, and extra arguments.
   - **Expected Output**: `{ x, y, direction, rotation, distance, radius, width, gridUnits, sticky, type }`.
   - **Internal Methods & Debug Breakpoints**:
     - [`detachWheelRotation()`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/crosshair/util.js#L230): Immediately removes window listeners (`wheel`, `pointermove`).
     - [`crosshairAdapter.resolveAnchorPlacement(token, clickCoords)`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/adapter/foundry/base-foundryvtt-adapter.js#L597): When `stickToToken` is true, performs exact Ray/line-segment raycasting from token center to mouse click to lock the coordinates to the token's edge. Add debug breakpoint here (`base-foundryvtt-adapter.js#L597`) if attached cones/rays jump to unexpected token vertices.
     - [`snapCoordinates(x, y, snapMode)`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/crosshair/util.js#L493): When detached (`stickToToken: false`), snaps click coordinates (`x, y`) according to `config.snapToGrid`.
     - [`crosshairAdapter.formatPlacementCoordinates(x, y, direction, config)`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/adapter/foundry/foundryvtt-v14-adapter.js#L386): Formats the dictionary for the active version schema (`V13` vs `V14`).
     - `config.context.resolve(result)`: Invokes the pending placement resolver bridge defined in `handleDrawPreview`.

---

### Phase 4: Document Creation Hooks (`preCreate` & `create`)
Fires when Foundry attempts to write the new document to the database.

5. **[`BaseFoundryVTTAdapter.handlePreCreate(doc, _data, _options, userId)`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/adapter/foundry/base-foundryvtt-adapter.js#L916)**
   - **Trigger**: `Hooks.on("preCreateMeasuredTemplate")` or `Hooks.on("preCreateRegion")`.
   - **Expected Input**: `doc` (Document being created), `userId`.
   - **Expected Output**: Returns `true` to proceed with creation, or `false` to abort/defer.
   - **Internal Methods & Debug Breakpoints**:
     - `this.pendingPlacements.get(placementKey)`: Looks up pending crosshair placement by `${entry.itemName}_${userId}` (or fallback uncancelled placement). Add debug breakpoint here if `preCreate` allows native creation without applying custom coordinates.
     - `if (pending.cancelled) return false`: Aborts creation if the user right-clicked to cancel during preview.
     - `if (pending.resolved && pending.coords)` -> [`this.applyDocumentPlacement(doc, pending.coords, pending.config)`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/adapter/foundry/foundryvtt-v14-adapter.js#L299): Applies resolved `{ x, y, direction, shapes }` plus fill/border colors and `flags.bbc` onto the document source.
     - `if (!pending.resolved) return false`: If the user has not clicked yet, stores `pending.deferredCreateData = doc.toObject()` and defers creation until `.resolve(coords)` invokes [`createDeferredDocument`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/adapter/foundry/foundryvtt-v14-adapter.js#L485).

6. **[`BaseFoundryVTTAdapter.handleCreateDocument(doc, _options, userId)`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/adapter/foundry/base-foundryvtt-adapter.js#L978)**
   - **Trigger**: `Hooks.on("createMeasuredTemplate")` or `Hooks.on("createRegion")`.
   - **Expected Input**: `doc` (Document just created in database), `userId`.
   - **Expected Output**: `Promise<void>`. Executes user-configured post-placement Javascript if defined.
   - **Internal Methods & Debug Breakpoints**:
     - Checks `doc.flags?.bbc?.postPlacementCode`.
     - [`this.extractCallingContext(doc)`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/adapter/foundry/base-foundryvtt-adapter.js#L59) + [`this.toToken(rawToken)`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/adapter/foundry/base-foundryvtt-adapter.js#L686): Builds execution variables (`doc, token, actor, item, scope, config, canvas, game`).
     - `new AsyncFunction(...)(...)`: Runs the user script inside a `try/catch` block. Add debug point inside the `catch (e)` block ([`base-foundryvtt-adapter.js#L1015`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/adapter/foundry/base-foundryvtt-adapter.js#L1015)) when debugging user script syntax errors.

---

## 3. Feature Index & Code Location Map ("Where to Add Debug Statements")

When troubleshooting visual issues, incorrect coordinates, or animation bugs, jump directly to the specific method locations indexed below:

| Feature / Behavior | Primary Code Location | Key Methods / Breakpoints | Troubleshooting Focus |
| :--- | :--- | :--- | :--- |
| **Active Grid Highlighting & Clearing** | [`base-foundryvtt-adapter.js:166`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/adapter/foundry/base-foundryvtt-adapter.js#L166)<br/>[`crosshair/util.js:69`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/crosshair/util.js#L69) | `hidePreview(placeable)`<br/>`refreshTemplateHighlights(tmpl, dir, rad)` | Inspect `canvas.grid.clearHighlightLayer(hId)` and `canvas.regions.highlight.clear()` inside `hidePreview`. Inspect grid coordinates updated during dragging inside `refreshTemplateHighlights`. |
| **Outline & Border Highlighting** | [`base-foundryvtt-adapter.js:179-277`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/adapter/foundry/base-foundryvtt-adapter.js#L179-L277)<br/>[`base-foundryvtt-adapter.js:457`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/adapter/foundry/base-foundryvtt-adapter.js#L457) | `hidePreview(placeable)`<br/>`handleMeasuredTemplateRefresh(template)` | Inspect method interception (`refresh`, `_refreshState`, `_refreshShape`) in `hidePreview`. Inspect PIXI 7 `graphicsData` vs PIXI 8 `instructions` in `handleMeasuredTemplateRefresh`. |
| **Tile / Region Highlighting & Shape Manipulation** | [`foundryvtt-v13-adapter.js:186`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/adapter/foundry/foundryvtt-v13-adapter.js#L186)<br/>[`foundryvtt-v14-adapter.js:235`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/adapter/foundry/foundryvtt-v14-adapter.js#L235) | `updatePreviewShape(previewDoc, coords)`<br/>`_formatRegionShapeUpdate(originalShape, coords)` | Inspect shape mutation (`previewDoc.shapes = [updatedShape]`) and game feet to canvas pixel conversion (`* pxPerFoot`) during live dragging. |
| **Sequencer Animation Spawning** | [`crosshair/base.js:203`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/crosshair/base.js#L203)<br/>[`crosshair/base.js:148`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/crosshair/base.js#L148) | `BaseCrosshairShape.create()`<br/>`playGraphicEffect(crosshair)` | Inspect `.crosshair("position")` builder options (`borderColor`, `fillColor`) and `.effect().file(effectFile).attachTo(crosshair).anchor(...)`. |
| **Cursor Animation & Mouse Tracking** | [`crosshair/util.js:248`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/crosshair/util.js#L248)<br/>[`crosshair/util.js:338`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/crosshair/util.js#L338) | `attachWheelRotation(crosshair, config)`<br/>`alignCrosshairAndEffects(crosshair, config, rad)` | Inspect window `wheel` and `pointermove` event handlers. Inspect child effect rotation syncing (`rotateCrosshairInstance` + `Sequencer.EffectManager.getEffects`). |
| **Coordinate Intake & Return (Resolution)** | [`crosshair/util.js:402`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/crosshair/util.js#L402)<br/>[`base-foundryvtt-adapter.js:597`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/adapter/foundry/base-foundryvtt-adapter.js#L597)<br/>[`foundryvtt-v14-adapter.js:299`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/adapter/foundry/foundryvtt-v14-adapter.js#L299) | `resolveCrosshairPlacement(crosshair, config)`<br/>`resolveAnchorPlacement(token, clickCoords)`<br/>`applyDocumentPlacement(doc, coords, config)` | Inspect raw `clickX`, `clickY`, and `direction` inputs from Sequencer. Inspect Ray intersection locking (`lineSegmentIntersection` / `Ray.intersectSegment`). Inspect final `doc.updateSource(updateData)` writing coordinates to the document. |
