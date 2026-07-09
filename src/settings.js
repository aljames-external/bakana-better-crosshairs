import { MODULE_ID } from "./lib/constants.js";
import { log } from './lib/logger.js';

Hooks.once('init', function() {
    log.info("Initializing Bakana's Better Crosshairs settings");

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
