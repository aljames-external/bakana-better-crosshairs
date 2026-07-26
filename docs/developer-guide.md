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

When using your module's manager, pass the **`itemName`** (the Item, Spell, or Activity name matching game items, e.g. `"Fireball"`, `"Longbow"`, `"Magic Missile"`). BBC automatically tags each entry with your specified module name (`sourceModule: "eskie-content-pack"`).

### Single Item Registration (`.register`)

```javascript
packManager.register("Fireball", {
    circleFile: "modules/eskie-content-pack/assets/fireball.webp",
    borderColor: "#ff0000",
    borderAlpha: 0.85,
    stickToToken: false,
    showLine: true,
    showRange: true,
    enabled: true
});
```

### Batch Item Registration (`.registerMany`)

```javascript
await packManager.registerMany([
    {
        itemName: "Tiger Attunement",
        config: {
            circleFile: "jb2a.tiger.orange",
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

### Unregistering Entries

```javascript
// Remove single item sequence
packManager.unregister("Fireball");

// Batch remove multiple sequences
await packManager.unregisterMany(["Tiger Attunement", "Chromatic Orb"]);
```

---

## 5. Exporting & Importing JSON Exchange Bundles

BBC supports importing and exporting crosshair presets via standardized JSON structures.

### Supported JSON Payloads

`importAutorecs(...)` accepts strings or objects in either format:

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
    "itemName": "Tiger Attunement",
    "circleFile": "jb2a.tiger.orange"
  }
]
```

### Module Tag Updating Behavior

- **Importing via `ModuleAutorecManager`**: Every element inside the imported JSON has its `sourceModule` tag automatically updated to your `module-id` (e.g. `"eskie-content-pack"`). This ensures presets bundled from external editors appear in the Autorec UI grouped under your module name.
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
        await packManager.importAutorecs(jsonContent, {
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
| `register` | `(itemName, handlerOrConfig, options?) => void` | Register a single crosshair animation tagged with `sourceModule: moduleId`. |
| `registerMany` | `(entries, options?) => Promise<void>` | Batch register entries tagged with `sourceModule: moduleId`. |
| `unregister` | `(itemName, options?) => boolean` | Remove single item autorec registration. |
| `unregisterMany` | `(itemNames, options?) => Promise<void>` | Batch remove item autorec registrations. |
| `get` | `(itemName) => Object \| null` | Get active configuration for an item name. |
| `has` | `(itemName) => boolean` | Check if item autorec registration exists. |
| `list` | `() => string[]` | List all item names registered under this module. |
| `getAllEntries` | `() => Object[]` | Get UI formatted entry dictionaries for this module. |
| `exportAutorecs` | `(options?) => Object` | Export JSON exchange package containing this module's registrations. |
| `exportToFile` | `(options?) => void` | Download exported JSON bundle as a file. |
| `importAutorecs` | `(jsonOrString, options?) => Promise<Object>` | Import package or JSON array and update elements with this module's `module-id`. |
