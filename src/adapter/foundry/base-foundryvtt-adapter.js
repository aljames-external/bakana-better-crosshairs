import { systemAdapter } from "../system/index.js";
import { log } from "../../lib/logger.js";

export class BaseFoundryVTTAdapter {
    constructor() {
        this.version = 0;
    }

    /**
     * Extract normalized calling item and activity context from a Foundry document.
     * @param {Document} doc - The template or region document
     * @returns {{item: Item|null, itemName: string, itemId: string, activity: Object|null, activityName: string, activityId: string}}
     */
    extractCallingContext(target) {
        if (!target) return { item: null, itemName: "", itemId: "", activity: null, activityName: "", activityId: "" };
        const document = target.document ?? target;
        const itemObj = document.item || target.item || null;
        const activityObj = document.activity || target.activity || null;

        const baseContext = {
            item: itemObj,
            itemName: itemObj?.name || "",
            itemId: itemObj?.id || "",
            activity: activityObj,
            activityName: activityObj?.name || "",
            activityId: activityObj?.id || activityObj?._id || ""
        };

        const result = systemAdapter.extractCallingContext(document, baseContext);

        log.info("BaseFoundryVTTAdapter.extractCallingContext | Result from systemAdapter:", {
            itemName: result.itemName,
            itemId: result.itemId,
            activityName: result.activityName,
            activityId: result.activityId
        });

        return result;
    }

    /**
     * Filter and match autorec candidates for a Foundry document (MeasuredTemplate / Region)
     * by calling the system adapter to decide whether an entry should replace the default crosshair.
     * @param {Document} doc - The template or region document
     * @param {Map<string, Object>} entries - Registered autorec entries map
     * @returns {Object|null} The matching autorec entry or null
     */
    matchAutorecEntry(doc, entries) {
        if (!doc || !entries) return null;
        const context = this.extractCallingContext(doc);
        if (!context.itemName && !context.itemId) {
            log.info("matchAutorecEntry | Could not extract calling item context (missing itemName and itemId) from document:", { doc, context });
            return null;
        }

        log.info("matchAutorecEntry | Comparing calling context against registered entries:", {
            callingItemName: context.itemName,
            callingActivityName: context.activityName,
            entriesCount: entries.size
        });

        // 1. Group candidate entries for this item and order: activity-specific rules first, item fallbacks last
        const candidateEntries = [];
        for (const [key, entry] of entries.entries()) {
            if (key === "DEFAULT" || entry.isDefault || entry.itemName === "DEFAULT") continue;
            if (entry.enabled === false) continue;
            const entryItemName = (entry.itemName || key.split(" | ")[0] || "").trim().toLowerCase();
            if (entryItemName === context.itemName.toLowerCase() || key.toLowerCase() === context.itemName.toLowerCase()) {
                candidateEntries.push(entry);
            }
        }

        candidateEntries.sort((a, b) => {
            const aHasAct = Boolean((a.activityId || a.activityName || "").trim());
            const bHasAct = Boolean((b.activityId || b.activityName || "").trim());
            if (aHasAct && !bHasAct) return -1;
            if (!aHasAct && bHasAct) return 1;
            return 0;
        });

        for (const entry of candidateEntries) {
            if (systemAdapter.shouldReplace(context, entry)) {
                log.info(`matchAutorecEntry | [MATCH FOUND] Specific entry "${entry.itemName}" (activity: "${entry.activityName || 'ANY'}") matched calling item "${context.itemName}" (activity: "${context.activityName}")`);
                return { ...entry, item: context.item, activity: context.activity };
            }
        }

        // 2. If no specific match was found, fall back to the DEFAULT entry if enabled
        const defaultEntry = entries.get("DEFAULT");
        if (defaultEntry && defaultEntry.enabled !== false) {
            log.info(`matchAutorecEntry | [DEFAULT FALLBACK] No specific item match found for "${context.itemName}"; applying DEFAULT crosshair entry.`);
            return { ...defaultEntry, item: context.item, activity: context.activity };
        }

        log.info(`matchAutorecEntry | [NO MATCH] No matching autorec entry or enabled DEFAULT entry for calling item "${context.itemName}" (activity: "${context.activityName}")`);
        return null;
    }




