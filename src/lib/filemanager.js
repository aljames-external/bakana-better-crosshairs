import { dependency } from './dependency.js';
import { log } from './logger.js';
import { notify } from './notifier.js';
import { localize } from './utils.js';

/**
 * Traverses the Sequencer database to find the best-fit path for a given set of categories.
 * If a category is not found, it will try to find a similar path and log a warning.
 * @param {string} modulePrefix - The prefix of the module to search within (e.g., 'jb2a').
 * @param {...string} categories - The categories to traverse.
 * @returns {string} The best-fit path in the Sequencer database.
 */
function bestFit(modulePrefix, ...categories) {
    let diverged = false;
    let currentPath = modulePrefix;
    const originalPath = `${modulePrefix}.${categories.join('.')}`;
    let remainingOptions = Sequencer.Database.getPathsUnder(currentPath);
    let divergenceOptions = '';

    /**
     * Checks whether a path component is a handlebars-style mustache template token.
     * @param {string} component - The path component to inspect.
     * @returns {boolean} True if the component is enclosed in mustache braces, false otherwise.
     */
    function isMustache(component) {
        return component.startsWith('{{') && component.endsWith('}}');
    }

    // Traverse the categories that the user has provided
    while (remainingOptions && remainingOptions.length > 0 && categories.length > 0) {
        if (isMustache(categories[0])) {
            currentPath = `${currentPath}.${categories.join('.')}`;
            break;
        }

        if (!remainingOptions.includes(categories[0])) {
            if (!diverged) {
                diverged = true;
                divergenceOptions = remainingOptions.join(', ');
            }
            const targetCat = categories[0];
            const numMatch = targetCat.match(/\d+(?:\.\d+)?/);
            let bestOption = remainingOptions[0] ?? '';
            if (numMatch) {
                const targetNum = parseFloat(numMatch[0]);
                let minDiff = Infinity;
                for (const opt of remainingOptions) {
                    const optMatch = opt.match(/\d+(?:\.\d+)?/);
                    if (optMatch) {
                        const diff = Math.abs(targetNum - parseFloat(optMatch[0]));
                        if (diff < minDiff) {
                            minDiff = diff;
                            bestOption = opt;
                        }
                    }
                }
            }
            currentPath += `.${bestOption}`;
            remainingOptions = Sequencer.Database.getPathsUnder(currentPath);
            categories.shift(); // Remove the used category and continue (try to match as best we can)
            continue;
        }

        currentPath += `.${categories.shift()}`;
        remainingOptions = Sequencer.Database.getPathsUnder(currentPath);
    }

    if (diverged) {
        const isNumericDivergence = /\b(?:radius|size)_\d+/i.test(originalPath);
        const msg = `Filemanager closest path diverged from requested path. Requested: ${originalPath} -> Resolved as: ${currentPath} (available: ${divergenceOptions})`;
        if (isNumericDivergence) {
            log.debug(msg);
        } else {
            log.warn(msg);
        }
    }
    return currentPath;
}

/**
 * Finds the closest matching file path in the Sequencer database, handling different module prefixes and versions (e.g., free vs. patreon).
 * @param {string} path - The path to the file, using dot notation (e.g., 'jb2a.fireball.blue').
 * @returns {string|undefined} The resolved file path, or undefined if no path categories exist.
 */
export function closest(path) {
    if (!path) return undefined;

    // Support http:// and https:// addresses
    // Support direct filepaths
    if (path.includes('/')) return path;

    // Support Sequencer Database paths (. seperated)
    const categories = path.split('.');
    if (categories.length === 0) return undefined;
    let isPatreonUser = false;
    let isFreeUser = false;
    let modulePrefix = categories.shift();

    switch (modulePrefix) {
        // Sounds
        case 'psfx':
            dependency.someRequired([{ id: 'psfx-patreon', ref: 'PSFX-Patreon' }, { id: 'psfx', ref: "PSFX - Peri's Sound Effects" }]);
            isPatreonUser = Boolean(dependency.isActivated({ id: 'psfx-patreon', ref: 'PSFX-Patreon' }));
            isFreeUser = Boolean(dependency.isActivated({ id: 'psfx', ref: "PSFX - Peri's Sound Effects" }));
            if (isPatreonUser && isFreeUser) {
                notify.warn(localize("BBC.Conflicts.PSFX", "Both PSFX Patreon and Free are activated, both modules use the path `psfx.` to prefix files! This will cause conflicts! Recommend disabling / uninstalling the free version."));
            }
            modulePrefix = 'psfx';
            break;
        case 'psfx-ambience':
            // Only Patreon Version
            break;

        // Animations
        case 'eskie':
        case 'eskie-free':
            dependency.someRequired([{ id: 'eskie-effects', ref: 'Eskie Effects' }, { id: 'eskie-effects-free', ref: 'Eskie Effects Free' }]);
            isPatreonUser = Boolean(dependency.isActivated({ id: 'eskie-effects', ref: 'Eskie Effects' }));
            modulePrefix = isPatreonUser ? 'eskie' : 'eskie-free';
            break;
        case 'jb2a':
            dependency.someRequired([{ id: 'jb2a_patreon', ref: 'JB2A Patreon' }, { id: 'JB2A_DnD5e', ref: 'JB2A Free' }]);
            isFreeUser = Boolean(dependency.isActivated({ id: 'JB2A_DnD5e' }));
            isPatreonUser = Boolean(dependency.isActivated({ id: 'jb2a_patreon' }));
            if (isPatreonUser && isFreeUser) {
                notify.warn(localize("BBC.Conflicts.JB2A", "Both JB2A Patreon and Free are activated, both modules use the path `jb2a.` to prefix files. This will cause conflicts! Recommend disabling / uninstalling the free version."));
            }
            modulePrefix = 'jb2a';
            break;
        case 'blfx':
            dependency.someRequired([{ id: 'boss-loot-assets-premium', ref: 'Boss Loot Assets Premium' }, { id: 'boss-loot-assets-free', ref: 'Boss Loot Assets Free' }]);
            isPatreonUser = Boolean(dependency.isActivated({ id: 'boss-loot-assets-premium' }));
            isFreeUser = Boolean(dependency.isActivated({ id: 'boss-loot-assets-free' }));
            if (isPatreonUser && isFreeUser) {
                notify.warn(localize("BBC.Conflicts.BLFX", "Both Boss Loot Assets Premium and Free are activated, both modules use the path `blfx.` to prefix files. This will cause conflicts! Recommend disabling / uninstalling the free version."));
            }
            modulePrefix = 'blfx';
            break;
    }

    return bestFit(modulePrefix, ...categories);
}

/**
 * Resolves a Sequencer database entry or file path config to its absolute file path.
 * @param {string} configPath - The configuration path to resolve.
 * @returns {string|undefined} The absolute file path, or undefined if empty.
 */
export function absolutePath(configPath) {
    if (!configPath) return undefined;
    const resolvedConfig = closest(configPath);
    try {
        const entry = Sequencer.Database.getEntry(resolvedConfig, { softFail: true });
        return typeof entry === 'string' ? entry : (entry?.file ?? entry?.files?.[0] ?? resolvedConfig);
    } catch (e) {
        log.debug(`filemanager | Failed to resolve Sequencer entry for: ${resolvedConfig}`, e);
        return resolvedConfig;
    }
}

/**
 * File manager utility object containing path resolution methods.
 */
export const file = {
    closest,
    absolutePath
};
