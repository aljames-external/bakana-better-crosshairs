import { log } from "./logger.js";

const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

/**
 * Standard utility for compiling and executing custom user asynchronous scripts
 * with explicit context variables and error isolation.
 */
export class ScriptRunner {
    /**
     * Execute an asynchronous user script with standard context bindings.
     * @param {string} code - User script body string
     * @param {object} [context={}] - Context variables dictionary
     * @param {string} [contextName="ScriptRunner"] - Label for error logging
     * @returns {Promise<void>}
     */
    static async execute(code, context = {}, contextName = "ScriptRunner") {
        if (!code || typeof code !== "string" || !code.trim()) return;

        const keys = Object.keys(context);
        const values = Object.values(context);

        try {
            const fn = new AsyncFunction(...keys, code);
            await fn(...values);
        } catch (e) {
            log.error(`${contextName} | Error executing custom script:`, e);
        }
    }
}
