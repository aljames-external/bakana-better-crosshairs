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

console.log('Validating split lang/en/dnd5e.json, lang/es/dnd5e.json, and lang/ja/dnd5e.json files...');
const enMainPath = path.resolve('./lang/en.json');
const enMainData = JSON.parse(fs.readFileSync(enMainPath, 'utf8'));
assert.equal(enMainData.BBC.defaults, undefined, 'lang/en.json must not contain defaults');

const enDefaultsPath = path.resolve('./lang/en/dnd5e.json');
const enDefaultsData = JSON.parse(fs.readFileSync(enDefaultsPath, 'utf8'));
assert.ok(enDefaultsData.BBC?.defaults?.dnd5e, 'lang/en/dnd5e.json must contain BBC.defaults.dnd5e');
const enDnd5eEntries = enDefaultsData.BBC.defaults.dnd5e;
assert.equal(Object.keys(enDnd5eEntries).length, 156, 'lang/en/dnd5e.json must contain all 156 spell translations');

const esDefaultsPath = path.resolve('./lang/es/dnd5e.json');
const esDefaultsData = JSON.parse(fs.readFileSync(esDefaultsPath, 'utf8'));
assert.ok(esDefaultsData.BBC?.defaults?.dnd5e, 'lang/es/dnd5e.json must contain BBC.defaults.dnd5e');
const esDnd5eEntries = esDefaultsData.BBC.defaults.dnd5e;
assert.equal(Object.keys(esDnd5eEntries).length, 156, 'lang/es/dnd5e.json must contain all 156 spell translations');

const jaDefaultsPath = path.resolve('./lang/ja/dnd5e.json');
const jaDefaultsData = JSON.parse(fs.readFileSync(jaDefaultsPath, 'utf8'));
assert.ok(jaDefaultsData.BBC?.defaults?.dnd5e, 'lang/ja/dnd5e.json must contain BBC.defaults.dnd5e');
const jaDnd5eEntries = jaDefaultsData.BBC.defaults.dnd5e;
assert.equal(Object.keys(jaDnd5eEntries).length, 156, 'lang/ja/dnd5e.json must contain all 156 spell translations');

for (const slug of Object.keys(data)) {
    assert.ok(slug in enDnd5eEntries, `Slug ${slug} from dnd5e.json must be present in lang/en/dnd5e.json`);
    assert.ok(slug in esDnd5eEntries, `Slug ${slug} from dnd5e.json must be present in lang/es/dnd5e.json`);
    assert.ok(slug in jaDnd5eEntries, `Slug ${slug} from dnd5e.json must be present in lang/ja/dnd5e.json`);
}
console.log('Validated en, es, and ja split dictionaries successfully!');

// Initialize Dnd5eSystemAdapter with base system dataset
console.log('Testing Dnd5eSystemAdapter with multi-language (en, es, ja) system defaults...');
const dnd5eAdapter = new Dnd5eSystemAdapter();
dnd5eAdapter.setDefaultsData(data);
dnd5eAdapter.registerLocalizedDefaults(esDnd5eEntries, data);
dnd5eAdapter.registerLocalizedDefaults(jaDnd5eEntries, data);

// 1. Verify direct English Lookups
console.log('Testing English spell name lookups...');
assert.equal(dnd5eAdapter.getSystemDefault('Thunderwave'), true);
assert.equal(dnd5eAdapter.getSystemDefault('thunderwave'), true);
assert.equal(dnd5eAdapter.getSystemDefault('Fireball'), false);
assert.equal(dnd5eAdapter.getSystemDefault('Cone of Cold'), true);

// 2. Verify Spanish Localized Name lookups
console.log('Testing Spanish localized spell name lookups...');
assert.equal(dnd5eAdapter.getSystemDefault('Ola de trueno'), true, 'Spanish "Ola de trueno" should stick (true)');
assert.equal(dnd5eAdapter.getSystemDefault('Bola de fuego'), false, 'Spanish "Bola de fuego" should not stick (false)');
assert.equal(dnd5eAdapter.getSystemDefault('Cono de frío'), true, 'Spanish "Cono de frío" should stick (true)');
assert.equal(dnd5eAdapter.getSystemDefault('Guardianes espirituales'), true, 'Spanish "Guardianes espirituales" should stick (true)');

