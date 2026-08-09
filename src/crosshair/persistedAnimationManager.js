import { log } from "../lib/logger.js";
import { crosshairAdapter } from "../adapter/foundry/index.js";
import { resolveCircleAsset, resolveRectangleAsset } from "./assetResolvers.js";
import { closest } from "../lib/filemanager.js";

/**
 * Manager for creating, updating, and removing persistent Sequencer effects
 * attached to placed MeasuredTemplate and Region documents on the canvas.
 */
export class PersistedAnimationManager {
    /**
     * Get the canonical Sequencer effect name for a template or region document.
     * @param {Document|string} docOrId - Target document or document ID
     * @returns {string} Unique effect name
     */
    static getEffectName(docOrId) {
        const id = typeof docOrId === "string" ? docOrId : (docOrId?.id ?? docOrId?._id ?? "");
        return `bbc-persisted-${id}`;
    }

    /**
     * Play or synchronize a persistent Sequencer animation onto a placed template or region.
     * Bound directly to the template/region placeable or location, independent of tokens.
     * @param {Document|PlaceableObject} target - The placed template or region document or placeable
     * @returns {Promise<any>}
     */
    static async syncPersistedAnimation(target) {
        if (!target) return;
        const doc = target.document ?? target;
        const docId = doc.id ?? doc._id;
        if (!docId) return;

        const bbcFlags = doc.flags?.bbc ?? {};
        const isPersisted = Boolean(bbcFlags.persist);
        const effectName = this.getEffectName(docId);

        if (!isPersisted) {
            this.endPersistedAnimation(docId);
            return;
        }

        if (typeof Sequencer === "undefined" || typeof Sequence === "undefined") {
            log.debug("PersistedAnimationManager | Sequencer is not active, skipping persistent effect.");
            return;
        }

        // End any existing effect with this name before recreating to guarantee clean state
        this.endPersistedAnimation(docId);

        // Clean up any remaining interactive preview crosshair effects on canvas
        if (typeof Sequencer !== "undefined" && Sequencer?.EffectManager?.endEffects) {
            try {
                const previewIds = [
                    "Crosshair",
                    "Cone Crosshair",
                    "Ray Crosshair",
                    "Square Crosshair",
                    "Circle Crosshair",
                    bbcFlags.itemName,
                    bbcFlags.id
                ].filter(Boolean);
                for (const name of new Set(previewIds)) {
                    Sequencer.EffectManager.endEffects({ name });
                    Sequencer.EffectManager.endEffects({ name: `${name}-line` });
                }
            } catch (e) {
                log.debug("PersistedAnimationManager.syncPersistedAnimation | Error ending preview effects:", e);
            }
        }

        const detected = crosshairAdapter.detectProperties(doc);
        const shapeType = detected.type ?? "circle";
        const { factor, gridUnits } = crosshairAdapter.getTemplatePixelFactor();
        const pxPerFoot = (canvas?.dimensions?.size ?? 100) / (canvas?.dimensions?.distance ?? 5);

        let effectFile = "";
        let widthPx = 100;
        let heightPx = 100;
        let anchor = { x: 0.5, y: 0.5 };
        const supportsRotation = crosshairAdapter.supportsShapeRotation(shapeType);
        const location = { x: detected.x ?? doc.x ?? 0, y: detected.y ?? doc.y ?? 0 };
        const rotation = supportsRotation ? (detected.direction ?? detected.rotation ?? doc.direction ?? doc.rotation ?? 0) : 0;

        switch (shapeType) {
            case "cone": {
                effectFile = bbcFlags.coneFile ?? "eskie.crosshair.cone.thin.fantasy_01.white.full";
                const dist = detected.distance ?? 30;
                const angle = detected.angle ?? 53.13;
                const rad = (angle * Math.PI) / 180;
                const lengthPx = dist * pxPerFoot;
                const spreadPx = 2 * lengthPx * Math.tan(rad / 2);
                widthPx = lengthPx;
                heightPx = spreadPx;
                anchor = { x: 0, y: 0.5 };
                break;
            }
            case "ray": {
                effectFile = bbcFlags.rayFile ?? "eskie.crosshair.ray.fantasy_01.white";
                const dist = detected.distance ?? 30;
                const width = detected.width ?? 5;
                widthPx = dist * pxPerFoot;
                heightPx = width * pxPerFoot;
                anchor = { x: 0, y: 0.5 };
                break;
            }
            case "square":
            case "rect": {
                const dist = detected.distance ?? 30;
                const width = detected.width ?? dist;
                effectFile = resolveRectangleAsset(bbcFlags.squareFile ?? "eskie.crosshair.rectangle.fantasy_01.white", dist, width);
                widthPx = dist * pxPerFoot;
                heightPx = width * pxPerFoot;
                anchor = { x: 0, y: 0 };
                break;
            }
            case "circle":
            default: {
                const radius = detected.radius ?? detected.distance ?? 20;
                effectFile = resolveCircleAsset(bbcFlags.circleFile ?? "eskie.crosshair.circle.fantasy_01.white.full", radius);
                const diameterPx = (radius * 2) * pxPerFoot;
                widthPx = diameterPx;
                heightPx = diameterPx;
                anchor = { x: 0.5, y: 0.5 };
                break;
            }
        }

        const resolvedFile = closest(effectFile);
        if (!resolvedFile) {
            log.debug(`PersistedAnimationManager | Could not resolve file for ${effectFile}.`);
            return;
        }

        const seq = new Sequence();
        const effect = seq.effect()
            .name(effectName)
            .file(resolvedFile)
            .atLocation(location)
            .rotate(-rotation)
            .anchor(anchor)
            .size({ width: widthPx * factor, height: heightPx * factor }, { gridUnits: Boolean(gridUnits) })
            .opacity(0.8)
            .belowTokens()
            .persist();

        return seq.play();
    }

    /**
     * Stop and remove persistent Sequencer effects associated with a template or region.
     * @param {Document|string} docOrId - Target document or document ID
     * @returns {void}
     */
    static endPersistedAnimation(docOrId) {
        const id = typeof docOrId === "string" ? docOrId : (docOrId?.id ?? docOrId?._id ?? "");
        if (!id) return;
        const effectName = this.getEffectName(id);

        if (typeof Sequencer !== "undefined" && Sequencer?.EffectManager?.endEffects) {
            try {
                Sequencer.EffectManager.endEffects({ name: effectName });
            } catch (e) {
                log.debug("PersistedAnimationManager.endPersistedAnimation | Error ending effect:", e);
            }
        }
    }
}
