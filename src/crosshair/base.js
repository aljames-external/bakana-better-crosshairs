import { MODULE_ID, BROADCAST_INTERVAL_MS } from "../lib/constants.js";
import { socketlib } from "../integration/socketlib.js";
import { closest } from "../lib/filemanager.js";
import { log } from "../lib/logger.js";
import { crosshairAdapter, systemAdapter } from "../adapter/index.js";
import { resolveCrosshairPlacement, attachWheelRotation, detachWheelRotation, shouldStickToToken, resolveCrosshairIcon, alignCrosshairAndEffects, getGridSnapMode, snapCoordinates, activePlacementTracker } from "./util.js";

/**
 * Base class for crosshair shape instances, managing Sequencer animations, grid alignments,
 * and independent anchor point calculations for visual effects and Foundry placeable shapes.
 */
export class BaseCrosshairShape {
    /**
     * Create a new crosshair shape instance.
     * @param {PlaceableObject|Document} placeable - Target template preview placeable or document
     * @param {object} [config={}] - Configuration options for the crosshair shape
     */
    constructor(placeable, config = {}) {
        this.placeable = placeable;
        this.config = config;

        // Entry-boundary normalization for target document and placeable
        const doc = placeable?.document ?? (placeable?.documentName ? placeable : null);
        this.doc = doc;
        const flagsToken = doc?.flags?.bbc?.token ?? doc?.flags?.bakana?.token ?? activePlacementTracker.sticky;
        const rawToken = config.token ?? flagsToken;
        this.token = crosshairAdapter.toToken(rawToken);

        // Normalize config properties using adapter properties extraction
        const docProps = doc ? crosshairAdapter.detectProperties(doc) : {};
        config.radius = config.radius ?? docProps.radius ?? 20;
        config.distance = config.distance ?? docProps.distance ?? 30;
        config.width = config.width ?? docProps.width ?? 5;
        config.angle = config.angle ?? docProps.angle ?? 53.13;

        this.radius = Number(config.radius);
        this.distance = Number(config.distance);
        this.width = Number(config.width);
        this.angle = Number(config.angle);

        const userId = game?.user?.id ?? "local";
        const defaultId = this.getDefaultId();
        this.id = config.id ?? `${defaultId}-${userId}`;
        this.type = this.defaultShapeType;
        this.stickToToken = shouldStickToToken(config, this.type);
        this.context = config.context ?? null;
        this.icon = config.icon ?? "";
        this.borderColor = config.borderColor ?? "#ffffff";
        this.borderAlpha = config.borderAlpha ?? 0;
        this.fillColor = config.fillColor ?? "#000000";
        this.fillAlpha = config.fillAlpha ?? 0;
        this.showLine = config.showLine !== false;
        this._rawLineFile = config.lineFile ?? "eskie.crosshair.line.generic_01.white";

        // Keep a reference to Sequencer visual container
        this.sequencerCrosshair = null;

        // Socket broadcasting state tracking
        this.broadcastTimer = null;
        this.placementId = null;

        // Position and direction state tracking
        const safeGet = (obj, prop) => { if (!obj) return undefined; try { return obj[prop]; } catch (e) { return undefined; } };
        this.x = safeGet(placeable, "x") ?? doc?.x ?? config.x ?? 0;
        this.y = safeGet(placeable, "y") ?? doc?.y ?? config.y ?? 0;
        this.direction = config.direction ?? 0;

        // Normalize boolean flags on config for clean direct boolean evaluation
        config.token = this.token;
        config.stickToToken = Boolean(this.stickToToken);
        config.showLine = this.showLine;
        config.shapeInstance = this;

        // Anchor points normalized (0.0 to 1.0) across bounding box width/height.
        // animationAnchor dictates where the Sequencer graphic effect anchor sits on the canvas point.
        // shapeAnchor dictates where the Foundry placeable (Region or MeasuredTemplate) origin point aligns relative to that canvas point when rotated.
        const defAnimAnchor = this.defaultAnimationAnchor;
        const defShapeAnchor = this.defaultShapeAnchor;
        this.animationAnchor = {
            x: config.animationAnchor?.x ?? defAnimAnchor.x,
            y: config.animationAnchor?.y ?? defAnimAnchor.y
        };
        this.shapeAnchor = {
            x: config.shapeAnchor?.x ?? defShapeAnchor.x,
            y: config.shapeAnchor?.y ?? defShapeAnchor.y
        };
    }

