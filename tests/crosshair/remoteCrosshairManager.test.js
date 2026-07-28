import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../setup.js";
import { BROADCAST_INTERVAL_MS, MODULE_ID } from "../../src/lib/constants.js";
import { registerModuleSettings } from "../../src/settings.js";
import { remoteCrosshairManager, RemoteCrosshairVisual } from "../../src/crosshair/remoteCrosshairManager.js";
import { BaseCrosshairShape } from "../../src/crosshair/base.js";
import { socketlib } from "../../src/integration/socketlib.js";

test("BROADCAST_INTERVAL_MS is set to 200ms (5Hz)", () => {
    assert.equal(BROADCAST_INTERVAL_MS, 200);
});

test("registerModuleSettings registers crosshair broadcasting settings with default true", () => {
    registerModuleSettings();
    assert.equal(game.settings.get(MODULE_ID, "enableCrosshairBroadcasting"), true);
    assert.equal(game.settings.get(MODULE_ID, "showOtherPlayersCrosshairs"), true);
});

test("RemoteCrosshairManager ignores socket payloads sent by local user", async () => {
    await remoteCrosshairManager.clear();
    game.user.id = "local-player";

    const payload = {
        type: "CROSSHAIR_START",
        placementId: "test-placement-1",
        senderUserId: "local-player",
        shapeType: "circle",
        file: "test-file.png",
        x: 100,
        y: 100
    };

    await remoteCrosshairManager.handleSocketMessage(payload);
    assert.equal(remoteCrosshairManager.remoteCrosshairs.size, 0);
});

test("RemoteCrosshairManager creates, updates, and destroys remote visuals for peer users", async () => {
    await remoteCrosshairManager.clear();
    game.user.id = "local-player";
    game.settings.set(MODULE_ID, "enableCrosshairBroadcasting", true);
    game.settings.set(MODULE_ID, "showOtherPlayersCrosshairs", true);

    const startPayload = {
        type: "CROSSHAIR_START",
        placementId: "peer-placement-1",
        senderUserId: "peer-player-1",
        shapeType: "circle",
        file: "test-circle.png",
        x: 500,
        y: 500,
        direction: 90
    };

    await remoteCrosshairManager.handleSocketMessage(startPayload);
    assert.equal(remoteCrosshairManager.remoteCrosshairs.size, 1);
    const visual = remoteCrosshairManager.remoteCrosshairs.get("peer-placement-1");
    assert.ok(visual);
    assert.equal(visual.shape.x, 500);
    assert.equal(visual.shape.y, 500);
    assert.equal(visual.shape.direction, 90);

    const updatePayload = {
        type: "CROSSHAIR_UPDATE",
        placementId: "peer-placement-1",
        senderUserId: "peer-player-1",
        x: 600,
        y: 600,
        direction: 180
    };

    await remoteCrosshairManager.handleSocketMessage(updatePayload);
    assert.equal(visual.shape.x, 600);
    assert.equal(visual.shape.y, 600);
    assert.equal(visual.shape.direction, 180);

    const endPayload = {
        type: "CROSSHAIR_END",
        placementId: "peer-placement-1",
        senderUserId: "peer-player-1",
        reason: "placed"
    };

    await remoteCrosshairManager.handleSocketMessage(endPayload);
    assert.equal(remoteCrosshairManager.remoteCrosshairs.size, 0);
    assert.equal(visual.isDestroyed, true);
});

test("RemoteCrosshairVisual resolves target position using peer cursor pointer if available", () => {
    globalThis.canvas = {
        controls: {
            cursors: {
                "peer-player-2": { x: 750, y: 850 }
            }
        }
    };

    const visual = new RemoteCrosshairVisual({
        placementId: "peer-placement-2",
        senderUserId: "peer-player-2",
        x: 100,
        y: 100
    });

    const pos = visual.resolveTargetPosition();
    assert.equal(pos.x, 750);
    assert.equal(pos.y, 850);
});

test("BaseCrosshairShape startBroadcasting and stopBroadcasting emit CROSSHAIR_* events", async () => {
    game.user.id = "origin-user";
    game.settings.set(MODULE_ID, "enableCrosshairBroadcasting", true);

    const emitted = [];
    const origEmit = socketlib.emit;
    socketlib.emit = (payload) => emitted.push(payload);

    const dummyPlaceable = { x: 200, y: 300 };
    const shape = new BaseCrosshairShape(dummyPlaceable, { id: "test-shape", type: "circle" });

    shape.startBroadcasting();
    assert.ok(shape.placementId);
    assert.ok(shape.broadcastTimer);
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].type, "CROSSHAIR_START");
    assert.equal(emitted[0].senderUserId, "origin-user");
    assert.equal(emitted[0].x, 200);
    assert.equal(emitted[0].y, 300);

    shape.stopBroadcasting("placed");
    assert.equal(shape.broadcastTimer, null);
    assert.equal(shape.placementId, null);
    assert.equal(emitted.length, 2);
    assert.equal(emitted[1].type, "CROSSHAIR_END");
    assert.equal(emitted[1].reason, "placed");

    socketlib.emit = origEmit;
});
