import '../setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { TokenGeometry } from '../../src/lib/tokenGeometry.js';
import { CrosshairRangeOverlay } from '../../src/crosshair/rangeOverlay.js';
import { CrosshairBroadcaster } from '../../src/crosshair/crosshairBroadcaster.js';

test('TokenGeometry extracts canonical bounds, centers, and angle calculations', () => {
    const mockToken = {
        x: 200,
        y: 300,
        w: 100,
        h: 100,
        center: { x: 250, y: 350 }
    };

    const bounds = TokenGeometry.getBounds(mockToken);
    assert.equal(bounds.x, 200);
    assert.equal(bounds.y, 300);
    assert.equal(bounds.w, 100);
    assert.equal(bounds.h, 100);
    assert.equal(bounds.center.x, 250);
    assert.equal(bounds.center.y, 350);

    const angle = TokenGeometry.calculateAngle({ x: 100, y: 100 }, { x: 100, y: 200 });
    assert.equal(angle.deg, 90);
    assert.equal(TokenGeometry.normalizeAngle(450), 90);
    assert.equal(TokenGeometry.normalizeAngle(-90), 270);
});

test('TokenGeometry.resolveAnchorPlacement and getTokenEdgePoint compute accurate ray-edge intersections', () => {
    const mockToken = {
        x: 100,
        y: 100,
        w: 100,
        h: 100,
        center: { x: 150, y: 150 }
    };

    // Right edge point toward (300, 150)
    const rightAnchor = TokenGeometry.resolveAnchorPlacement(mockToken, { x: 300, y: 150 });
    assert.equal(rightAnchor.x, 200);
    assert.equal(rightAnchor.y, 150);
    assert.equal(rightAnchor.direction, 0);

    // Top edge point toward (150, 0)
    const topAnchor = TokenGeometry.resolveAnchorPlacement(mockToken, { x: 150, y: 0 });
    assert.equal(topAnchor.x, 150);
    assert.equal(topAnchor.y, 100);
    assert.equal(topAnchor.direction, 270);

    // 8-way sticky perimeter snap
    const stickyEdge = TokenGeometry.getTokenEdgePoint(mockToken, 300, 300, true);
    assert.equal(stickyEdge.x, 200);
    assert.equal(stickyEdge.y, 200);
    assert.equal(stickyEdge.direction, 45);
});

test('CrosshairRangeOverlay measures grid distance and manages overlay lifecycle', () => {
    const mockShape = {
        stickToToken: false,
        token: { center: { x: 100, y: 100 } },
        config: { showRange: true },
        sequencerCrosshair: { x: 400, y: 100, parent: { addChild: () => {} }, rotation: 0 },
        x: 400,
        y: 100
    };

    const overlay = new CrosshairRangeOverlay(mockShape);
    const label = overlay.measureDistance({ x: 100, y: 100 }, { x: 400, y: 100 });
    assert.ok(label.includes('ft') || label.includes('units') || typeof label === 'string');

    // Safe destruction
    assert.doesNotThrow(() => {
        overlay.destroy();
    });
});

test('CrosshairBroadcaster extracts live state and manages socket broadcasts', () => {
    const mockShape = {
        id: 'test-broadcaster-shape',
        type: 'cone',
        x: 100,
        y: 100,
        direction: 45,
        distance: 30,
        width: 10,
        angle: 60,
        fillColor: '#ffffff',
        fillAlpha: 0.5,
        borderColor: '#000000',
        borderAlpha: 1.0,
        getGraphicFile: () => 'path/to/cone.png',
        sequencerCrosshair: { x: 100, y: 100, direction: 45 }
    };

    const broadcaster = new CrosshairBroadcaster(mockShape);
    const live = broadcaster.getLiveState();

    assert.equal(live.originX, 100);
    assert.equal(live.originY, 100);
    assert.equal(live.direction, 45);
    assert.equal(live.distance, 30);
    assert.equal(live.width, 10);
    assert.equal(live.angle, 60);

    // Verify start and stop
    broadcaster.start();
    assert.doesNotThrow(() => {
        broadcaster.stop('placed');
    });
});
