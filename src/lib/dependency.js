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
    if ((Boolean(min) || Boolean(max)) && !version) return false;
    let isValidVersion = true;
    const isNewer = foundry?.utils?.isNewerVersion;
    if (!isNewer) return false;
    if (min) isValidVersion = isValidVersion && !isNewer(min, version);
    if (max) isValidVersion = isValidVersion && !isNewer(version, max);
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
    const depId = dependency?.id;
    if (!depId) return undefined;
    if (depId === "foundry") return game;
    const win = typeof window !== "undefined" ? window : global;
    const mod = game?.modules?.get(depId);
    return mod ? mod : win[depId];
}

/**
 * Extracts the current version string for a dependency entity.
 * @param {object} dependency - The dependency object.
 * @param {object} [entity] - Optional pre-resolved dependency entity.
 * @returns {string|undefined} The version string if present.
 * @private
 */
function _getVersion(dependency, entity = _getEntity(dependency)) {
    return entity?.version ?? (dependency?.id === "foundry" ? game?.version : undefined);
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
    if (!dependency?.id) return false;
    const entity = _getEntity(dependency);
    if (!entity) return false;
    const versionStr = _getVersion(dependency, entity);
    return Boolean(_isAscending(dependency.min, versionStr, dependency.max));
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
    if (!dependency?.id) return false;
    const entity = _getEntity(dependency);
    if (!entity) return false;
    const isActive = entity.active ?? true;
    return Boolean(_isInstalled(dependency) && Boolean(isActive));
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
    if (dependency?.min) msg += `\n\t${localize("BBC.Dependency.MinVersion", "Minimum version: ")}${dependency.min}`;
    if (dependency?.max) msg += `\n\t${localize("BBC.Dependency.MaxVersion", "Maximum version: ")}${dependency.max}`;
    msg += version ? `\n\t${localize("BBC.Dependency.CurVersion", "Current version: ")}${version}` : "";
    msg += `\n\t${localize("BBC.Dependency.CurState", "Current state: ")}`;

    const entity = _getEntity(dependency);
    const compatible = _isAscending(dependency?.min, version, dependency?.max);
    const isActive = entity?.active ?? true;
    if (!entity) return msg + localize("BBC.Dependency.StateNotInstalled", "NOT INSTALLED");
    if (!compatible) msg += localize("BBC.Dependency.StateIncompatible", "INCOMPATIBLE");
    else if (!isActive) msg += localize("BBC.Dependency.StateNotActivated", "NOT ACTIVATED");
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
        let prefix = warnMessage;
        if (prefix.length > 0) prefix += "\n";
        const depRef = dependency.id + (dependency.ref ? ` (${dependency.ref})` : "");
        let fullWarnMsg = `${prefix}${localize("BBC.Dependency.WarnNotActivated", "Warning: not activated and between expected versions:")} ${depRef}`;
        const entity = _getEntity(dependency);
        const versionStr = _getVersion(dependency, entity);
        fullWarnMsg += _versionMessageAppend(dependency, versionStr);
        log.warn(fullWarnMsg);
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
        let prefix = warnMessage;
        if (prefix.length > 0) prefix += "\n";
        const depRef = dependency.id + (dependency.ref ? ` (${dependency.ref})` : "");
        let fullWarnMsg = `${prefix}${localize("BBC.Dependency.WarnNotInstalled", "Warning: not installed and between expected versions:")} ${depRef}`;
        const entity = _getEntity(dependency);
        const versionStr = _getVersion(dependency, entity);
        fullWarnMsg += _versionMessageAppend(dependency, versionStr);
        log.warn(fullWarnMsg);
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
    if (!dependency?.id) return false;
    return isActivated(dependency, localize("BBC.Dependency.RecommendInstalling", "Recommend installing the following:"));
}

/**
 * Checks if at least one of a list of recommended dependencies is activated.
 * @param {Array<object>} dependencyList - The list of dependencies to check.
 * @returns {boolean} Whether at least one dependency is activated.
 */
function hasSomeRecommended(dependencyList) {
    if (!Array.isArray(dependencyList) || dependencyList.length === 0) return false;
    for (const dependency of dependencyList) {
        if (isActivated(dependency)) return true;
    }

    let warnMsg = localize("BBC.Dependency.RecommendInstallingOne", "Recommend installing one of the following:");
    for (const dependency of dependencyList) {
        if (!dependency?.id) continue;
        warnMsg += `\n${localize("BBC.Dependency.ModuleLabel", "Module: ")}${dependency.id}`;
        if (dependency.ref) warnMsg += ` (${dependency.ref})`;
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
    const list = Array.isArray(dependencyList) ? dependencyList : [dependencyList];
    let errorMsg = localize("BBC.Dependency.RequiresAll", "Requires all of the following to be installed and activated:\n");
    let dependencyMet = true;

    for (const dependency of list) {
        if (!dependency?.id) continue;
        if (_isActivated(dependency)) continue;
        dependencyMet = false;

        const depRef = dependency.id + (dependency.ref ? ` (${dependency.ref})` : "");
        errorMsg += `\n${localize("BBC.Dependency.ModuleLabel", "Module: ")}${depRef}`;
        const entity = _getEntity(dependency);
        const versionStr = _getVersion(dependency, entity);
        errorMsg += _versionMessageAppend(dependency, versionStr);
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
    if (!Array.isArray(dependencyList) || dependencyList.length === 0) {
        throw new Error("No dependencies specified for someRequired.\n");
    }
    let errorMsg = localize("BBC.Dependency.RequiresOne", "Requires at least one of the following to be installed and activated:\n");

    for (const dependency of dependencyList) {
        if (!dependency?.id) continue;
        if (_isActivated(dependency)) return;
        if (errorMsg.length > 0) errorMsg += "\n";
        const depRef = dependency.id + (dependency.ref ? ` (${dependency.ref})` : "");
        errorMsg += `${localize("BBC.Dependency.ModuleLabel", "Module: ")}${depRef}`;
        const entity = _getEntity(dependency);
        const versionStr = _getVersion(dependency, entity);
        errorMsg += _versionMessageAppend(dependency, versionStr);
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