    /**
     * Get the default shape type string for this crosshair (`"circle"`, `"cone"`, `"ray"`, or `"rect"`).
     * @returns {string} The canonical Sequencer/Foundry shape type string
     */
    get defaultShapeType() {
        return "circle";
    }

    /**
     * Get whether this shape type requires mousewheel and pointer rotation listeners.
     * @returns {boolean} Whether wheel rotation is required
     */
    get requiresWheelRotation() {
        return this.type !== "circle";
    }

    /**
     * Get the default identifier string for this crosshair sequence effect.
     * @returns {string} Default effect identifier (`e.g. "Crosshair"`)
     */
    getDefaultId() {
        return "Crosshair";
    }

    /**
     * Get the resolved asset file path or Sequencer key for the optional line connecting token to crosshair.
     * @returns {string} Resolved asset path or key
     */
    get lineFile() {
        return closest(this._rawLineFile);
    }

    /**
     * Get the default normalized animation anchor coordinates (`{ x, y }`).
     * @returns {{x: number, y: number}} Normalized anchor coordinates
     */
    get defaultAnimationAnchor() {
        return { x: 0.5, y: 0.5 };
    }

    /**
     * Get the default normalized Foundry shape anchor coordinates (`{ x, y }`).
     * @returns {{x: number, y: number}} Normalized anchor coordinates
     */
    get defaultShapeAnchor() {
        return { x: 0.5, y: 0.5 };
    }

    /**
     * Calculate rotated world coordinates for the Foundry placeable shape given a cursor/pivot coordinate and rotation angle.
     * When the Sequencer animation rotates around `(cursorX, cursorY)` at its `animationAnchor`, this method returns the exact
     * world coordinate where the Foundry placeable shape with its own `shapeAnchor` must sit so both anchor points coincide.
     * @param {number} cursorX - The x-coordinate of the cursor / Sequencer crosshair pivot on canvas
     * @param {number} cursorY - The y-coordinate of the cursor / Sequencer crosshair pivot on canvas
     * @param {number} directionDeg - Current rotation angle in degrees
     * @param {object} [dimensions={}] - Sizing dimensions (`{ widthPx, heightPx }`) of the shape in canvas pixels
     * @returns {{x: number, y: number}} Corrected placement coordinate for the Foundry placeable shape
     */
    getRotatedShapeCoordinates(cursorX, cursorY, directionDeg, dimensions = {}) {
        const widthPx = dimensions.widthPx ?? 0;
        const heightPx = dimensions.heightPx ?? widthPx;

        const deltaX0 = (this.animationAnchor.x - this.shapeAnchor.x) * widthPx;
        const deltaY0 = (this.animationAnchor.y - this.shapeAnchor.y) * heightPx;

        if (deltaX0 === 0 && deltaY0 === 0) {
            return { x: cursorX, y: cursorY };
        }

        const rad = directionDeg * (Math.PI / 180);
        const cosAngle = Math.cos(rad);
        const sinAngle = Math.sin(rad);

        const deltaXRad = (deltaX0 * cosAngle) - (deltaY0 * sinAngle);
        const deltaYRad = (deltaX0 * sinAngle) + (deltaY0 * cosAngle);

        return {
            x: cursorX + deltaXRad,
            y: cursorY + deltaYRad
        };
    }

