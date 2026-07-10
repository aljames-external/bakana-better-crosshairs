/**
 * Checks if the versions are in ascending order.
 * @param {string} min The minimum version.
 * @param {string} version The version to check.
 * @param {string} max The maximum version.
 * @returns {boolean} Whether the versions are in ascending order.
 * @private
 */
function _isAscending(min, version, max) {
    let isValidVersion = true;
    if (min) isValidVersion = isValidVersion && !foundry.utils.isNewerVersion(min, version);
    if (max) isValidVersion = isValidVersion && !foundry.utils.isNewerVersion(version, max);
    return isValidVersion;
}

function _getEntity(dependency) {
    const isModule = game.modules.get(dependency?.id);
    const entity = isModule ? game.modules.get(dependency?.id) : globalThis[dependency?.id];
    if (dependency?.id == 'foundry') return game;
    return entity;
}

/**
 * Checks if the dependency is installed.
 * @param {object} dependency
 * @param {string} dependency.id
 * @param {string} dependency.min Minimum allowable version
 * @param {string} dependency.max Maximum allowable version
 * @returns {[boolean, boolean]} [installed, isValidVersion]
 * @private
 */
function _isInstalled(dependency) {
    const entity = _getEntity(dependency);
    if (!entity) return false;
    return _isAscending(dependency.min, entity?.version, dependency.max);
}

/**
 * Checks if the dependency is installed and activated.
 * @param {object} dependency
 * @param {string} dependency.id
 * @param {string} dependency.min Minimum allowable version
 * @param {string} dependency.max Maximum allowable version
 * @returns {boolean} activated and valid version
 * @private
 */
function _isActivated(dependency) {
    const entity = _getEntity(dependency);
    return Boolean(_isInstalled(dependency) && entity?.active);
}

/**
 * Appends version information to a message.
 * @param {object} dependency The dependency to get version information from.
 * @param {string} version The current version of the dependency.
 * @returns {string} The message with version information appended.
 * @private
 */
function _versionMessageAppend(dependency, version) {
    let msg = '';
    if (dependency?.min) msg += `\n\tMinimum version: ${dependency?.min}`;
    if (dependency?.max) msg += `\n\tMaximum version: ${dependency?.max}`;
    msg += (version) ? `\n\tCurrent version: ${version}` : ``;
    msg += `\n\tCurrent state: `;

    const entity = _getEntity(dependency);
    const compatible = _isAscending(dependency.min, version, dependency.max);
    if (!entity) return (msg + 'NOT INSTALLED');
    else if (!compatible) msg += 'INCOMPATIBLE';
    else if (!entity.active) msg += 'NOT ACTIVATED';
    else msg += '[AN UNKNOWN ERROR OCCURRED]';

    return msg;
}

function isActivated(dependency, warnMessage) {
    if (!dependency?.id) return false;
    const valid = _isActivated(dependency);
    if (!valid && warnMessage) {
        if (warnMessage.length) warnMessage += '\n';
        const depRef = dependency?.id + ((dependency?.ref) ? ` (${dependency?.ref})` : '');
        warnMessage += `Warning: ${depRef} is not activated and between expected versions:`;
        warnMessage += _versionMessageAppend(dependency, _getEntity(dependency)?.version);
        console.warn(warnMessage);
    }
    return valid;
}

function isInstalled(dependency, warnMessage) {
    const valid = _isInstalled(dependency);
    if (!valid && warnMessage) {
        if (warnMessage.length) warnMessage += '\n';
        const depRef = dependency?.id + ((dependency?.ref) ? ` (${dependency?.ref})` : '');
        warnMessage += `Warning: ${depRef} is not installed and between expected versions:`;
        warnMessage += _versionMessageAppend(dependency, _getEntity(dependency)?.version);
        console.warn(warnMessage);
    }
    return valid;
}

/**
 * Checks if a recommended dependency is activated.
 * @param {object} dependency The dependency to check.
 * @returns {boolean} Whether the dependency is activated.
 */
function hasRecommended(dependency) {
    return isActivated(dependency, 'Recommend installing the following:');
}

/**
 * Checks if at least one of a list of recommended dependencies is activated.
 * @param {Array<object>} dependencyList The list of dependencies to check.
 * @returns {boolean} Whether at least one dependency is activated.
 */
function hasSomeRecommended(dependencyList) {
    for (let dependency of dependencyList)
        if (isActivated(dependency)) return true;

    let warnMsg = 'Recommend installing one of the following:';
    for (let dependency of dependencyList) {
        warnMsg += `\nModule: ${dependency?.id}`;
        if (dependency?.ref) warnMsg += ` (${dependency?.ref})`;
    }
    console.warn(warnMsg);
    return false;
}

/**
 * Checks if a required dependency is activated and throws an error if it is not.
 * @param {object} dependency The dependency to check.
 * @returns {null | throw}
 */
function required(dependencyList) {
    if (!Array.isArray(dependencyList)) return required([dependencyList]);
    let errorMsg = `Requires all of the following to be installed and activated:\n`;
    let dependencyMet = true;

    for (let dependency of dependencyList) {
        if (_isActivated(dependency)) continue;
        dependencyMet = false;

        const depRef = dependency?.id + ((dependency?.ref) ? ` (${dependency?.ref})` : '');
        errorMsg += `\nModule: ${depRef}`;
        errorMsg += _versionMessageAppend(dependency, _getEntity(dependency)?.version);
    }

    if (!dependencyMet) throw errorMsg;
}

/**
 * Checks if at least one of a list of required dependencies is activated and throws an error if not.
 * @param {Array<object>} dependencyList The list of dependencies to check.
 * @returns {null | throw}
 */
function someRequired(dependencyList) {
    let errorMsg = `Requires at least one of the following to be installed and activated:\n`;

    for (let dependency of dependencyList) {
        if (_isActivated(dependency)) return;
        if (errorMsg.length) errorMsg += '\n';
        const depRef = dependency?.id + ((dependency?.ref) ? ` (${dependency?.ref})` : '');
        errorMsg += `Module: ${depRef}`;
        errorMsg += _versionMessageAppend(dependency, _getEntity(dependency)?.version);
    }
    throw errorMsg;
}


export const dependency = {
    isActivated,
    isInstalled,
    hasRecommended,
    hasSomeRecommended,
    required,
    someRequired,
};
