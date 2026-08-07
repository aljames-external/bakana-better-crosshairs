import './setup.js';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { validateImportPackage } from '../src/autorec/autorecExchange.js';
import { autorecManager } from '../src/autorec/autorecManager.js';
import { Dnd5eSystemAdapter } from '../src/adapter/system/dnd5e-adapter.js';

const jsonPath = path.resolve('./src/autorec/system-defaults/dnd5e.json');
const rawText = fs.readFileSync(jsonPath, 'utf8');

console.log('Validating dnd5e.json schema in system-defaults...');
const validated = validateImportPackage(rawText);
assert.equal(validated.version, '2.0.0');
assert.equal(validated.entries.length, 156);
console.log(`Validated ${validated.entries.length} AoE entries successfully!`);

// Test Dnd5eSystemAdapter loadDefaults via payload
console.log('Testing Dnd5eSystemAdapter.loadDefaults with pre-parsed payload...');
const dnd5eAdapter = new Dnd5eSystemAdapter();
const result = await dnd5eAdapter.loadDefaults({ payload: validated, interactive: false, overwrite: true });

console.log(`Import completed. Merged count: ${result.mergedCount}`);
assert.equal(result.mergedCount, 156);
assert.equal(result.skipped, false);

// Test onlyFirstBoot skip behavior when already loaded
console.log('Testing onlyFirstBoot idempotency when already initialized...');
const secondResult = await dnd5eAdapter.loadDefaults({ onlyFirstBoot: true });
assert.equal(secondResult.skipped, true);
assert.equal(secondResult.mergedCount, 0);

// Spot check entries in autorecManager
const thunderwave = autorecManager.getEntryByName('Thunderwave');
assert.ok(thunderwave, 'Thunderwave should be registered');
assert.equal(thunderwave.stickToToken, 'true', 'Thunderwave should be attached to token');
assert.equal(thunderwave.showLine, false, 'Thunderwave showLine should be false');

const fireball = autorecManager.getEntryByName('Fireball');
assert.ok(fireball, 'Fireball should be registered');
assert.equal(fireball.stickToToken, 'false', 'Fireball should NOT be attached to token');
assert.equal(fireball.showLine, true, 'Fireball showLine should be true');
assert.equal(fireball.limitRange, true, 'Fireball limitRange should be true');

const lightningBolt = autorecManager.getEntryByName('Lightning Bolt');
assert.ok(lightningBolt, 'Lightning Bolt should be registered');
assert.equal(lightningBolt.stickToToken, 'true', 'Lightning Bolt should be attached to token');

const coneOfCold = autorecManager.getEntryByName('Cone of Cold');
assert.ok(coneOfCold, 'Cone of Cold should be registered');
assert.equal(coneOfCold.stickToToken, 'true', 'Cone of Cold should be attached to token');

const spiritGuardians = autorecManager.getEntryByName('Spirit Guardians');
assert.ok(spiritGuardians, 'Spirit Guardians should be registered');
assert.equal(spiritGuardians.stickToToken, 'true', 'Spirit Guardians should be attached to token');

const wallOfFire = autorecManager.getEntryByName('Wall of Fire');
assert.ok(wallOfFire, 'Wall of Fire should be registered');
assert.equal(wallOfFire.stickToToken, 'false', 'Wall of Fire should NOT be attached to token');

console.log('ALL SYSTEM-DEFAULTS VERIFICATIONS PASSED PERFECTLY!');