    /**
     * Calculate canvas pixel dimensions and grid scale factors for this shape graphic.
     * Must be overridden by subclasses.
     * @returns {{widthPx: number, heightPx: number, factor: number, gridUnits: boolean}} Calculated pixel and scale dimensions
     */
    getGraphicDimensions() {
        return this._getGraphicDimensions();
    }

    /**
     * Protected hook to calculate canvas pixel dimensions for subclass graphics.
     * @protected
     * @returns {{widthPx: number, heightPx: number, factor: number, gridUnits: boolean}}
     */
    _getGraphicDimensions() {
        const { factor, gridUnits } = crosshairAdapter.getTemplatePixelFactor();
        return { widthPx: 100, heightPx: 100, factor, gridUnits };
    }

    /**
     * Render and play the graphic visual sequence effect for the crosshair container.
     * @param {object} crosshair - The Sequencer crosshair placeable/container instance
     * @returns {Promise<any>} A promise resolving when the graphic sequence begins or completes
     */
    async playGraphicEffect(crosshair) {
        const seq = new Sequence().wait(50);

        if (this.type === "circle" && this.token && this.showLine && !this.stickToToken) {
            seq.effect()
                .name(`${this.id}-line`)
                .file(this.lineFile)
                .attachTo(this.token)
                .stretchTo(crosshair, { attachTo: true })
                .opacity(0.8)
                .locally()
                .persist();
        }

        const { widthPx, heightPx, factor, gridUnits } = this.getGraphicDimensions();
        const effectFile = this.getGraphicFile();
        if (!effectFile) {
            log.debug(`BaseCrosshairShape.playGraphicEffect | No valid graphic file for "${this.id}". Skipping effect.`);
            return seq.play();
        }

        log.debug(`BaseCrosshairShape.playGraphicEffect | Sizing graphic for "${this.id}":`, {
            widthPx,
            heightPx,
            factor,
            gridUnits,
            animationAnchor: this.animationAnchor
        });

        const isRemote = !(crosshair && (crosshair.parent || crosshair.transform || typeof crosshair.addChild === "function"));
        const isSticky = Boolean(this.stickToToken && this.token);
        const attachOptions = {
            bindRotation: !isRemote,
            ...((this.type === "rect" && !isSticky) ? { align: "top-left" } : {})
        };
        seq.effect()
            .name(this.id)
            .file(effectFile)
            .attachTo(crosshair, attachOptions)
            .anchor(this.animationAnchor)
            .size({ width: widthPx * factor, height: heightPx * factor }, { gridUnits: Boolean(gridUnits) })
            .opacity(0.8)
            .belowTokens()
            .locally()
            .persist();

        if (this.icon) {
            const iconPath = resolveCrosshairIcon(this.icon);
            if (iconPath) {
                seq.effect()
                    .name(`${this.id}-icon`)
                    .file(iconPath)
                    .attachTo(crosshair, attachOptions)
                    .size(50, { gridUnits: false })
                    .opacity(0.9)
                    .locally()
                    .persist();
            }
        }

        return seq.play();
    }

    /**
     * Resolve the primary graphic asset path or Sequencer key for this shape.
     * Must be overridden by subclasses or provided via config.
     * @returns {string} Fully resolved file path or asset key
     */
    getGraphicFile() {
        return this._getGraphicFile();
    }

    /**
     * Protected hook to resolve graphic asset path or Sequencer key for subclass graphics.
     * @protected
     * @returns {string}
     */
    _getGraphicFile() {
        if (this.config.file) return closest(this.config.file);
        return "";
    }

