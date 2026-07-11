import { MODULE_ID, MODULE_NAME } from "./lib/constants.js";
import { log } from './lib/logger.js';
import { autorecManager } from './autorec/autorecManager.js';
import { AutorecMenuApplication } from "./autorec/autorecMenu.js";

Hooks.once('init', function() {
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
        onChange: (value) => log.setVerbosity(value)
    });
});