    /**
     * Hide a live placeable preview graphic during interactive drawing.

     * Common across Foundry v12..v14+ placement previews.
     * @param {PlaceableObject} placeable
     */
    hidePreview(placeable) {
        if (!placeable) return;
        placeable.visible = false;
        placeable.renderable = false;
        placeable.alpha = 0;
        if (placeable.template) {
            placeable.template.visible = false;
            placeable.template.renderable = false;
            placeable.template.alpha = 0;
        }
        if (placeable.ruler) {
            placeable.ruler.visible = false;
            placeable.ruler.renderable = false;
            placeable.ruler.text = "";
        }
        if (placeable.controlIcon) {
            placeable.controlIcon.visible = false;
        }
        if (typeof placeable.highlightGrid === "function") {
            placeable.highlightGrid = function() {};
        }
        if (placeable.highlightId && canvas.grid?.clearHighlightLayer) {
            try { canvas.grid.clearHighlightLayer(placeable.highlightId); } catch (e) {}
        }

        placeable.refresh = function() {
            this.visible = false;
            this.renderable = false;
            this.alpha = 0;
            if (this.template) {
                this.template.visible = false;
                this.template.renderable = false;
                this.template.alpha = 0;
            }
            if (this.ruler) {
                this.ruler.visible = false;
                this.ruler.renderable = false;
                this.ruler.text = "";
            }
            if (this.controlIcon) {
                this.controlIcon.visible = false;
            }
            if (this.highlightId && canvas.grid?.clearHighlightLayer) {
                try { canvas.grid.clearHighlightLayer(this.highlightId); } catch (e) {}
            }
            return this;
        };
    }

    /**
     * Extract normalized placed fill/border styling values and flags from workflow configuration.
     * Shared across V12 and V14 document updates.
     * @param {Object} [config={}]
     * @returns {{placedFillColor?: string, placedFillAlpha?: number, placedBorderColor?: string, placedBorderAlpha?: number, flags: Object}}
     */
    extractPlacedStylingFlags(config = {}) {
        const placedFillColor = config.placedFillColor || config.templateFillColor;
        const placedFillAlpha = config.placedFillAlpha !== undefined ? config.placedFillAlpha : config.templateFillAlpha;
        const placedBorderColor = config.placedBorderColor || config.templateBorderColor;
        const placedBorderAlpha = config.placedBorderAlpha !== undefined ? config.placedBorderAlpha : config.templateBorderAlpha;

        const flags = {
            bbc: { placedFillColor, placedFillAlpha, placedBorderColor, placedBorderAlpha }
        };

        return { placedFillColor, placedFillAlpha, placedBorderColor, placedBorderAlpha, flags };
    }

    registerPlacementHooks(callbacks) {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement registerPlacementHooks(callbacks).");
    }

    detectProperties(doc) {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement detectProperties(doc).");
    }

    updatePreviewShape(previewDoc, coords) {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement updatePreviewShape(previewDoc, coords).");
    }

    formatDocumentUpdate(doc, coords, config) {
        throw new Error("Subclasses of BaseFoundryVTTAdapter must implement formatDocumentUpdate(doc, coords, config).");
    }