    /**
     * Configure and initialize the main Sequencer crosshair `Sequence` chain.
     * @returns {Promise<Array>} A promise resolving to an array `[Sequence, targets]`
     */
    async create() {
        const crosshairSeq = new Sequence()
            .crosshair("position")
                .type(this.type)
                .borderColor(this.borderColor, { alpha: this.borderAlpha })
                .fillColor(this.fillColor, { alpha: this.fillAlpha });

        this.configureCrosshairShape(crosshairSeq);

        if (this.stickToToken && this.token) {
            crosshairSeq.location(this.token, { lockToEdge: true, lockToEdgeDirection: false });
        } else {
            const locationOpts = {};
            if (this.token && this.config.showRange !== false) {
                locationOpts.showRange = true;
            }
            const limitRangeEnabled = this.config.limitRange !== false;
            const maxRange = limitRangeEnabled ? (this.config.maxRange ?? systemAdapter?.getItemMaxRange?.(this.config.item, this.config.activity)) : null;
            if (this.token && Number.isFinite(maxRange) && maxRange > 0) {
                locationOpts.limitMaxRange = maxRange;
                locationOpts.displayRangePoly = true;
            }
            if (this.token && Object.keys(locationOpts).length > 0) {
                crosshairSeq.location(this.token, locationOpts);
            }
            const snapMode = getGridSnapMode(this.config);
            if (snapMode !== 0) crosshairSeq.snapPosition(snapMode);
        }

        if (this.icon) {
            crosshairSeq.icon(resolveCrosshairIcon(this.icon));
        }

        crosshairSeq
            .callback(Sequencer.Crosshair.CALLBACKS.SHOW, async (crosshair) => {
                await this.onShowCallback(crosshair);
            })
            .callback(Sequencer.Crosshair.CALLBACKS.PLACED, async (...args) => {
                await this.onPlacedCallback(...args);
            })
            .callback(Sequencer.Crosshair.CALLBACKS.CANCEL, () => {
                this.onCancelCallback();
            });

        return [crosshairSeq, undefined];
    }

    /**
     * Configure shape-specific properties (distance, angle, width) on the Sequencer crosshair chain.
     * Intended to be overridden by subclasses.
     * @param {Sequence} crosshairSeq - The Sequencer crosshair builder instance
     * @returns {void}
     */
    configureCrosshairShape(crosshairSeq) {
        this._configureCrosshairShape(crosshairSeq);
    }

    /**
     * Protected hook to configure shape-specific properties on the Sequencer crosshair chain.
     * @protected
     * @param {Sequence} crosshairSeq - The Sequencer crosshair builder instance
     * @returns {void}
     */
    _configureCrosshairShape(crosshairSeq) {}

    /**
     * Execute callback when the crosshair is first shown on canvas.
     * @param {object} crosshair - The active crosshair container/placeable
     * @returns {Promise<void>}
     */
    async onShowCallback(crosshair) {
        if (crosshair) {
            this.sequencerCrosshair = crosshair;
            crosshair.shapeInstance = this;
            activePlacementTracker.crosshair = crosshair;
        }
        if ((this.type === "rect" || this.type === "square") && !this.stickToToken && !this.token && crosshair?.pivot?.set) {
            crosshair.pivot.set(0, 0);
        }
        attachWheelRotation(this, this.config);
        await this.playGraphicEffect(crosshair);
        alignCrosshairAndEffects(crosshair, this.config, this.direction * (Math.PI / 180));
        this._updateRangeText();
        this.startBroadcasting();
    }