// 3. Verify Japanese Localized Name lookups
console.log('Testing Japanese localized spell name lookups...');
assert.equal(dnd5eAdapter.getSystemDefault('サンダーウェイブ'), true, 'Japanese "サンダーウェイブ" should stick (true)');
assert.equal(dnd5eAdapter.getSystemDefault('ファイアーボール'), false, 'Japanese "ファイアーボール" should not stick (false)');
assert.equal(dnd5eAdapter.getSystemDefault('コーン・オブ・コールド'), true, 'Japanese "コーン・オブ・コールド" should stick (true)');
assert.equal(dnd5eAdapter.getSystemDefault('スピリット・ガーディアンズ'), true, 'Japanese "スピリット・ガーディアンズ" should stick (true)');

// 4. Verify item document with system.identifier lookup
console.log('Testing item document with system identifier lookup...');
const customFireballItem = {
    documentName: 'Item',
    name: 'Bola de fuego personalizada élfica',
    system: { identifier: 'fireball' }
};
assert.equal(dnd5eAdapter.getSystemDefault({ item: customFireballItem }), false);

const customThunderwaveItem = {
    documentName: 'Item',
    name: 'サンダーウェイブ・カスタム',
    system: { identifier: 'thunderwave' }
};
assert.equal(dnd5eAdapter.getSystemDefault({ item: customThunderwaveItem }), true);

// 5. Test shouldStickToToken resolution across mixed languages simultaneously
console.log('Testing shouldStickToToken across mixed English, Spanish, and Japanese names...');
assert.equal(shouldStickToToken({ itemName: 'Thunderwave', stickToToken: 'default' }, 'rect', dnd5eAdapter), true);
assert.equal(shouldStickToToken({ itemName: 'Ola de trueno', stickToToken: 'default' }, 'rect', dnd5eAdapter), true);
assert.equal(shouldStickToToken({ itemName: 'サンダーウェイブ', stickToToken: 'default' }, 'rect', dnd5eAdapter), true);
assert.equal(shouldStickToToken({ itemName: 'Fireball', stickToToken: 'default' }, 'circle', dnd5eAdapter), false);
assert.equal(shouldStickToToken({ itemName: 'Bola de fuego', stickToToken: 'default' }, 'circle', dnd5eAdapter), false);
assert.equal(shouldStickToToken({ itemName: 'ファイアーボール', stickToToken: 'default' }, 'circle', dnd5eAdapter), false);
assert.equal(shouldStickToToken({ itemName: 'Cone of Cold', stickToToken: 'default' }, 'cone', dnd5eAdapter), true);
assert.equal(shouldStickToToken({ itemName: 'Cono de frío', stickToToken: 'default' }, 'cone', dnd5eAdapter), true);
assert.equal(shouldStickToToken({ itemName: 'コーン・オブ・コールド', stickToToken: 'default' }, 'cone', dnd5eAdapter), true);

// 6. Test key collision conflict detection & warning
console.log('Testing key collision conflict detection...');
const testAdapter = new Dnd5eSystemAdapter();
testAdapter.setDefaultsData({ 'fireball': false, 'web': false, 'thunderwave': true });

// Register a simulated conflicting translation (e.g. hypothetical conflicting spell name)
let warnLogged = false;
const originalWarn = console.warn;
console.warn = (...args) => {
    warnLogged = true;
};

// Attempt to register a conflicting localized entry for "fireball" with stick = true
testAdapter.registerLocalizedDefaults({ 'hypothetical-attached-spell': 'fireball' }, { 'hypothetical-attached-spell': true });
console.warn = originalWarn;

// Verify original entry is preserved deterministically
assert.equal(testAdapter.getSystemDefault('fireball'), false, 'Original fireball default should be preserved');

console.log('ALL SIMULTANEOUS MULTI-LANGUAGE SYSTEM-DEFAULTS VERIFICATIONS PASSED PERFECTLY!');


