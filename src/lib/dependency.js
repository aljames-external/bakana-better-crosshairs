import { log } from "./logger.js";
import { localize } from "./utils.js";

/**
 * Checks if the versions are in ascending order.
 * @param {string} [min] - The minimum version.
 * @param {string} [version] - The version to check.
 * @param {string} [max] - The maximum version.
 * @returns {boolean} Whether the versions are in ascending order.
 * @private
 */
function _isAscending(min, version, max) {
    let isValidVersion = true;
    if (min) isValidVersion = isValidVersion && !foundry.utils.isNewerVersion(min, version);
    if (max) isValidVersion = isValidVersion && !foundry.utils.isNewerVersion(version, max);
    return Boolean(isValidVersion);
}

/**
 * Retrieves the dependency entity from game modules or global scope.
 * @param {object} dependency - The dependency object to look up.
 * @param {string} dependency.id - The identifier of the dependency.
 * @returns {object|undefined} The module, global entity, or game object if found.
 * @private
 */
function _getEntity(dependency) {
    const isModule = Boolean(game.modules.get(dependency?.id));
    const entity = isModule ? game.modules.get(dependency?.id) : globalThis[dependency?.id];
    if (dependency?.id === "foundry") return game;
    return entity;
}

/**
 * Checks if the dependency is installed.
 * @param {object} dependency - The dependency object to check.
 * @param {string} dependency.id - The identifier of the dependency.
 * @param {string} [dependency.min] - Minimum allowable version.
 * @param {string} [dependency.max] - Maximum allowable version.
 * @returns {boolean} Whether the dependency is installed and within the valid version range.
 * @private
 */
function _isInstalled(dependency) {
    const entity = _getEntity(dependency);
    if (!entity) return false;
    return Boolean(_isAscending(dependency.min, entity?.version, dependency.max));
}

/**
 * Checks if the dependency is installed and activated.
 * @param {object} dependency - The dependency object to check.
 * @param {string} dependency.id - The identifier of the dependency.
 * @param {string} [dependency.min] - Minimum allowable version.
 * @param {string} [dependency.max] - Maximum allowable version.
 * @returns {boolean} Whether the dependency is activated and within the valid version range.
 * @private
 */
function _isActivated(dependency) {
    const entity = _getEntity(dependency);
    return Boolean(_isInstalled(dependency) && entity?.active);
}

/**
 * Appends version information to a message.
 * @param {object} dependency - The dependency to get version information from.
 * @param {string} [dependency.min] - Minimum allowable version.
 * @param {string} [dependency.max] - Maximum allowable version.
 * @param {string} [version] - The current version of the dependency.
 * @returns {string} The message with version information appended.
 * @private
 */
function _versionMessageAppend(dependency, version) {
    let msg = "";
    if (dependency?.min) msg += `\n\t${localize("BBC.Dependency.MinVersion", "Minimum version: ")}${dependency?.min}`;
    if (dependency?.max) msg += `\n\t${localize("BBC.Dependency.MaxVersion", "Maximum version: ")}${dependency?.max}`;
    msg += version ? `\n\t${localize("BBC.Dependency.CurVersion", "Current version: ")}${version}` : "";
    msg += `\n\t${localize("BBC.Dependency.CurState", "Current state: ")}`;

    const entity = _getEntity(dependency);
    const compatible = _isAscending(dependency?.min, version, dependency?.max);
    if (!entity) return msg + localize("BBC.Dependency.StateNotInstalled", "NOT INSTALLED");
    if (!compatible) msg += localize("BBC.Dependency.StateIncompatible", "INCOMPATIBLE");
    else if (!entity.active) msg += localize("BBC.Dependency.StateNotActivated", "NOT ACTIVATED");
    else msg += "[AN UNKNOWN ERROR OCCURRED]";

    return msg;
}

/**
 * Checks if a dependency is activated and optionally logs a warning if it is not.
 * @param {object} dependency - The dependency to check.
 * @param {string} dependency.id - The identifier of the dependency.
 * @param {string} [dependency.ref] - Optional human-readable reference name.
 * @param {string} [warnMessage] - Optional warning message prefix to log if not activated.
 * @returns {boolean} Whether the dependency is activated.
 */
function isActivated(dependency, warnMessage) {
    if (!dependency?.id) return false;
    const valid = _isActivated(dependency);
    if (!valid && warnMessage) {
        if (warnMessage.length) warnMessage += "\n";
        const depRef = dependency?.id + (dependency?.ref ? ` (${dependency?.ref})` : "");
        warnMessage += `${localize("BBC.Dependency.WarnNotActivated", "Warning: not activated and between expected versions:")} ${depRef}`;
        warnMessage += _versionMessageAppend(dependency, _getEntity(dependency)?.version);
        log.warn(warnMessage);
    }
    return valid;
}

