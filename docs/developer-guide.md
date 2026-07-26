# Bakana's Better Crosshairs (BBC) — Third-Party Module Developer Guide

This guide describes how third-party Foundry VTT modules (such as content modules, spell collections, or class feature packs) can register, export, and import crosshair animations for items and activities using the BBC Module API.

---

## 1. Getting Started with the Public Module API

When Bakana's Better Crosshairs initializes, its public API surface is registered on the global Foundry module object:

```javascript
const bbcApi = game.modules.get("bakana-better-crosshairs")?.api;
```

---

## 2. Instantiating a Module-Scoped Autorec Manager

Rather than passing your module ID manually on every single registration call, invoke `autorecManager` directly as a function supplying your unique `module-id`:

```javascript
const packManager = bbcApi.autorecManager("eskie-content-pack");
```

Optionally, you can also instantiate the class directly:

```javascript
const packManager = new bbcApi.ModuleAutorecManager("eskie-content-pack");
```

---

## 3. Registering Item & Activity Autorec Animations

When using your module's manager, register crosshair workflows using `.register(...)`. You **must pass an Array of elements** (single item objects are not accepted). Each element specifies an `itemName` matching an item, spell, or activity in Foundry VTT (e.g. `"Fireball"`, `"Longbow"`, `"Magic Missile"`). BBC automatically tags every entry with your specified module name (`sourceModule: "eskie-content-pack"`).

### Registering an Array of Items (`.register`)

```javascript
await packManager.register([
    {
        itemName: "Fireball",
        config: {
            circleFile: "modules/eskie-content-pack/assets/fireball.webp",
            borderColor: "#ff0000",
            borderAlpha: 0.85,
            stickToToken: false,
            showLine: true,
            showRange: true,
            enabled: true
        }
    },
    {
        itemName: "Longbow",
        activityName: "Ranged Attack",
        config: {
            rayFile: "jb2a.arrow.white",
            showLine: true,
            showRange: true,
            limitRange: true
        }
    },
    {
        itemName: "Chromatic Orb",
        config: {
            circleFile: "jb2a.chromatic_orb.blue",
            placedFillColor: "#0099ff",
            placedFillAlpha: 0.3
        }
    }
]);
```

### Filtering by System Activity (`activityName` & `activityId`)

In activity-based game systems (such as **DnD5e v4**), an item can have multiple activities (e.g. an item with `"Ranged Attack"`, `"Cast"`, `"Save"`, etc.). You can specify optional **`activityName`** or **`activityId`** fields on an entry:

- **`activityName`** (e.g. `"Ranged Attack"`, `"Cast"`): Specifies a sub-activity name filter. Activity-filtered entries take priority over generic item-wide entries.
- **`activityId`** (e.g. `"act_12345"`): Specifies an exact system activity ID filter.

> **Note:** `.register(...)` strictly requires an Array argument (`Array<Object>`). Passing a single object throws a contract error.

---

## 4. Querying & Unregistering Entries

### Check or Retrieve Active Registration

```javascript
// Check whether an item/spell is registered
const isRegistered = packManager.has("Fireball");

// Retrieve configuration object
const config = packManager.get("Fireball");
```

### List Belonging Keys & UI Entries

```javascript
// Get list of item name string keys registered under your module-id
const myItemNames = packManager.list();
// ["Fireball", "Tiger Attunement", "Chromatic Orb"]

// Get full UI-formatted entries belonging to your module
const myEntries = packManager.getAllEntries();
```

### Unregistering Entries (`.unregister`)

Like `.register(...)`, `.unregister(...)` **strictly requires an Array** of item name strings:

```javascript
// Unregister an array of item sequences by name
await packManager.unregister(["Fireball", "Tiger Attunement", "Chromatic Orb"]);
```

---

## 5. Exporting & Importing JSON Exchange Bundles

BBC supports importing and exporting crosshair presets via standardized JSON structures.

### Exporting Configurations (`.export`)

Generate a versioned JSON exchange package container for all registrations belonging to your module:

```javascript
const bundle = packManager.export({ description: "Eskie Content Pack v1.0 Presets" });
console.log("Package Container:", bundle);
```

### Supported JSON Import Payloads (`.import`)

`.import(...)` accepts strings or objects in either format:

#### Standard Exchange Bundle Structure
```json
{
  "version": "1.0.0",
  "sourceModule": "eskie-content-pack",
  "description": "Eskie Content Pack Crosshairs v1.0",
  "entries": [
    {
      "itemName": "Fireball",
      "circleFile": "modules/eskie-content-pack/assets/fireball.webp",
      "sourceModule": "eskie-content-pack"
    }
  ]
}
```

#### Plain JSON Array Payload
You can also pass a simple raw JSON array string or array of objects without schema wrappers—BBC automatically normalizes it into a valid package structure:

```json
[
  {
    "itemName": "Fireball",
    "circleFile": "modules/eskie-content-pack/assets/fireball.webp"
  },
  {
    "itemName": "Longbow",
    "activityName": "Ranged Attack",
    "rayFile": "jb2a.arrow.white"
  }
]
```

### Module Tag Updating Behavior

- **Importing via `ModuleAutorecManager` (`.import`)**: Every element inside the imported JSON has its `sourceModule` tag automatically updated to your `module-id` (e.g. `"eskie-content-pack"`). This ensures presets bundled from external editors appear in the Autorec UI grouped under your module name.
- **Importing via Game Settings / Autorec Menu**: Global UI import preserves existing `sourceModule` tags in the JSON file as-is without overriding.

### Loading Included JSON Bundles on Module Startup

A common pattern for modules is shipping a JSON preset file inside the module directory and auto-loading it during Foundry's `ready` hook:

```javascript
Hooks.once("ready", async () => {
    const packManager = game.modules.get("bakana-better-crosshairs")?.api?.autorecManager("eskie-content-pack");
    if (!packManager) return;

    try {
        const response = await fetch("modules/eskie-content-pack/packs/crosshairs.json");
        if (!response.ok) return;

        const jsonContent = await response.text();
        await packManager.import(jsonContent, {
            interactive: false,
            overwrite: true
        });

        console.log("Eskie Content Pack | Loaded crosshair autorec presets.");
    } catch (err) {
        console.error("Eskie Content Pack | Failed to load crosshair presets:", err);
    }
});
```

---

## 6. API Reference Summary

| Method | Signature | Description |
| :--- | :--- | :--- |
| `autorecManager(moduleId)` | `(moduleId: string) => ModuleAutorecManager` | Callable function proxy to instantiate a module-scoped manager. |
| `register` | `(entries: Array<Object>, options?) => Promise<void>` | Register an array of item/activity animations tagged with `sourceModule: moduleId`. **Requires an array.** |
| `unregister` | `(itemNames: Array<string>, options?) => Promise<void>` | Remove item autorec registrations by array of names. **Requires an array.** |
| `get` | `(itemName: string) => Object \| null` | Get active configuration for an item name. |
| `has` | `(itemName: string) => boolean` | Check if item autorec registration exists. |
| `list` | `() => string[]` | List all item names registered under this module. |
| `getAllEntries` | `() => Object[]` | Get UI formatted entry dictionaries for this module. |
| `export` | `(options?) => Object` | Export JSON exchange package containing this module's registrations. |
| `import` | `(jsonOrString, options?) => Promise<Object>` | Import package or JSON array and update elements with this module's `module-id`. |