    /**
     * Resolve placement anchor coordinates {x, y, direction} on a token's edge toward a click coordinate.
     * Takes only the token object and {x, y} click coordinates.
     * Implements 1-to-1 the exact algorithm from Sequencer 4.2.2 (#handleLockedEdge in CrosshairsPlaceable.js).
     */
    resolveAnchorPlacement(token, clickCoords = {}) {
        const rawClickX = clickCoords.x ?? 0;
        const rawClickY = clickCoords.y ?? 0;
        if (!token) return { x: rawClickX, y: rawClickY, direction: 0 };

        const tok = token instanceof Token ? token : (token.object instanceof Token ? token.object : token);
        const centerMode = typeof CONST !== "undefined" && CONST.GRID_SNAPPING_MODES ? CONST.GRID_SNAPPING_MODES.CENTER : 1;
        const edgeMidpointMode = typeof CONST !== "undefined" && CONST.GRID_SNAPPING_MODES ? CONST.GRID_SNAPPING_MODES.EDGE_MIDPOINT : 16;
        const size = canvas?.grid?.size || 100;

        const snapPt = (pt, mode) => {
            if (canvas?.grid?.getSnappedPoint) {
                try { return canvas.grid.getSnappedPoint(pt, { mode, resolution: size }); } catch (e) {}
            }
            return pt;
        };

        const snappedMouse = snapPt({ x: rawClickX, y: rawClickY }, centerMode);

        const tx = tok.x || 0;
        const ty = tok.y || 0;
        const w = tok.w || tok.hitArea?.width || size;
        const h = tok.h || tok.hitArea?.height || size;

        const points = [tx, ty, tx + w, ty, tx + w, ty + h, tx, ty + h];

        const centerPoint = typeof tok.getCenterPoint === "function"
            ? tok.getCenterPoint()
            : { x: tok.center?.x ?? (tx + w / 2), y: tok.center?.y ?? (ty + h / 2) };

        const RayClass = foundry?.canvas?.geometry?.Ray ?? globalThis.Ray;
        if (!RayClass) {
            return { x: centerPoint.x, y: centerPoint.y, direction: 0 };
        }

        const ray = new RayClass(centerPoint, snappedMouse);
        let intersection = null;
        for (let i = 0; i < points.length; i += 2) {
            const p1 = { x: points[i], y: points[i + 1] };
            const p2Idx = (i + 2) >= points.length ? 0 : (i + 2);
            const p2 = { x: points[p2Idx], y: points[p2Idx + 1] };
            intersection = ray.intersectSegment([p1.x, p1.y, p2.x, p2.y]);
            if (intersection) break;
        }

        if (!intersection) {
            const angleRad = Math.atan2(snappedMouse.y - centerPoint.y, snappedMouse.x - centerPoint.x);
            let dir = angleRad * (180 / Math.PI);
            if (dir < 0) dir += 360;
            return { x: centerPoint.x, y: centerPoint.y, direction: dir };
        }

        let snappedIntersection = snapPt(intersection, edgeMidpointMode);

        const isSquareGrid = canvas?.scene?.grid?.type === (typeof CONST !== "undefined" ? CONST.GRID_TYPES?.SQUARE : 1);
        if (isSquareGrid) {
            const left = snappedMouse.x < points[0];
            const above = snappedMouse.y < points[1];
            const right = snappedMouse.x > points[2];
            const below = snappedMouse.y > points[5];
            if ((left || right) && (below || above)) {
                snappedIntersection.x = left ? points[0] - size : (right ? points[2] + size : snappedIntersection.x);
                snappedIntersection.y = above ? points[1] - size : (right ? points[5] + size : snappedIntersection.y);
                if (above && left) {
                    snappedIntersection.x = points[0];
                    snappedIntersection.y = points[1];
                } else if (above && right) {
                    snappedIntersection.x = points[2];
                    snappedIntersection.y = points[3];
                } else if (below && right) {
                    snappedIntersection.x = points[4];
                    snappedIntersection.y = points[5];
                } else if (below && left) {
                    snappedIntersection.x = points[6];
                    snappedIntersection.y = points[7];
                }
            }
        }

        const dragAngle = (new RayClass(snappedIntersection, snappedMouse)).angle;
        let direction = dragAngle * (180 / Math.PI);
        if (direction < 0) direction += 360;

        return {
            x: snappedIntersection.x,
            y: snappedIntersection.y,
            direction
        };
    }

    /**
     * Return template pixel multiplier factor and gridUnits mode for Sequencer effects.
     */
    getTemplatePixelFactor() {
        return { factor: 1, gridUnits: false };
    }
}

