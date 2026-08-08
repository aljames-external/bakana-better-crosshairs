import '../setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PendingPlacementSession } from '../../src/adapter/foundry/pendingPlacementSession.js';

test('PendingPlacementSession resolves coordinates and triggers deferred document creation', async () => {
    let createdDocData = null;
    let dismissedPlaceable = null;
    const mockAdapter = {
        pendingPlacements: new Map(),
        createDeferredDocument: async (scene, data, coords, docName, config) => {
            createdDocData = { scene, data, coords, docName, config };
        },
        dismissPreview: (p) => {
            dismissedPlaceable = p;
        }
    };

    const placementKey = 'Fireball_user123';
    const pendingData = {
        itemName: 'Fireball',
        resolved: false,
        cancelled: false,
        deferredCreateData: { name: 'Fireball' },
        documentName: 'MeasuredTemplate',
        config: { distance: 30 }
    };
    mockAdapter.pendingPlacements.set(placementKey, pendingData);

    const mockPlaceable = { id: 'placeable-1' };
    const mockDoc = { id: 'doc-1', documentName: 'MeasuredTemplate' };

    globalThis.canvas = { scene: { id: 'scene-1' } };

    const session = new PendingPlacementSession(mockAdapter, placementKey, pendingData, mockDoc, mockPlaceable);
    await session.resolve({ x: 200, y: 300, direction: 45 });

    assert.equal(session.resolved, true);
    assert.equal(session.x, 200);
    assert.equal(session.y, 300);
    assert.equal(session.direction, 45);

    assert.ok(createdDocData);
    assert.equal(createdDocData.coords.x, 200);
    assert.equal(dismissedPlaceable, mockPlaceable);
});

test('PendingPlacementSession cancels placement and removes from pendingPlacements', () => {
    let dismissedPlaceable = null;
    const mockAdapter = {
        pendingPlacements: new Map(),
        dismissPreview: (p) => {
            dismissedPlaceable = p;
        }
    };

    const placementKey = 'ConeOfCold_user123';
    const pendingData = {
        itemName: 'ConeOfCold',
        resolved: false,
        cancelled: false,
        config: { distance: 60 }
    };
    mockAdapter.pendingPlacements.set(placementKey, pendingData);

    const mockPlaceable = { id: 'placeable-2' };
    const mockDoc = { id: 'doc-2', documentName: 'MeasuredTemplate' };

    const session = new PendingPlacementSession(mockAdapter, placementKey, pendingData, mockDoc, mockPlaceable);
    session.cancel();

    assert.equal(session.cancelled, true);
    assert.equal(session.resolved, true);
    assert.equal(mockAdapter.pendingPlacements.has(placementKey), false);
    assert.equal(dismissedPlaceable, mockPlaceable);
});
