import './setup.js';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { autorecManager } from '../src/autorec/autorecManager.js';
import { Dnd5eSystemAdapter } from '../src/adapter/system/dnd5e-adapter.js';
import { shouldStickToToken } from '../src/crosshair/util.js';

const jsonPath = path.resolve('./src/autorec/system-defaults/dnd5e.json');
const rawText = fs.readFileSync(jsonPath, 'utf8');

console.log('Validating slugified dnd5e.json dictionary in system-defaults...');
const data = JSON.parse(rawText);
const entriesCount = Object.keys(data).length;
assert.equal(entriesCount, 156);
console.log(`Validated ${entriesCount} AoE spell definitions successfully!`);

// Mock Spanish localization in game.i18n
const spanishTranslations = {
    'BBC.defaults.dnd5e.thunderwave': 'Ola de trueno',
    'BBC.defaults.dnd5e.fireball': 'Bola de fuego',
    'BBC.defaults.dnd5e.lightning-bolt': 'Rayo relampagueante',
    'BBC.defaults.dnd5e.cone-of-cold': 'Cono de frío',
    'BBC.defaults.dnd5e.spirit-guardians': 'Guardianes espirituales'
};

globalThis.game.i18n = {
    has: (key) => key in spanishTranslations,
    localize: (key) => spanishTranslations[key] ?? key
};

// Initialize Dnd5eSystemAdapter with system dataset
console.log('Testing Dnd5eSystemAdapter with in-memory localized system defaults...');
const dnd5eAdapter = new Dnd5eSystemAdapter();
dnd5eAdapter.setDefaultsData(data);

// Verify direct English & Slug lookups
assert.equal(dnd5eAdapter.getSystemDefault('Thunderwave'), true);
assert.equal(dnd5eAdapter.getSystemDefault('thunderwave'), true);
assert.equal(dnd5eAdapter.getSystemDefault('Fireball'), false);
assert.equal(dnd5eAdapter.getSystemDefault('fireball'), false);

// Verify Spanish Localized Name lookups
console.log('Testing Spanish localized spell name lookups...');
assert.equal(dnd5eAdapter.getSystemDefault('Ola de trueno'), true, 'Spanish "Ola de trueno" should stick (true)');
assert.equal(dnd5eAdapter.getSystemDefault('Bola de fuego'), false, 'Spanish "Bola de fuego" should not stick (false)');
assert.equal(dnd5eAdapter.getSystemDefault('Cono de frío'), true, 'Spanish "Cono de frío" should stick (true)');
assert.equal(dnd5eAdapter.getSystemDefault('Guardianes espirituales'), true, 'Spanish "Guardianes espirituales" should stick (true)');

// Verify item document with system.identifier lookup
console.log('Testing item document with system identifier lookup...');
const spanishFireballItem = {
    documentName: 'Item',
    name: 'Bola de fuego personalizada',
    system: { identifier: 'fireball' }
};
assert.equal(dnd5eAdapter.getSystemDefault({ item: spanishFireballItem }), false);

const spanishThunderwaveItem = {
    documentName: 'Item',
    name: 'Ola de trueno élfica',
    system: { identifier: 'thunderwave' }
};
assert.equal(dnd5eAdapter.getSystemDefault({ item: spanishThunderwaveItem }), true);

// Test shouldStickToToken resolution with Spanish names
console.log('Testing shouldStickToToken with Spanish localized names...');
assert.equal(shouldStickToToken({ itemName: 'Ola de trueno', stickToToken: 'default' }, 'rect', dnd5eAdapter), true);
assert.equal(shouldStickToToken({ itemName: 'Bola de fuego', stickToToken: 'default' }, 'circle', dnd5eAdapter), false);
assert.equal(shouldStickToToken({ itemName: 'Cono de frío', stickToToken: 'default' }, 'cone', dnd5eAdapter), true);

console.log('ALL LOCALIZED SYSTEM-DEFAULTS VERIFICATIONS PASSED PERFECTLY!');
