# Bakana's Better Crosshairs

[![Foundry VTT Version](https://img.shields.io/badge/Foundry%20VTT-v13+-orange.svg)](https://foundryvtt.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[![Latest Module Downloads](https://img.shields.io/github/downloads/aljames-arctic/bakana-better-crosshairs/latest/module.zip?style=flat-square&label=latest%20downloads&color=blue)](https://github.com/aljames-arctic/bakana-better-crosshairs/releases) [![Total Module Downloads](https://img.shields.io/github/downloads-pre/aljames-arctic/bakana-better-crosshairs/module.zip?style=flat-square&label=total%20downloads&color=success)](https://github.com/aljames-arctic/bakana-better-crosshairs/releases)

A high-performance, modular targeting crosshair replacement and automated recognition (**Autorec**) engine for **Foundry VTT (v13+)**, powered by **[Sequencer](https://fantasycomputer.works/FoundryVTT-Sequencer/)**.

**Bakana's Better Crosshairs (`BBC`)** replaces Foundry's static, flat template placement previews (`MeasuredTemplate`, `Region`) with vibrant, animated Sequencer crosshairs (`Circle`, `Cone`, `Ray`, `Square`). With **Autorec**, developers, GMs, and players can map unique animated crosshairs, origin stretch lines, colors, and targeting behaviors directly to individual spells, weapons, or system activities.

---

## Table of Contents
* [Key Features](#key-features)
* [Targeting Modes (`Attached` vs `Detached`)](#targeting-modes-attached-vs-detached)
* [Automated Recognition (Autorec)](#automated-recognition-autorec)
* [Per-Item Customization & Preference Hierarchy](#per-item-customization--preference-hierarchy)
* [System & Module Support](#system--module-support)
* [Developer Documentation](#developer-documentation)
* [Installation](#installation)
* [License](#license)


---

## Key Features

* **Animated Sequencer Crosshairs**: Instantly upgrades all 4 core template shapes (`Circle`, `Cone`, `Ray`, `Square`) into customizable Sequencer crosshair reticles.
* **Stick-to-Token (`Attached`) Targeting**: Optionally locks the crosshair directly to the casting token (`location(token, { lockToEdge: true })`). When clicked, anchored templates (`Cone`, `Ray`, `Square`) are placed precisely at the token corner or edge (`resolveAnchorPlacement`) where the graphic was locked, while `Circle` templates center directly on the token.
* **Detached Precision Rotation**: In free-floating (`Detached`) mode, scrolling the mousewheel (`Shift+Scroll` / `Ctrl+Scroll`) rotates Cones, Rays, and Squares smoothly with sub-degree accuracy while keeping origin stretch lines pointed directly at the target origin (`getCrosshairOriginTarget`).
* **Origin Stretch Lines (`showLine`)**: Dynamically renders an animated stretch line (`lineFile`) from the casting token directly to the crosshair's origin vertex (`crosshair.x, crosshair.y`) during targeting preview.
* **Modern ApplicationV2 UI**: Built strictly on Foundry V12-V14 `HandlebarsApplicationMixin(ApplicationV2)` for fast, responsive configuration and menu management.

---

## Targeting Modes (`Attached` vs `Detached`)

Bakana's Better Crosshairs supports two primary targeting modes configured per-item or globally:

1. **Detached Mode (`stickToToken: false`)**:
   - The crosshair follows your mouse cursor anywhere on the canvas.
   - For directional shapes (`Cone`, `Ray`, `Square`), rotating via the mouse wheel updates the crosshair direction immediately.
   - When you click to place, the final `MeasuredTemplate` spawns at the exact mouse coordinate and exact rotation angle (`preserveExactDirection`).

2. **Attached / Stick-to-Token Mode (`stickToToken: true`)**:
   - The crosshair attaches to the casting token (`lockToEdge: true`).
   - For directional shapes (`Cone`, `Ray`, `Square`), moving the mouse rotates the template around the token perimeter.
   - When you click to place, `resolveAnchorPlacement` calculates the exact perimeter intersection point (`token edge or corner`) so the spawned template lines up 1:1 with the visual preview graphic.

---

## Automated Recognition (Autorec)

The **Autorec Configuration Hub** allows you to define custom crosshair rules that automatically trigger whenever an item or spell is cast:
- **Built-in `DEFAULT` Fallback Entry**: Includes a permanent, non-deletable `DEFAULT` workflow entry. Any template placeable drawn that lacks a specific item entry automatically adopts the animated crosshair configuration of `DEFAULT` (unless explicitly disabled via *Workflow Enabled: Disabled*).
- **Multi-Activity Hierarchy & Priority Matching**: Define independent entries for each activity on an item (`e.g. Longbow > Line Fire`, `Longbow > Rapid Fire`, and `Longbow > <no activity named>`). Activity-specific workflows automatically take precedence over general item fallback workflows (`<no activity named>`), with stable front-to-back tiebreaking (`first registered matching rule wins`).
- **Shape & Animation Override**: Force an item to spawn a specific crosshair shape (`Circle`, `Cone`, `Ray`, `Rectangle` / `Square`) and select specific Sequencer database animations (`circleFile`, `coneFile`, `rayFile`, `rectangleFile`, `lineFile`).
- **Color & Border Themes**: Set custom fill colors, border colors, and opacity alphas per spell or weapon (`placedFillColor`, `placedBorderColor`, etc.). When a template is placed, native schema fields (`fillColor`, `borderColor`, etc.) are written directly to the database so standard canvas colors persist across scene reloads.
- **Pre & Post Placement Scripting (`concurrentCode` & `postPlacementCode`)**: Run custom asynchronous JavaScript snippets immediately before targeting (`concurrentCode`) or asynchronously right after document creation in the database (`postPlacementCode`).

---

## Custom Placement Macros & Document Flags

Bakana's Better Crosshairs provides two custom JavaScript execution points per workflow:

### 1. Pre-Placement Concurrent Script (`concurrentCode`)
Runs right before the Sequencer targeting crosshair is spawned. Exposes:
- `token`, `actor`, `item`, `scope`, `config`, `crosshair`, `canvas`, `game`

### 2. Post-Placement Macro (`postPlacementCode`)
Executed automatically inside the `createMeasuredTemplate` or `createRegion` hook after document database creation ([`BaseFoundryVTTAdapter.handleCreateDocument`](file:///usr/local/google/home/aljames/github/bakana-better-crosshairs/src/adapter/foundry/base-foundryvtt-adapter.js#L1070-L1108)). Exposes:
- `doc`: The created `MeasuredTemplate` or `Region` document.
- `token`: The source/caster token originating the placement.
- `actor`, `item`, `scope` (`{ doc, token, actor, item, config }`), `config`, `canvas`, `game`.

> [!NOTE]
> **Why `doc.flags.bbc` are stored on placed documents:**  
> Foundry's `createMeasuredTemplate`/`createRegion` hooks only provide `(doc, options, userId)`. To bridge configuration to the database creation event without memory leaks, `BBC` stores metadata on `doc.flags.bbc` (`postPlacementCode`, `itemName`, `activityId`, `token` reference, and V14 Region dual-color parameters). Standard template colors (`fillColor`, `borderColor`) are saved directly to native schema properties.

---

## Per-Item Customization & Preference Hierarchy

Bakana's Better Crosshairs supports item-level overrides stored directly on item flags (`bakana-better-crosshairs.customConfig`):

- **Item Sheet Header Button**: When an item owner (player or GM) opens an Item Sheet, a **BBC** button (`<i class="fa-solid fa-crosshairs"></i> BBC`) appears in the sheet header bar. Clicking it opens up an item-specific configuration menu (`ItemCrosshairConfigApplication`).
- **Live Status Badges**: The Item Configuration Menu displays dynamic badges to indicate how the item resolves its crosshairs:
  - **`CUSTOM`**: Custom overrides stored directly on the item's flags (`item.flags["bakana-better-crosshairs"].customConfig`).
  - **`AUTOREC`**: Inheriting settings from a registered Autorec workflow.
  - **`DEFAULT`**: Using the canonical fallback configuration.
- **Delete CUSTOM Configuration**: If an item has custom flags stored, owners can click **Delete CUSTOM Configuration** to clear item-level overrides and immediately revert to AUTOREC or default without touching any global AUTOREC entries.
- **Preference Resolution Hierarchy**: When any item or spell is used to spawn a crosshair (`matchAutorecEntry`), the engine resolves configuration in strict order:

  $$\text{CUSTOM CONFIG} \rightarrow \text{AUTOREC MATCH} \rightarrow \text{AUTOREC DEFAULT} \rightarrow \text{FOUNDRY DEFAULT}$$

### Programmatic Customization API

For game systems without native integration or modules looking to programmatically configure items, `BBC` exposes two helper methods on `bbc.manager`:

- **`bbc.manager.getDefaultConfig()`**: Returns a clean copy (`{ ...DEFAULT_AUTOREC_ENTRY }`) of the canonical default crosshair configuration schema outlining all required and available fields (`enabled`, `circleFile`, `coneFile`, `rayFile`, `rectangleFile`, `stickToToken`, `showLine`, `borderColor`, `borderAlpha`, `fillColor`, `fillAlpha`, `placedFillColor`, `concurrentCode`, `postPlacementCode`, etc.).
- **`bbc.manager.customize(item, config)`**: Programmatically store or clear a custom crosshair configuration override on any Item document owned by the calling user (`item.setFlag("bakana-better-crosshairs", "customConfig", config)`). Passing `config === undefined` (or `null`) clears the override.

---

## System & Module Support


Bakana's Better Crosshairs uses a decoupled **System Adapter & Foundry Adapter** architecture:
* **Foundry VTT V14+ (`Region` Workflows)**: Intercepts targeting via `drawMeasuredTemplate` → `preCreateRegion` → `createRegion`, automatically converting game feet (`30 ft`) into exact canvas pixel dimensions (`* pxPerFoot`) and grid units (`{ gridUnits: true }`) for Sequencer effects.
* **Foundry VTT V12 & V13 (`MeasuredTemplate` Workflows)**: Runs with version-isolated legacy pixel sizing (`{ factor: 1, gridUnits: false }`) and `MeasuredTemplate` lifecycle hooks (`drawMeasuredTemplate` → `preCreateMeasuredTemplate` → `createMeasuredTemplate`).
* **D&D 5e (`dnd5e` v3 / v4.x)**: Full support for native Activity workflows (`item.system.activities`), multi-activity priority filtering (`activityId` / `activityName`), and spell origin UUID lookup (`flags.dnd5e.origin`).
* **System Agnostic (`BaseSystemAdapter`)**: Automatically supports any system that spawns standard `MeasuredTemplate` or `Region` placeables.
* **Midi-QOL & Item Workflows**: Seamlessly integrates with workflow automation modules (`midi-qol`) without interfering with automated template placement hooks.

---

## Developer Documentation

Bakana's Better Crosshairs provides a dedicated **Module Autorec Manager API** (`game.modules.get("bakana-better-crosshairs").api.autorecManager("your-module-id")`) for content packs, spell books, and subclass modules to load animated crosshairs automatically.

### Integration Best Practice: `.import(...)` vs `.register(...)`
* **Use `.import(...)` for Shipped Content Modules (Recommended)**: When your module auto-loads crosshair presets on startup (`ready` hook), fetch your JSON file and call `packManager.import(jsonContent, { interactive: false, overwrite: true })`. This validates package structure, auto-upgrades legacy `v1.0.0` preset schemas to `v2.0.0`, attributes your `module-id`, and merges items without throwing cross-module warning notices.
* **Use `.register(...)` for Local Testing & Niche Workflows**: `.register(...)` is intended strictly for local development environments (where you control all loaded modules) or dynamic programmatic registration. Calling `.register(...)` on an item or activity name already owned by another active module rejects assignment, alerts the GM with a visual warning notification (`ui.notifications.warn`), and returns a failure status object (`code: "ERR_MODULE_OVERWRITE_REJECTED"`).
* **Reserved Module ID `'world'`**: The scope attribution `'world'` is restricted to game settings and cannot be used as a module ID.

For deep technical diagrams and full API reference, consult our documentation:

* **[Third-Party Module Developer Guide (`docs/developer-guide.md`)](docs/developer-guide.md)**: Practical integration tutorial, `.import` code snippets, activity filtering, and JSON exchange structures.
* **[Architecture Guide (`docs/architecture_guide.md`)](docs/architecture_guide.md)**: Explains adapter decoupling, deterministic identity key hashing, strict cross-module ownership rules, and adding custom game system adapters.
* **[Function Call Tree & Developer API Reference (`docs/function_tree.md`)](docs/function_tree.md)**: Comprehensive sequence diagrams, module call trees, and API method signatures (`resolveCrosshairPlacement`, `resolveAnchorPlacement`, `getCrosshairOriginTarget`).

---

## Installation

Install the module in Foundry VTT (V12+) using the manifest URL:

```text
https://github.com/aljames-external/bakana-better-crosshairs/releases/latest/download/module.json
```

---

## License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.
