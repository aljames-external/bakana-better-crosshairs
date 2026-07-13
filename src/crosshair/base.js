import { closest } from "../lib/filemanager.js";
import { log } from "../lib/logger.js";
import { crosshairAdapter } from "../adapter/foundry/index.js";
import { resolveCrosshairPlacement, attachWheelRotation, detachWheelRotation, shouldStickToToken, resolveCrosshairIcon, alignCrosshairAndEffects, getGridSnapMode } from "./util.js";

/**
 * Base class for crosshair shape instances, managing Sequencer animations, grid alignments,
 * and independent anchor point calculations for visual effects and Foundry placeable shapes.
 */
export class BaseCrosshairShape {
    /**
     * Create a new crosshair shape instance.
     * @param {object|null} token - Target Token document or placeable object
     * @param {object} [config={}] - Configuration options for the crosshair shape
     */
    constructor(token, config = {}) {
        this.token = token;
        this.config = config;
        this.id = config.id ?? this.getDefaultId();
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

        // Normalize boolean flags on config for clean direct boolean evaluation
        config.token = token;
        config.stickToToken = Boolean(this.stickToToken);
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
        const widthPx = dimensions.widthPx ?? dimensions.width ?? 0;
        const heightPx = dimensions.heightPx ?? dimensions.height ?? widthPx;

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

        if (this.token && this.showLine && !this.stickToToken) {
            seq.effect()
                .name(this.id)
                .file(this.lineFile)
                .attachTo(this.token)
                .stretchTo(crosshair, { attachTo: true })
                .opacity(0.8)
                .locally()
                .persist();
        }

        const { widthPx, heightPx, factor, gridUnits } = this.getGraphicDimensions();
        const effectFile = this.getGraphicFile();

        log.debug(`BaseCrosshairShape.playGraphicEffect | Sizing graphic for "${this.id}":`, {
            widthPx,
            heightPx,
            factor,
            gridUnits,
            animationAnchor: this.animationAnchor
        });

        seq.effect()
            .name(this.id)
            .file(effectFile)
            .attachTo(crosshair)
            .anchor(this.animationAnchor)
            .size({ width: widthPx * factor, height: heightPx * factor }, { gridUnits: Boolean(gridUnits) })
            .opacity(0.8)
            .belowTokens()
            .locally()
            .persist();

        return seq.play();
    }

    /**
     * Resolve the primary graphic asset path or Sequencer key for this shape.
     * Must be overridden by subclasses or provided via config.
     * @returns {string} Fully resolved file path or asset key
     */
    getGraphicFile() {
        if (this.config.file) return closest(this.config.file);
        return "";
    }

    /**
     * Configure and initialize the main Sequencer crosshair `Sequence` chain.
     * @returns {Promise<Array>} A promise resolving to an array `[Sequence, targets]`
     */
    async create() {
        if (this.requiresWheelRotation) {
            attachWheelRotation(null, this.config);
        }

        const crosshairSeq = new Sequence()
            .crosshair("position")
                .type(this.type)
                .borderColor(this.borderColor, { alpha: this.borderAlpha })
                .fillColor(this.fillColor, { alpha: this.fillAlpha });

        this.configureCrosshairShape(crosshairSeq);

        if (this.stickToToken && this.token) {
            crosshairSeq.location(this.token, { lockToEdge: true, lockToEdgeDirection: false });
        } else if (this.config.snapToGrid !== false && this.config.snapToGrid !== "none") {
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
    configureCrosshairShape(crosshairSeq) {}

    /**
     * Execute callback when the crosshair is first shown on canvas.
     * @param {object} crosshair - The active crosshair container/placeable
     * @returns {Promise<void>}
     */
    async onShowCallback(crosshair) {
        if (crosshair) {
            crosshair.shapeInstance = this;
        }
        if (this.requiresWheelRotation) {
            if (crosshair?.pivot?.set) {
                crosshair.pivot.set(0, 0);
            }
            attachWheelRotation(crosshair, this.config);
        }
        await this.playGraphicEffect(crosshair);
        alignCrosshairAndEffects(crosshair, this.config, (this.config.currentDirection ?? this.config.direction ?? 0) * (Math.PI / 180));
    }

    /**
     * Execute callback when the crosshair is placed on canvas.
     * @param {object} crosshair - The placed crosshair object or position coordinates
     * @param {...*} extraArgs - Additional arguments passed by placement callback
     * @returns {Promise<void>}
     */
    async onPlacedCallback(crosshair, ...extraArgs) {
        Sequencer.EffectManager.endEffects({ name: this.id });
        resolveCrosshairPlacement(crosshair, this.config, ...extraArgs);
    }

    /**
     * Execute callback when the crosshair placement is canceled.
     * @returns {void}
     */
    onCancelCallback() {
        if (this.requiresWheelRotation) {
            detachWheelRotation();
        }
        Sequencer.EffectManager.endEffects({ name: this.id });
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
        return Sequencer.EffectManager.endEffects({ name: id, object: token });
    }
}
