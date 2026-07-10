/**
 * Namespace compatibility shim for Foundry VTT API updates across versions (v12..v14+).
 */

export function getTokenClass() {
    return globalThis.foundry?.canvas?.placeables?.Token ?? globalThis.Token;
}

export function isToken(obj) {
    if (!obj || typeof obj !== "object") return false;
    const tokenClass = getTokenClass();
    if (tokenClass && obj instanceof tokenClass) return true;
    return Boolean(obj.document && obj.document.documentName === "Token");
}

/**
 * Compatible Token reference that safely resolves and works with `instanceof Token` checks across Foundry v12..v14+.
 */
export const Token = new Proxy(function() {}, {
    get(target, prop, receiver) {
        const cls = getTokenClass();
        return cls ? Reflect.get(cls, prop, receiver) : undefined;
    },
    construct(target, args) {
        const cls = getTokenClass();
        return new cls(...args);
    },
    get [Symbol.hasInstance]() {
        return (obj) => isToken(obj);
    }
});
