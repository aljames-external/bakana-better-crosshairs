import test from 'node:test';
import assert from 'node:assert/strict';

import '../setup.js';

import { setupModule, setupApiCalls } from '../../src/module.js';
import { registerModuleSettings } from '../../src/settings.js';
import { socketlib } from '../../src/integration/socketlib.js';
import { socketlib as indexSocketlib } from '../../src/integration/index.js';
import { MODULE_ID } from '../../src/lib/constants.js';

test('integration barrel exports socketlib', () => {
    assert.strictEqual(indexSocketlib, socketlib);
});

test('socketlib emit, on, and off enforce strict input contracts', () => {
    let emitted = null;
    const handler = (payload) => { emitted = payload; };

    // Contract validation: invalid payload or handler should be NOP
    socketlib.emit(null);
    socketlib.emit("not an object");
    assert.strictEqual(emitted, null);

    socketlib.on(null);
    socketlib.on("not a function");

    // Valid listener and emit
    socketlib.on(handler);
    socketlib.emit({ type: "TEST_EVENT", data: 123 });
    assert.deepEqual(emitted, { type: "TEST_EVENT", data: 123 });

    // Remove listener
    socketlib.off("not a function");
    socketlib.off(handler);
    emitted = null;
    socketlib.emit({ type: "TEST_EVENT_2", data: 456 });
    assert.strictEqual(emitted, null);
});

test('setupApiCalls safely merges API functions into game.modules.get(MODULE_ID).api', () => {
    setupApiCalls(null);
    setupApiCalls("invalid");

    const testApi = { testFn: () => 'hello' };
    setupApiCalls(testApi);
    const modApi = game.modules.get(MODULE_ID).api;
    assert.strictEqual(typeof modApi.testFn, 'function');
    assert.strictEqual(modApi.testFn(), 'hello');
});

test('registerModuleSettings registers menus and settings with safe onChange handlers', () => {
    const registeredMenus = [];
    let registeredSettings = [];

    const origRegisterMenu = game.settings.registerMenu;
    const origRegister = game.settings.register;

    game.settings.registerMenu = (mod, key, config) => {
        registeredMenus.push({ mod, key, config });
        assert.strictEqual(mod, MODULE_ID);
    };

    game.settings.register = (mod, key, config) => {
        registeredSettings.push({ key, config });
    };

    registerModuleSettings();
    assert.strictEqual(registeredMenus.length, 2);
    assert.ok(registeredMenus.some(m => m.key === 'autorecMenu'));
    assert.ok(registeredMenus.some(m => m.key === 'autorecExchangeMenu'));
    assert.strictEqual(registeredSettings.length, 2);

    // Test onChange callback nullish resiliency
    const regTemplatesConfig = registeredSettings.find(s => s.key === 'registeredTemplates')?.config;
    assert.doesNotThrow(() => regTemplatesConfig.onChange(null));

    const logVerbosityConfig = registeredSettings.find(s => s.key === 'logVerbosity')?.config;
    assert.doesNotThrow(() => logVerbosityConfig.onChange(null));

    // Restore original mocks
    game.settings.registerMenu = origRegisterMenu;
    game.settings.register = origRegister;
});

test('setupModule initializes adapters, hooks, settings, and populates module.api', () => {
    globalThis.loadTemplates = (templates) => Promise.resolve(templates);

    const mockModule = { id: MODULE_ID, active: true, version: '6.0.0', api: {} };
    const origGet = game.modules.get;
    game.modules.get = (id) => (id === MODULE_ID ? mockModule : origGet(id));

    setupModule();

    assert.ok(mockModule.api);
    assert.ok(mockModule.api.crosshair);
    assert.ok(mockModule.api.util);
    assert.ok(mockModule.api.autorecManager);
    assert.ok(mockModule.api.systemAdapter);
    assert.ok(mockModule.api.crosshairAdapter);

    game.modules.get = origGet;
});

