import '../setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PersistedAnimationManager } from '../../src/crosshair/persistedAnimationManager.js';
import { CrosshairConfiguration } from '../../src/autorec/CrosshairConfiguration.js';
import { DEFAULT_AUTOREC_ENTRY } from '../../src/autorec/autorecManager.js';
import { FoundryVTTV13Adapter } from '../../src/adapter/foundry/foundryvtt-v13-adapter.js';
import { FoundryVTTV14Adapter } from '../../src/adapter/foundry/foundryvtt-v14-adapter.js';

test('CrosshairConfiguration normalizes persist flag across default, source, overrides, and toJSON', () => {
    assert.equal(DEFAULT_AUTOREC_ENTRY.persist, false);

    const defaultCfg = new CrosshairConfiguration();
    assert.equal(defaultCfg.persist, false);
    assert.equal(defaultCfg.toJSON().persist, false);

    const customCfg = new CrosshairConfiguration({ persist: true });
    assert.equal(customCfg.persist, true);
    assert.equal(customCfg.toJSON().persist, true);

    const overridden = defaultCfg.overrideWith({ enablePlacedStyling: true, persist: true });
    assert.equal(overridden.persist, true);
    assert.equal(overridden.toJSON().persist, true);
});

test('FoundryVTTV13Adapter and FoundryVTTV14Adapter extractPlacedStylingFlags include persist and asset files', () => {
    const v13 = new FoundryVTTV13Adapter();
    const v14 = new FoundryVTTV14Adapter();

    const config = {
        itemName: 'Fireball',
        persist: true,
        circleFile: 'eskie.crosshair.circle.custom',
        coneFile: 'eskie.crosshair.cone.custom',
        rayFile: 'eskie.crosshair.ray.custom',
        rectangleFile: 'eskie.crosshair.rectangle.custom'
    };

    const v13Flags = v13.extractPlacedStylingFlags(config);
    assert.equal(v13Flags.flags.bbc.persist, true);
    assert.equal(v13Flags.flags.bbc.circleFile, 'eskie.crosshair.circle.custom');
    assert.equal(v13Flags.flags.bbc.rectangleFile, 'eskie.crosshair.rectangle.custom');

    const v14Flags = v14.extractPlacedStylingFlags(config);
    assert.equal(v14Flags.flags.bbc.persist, true);
    assert.equal(v14Flags.flags.bbc.coneFile, 'eskie.crosshair.cone.custom');
    assert.equal(v14Flags.flags.bbc.rectangleFile, 'eskie.crosshair.rectangle.custom');
});

test('PersistedAnimationManager creates, updates, and ends persistent Sequencer effects bound to template', async () => {
    let playedEffects = [];
    let endedEffects = [];

    globalThis.Sequence = class MockSequence {
        constructor() {
            this._effect = null;
        }
        effect() {
            const eff = {
                _name: '',
                _file: '',
                _location: null,
                _rotation: 0,
                _anchor: null,
                _size: null,
                _opacity: 1,
                _persist: false,
                name(n) { this._name = n; return this; },
                file(f) { this._file = f; return this; },
                atLocation(loc) { this._location = loc; return this; },
                rotate(r) { this._rotation = r; return this; },
                anchor(a) { this._anchor = a; return this; },
                size(s, opts) { this._size = s; return this; },
                opacity(o) { this._opacity = o; return this; },
                belowTokens() { return this; },
                persist() { this._persist = true; return this; }
            };
            this._effect = eff;
            return eff;
        }
        async play() {
            if (this._effect) playedEffects.push(this._effect);
            return this;
        }
    };

    globalThis.Sequencer = {
        EffectManager: {
            endEffects(opts) {
                endedEffects.push(opts);
            }
        }
    };

    const mockDoc = {
        id: 'tmpl-12345',
        x: 500,
        y: 600,
        direction: 45,
        distance: 20,
        t: 'cone',
        flags: {
            bbc: {
                persist: true,
                coneFile: 'eskie.crosshair.cone.thin.fantasy_01.white.full'
            }
        }
    };

    // 1. Sync / Play persistent animation (direction 45 -> Sequencer rotation -45)
    await PersistedAnimationManager.syncPersistedAnimation(mockDoc);
    assert.equal(playedEffects.length, 1);
    assert.equal(playedEffects[0]._name, 'bbc-persisted-tmpl-12345');
    assert.equal(playedEffects[0]._persist, true);
    assert.equal(playedEffects[0]._rotation, -45);

    // 2. Update document rotation and sync (direction 90 -> Sequencer rotation -90)
    mockDoc.direction = 90;
    await PersistedAnimationManager.syncPersistedAnimation(mockDoc);
    assert.equal(playedEffects.length, 2);
    assert.equal(playedEffects[1]._rotation, -90);

    // 3. End persistent animation
    PersistedAnimationManager.endPersistedAnimation(mockDoc);
    assert.ok(endedEffects.some(e => e.name === 'bbc-persisted-tmpl-12345'));
});
