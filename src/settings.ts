import { MODULE_ID, MODULE_NAME } from './lib/constants.js';
import { log } from './lib/logger.js';
import { autorecManager } from './autorec/autorecManager.js';
import { AutorecMenuApplication } from './autorec/autorecMenu.js';
import { AutorecExchangeMenuApplication } from './autorec/autorecExchangeMenu.js';

/**
 * Registers module settings and menus during Foundry VTT initialization.
 *
 * @returns {void}
 */
export function registerModuleSettings() {
    log.info(`Initializing ${MODULE_NAME} settings`);

    if (!game?.settings) return;

    game.settings.registerMenu(MODULE_ID, 'autorecMenu', {
        name: 'BBC.settings.autorecMenu.name',
        label: 'BBC.settings.autorecMenu.label',
        hint: 'BBC.settings.autorecMenu.hint',
        icon: 'fa-solid fa-wand-magic-sparkles',
        type: AutorecMenuApplication,
        restricted: true
    });

    game.settings.registerMenu(MODULE_ID, 'autorecExchangeMenu', {
        name: 'BBC.settings.autorecExchangeMenu.name',
        label: 'BBC.settings.autorecExchangeMenu.label',
        hint: 'BBC.settings.autorecExchangeMenu.hint',
        icon: 'fa-solid fa-file-import',
        type: AutorecExchangeMenuApplication,
        restricted: true
    });

    game.settings.register(MODULE_ID, 'registeredTemplates', {
        name: 'BBC.settings.registeredTemplates.name',
        scope: 'world',
        config: false,
        type: Object,
        default: {},
        /**
         * Reloads saved autorec registrations when the registeredTemplates setting changes.
         *
         * @param {Object<string, Object>} savedRegistrations - The updated dictionary of saved template registrations.
         * @returns {void}
         */
        onChange: (savedRegistrations) => {
            autorecManager.loadSavedRegistrations(savedRegistrations ?? {});
        }
    });

    game.settings.register(MODULE_ID, 'enableCrosshairBroadcasting', {
        name: 'BBC.settings.enableCrosshairBroadcasting.name',
        hint: 'BBC.settings.enableCrosshairBroadcasting.hint',
        scope: 'world',
        config: true,
        restricted: true,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE_ID, 'showOtherPlayersCrosshairs', {
        name: 'BBC.settings.showOtherPlayersCrosshairs.name',
        hint: 'BBC.settings.showOtherPlayersCrosshairs.hint',
        scope: 'client',
        config: true,
        restricted: false,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE_ID, 'logVerbosity', {
        name: 'BBC.settings.logVerbosity.name',
        hint: 'BBC.settings.logVerbosity.hint',
        scope: 'client',
        config: true,
        type: String,
        choices: {
            'error': 'BBC.settings.logVerbosity.choices.error',
            'warn': 'BBC.settings.logVerbosity.choices.warn',
            'info': 'BBC.settings.logVerbosity.choices.info',
            'debug': 'BBC.settings.logVerbosity.choices.debug'
        },
        default: 'warn',
        /**
         * Dynamically updates the logger verbosity level when the logVerbosity setting changes.
         *
         * @param {string} value - The newly selected verbosity level ('error', 'warn', 'info', or 'debug').
         * @returns {void}
         */
        onChange: (value) => log.setVerbosity(value ?? 'warn')
    });
}

/**
 * Injects structured World, User, and Client section headers into SettingsConfig.
 *
 * @param {HTMLElement|jQuery} html - The settings config DOM element
 * @param {object} [_app=null] - The settings application instance
 */
export function injectSettingsHeaders(html, _app = null) {
    const root = html?.querySelector ? html : html?.[0];
    if (!root?.querySelector) return;

    // 1. Ensure logVerbosity (Client Setting) is placed after showOtherPlayersCrosshairs (User Setting)
    const showOtherPlayersSelector = [
        `[name="${MODULE_ID}.showOtherPlayersCrosshairs"]`,
        `[data-setting-id="${MODULE_ID}.showOtherPlayersCrosshairs"]`,
        `[data-entry-id="${MODULE_ID}.showOtherPlayersCrosshairs"]`,
        `[name="showOtherPlayersCrosshairs"]`
    ].join(', ');
    const logVerbositySelector = [
        `[name="${MODULE_ID}.logVerbosity"]`,
        `[data-setting-id="${MODULE_ID}.logVerbosity"]`,
        `[data-entry-id="${MODULE_ID}.logVerbosity"]`,
        `[name="logVerbosity"]`
    ].join(', ');

    const showOtherPlayersEl = root.querySelector(showOtherPlayersSelector);
    const logVerbosityEl = root.querySelector(logVerbositySelector);

    if (showOtherPlayersEl && logVerbosityEl) {
        const showOtherPlayersFg = showOtherPlayersEl.closest('.form-group') ?? showOtherPlayersEl;
        const logFg = logVerbosityEl.closest('.form-group') ?? logVerbosityEl;
        if (showOtherPlayersFg && logFg && showOtherPlayersFg.parentNode && showOtherPlayersFg.parentNode === logFg.parentNode) {
            const parentChildren = Array.from(showOtherPlayersFg.parentNode.children);
            if (parentChildren.indexOf(logFg) < parentChildren.indexOf(showOtherPlayersFg)) {
                showOtherPlayersFg.parentNode.insertBefore(logFg, showOtherPlayersFg.nextElementSibling);
            }
        }
    }

    // 2. Insert section headers before the respective first setting in each scope
    const sections = [
        {
            keys: ['autorecMenu', 'autorecExchangeMenu', 'enableCrosshairBroadcasting'],
            scope: 'world',
            title: game.i18n?.localize?.('BBC.settingsSections.world') ?? 'World Settings',
            icon: 'fas fa-globe'
        },
        {
            keys: ['showOtherPlayersCrosshairs'],
            scope: 'user',
            title: game.i18n?.localize?.('BBC.settingsSections.user') ?? 'User Settings',
            icon: 'fas fa-user'
        },
        {
            keys: ['logVerbosity'],
            scope: 'client',
            title: game.i18n?.localize?.('BBC.settingsSections.client') ?? 'Client Settings',
            icon: 'fas fa-desktop'
        }
    ];

    for (const section of sections) {
        let targetEl = null;
        for (const key of section.keys) {
            const selector = [
                `[data-setting-id="${MODULE_ID}.${key}"]`,
                `[data-entry-id="${MODULE_ID}.${key}"]`,
                `[name="${MODULE_ID}.${key}"]`,
                `[data-key="${MODULE_ID}.${key}"]`,
                `[data-action="${MODULE_ID}.${key}"]`,
                `[data-setting-id="${key}"]`,
                `[data-entry-id="${key}"]`,
                `[name="${key}"]`,
                `[data-key="${key}"]`,
                `[data-action="${key}"]`
            ].join(', ');
            targetEl = root.querySelector(selector);
            if (targetEl) break;
        }

        if (!targetEl) continue;

        const formGroup = targetEl.closest('.form-group') ?? targetEl;
        const parent = formGroup?.parentNode;
        if (!formGroup || !parent) continue;

        // Ensure we don't insert duplicate headers
        const existing = parent.querySelector?.(`.bbc-settings-section-header[data-scope="${section.scope}"]`);
        if (existing) continue;

        const prev = formGroup.previousElementSibling;
        if (prev?.classList?.contains('bbc-settings-section-header') && prev?.dataset?.scope === section.scope) {
            continue;
        }

        const header = document.createElement('div');
        header.className = 'bbc-settings-section-header';
        header.dataset.scope = section.scope;
        header.innerHTML = `<i class="${section.icon}"></i><span>${section.title}</span>`;
        parent.insertBefore(header, formGroup);
    }
}

Hooks.on('renderSettingsConfig', (app, html) => {
    injectSettingsHeaders(html, app);
});

