# Bakana's Better Crosshairs

[![Foundry VTT Version](https://img.shields.io/badge/Foundry%20VTT-v12%20--%20v14+-orange.svg)](https://foundryvtt.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A high-performance, modular targeting crosshair replacement and automated recognition (**Autorec**) engine for **Foundry VTT (v12–v14+)**, powered by **[Sequencer](https://fantasycomputer.works/FoundryVTT-Sequencer/)**.

**Bakana's Better Crosshairs (`BBC`)** replaces Foundry's static, flat template placement previews (`MeasuredTemplate`, `Region`) with vibrant, animated Sequencer crosshairs (`Circle`, `Cone`, `Ray`, `Square`). With **Autorec**, developers, GMs, and players can map unique animated crosshairs, origin stretch lines, colors, and targeting behaviors directly to individual spells, weapons, or system activities.

---

## Table of Contents
* [Key Features](#key-features)
* [Targeting Modes (`Attached` vs `Detached`)](#targeting-modes-attached-vs-detached)
* [Automated Recognition (Autorec)](#automated-recognition-autorec)
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
- **Item & Activity Matching**: Filter by exact Item Name/UUID or Activity Name/UUID (`e.g. Item: Longbow -> Activity: Cone Attack`).
- **Shape Override**: Force an item to spawn a specific crosshair shape (`Circle`, `Cone`, `Ray`, `Square`).
- **Animation Customization**: Select specific Sequencer database animations (`circleFile`, `coneFile`, `rayFile`, `squareFile`, `lineFile`).
- **Color & Border Themes**: Set custom fill colors, border colors, and opacity alphas per spell or weapon.

---

## System & Module Support

Bakana's Better Crosshairs uses a decoupled **System Adapter & Foundry Adapter** architecture:
* **D&D 5e (`dnd5e` v3 / v4.x)**: Full support for native Activity workflows (`item.system.activities`), activity filters (`activityId` / `activityName`), and spell origin UUID lookup (`flags.dnd5e.origin`).
* **System Agnostic (`BaseSystemAdapter`)**: Automatically supports any system that spawns standard `MeasuredTemplate` or `Region` placeables.
* **Midi-QOL & Item Workflows**: Seamlessly integrates with workflow automation modules (`midi-qol`) without interfering with automated template placement hooks.

---

## Developer Documentation

For developers looking to inspect the codebase, write custom system/module adapters, or trace execution flow, consult our deep-dive documentation:

* **[Architecture Guide (`docs/architecture_guide.md`)](docs/architecture_guide.md)**: Explains the adapter design pattern, directory structure, preview interception hooks, and guide to implementing new game system adapters.
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