    /**
     * Start periodic socket broadcasting of local crosshair state to peer clients.
     * Cadence interval defined by BROADCAST_INTERVAL_MS (200ms = 5Hz).
     * @returns {void}
     */
    startBroadcasting() {
        if (!game?.user || !game?.settings) return;
        const broadcastEnabled = game.settings.get(MODULE_ID, "enableCrosshairBroadcasting") !== false;
        if (!broadcastEnabled) return;

        this.stopBroadcasting();

        const getLiveState = () => {
            let x = this.x;
            let y = this.y;
            if (this.sequencerCrosshair && Number.isFinite(this.sequencerCrosshair.x) && Number.isFinite(this.sequencerCrosshair.y)) {
                x = this.sequencerCrosshair.x;
                y = this.sequencerCrosshair.y;
            } else if (canvas?.mousePosition && Number.isFinite(canvas.mousePosition.x) && Number.isFinite(canvas.mousePosition.y)) {
                x = canvas.mousePosition.x;
                y = canvas.mousePosition.y;
            }

            let direction = this.config?.currentDirection ?? this.direction ?? 0;
            if (this.sequencerCrosshair && Number.isFinite(this.sequencerCrosshair.direction)) {
                direction = this.sequencerCrosshair.direction;
            } else if (this.sequencerCrosshair && Number.isFinite(this.sequencerCrosshair.rotation)) {
                direction = this.sequencerCrosshair.rotation * (180 / Math.PI);
            }

            return {
                x,
                y,
                direction,
                distance: this.distance,
                width: this.width,
                angle: this.angle
            };
        };

        const live = getLiveState();
        this.placementId = `${game.user.id}_${this.id}_${Date.now()}`;
        const initialPayload = {
            type: "CROSSHAIR_START",
            placementId: this.placementId,
            senderUserId: game.user.id,
            shapeType: this.type,
            file: this.getGraphicFile(),
            lineFile: this.lineFile,
            icon: this.icon,
            fillColor: this.fillColor,
            fillAlpha: this.fillAlpha,
            borderColor: this.borderColor,
            borderAlpha: this.borderAlpha,
            distance: live.distance,
            width: live.width,
            angle: live.angle,
            direction: live.direction,
            tokenId: this.token?.id ?? null,
            stickToToken: Boolean(this.stickToToken && this.token),
            showLine: Boolean(this.showLine),
            x: live.x,
            y: live.y
        };

        socketlib.emit(initialPayload);

        this.broadcastTimer = setInterval(() => {
            if (!this.placementId) return;
            const updated = getLiveState();
            socketlib.emit({
                type: "CROSSHAIR_UPDATE",
                placementId: this.placementId,
                senderUserId: game.user.id,
                x: updated.x,
                y: updated.y,
                direction: updated.direction,
                distance: updated.distance,
                width: updated.width,
                angle: updated.angle
            });
        }, BROADCAST_INTERVAL_MS);
    }

    /**
     * Stop periodic socket broadcasting and emit completion payload to peer clients.
     * @param {string} [reason="placed"] - Termination reason ("placed" or "canceled")
     * @returns {void}
     */
    stopBroadcasting(reason = "placed") {
        if (this.broadcastTimer) {
            clearInterval(this.broadcastTimer);
            this.broadcastTimer = null;
        }

        if (this.placementId) {
            socketlib.emit({
                type: "CROSSHAIR_END",
                placementId: this.placementId,
                senderUserId: game.user.id,
                reason
            });
            this.placementId = null;
        }
    }

    /**
     * Helper to destroy and detach live range text overlay if present.
     * @protected
     * @returns {void}
     */
    _destroyRangeText() {
        if (this._rangeText) {
            try {
                if (this._rangeText.parent && typeof this._rangeText.parent.removeChild === "function") {
                    this._rangeText.parent.removeChild(this._rangeText);
                }
                if (typeof this._rangeText.destroy === "function") {
                    this._rangeText.destroy({ children: true });
                }
            } catch (e) {}
            this._rangeText = null;
        }
    }

