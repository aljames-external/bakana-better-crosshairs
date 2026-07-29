import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../setup.js";
import { attachCrosshairToToken, CrosshairController } from "../../src/crosshair/crosshairController.js";
import { getPeerCursorPosition } from "../../src/crosshair/remoteCrosshairManager.js";

test("attachCrosshairToToken initializes handle with shape, controller, and tracking functions", async () => {
    const dummyToken = { id: "tok-1", x: 100, y: 100, center: { x: 150, y: 150 }, w: 100, h: 100 };
    let cancelCalled = false;
    let cursorCoords = { x: 300, y: 400 };

    const handle = await attachCrosshairToToken(
        dummyToken,
        "circle",
        30,
        () => cursorCoords,
        () => { cancelCalled = true; },
        { id: "test-attach-1" }
    );

    assert.ok(handle);
    assert.ok(handle.shape);
    assert.ok(handle.controller);
    assert.equal(handle.token.id, "tok-1");

    await handle.start();
    assert.equal(handle.shape.x, 300);
    assert.equal(handle.shape.y, 400);

    cursorCoords = { x: 500, y: 600 };
    handle.update(true);
    assert.equal(handle.shape.x, 500);
    assert.equal(handle.shape.y, 600);

    await handle.stop("canceled");
    assert.equal(cancelCalled, true);
    assert.equal(handle.controller.isDestroyed, true);
});

test("attachCrosshairToToken tracks remote peer player cursor via getPeerCursorPosition", async () => {
    const dummyToken = { id: "tok-2", x: 200, y: 200, center: { x: 250, y: 250 }, w: 100, h: 100 };
    globalThis.canvas = {
        controls: {
            cursors: {
                "remote-player-1": { x: 700, y: 800 }
            }
        }
    };

    const handle = await attachCrosshairToToken(
        dummyToken,
        "cone",
        { distance: 40, angle: 60 },
        () => getPeerCursorPosition("remote-player-1"),
        null,
        { id: "test-remote-attach", isRemote: true }
    );

    assert.ok(handle.shape);
    await handle.start();

    assert.equal(handle.shape.x, 700);
    assert.equal(handle.shape.y, 800);

    // Update peer cursor location
    globalThis.canvas.controls.cursors["remote-player-1"] = { x: 900, y: 950 };
    handle.update(true);

    assert.equal(handle.shape.x, 900);
    assert.equal(handle.shape.y, 950);

    await handle.stop("placed");
    assert.equal(handle.controller.isDestroyed, true);
});

test("CrosshairController.hide terminates Sequencer effects on sourceToken", async () => {
    let endedEffects = [];
    globalThis.Sequencer = {
        EffectManager: {
            endEffects: async (opts) => { endedEffects.push(opts); }
        }
    };

    const dummyToken = { id: "tok-3", x: 0, y: 0 };
    await CrosshairController.hide(dummyToken, { id: "custom-effect" });

    assert.equal(endedEffects.length, 3);
    assert.equal(endedEffects[0].name, "custom-effect");
    assert.equal(endedEffects[0].object.id, "tok-3");
    assert.equal(endedEffects[1].name, "custom-effect-line");
    assert.equal(endedEffects[2].name, "custom-effect-icon");
});
