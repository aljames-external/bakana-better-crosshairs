# Bakana's Better Crosshairs (BBC) — Third-Party Module Developer Guide

This guide describes how third-party Foundry VTT modules (such as macro packs, spell collections, or class feature libraries) can register, export, and import crosshair animations using the BBC Module API.

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
const macroPackManager = bbcApi.autorecManager("eskie-macro-pack");
```

Optionally, you can also instantiate the class directly:

```javascript
const macroPackManager = new bbcApi.ModuleAutorecManager("eskie-macro-pack");
```

---

## 3. Registering Macro Crosshair Animations

When using your module's manager, pass your **macro-id** (the item or spell name matching system items or macros). BBC automatically tags each entry with your specified module name (`sourceModule: "eskie-macro-pack"`).

### Single Macro Registration (`.register`)

```javascript
macroPackManager.register("sao-death", {
    circleFile: "modules/eskie-macro-pack/assets/death.webp",
    borderColor: "#ff0000",
    borderAlpha: 0.85,
    stickToToken: false,
    showLine: true,
    showRange: true,
    enabled: true
});
```

### Batch Macro Registration (`.registerMany`)

```javascript
await macroPackManager.registerMany([
    {
        macroId: "tiger-attunement",
        config: {
            circleFile: "jb2a.tiger.orange",
            showLine: true,
            showRange: true,
            limitRange: true
        }
    },
    {
        macroId: "chromatic-orb",
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
// Check whether a macro-id is registered
const isRegistered = macroPackManager.has("sao-death");

// Retrieve configuration object
const config = macroPackManager.get("sao-death");
```

### List Belonging Keys & UI Entries

```javascript
// Get list of macro-id string keys registered under your module-id
const myMacroIds = macroPackManager.list();
// ["sao-death", "tiger-attunement", "chromatic-orb"]

// Get full UI-formatted entries belonging to your module
const myEntries = macroPackManager.getAllEntries();
```

### Unregistering Entries

```javascript
// Remove single macro sequence
macroPackManager.unregister("sao-death");

// Batch remove multiple sequences
await macroPackManager.unregisterMany(["tiger-attunement", "chromatic-orb"]);
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
  "sourceModule": "eskie-macro-pack",
  "description": "Eskie Macro Pack Crosshairs v1.0",
  "entries": [
    {
      "itemName": "sao-death",
      "circleFile": "modules/eskie-macro-pack/assets/death.webp",
      "sourceModule": "eskie-macro-pack"
    }
  ]
}
```

#### Plain JSON Array Payload
You can also pass a simple raw JSON array string or array of objects without schema wrappers—BBC automatically normalizes it into a valid package structure:

```json
[
  {
    "itemName": "sao-death",
    "circleFile": "modules/eskie-macro-pack/assets/death.webp"
  },
  {
    "itemName": "tiger-attunement",
    "circleFile": "jb2a.tiger.orange"
  }
]
```

### Module Tag Updating Behavior

- **Importing via `ModuleAutorecManager`**: Every element inside the imported JSON has its `sourceModule` tag automatically updated to your `module-id` (e.g. `"eskie-macro-pack"`). This ensures presets bundled from external editors appear in the Autorec UI grouped under your module name.
- **Importing via Game Settings / Autorec Menu**: Global UI import preserves existing `sourceModule` tags in the JSON file as-is without overriding.

### Loading Included JSON Bundles on Module Startup

A common pattern for macro modules is shipping a JSON preset file inside the module directory and auto-loading it during Foundry's `ready` hook:

```javascript
Hooks.once("ready", async () => {
    const macroPackManager = game.modules.get("bakana-better-crosshairs")?.api?.autorecManager("eskie-macro-pack");
    if (!macroPackManager) return;

    try {
        const response = await fetch("modules/eskie-macro-pack/packs/crosshairs.json");
        if (!response.ok) return;

        const jsonContent = await response.text();
        await macroPackManager.importAutorecs(jsonContent, {
            interactive: false,
            overwrite: true
        });

        console.log("Eskie Macro Pack | Loaded crosshair autorec presets.");
    } catch (err) {
        console.error("Eskie Macro Pack | Failed to load crosshair presets:", err);
    }
});
```

---

## 6. API Reference Summary

| Method | Signature | Description |
| :--- | :--- | :--- |
| `autorecManager(moduleId)` | `(moduleId: string) => ModuleAutorecManager` | Callable function proxy to instantiate a module-scoped manager. |
| `register` | `(macroId, handlerOrConfig, options?) => void` | Register a single macro animation tagged with `sourceModule: moduleId`. |
| `registerMany` | `(entries, options?) => Promise<void>` | Batch register entries tagged with `sourceModule: moduleId`. |
| `unregister` | `(macroId, options?) => boolean` | Remove single macro sequence registration. |
| `unregisterMany` | `(macroIds, options?) => Promise<void>` | Batch remove macro sequence registrations. |
| `get` | `(macroId) => Object \| null` | Get active configuration for a macro ID. |
| `has` | `(macroId) => boolean` | Check if macro sequence registration exists. |
| `list` | `() => string[]` | List all macro IDs registered under this module. |
| `getAllEntries` | `() => Object[]` | Get UI formatted entry dictionaries for this module. |
| `exportAutorecs` | `(options?) => Object` | Export JSON exchange package containing this module's registrations. |
| `exportToFile` | `(options?) => void` | Download exported JSON bundle as a file. |
| `importAutorecs` | `(jsonOrString, options?) => Promise<Object>` | Import package or JSON array and update elements with this module's `module-id`. |