    /**
     * Helper to update live grid distance measurement text beneath the reticle.
     * @protected
     * @returns {void}
     */
    _updateRangeText() {
        if (this.stickToToken || !this.token || this.config.showRange === false || !this.sequencerCrosshair) {
            if (this._rangeText) this._rangeText.visible = false;
            return;
        }
        const origin = this.token.center ?? { x: this.token.x ?? 0, y: this.token.y ?? 0 };
        const targetX = (this.sequencerCrosshair && Number.isFinite(this.sequencerCrosshair.x)) ? this.sequencerCrosshair.x : this.x;
        const targetY = (this.sequencerCrosshair && Number.isFinite(this.sequencerCrosshair.y)) ? this.sequencerCrosshair.y : this.y;
        const target = { x: targetX, y: targetY };
        let distance = 0;
        try {
            if (canvas?.grid && typeof canvas.grid.measurePath === "function") {
                const measured = canvas.grid.measurePath([origin, target]);
                distance = measured?.distance ?? 0;
            } else if (canvas?.grid && typeof canvas.grid.measureDistance === "function") {
                distance = Math.round(canvas.grid.measureDistance(origin, target) * 10) / 10;
            } else if (canvas?.dimensions) {
                const distPx = Math.hypot(target.x - origin.x, target.y - origin.y);
                const gridDist = canvas.dimensions.distance ?? 5;
                const gridSize = canvas.dimensions.size ?? 100;
                distance = Math.round((distPx / gridSize) * gridDist);
            }
        } catch (e) {
            const distPx = Math.hypot(target.x - origin.x, target.y - origin.y);
            const gridDist = canvas?.dimensions?.distance ?? 5;
            const gridSize = canvas?.dimensions?.size ?? 100;
            distance = Math.round((distPx / gridSize) * gridDist);
        }

        const units = canvas?.grid?.units ?? canvas?.dimensions?.units ?? "ft";
        const labelStr = `${distance} ${units}`;

        if (!this._rangeText) {
            const TextClass = foundry?.canvas?.containers?.PreciseText ?? PreciseText ?? PIXI?.Text;
            if (!TextClass) return;
            const style = CONFIG?.canvasTextStyle
                ? CONFIG.canvasTextStyle.clone()
                : {
                    fontFamily: "Signika, sans-serif",
                    fontSize: 24,
                    fill: "#ffffff",
                    stroke: "#000000",
                    strokeThickness: 4,
                    align: "center"
                };
            if (style) style.align = "center";
            try {
                this._rangeText = new TextClass(labelStr, style);
                if (this._rangeText.anchor && typeof this._rangeText.anchor.set === "function") {
                    this._rangeText.anchor.set(0.5, 1);
                }
                const parentContainer = this.sequencerCrosshair.parent ?? canvas?.controls ?? canvas?.stage ?? this.sequencerCrosshair;
                if (typeof parentContainer.addChild === "function") {
                    parentContainer.addChild(this._rangeText);
                }
            } catch (e) {
                log.debug("BaseCrosshairShape._updateRangeText | Could not create range text element:", e);
                return;
            }
        } else {
            const targetParent = this.sequencerCrosshair.parent ?? canvas?.controls ?? canvas?.stage ?? this.sequencerCrosshair;
            if (this._rangeText.parent !== targetParent && typeof targetParent.addChild === "function") {
                try { targetParent.addChild(this._rangeText); } catch (e) {}
            }
        }

        this._rangeText.text = labelStr;
        this._rangeText.visible = true;
        if (this._rangeText.parent !== this.sequencerCrosshair) {
            if (this._rangeText.position && typeof this._rangeText.position.set === "function") {
                this._rangeText.position.set(target.x, target.y - 25);
            }
            try { this._rangeText.rotation = 0; } catch (e) {}
        } else {
            if (this._rangeText.position && typeof this._rangeText.position.set === "function") {
                this._rangeText.position.set(0, -25);
            }
            try { this._rangeText.rotation = -(this.sequencerCrosshair.rotation ?? 0); } catch (e) {}
        }
    }

    /**
     * Execute callback when the crosshair is placed on canvas.
     * @param {object} crosshair - The placed crosshair object or position coordinates
     * @param {...*} extraArgs - Additional arguments passed by placement callback
     * @returns {Promise<void>}
     */
    async onPlacedCallback(crosshair, ...extraArgs) {
        this.stopBroadcasting("placed");
        this._destroyRangeText();
        Sequencer.EffectManager.endEffects({ name: this.id });
        Sequencer.EffectManager.endEffects({ name: `${this.id}-line` });
        resolveCrosshairPlacement(this, this.config, ...extraArgs);
    }

