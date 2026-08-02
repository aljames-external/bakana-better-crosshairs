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
    if (!original || typeof original !== 'object') return other;
    for (const [k, v] of Object.entries(other)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && original[k] && typeof original[k] === 'object' && !Array.isArray(original[k])) {
            mergeObject(original[k], v, options);
        } else {
            original[k] = deepClone(v);
        }
    }
    return original;
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
            Token: class Token {},
            MeasuredTemplate: class MeasuredTemplate {},
            Region: class Region {}
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

globalThis.CONST = {
    GRID_SNAPPING_MODES: {
        CENTER: 1,
        VERTEX: 2,
        SIDE_MIDPOINT: 4,
        SIDE: 4
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
        register(moduleId, key, data) {
            if (!settingsStore.has(`${moduleId}.${key}`) && data && "default" in data) {
                settingsStore.set(`${moduleId}.${key}`, data.default);
            }
        },
        registerMenu(moduleId, key, data) {}
    },
    modules: {
        _store: new Map([
            ["bakana-better-crosshairs", { id: "bakana-better-crosshairs", active: true, version: "2.0.0", api: {} }],
            ["sequencer", { id: "sequencer", active: true, version: "3.2.0" }],
            ["socketlib", { id: "socketlib", active: true, version: "3.2.0" }]
        ]),
        get(id) {
            if (this._store.has(id)) return this._store.get(id);
            if (id && id !== "nonexistent-module") {
                const mod = { id, active: true, version: "1.0.0" };
                this._store.set(id, mod);
                return mod;
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
        wait(ms) { return this; }
        effect() { return this; }
        name(n) { return this; }
        file(f) { return this; }
        atLocation(loc) { return this; }
        atPosition(pos) { return this; }
        attachTo(loc, opts) { return this; }
        stretchTo(loc) { return this; }
        size(sz) { return this; }
        anchor(a) { return this; }
        rotate(r) { return this; }
        rotation(r) { return this; }
        opacity(o) { return this; }
        belowTokens() { return this; }
        locally() { return this; }
        persist() { return this; }
        crosshair(pos) { return this; }
        type(t) { return this; }
        borderColor(c, o) { return this; }
        fillColor(c, o) { return this; }
        location(l, o) { return this; }
        snapPosition(s) { return this; }
        icon(i) { return this; }
        callback(ev, fn) { return this; }
        play() { return Promise.resolve(this); }
    },
    EffectManager: {
        getEffects: (opts) => [],
        endEffects: async (opts) => {}
    }
};

globalThis.Sequence = globalThis.Sequencer.Sequence;

