import { Ray } from "./compat.js";

/**
 * Unified geometric utilities for token bounding boxes, ray-casting perimeter intersections,
 * and 8-way sticky corner calculations.
 */
export class TokenGeometry {
    /**
     * Normalize an angle in degrees to the [0, 360) range.
     * @param {number} angleDeg - Raw angle in degrees
     * @returns {number} Normalized angle in degrees [0, 360)
     */
    static normalizeAngle(angleDeg) {
        if (typeof angleDeg !== "number" || !Number.isFinite(angleDeg)) return 0;
        let norm = angleDeg % 360;
        if (norm < 0) norm += 360;
        return norm;
    }

    /**
     * Calculate angle in radians and degrees from origin to target.
     * @param {{x: number, y: number}} origin - Origin point
     * @param {{x: number, y: number}} target - Target point
     * @returns {{rad: number, deg: number}} Calculated angles
     */
    static calculateAngle(origin, target) {
        const dx = target.x - origin.x;
        const dy = target.y - origin.y;
        const rad = Math.atan2(dy, dx);
        const deg = this.normalizeAngle(rad * (180 / Math.PI));
        return { rad, deg };
    }

    /**
     * Extract canonical bounding box and center point from a Token object or document.
     * @param {object} token - Target Token placeable or document
     * @returns {{x: number, y: number, w: number, h: number, center: {x: number, y: number}}} Bounding box data
     */
    static getBounds(token) {
        const size = canvas?.grid?.size ?? 100;
        const tx = token?.x ?? token?.document?.x ?? 0;
        const ty = token?.y ?? token?.document?.y ?? 0;
        const tokenWidth = token?.document?.width ?? token?.width ?? 1;
        const tokenHeight = token?.document?.height ?? token?.height ?? 1;
        const w = token?.w ?? (tokenWidth * size);
        const h = token?.h ?? (tokenHeight * size);
        const center = token?.center ?? token?.document?.center ?? { x: tx + w / 2, y: ty + h / 2 };
        return { x: tx, y: ty, w, h, center };
    }

    /**
     * Resolve the exact perimeter intersection point and facing direction for anchoring crosshairs to a token edge.
     * Implements 1-to-1 the exact algorithm from Sequencer (#handleLockedEdge in CrosshairsPlaceable.js).
     * @param {object} token - The source Token object
     * @param {{x?: number, y?: number}} [clickCoords={}] - Target cursor coordinates
     * @returns {{x: number, y: number, direction: number}} Resolved anchor placement
     */
    static resolveAnchorPlacement(token, clickCoords = {}) {
        const rawClickX = clickCoords.x ?? 0;
        const rawClickY = clickCoords.y ?? 0;
        if (!token) return { x: rawClickX, y: rawClickY, direction: 0 };

        const { x: tx, y: ty, w, h, center: centerPoint } = this.getBounds(token);
        const targetMouse = { x: rawClickX, y: rawClickY };

        const dx = targetMouse.x - centerPoint.x;
        const dy = targetMouse.y - centerPoint.y;
        const dist = Math.hypot(dx, dy);

        let farPoint = targetMouse;
        if (dist > 0) {
            const scale = Math.max(10000, (w + h) * 10) / dist;
            farPoint = {
                x: centerPoint.x + dx * scale,
                y: centerPoint.y + dy * scale
            };
        }

        const points = [tx, ty, tx + w, ty, tx + w, ty + h, tx, ty + h];

        let intersection = null;
        if (typeof foundry?.utils?.lineSegmentIntersection === "function") {
            for (let i = 0; i < points.length; i += 2) {
                const p1 = { x: points[i], y: points[i + 1] };
                const p2Idx = (i + 2) >= points.length ? 0 : (i + 2);
                const p2 = { x: points[p2Idx], y: points[p2Idx + 1] };
                intersection = foundry.utils.lineSegmentIntersection(centerPoint, farPoint, p1, p2);
                if (intersection) break;
            }
        }

        if (!intersection && Ray) {
            const ray = new Ray(centerPoint, farPoint);
            if (typeof ray.intersectSegment === "function") {
                for (let i = 0; i < points.length; i += 2) {
                    const p1 = { x: points[i], y: points[i + 1] };
                    const p2Idx = (i + 2) >= points.length ? 0 : (i + 2);
                    const p2 = { x: points[p2Idx], y: points[p2Idx + 1] };
                    intersection = ray.intersectSegment([p1.x, p1.y, p2.x, p2.y]);
                    if (intersection) break;
                }
            }
        }

        if (!intersection) {
            const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
            intersection = {
                x: clamp(targetMouse.x, tx, tx + w),
                y: clamp(targetMouse.y, ty, ty + h)
            };
        }

        const dxPivot = targetMouse.x - intersection.x;
        const dyPivot = targetMouse.y - intersection.y;
        let dragAngle = (Math.abs(dxPivot) > 1e-6 || Math.abs(dyPivot) > 1e-6)
            ? Math.atan2(dyPivot, dxPivot) * (180 / Math.PI)
            : Math.atan2(dy, dx) * (180 / Math.PI);

        if (Number.isNaN(dragAngle)) dragAngle = 0;
        if (dragAngle < 0) dragAngle += 360;
        const direction = dragAngle % 360;

        return {
            x: intersection.x,
            y: intersection.y,
            direction
        };
    }

    /**
     * Calculate point on token boundary edge toward target position with optional 8-way sticky perimeter snapping.
     * @param {object} token - Target Token object
     * @param {number} targetX - Target X coordinate
     * @param {number} targetY - Target Y coordinate
     * @param {boolean} [sticky=false] - Whether to snap to 8-way perimeter sectors
     * @returns {{x: number, y: number, direction: number}} Edge coordinates and direction
     */
    static getTokenEdgePoint(token, targetX, targetY, sticky = false) {
        if (!token) return { x: targetX, y: targetY, direction: 0 };
        const { w, h, center } = this.getBounds(token);
        const cx = center.x;
        const cy = center.y;
        const hw = w / 2;
        const hh = h / 2;

        const { rad: angleRad, deg: angleDeg } = this.calculateAngle({ x: cx, y: cy }, { x: targetX, y: targetY });

        if (sticky) {
            const sector = Math.round(angleDeg / 45) % 8;
            let x = cx, y = cy;
            switch (sector) {
                case 0: x = cx + hw; y = cy; break;      // 0 deg (Right)
                case 1: x = cx + hw; y = cy + hh; break; // 45 deg (Bottom-Right)
                case 2: x = cx;      y = cy + hh; break; // 90 deg (Bottom)
                case 3: x = cx - hw; y = cy + hh; break; // 135 deg (Bottom-Left)
                case 4: x = cx - hw; y = cy; break;      // 180 deg (Left)
                case 5: x = cx - hw; y = cy - hh; break; // 225 deg (Top-Left)
                case 6: x = cx;      y = cy - hh; break; // 270 deg (Top)
                case 7: x = cx + hw; y = cy - hh; break; // 315 deg (Top-Right)
            }
            return { x, y, direction: angleDeg };
        }

        const cosA = Math.cos(angleRad);
        const sinA = Math.sin(angleRad);
        const tx = Math.abs(cosA) > 1e-6 ? Math.abs(hw / cosA) : Infinity;
        const ty = Math.abs(sinA) > 1e-6 ? Math.abs(hh / sinA) : Infinity;
        const t = Math.min(tx, ty);

        return {
            x: cx + cosA * t,
            y: cy + sinA * t,
            direction: angleDeg
        };
    }
}