/**
 * Checks if a dependency is installed and optionally logs a warning if it is not.
 * @param {object} dependency - The dependency to check.
 * @param {string} dependency.id - The identifier of the dependency.
 * @param {string} [dependency.ref] - Optional human-readable reference name.
 * @param {string} [warnMessage] - Optional warning message prefix to log if not installed.
 * @returns {boolean} Whether the dependency is installed.
 */
function isInstalled(dependency, warnMessage) {
    if (!dependency?.id) return false;
    const valid = _isInstalled(dependency);
    if (!valid && warnMessage) {
        if (warnMessage.length) warnMessage += "\n";
        const depRef = dependency?.id + (dependency?.ref ? ` (${dependency?.ref})` : "");
        warnMessage += `${localize("BBC.Dependency.WarnNotInstalled", "Warning: not installed and between expected versions:")} ${depRef}`;
        warnMessage += _versionMessageAppend(dependency, _getEntity(dependency)?.version);
        log.warn(warnMessage);
    }
    return valid;
}

/**
 * Checks if a recommended dependency is activated.
 * @param {object} dependency - The dependency to check.
 * @param {string} dependency.id - The identifier of the dependency.
 * @returns {boolean} Whether the dependency is activated.
 */
function hasRecommended(dependency) {
    return isActivated(dependency, localize("BBC.Dependency.RecommendInstalling", "Recommend installing the following:"));
}

/**
 * Checks if at least one of a list of recommended dependencies is activated.
 * @param {Array<object>} dependencyList - The list of dependencies to check.
 * @returns {boolean} Whether at least one dependency is activated.
 */
function hasSomeRecommended(dependencyList) {
    for (const dependency of dependencyList) {
        if (isActivated(dependency)) return true;
    }

    let warnMsg = localize("BBC.Dependency.RecommendInstallingOne", "Recommend installing one of the following:");
    for (const dependency of dependencyList) {
        warnMsg += `\n${localize("BBC.Dependency.ModuleLabel", "Module: ")}${dependency?.id}`;
        if (dependency?.ref) warnMsg += ` (${dependency?.ref})`;
    }
    log.warn(warnMsg);
    return false;
}

/**
 * Checks if a required dependency is activated and throws an error if it is not.
 * @param {object|Array<object>} dependencyList - The dependency or list of dependencies to check.
 * @returns {void} Throws an error if any required dependency is missing.
 */
function required(dependencyList) {
    if (!Array.isArray(dependencyList)) return required([dependencyList]);
    let errorMsg = localize("BBC.Dependency.RequiresAll", "Requires all of the following to be installed and activated:\n");
    let dependencyMet = true;

    for (const dependency of dependencyList) {
        if (_isActivated(dependency)) continue;
        dependencyMet = false;

        const depRef = dependency?.id + (dependency?.ref ? ` (${dependency?.ref})` : "");
        errorMsg += `\n${localize("BBC.Dependency.ModuleLabel", "Module: ")}${depRef}`;
        errorMsg += _versionMessageAppend(dependency, _getEntity(dependency)?.version);
    }

    if (!dependencyMet) {
        throw new Error(errorMsg + "\n");
    }
}

/**
 * Checks if at least one of a list of required dependencies is activated and throws an error if not.
 * @param {Array<object>} dependencyList - The list of dependencies to check.
 * @returns {void} Throws an error if no required dependency is activated.
 */
function someRequired(dependencyList) {
    let errorMsg = localize("BBC.Dependency.RequiresOne", "Requires at least one of the following to be installed and activated:\n");

    for (const dependency of dependencyList) {
        if (_isActivated(dependency)) return;
        if (errorMsg.length) errorMsg += "\n";
        const depRef = dependency?.id + (dependency?.ref ? ` (${dependency?.ref})` : "");
        errorMsg += `${localize("BBC.Dependency.ModuleLabel", "Module: ")}${depRef}`;
        errorMsg += _versionMessageAppend(dependency, _getEntity(dependency)?.version);
    }
    throw new Error(errorMsg + "\n");
}

/**
 * Dependency verification utility export.
 * @type {object}
 * @property {typeof isActivated} isActivated - Checks if a dependency is activated and optionally logs a warning.
 * @property {typeof isInstalled} isInstalled - Checks if a dependency is installed and optionally logs a warning.
 * @property {typeof hasRecommended} hasRecommended - Checks if a recommended dependency is activated.
 * @property {typeof hasSomeRecommended} hasSomeRecommended - Checks if at least one of a list of recommended dependencies is activated.
 * @property {typeof required} required - Checks if a required dependency or list of dependencies is activated and throws if not.
 * @property {typeof someRequired} someRequired - Checks if at least one of a list of required dependencies is activated and throws if not.
 */
export const dependency = {
    isActivated,
    isInstalled,
    hasRecommended,
    hasSomeRecommended,
    required,
    someRequired,
};
