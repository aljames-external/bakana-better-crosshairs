import { MODULE_ID, MODULE_NAME } from './lib/constants.js';
import { log } from './lib/logger.js';
import { autorecManager } from './autorec/autorecManager.js';
import { AutorecMenuApplication } from './autorec/autorecMenu.js';

/**
 * Registers module settings and menus during Foundry VTT initialization.
 *
 * @returns {void}
 */
export function registerModuleSettings() {
    log.info(`Initializing ${MODULE_NAME} settings`);

    game.settings.registerMenu(MODULE_ID, 'autorecMenu', {
        name: 'BBC.settings.autorecMenu.name',
        label: 'BBC.settings.autorecMenu.label',
        hint: 'BBC.settings.autorecMenu.hint',
        icon: 'fa-solid fa-wand-magic-sparkles',
        type: AutorecMenuApplication,
        restricted: false
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
            autorecManager.loadSavedRegistrations(savedRegistrations);
        }
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
        onChange: (value) => log.setVerbosity(value)
    });
}