    /**
     * Execute callback when the crosshair placement is canceled.
     * @returns {void}
     */
    onCancelCallback() {
        this.stopBroadcasting("canceled");
        this._destroyRangeText();
        detachWheelRotation();
        Sequencer.EffectManager.endEffects({ name: this.id });
        Sequencer.EffectManager.endEffects({ name: `${this.id}-line` });
        if (this.context && typeof this.context.cancel === "function") {
            this.context.cancel();
        }
    }

    /**
     * Create and immediately execute the crosshair sequence.
     * @returns {Promise<any>} A promise resolving when the crosshair sequence begins playing
     */
    async play() {
        const [seq] = await this.create();
        return seq.play();
    }

    /**
     * Stop and terminate active visual effects associated with a target token and effect identifier.
     * @param {object|null} token - Target Token object
     * @param {object} [options={}] - Options for stopping effects
     * @param {string} [options.id] - The identifier of the effect to end
     * @returns {Promise<void>} A promise resolving when matching effects have been terminated
     */
    static async stop(token, options = {}) {
        const id = options?.id ?? "Crosshair";
        await Sequencer.EffectManager.endEffects({ name: id, object: token });
        return Sequencer.EffectManager.endEffects({ name: `${id}-line`, object: token });
    }

    /**
     * Hide the template preview placeable on canvas.
     */
    hide() {
        crosshairAdapter.hidePreview(this.placeable);
    }

    /**
     * Update the visual position of BOTH the Sequencer graphic and the hidden Foundry placeable template.
     * @param {number} x - New target X coordinate (pre-snapping)
     * @param {number} y - New target Y coordinate (pre-snapping)
     */
    move(x, y) {
        let targetX = x;
        let targetY = y;

        if (this.stickToToken && this.token) {
            const anchored = crosshairAdapter.resolveAnchorPlacement(this.token, { x, y });
            targetX = anchored.x;
            targetY = anchored.y;
            if (anchored.direction !== undefined && this.config.currentDirection === undefined) {
                this.direction = anchored.direction;
            }
        } else {
            const snapMode = getGridSnapMode(this.config);
            if (snapMode !== 0) {
                const snapped = snapCoordinates(targetX, targetY, snapMode);
                targetX = snapped.x;
                targetY = snapped.y;
            }
        }

        if (this.x === targetX && this.y === targetY) {
            return;
        }

        this.x = targetX;
        this.y = targetY;

        const isAttached = Boolean(this.stickToToken && this.token);
        if (this.sequencerCrosshair && !isAttached) {
            this.sequencerCrosshair.x = targetX;
            this.sequencerCrosshair.y = targetY;
        }

        this._updateRangeText();
        this.refreshTemplateHighlights();
    }

