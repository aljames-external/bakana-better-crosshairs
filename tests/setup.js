/**
 * Global Foundry VTT & Sequencer environment mock/shim for zero-dependency Node.js unit tests.
 * Sets up globalThis.game, globalThis.foundry, and globalThis.Sequencer before importing modules.
 */

globalThis.Token = class Token {};
globalThis.Item = class Item {};
globalThis.Actor = class Actor {};

function getProperty(obj, path) {
    if (!obj || !path) return undefined;
    const parts = String(path).split('.');
    let current = obj;
    for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        current = current[part];
    }
    return current;
}

function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    return JSON.parse(JSON.stringify(obj));
}

function mergeObject(original, other = {}, options = {}) {
    const target = deepClone(original ?? {});
    for (const [k, v] of Object.entries(other)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') {
            target[k] = mergeObject(target[k], v, options);
        } else {
            target[k] = v;
        }
    }
    return target;
}

function isNewerVersion(v1, v2) {
    const p1 = String(v1).split('.').map(Number);
    const p2 = String(v2).split('.').map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const n1 = p1[i] ?? 0;
        const n2 = p2[i] ?? 0;
        if (n1 > n2) return true;
        if (n1 < n2) return false;
    }
    return false;
}

globalThis.foundry = {
    helpers: {
        interaction: {
            KeyboardManager: class KeyboardManager {}
        }
    },
    applications: {
        api: {
            HandlebarsApplicationMixin: (cls) => cls,
            ApplicationV2: class ApplicationV2 {
                constructor(options = {}) {
                    this.options = options;
                }
                render() {}
            },
            DialogV2: class DialogV2 {
                static async confirm(options) {
                    return true;
                }
            }
        },
        ux: {
            ContextMenu: class ContextMenu {}
        }
    },
    canvas: {
        geometry: {
            Ray: class Ray {
                constructor(pt1, pt2) {
                    this.A = pt1;
                    this.B = pt2;
                }
            }
        },
        placeables: {
            Token: class Token {}
        }
    },
    utils: {
        getProperty,
        deepClone,
        mergeObject,
        isNewerVersion,
        randomID: () => 'test-id-' + Math.random().toString(36).substring(2, 8)
    }
};

globalThis.CONFIG = {
    MeasuredTemplate: {
        objectClass: class MeasuredTemplate {}
    },
    Region: {
        objectClass: class Region {}
    }
};

const settingsStore = new Map([
    ['bakana-better-crosshairs.logVerbosity', 3],
    ['bakana-better-crosshairs.registeredTemplates', {}]
]);

const registeredCallbacks = new Map();

globalThis.game = {
    user: { id: "test-user", isGM: true },
    version: "13.335",
    system: { id: "dnd5e", title: "Dungeons & Dragons 5th Edition" },
    i18n: {
        has(key) { return true; },
        localize(key) { return `LOC:${key}`; },
        format(key, data = {}) { return `LOC_FMT:${key}:${JSON.stringify(data)}`; }
    },
    settings: {
        get(moduleId, key) {
            const fullKey = `${moduleId}.${key}`;
            return settingsStore.has(fullKey) ? settingsStore.get(fullKey) : undefined;
        },
        set(moduleId, key, value) {
            settingsStore.set(`${moduleId}.${key}`, value);
        },
        register(moduleId, key, data) {},
        registerMenu(moduleId, key, data) {}
    },
    modules: {
        get(id) {
            if (id === "bakana-better-crosshairs") {
                return { id, active: true, version: "2.0.0", api: {} };
            }
            if (id === "sequencer" || id === "socketlib") {
                return { id, active: true, version: "3.2.0" };
            }
            if (id === "jb2a_patreon" || id === "eskie" || id === "psfx" || id === "boss-loot-assets-premium") {
                return { id, active: true, version: "1.0.0" };
            }
            return undefined;
        }
    },
    socket: {
        on(channel, callback) {
            registeredCallbacks.set(channel, callback);
        },
        off(channel, callback) {
            if (registeredCallbacks.get(channel) === callback) {
                registeredCallbacks.delete(channel);
            }
        },
        emit(channel, data) {
            const cb = registeredCallbacks.get(channel);
            if (cb) cb(data);
        }
    }
};

globalThis.Hooks = {
    _hooks: new Map(),
    on(event, fn) {
        if (!this._hooks.has(event)) this._hooks.set(event, []);
        this._hooks.get(event).push(fn);
    },
    once(event, fn) {
        this.on(event, (...args) => fn(...args));
    },
    callAll(event, ...args) {
        const fns = this._hooks.get(event) ?? [];
        for (const fn of fns) fn(...args);
    }
};

globalThis.ui = {
    notifications: {
        info(msg) {},
        warn(msg) {},
        error(msg) {}
    }
};

globalThis.canvas = {
    grid: {
        size: 100,
        grid: {
            options: { dimensions: { distance: 5 } }
        },
        getCenter(x, y) { return [x, y]; },
        getSnappedPosition(x, y, mode = 7) {
            const size = this.size ?? 100;
            if (mode === 2) return { x: Math.round(x / size) * size, y: Math.round(y / size) * size };
            if (mode === 1) return { x: Math.round(x / size) * size + size / 2, y: Math.round(y / size) * size + size / 2 };
            const half = size / 2;
            return { x: Math.round(x / half) * half, y: Math.round(y / half) * half };
        }
    },
    interface: {
        grid: {
            clearHighlightLayer(id) {}
        }
    },
    scene: {
        name: "Test Scene",
        createEmbeddedDocuments: async (docName, data) => data
    }
};

globalThis.Sequencer = {
    Database: {
        getEntry(path) {
            if (!path || String(path).includes("invalid")) return null;
            return { path };
        },
        entryExists(path) {
            const str = String(path);
            return str === "jb2a.crosshair.01.white" || str.includes(".white");
        },
        getPathsUnder(path) {
            const str = String(path);
            if (str.includes("invalid")) return [];
            if (str === "jb2a") return ["crosshair"];
            if (str === "jb2a.crosshair") return ["01"];
            if (str === "jb2a.crosshair.01") return ["white"];
            return [];
        }
    },
    Crosshair: {
        CALLBACKS: { SHOW: "show", PLACED: "placed", CANCEL: "cancel" },
        show: async (data) => data
    },
    Ray: class Ray {
        constructor(pt1, pt2) {
            this.A = pt1;
            this.B = pt2;
        }
    },
    Sequence: class Sequence {
        constructor() {
            this._steps = [];
        }
        effect() { return this; }
        file(f) { return this; }
        atLocation(loc) { return this; }
        stretchTo(loc) { return this; }
        size(sz) { return this; }
        play() { return Promise.resolve(this); }
    },
    EffectManager: {
        endEffects: async (opts) => {}
    }
};