    /**
     * Update the rotation/direction of BOTH the Sequencer graphic and the hidden Foundry placeable template.
     * @param {number} newAngleDeg - New direction in degrees
     * @param {boolean} [refresh=true] - Whether to trigger immediate template rendering refresh
     */
    rotate(newAngleDeg, refresh = true) {
        if (!crosshairAdapter.supportsShapeRotation(this.type)) {
            return;
        }

        if (typeof newAngleDeg === "number" && Number.isFinite(newAngleDeg)) {
            while (newAngleDeg < 0) newAngleDeg += 360;
            newAngleDeg = newAngleDeg % 360;
        } else {
            newAngleDeg = 0;
        }

        this.direction = newAngleDeg;
        const rad = newAngleDeg * (Math.PI / 180);

        if (this.config) {
            this.config.currentDirection = newAngleDeg;
            this.config.direction = newAngleDeg;
            this.config.rotation = rad;
        }

        if (this.sequencerCrosshair && !this.sequencerCrosshair.destroyed) {
            const isRect = this.type === "rect" || this.type === "square";
            const isAttached = Boolean(this.stickToToken && this.token);
            if (!isAttached) {
                this.sequencerCrosshair.direction = newAngleDeg;
                if (!isRect) {
                    this.sequencerCrosshair.rotation = rad;
                } else {
                    this.sequencerCrosshair.rotation = 0;
                }
                if (this.sequencerCrosshair.config) {
                    this.sequencerCrosshair.config.direction = newAngleDeg;
                    this.sequencerCrosshair.config.rotation = rad;
                }
                if (this.sequencerCrosshair.data) {
                    this.sequencerCrosshair.data.direction = newAngleDeg;
                    this.sequencerCrosshair.data.rotation = rad;
                }
            } else {
                this.sequencerCrosshair.direction = 0;
                this.sequencerCrosshair.rotation = 0;
                if (this.sequencerCrosshair.config) {
                    this.sequencerCrosshair.config.direction = 0;
                    this.sequencerCrosshair.config.rotation = 0;
                }
                if (this.sequencerCrosshair.data) {
                    this.sequencerCrosshair.data.direction = 0;
                    this.sequencerCrosshair.data.rotation = 0;
                }
            }

            alignCrosshairAndEffects(this.sequencerCrosshair, this.config, rad);
        }

        const doc = this.doc;
        if (doc) {
            doc.direction = newAngleDeg;
        }
        if (this.placeable) {
            this.placeable.direction = newAngleDeg;
        }

        if (refresh) {
            this.refreshTemplateHighlights();

            if (this.sequencerCrosshair) {
                if (typeof this.sequencerCrosshair.refresh === "function") {
                    this.sequencerCrosshair.refresh();
                }
            }
        }
    }

    /**
     * Refresh the template rendering highlights and update preview shape coordinates.
     */
    refreshTemplateHighlights() {
        const doc = this.doc;
        if (doc) {
            const dims = this.placeable?.dimensions ?? doc.dimensions ?? activePlacementTracker.dimensions;
            const docProps = crosshairAdapter.detectProperties(doc);
            const initialDist = dims?.distance ?? docProps.distance;
            const initialWidth = dims?.width ?? docProps.width;
            const isGridUnits = dims?.gridUnits ?? true;
            const shapeType = this.type ?? this.config?.type ?? "circle";

            crosshairAdapter.updatePreviewShape(doc, {
                x: this.x,
                y: this.y,
                direction: this.direction,
                rotation: this.direction,
                distance: initialDist,
                radius: initialDist,
                width: initialWidth,
                sticky: this.stickToToken,
                gridUnits: isGridUnits,
                type: shapeType,
                originalType: this.config?.originalType,
                t: shapeType === "square" ? "rect" : shapeType
            });

            if (this.placeable?.document) {
                try {
                    this.placeable.x = doc.x;
                    this.placeable.y = doc.y;
                } catch (e) {}
            }
        }
        if (crosshairAdapter?.refreshTemplateHighlights && this.placeable) {
            try {
                crosshairAdapter.refreshTemplateHighlights(this.placeable, this.direction);
            } catch (e) {
                log.debug("BaseCrosshairShape.refreshTemplateHighlights | Adapter refresh call failed gracefully:", e);
            }
        }
    }

    /**
     * Return updates for placement document by delegating coordinate formatting to the adapter.
     * @returns {{x: number, y: number, direction: number}} Formatted placement coordinates object
     */
    getPlacementUpdates() {
        let posX = this.x;
        let posY = this.y;
        if (this.sequencerCrosshair && Number.isFinite(this.sequencerCrosshair.x) && Number.isFinite(this.sequencerCrosshair.y)) {
            posX = this.sequencerCrosshair.x;
            posY = this.sequencerCrosshair.y;
        }
        return crosshairAdapter.formatPlacementCoordinates(posX, posY, this.direction, this.config);
    }
}
