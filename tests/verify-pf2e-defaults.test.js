import './setup.js';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { autorecManager } from '../src/autorec/autorecManager.js';
import { Pf2eSystemAdapter } from '../src/adapter/system/pf2e-adapter.js';
import { shouldStickToToken } from '../src/crosshair/util.js';

const jsonPath = path.resolve('./src/autorec/system-defaults/pf2e.json');
const rawText = fs.readFileSync(jsonPath, 'utf8');

console.log('Validating slugified pf2e.json dictionary in system-defaults...');
const data = JSON.parse(rawText);
const entriesCount = Object.keys(data).length;
assert.ok(entriesCount >= 200, `Must have at least 200 PF2e AoE spells/activities, found ${entriesCount}`);
console.log(`Validated ${entriesCount} PF2e AoE spell and activity definitions successfully!`);

console.log('Validating split lang/en/pf2e.json, lang/es/pf2e.json, and lang/ja/pf2e.json files...');
const enMainPath = path.resolve('./lang/en.json');
const enMainData = JSON.parse(fs.readFileSync(enMainPath, 'utf8'));
assert.equal(enMainData.BBC.defaults, undefined, 'lang/en.json must not contain defaults');

const enDefaultsPath = path.resolve('./lang/en/pf2e.json');
const enDefaultsData = JSON.parse(fs.readFileSync(enDefaultsPath, 'utf8'));
assert.ok(enDefaultsData.BBC?.defaults?.pf2e, 'lang/en/pf2e.json must contain BBC.defaults.pf2e');
const enPf2eEntries = enDefaultsData.BBC.defaults.pf2e;
assert.equal(Object.keys(enPf2eEntries).length, entriesCount, `lang/en/pf2e.json must contain all ${entriesCount} spell translations`);

const esDefaultsPath = path.resolve('./lang/es/pf2e.json');
const esDefaultsData = JSON.parse(fs.readFileSync(esDefaultsPath, 'utf8'));
assert.ok(esDefaultsData.BBC?.defaults?.pf2e, 'lang/es/pf2e.json must contain BBC.defaults.pf2e');
const esPf2eEntries = esDefaultsData.BBC.defaults.pf2e;
assert.equal(Object.keys(esPf2eEntries).length, entriesCount, `lang/es/pf2e.json must contain all ${entriesCount} spell translations`);

const jaDefaultsPath = path.resolve('./lang/ja/pf2e.json');
const jaDefaultsData = JSON.parse(fs.readFileSync(jaDefaultsPath, 'utf8'));
assert.ok(jaDefaultsData.BBC?.defaults?.pf2e, 'lang/ja/pf2e.json must contain BBC.defaults.pf2e');
const jaPf2eEntries = jaDefaultsData.BBC.defaults.pf2e;
assert.equal(Object.keys(jaPf2eEntries).length, entriesCount, `lang/ja/pf2e.json must contain all ${entriesCount} spell translations`);

for (const slug of Object.keys(data)) {
    assert.ok(slug in enPf2eEntries, `Slug ${slug} from pf2e.json must be present in lang/en/pf2e.json`);
    assert.ok(slug in esPf2eEntries, `Slug ${slug} from pf2e.json must be present in lang/es/pf2e.json`);
    assert.ok(slug in jaPf2eEntries, `Slug ${slug} from pf2e.json must be present in lang/ja/pf2e.json`);
}
console.log('Validated en, es, and ja split PF2e dictionaries successfully!');

// Initialize Pf2eSystemAdapter with base system dataset
console.log('Testing Pf2eSystemAdapter with multi-language (en, es, ja) system defaults...');
const pf2eAdapter = new Pf2eSystemAdapter();
pf2eAdapter.setDefaultsData(data);
pf2eAdapter.registerLocalizedDefaults(esPf2eEntries, data);
pf2eAdapter.registerLocalizedDefaults(jaPf2eEntries, data);

// 1. Verify direct English Lookups
console.log('Testing English spell name lookups...');
assert.equal(pf2eAdapter.getSystemDefault('Burning Hands'), true);
assert.equal(pf2eAdapter.getSystemDefault('burning-hands'), true);
assert.equal(pf2eAdapter.getSystemDefault('Fireball'), false);
assert.equal(pf2eAdapter.getSystemDefault('Cone of Cold'), true);
assert.equal(pf2eAdapter.getSystemDefault('Courageous Anthem'), true);
assert.equal(pf2eAdapter.getSystemDefault('Heal'), true);
assert.equal(pf2eAdapter.getSystemDefault('Harm'), true);
assert.equal(pf2eAdapter.getSystemDefault('Dragon Roar'), true);

// 2. Verify Spanish Localized Name lookups
console.log('Testing Spanish localized spell name lookups...');
assert.equal(pf2eAdapter.getSystemDefault('Manos ardientes'), true, 'Spanish "Manos ardientes" should stick (true)');
assert.equal(pf2eAdapter.getSystemDefault('Bola de fuego'), false, 'Spanish "Bola de fuego" should not stick (false)');
assert.equal(pf2eAdapter.getSystemDefault('Cono de frío'), true, 'Spanish "Cono de frío" should stick (true)');
assert.equal(pf2eAdapter.getSystemDefault('Himno valeroso'), true, 'Spanish "Himno valeroso" should stick (true)');
assert.equal(pf2eAdapter.getSystemDefault('Sanar'), true, 'Spanish "Sanar" should stick (true)');
assert.equal(pf2eAdapter.getSystemDefault('Dañar'), true, 'Spanish "Dañar" should stick (true)');

// 3. Verify Japanese Localized Name lookups
console.log('Testing Japanese localized spell name lookups...');
assert.equal(pf2eAdapter.getSystemDefault('バーニング・ハンズ'), true, 'Japanese "バーニング・ハンズ" should stick (true)');
assert.equal(pf2eAdapter.getSystemDefault('ファイアーボール'), false, 'Japanese "ファイアーボール" should not stick (false)');
assert.equal(pf2eAdapter.getSystemDefault('コーン・オブ・コールド'), true, 'Japanese "コーン・オブ・コールド" should stick (true)');
assert.equal(pf2eAdapter.getSystemDefault('カレイジャス・アンセム'), true, 'Japanese "カレイジャス・アンセム" should stick (true)');
assert.equal(pf2eAdapter.getSystemDefault('ヒール'), true, 'Japanese "ヒール" should stick (true)');

// 4. Verify item document with system.identifier / slug lookup
console.log('Testing item document with slug/identifier lookup...');
const customFireballItem = {
    documentName: 'Item',
    name: 'Bola de fuego élfica personalizada',
    system: { identifier: 'fireball' }
};
assert.equal(pf2eAdapter.getSystemDefault({ item: customFireballItem }), false);

const customBurningHandsItem = {
    documentName: 'Item',
    name: 'バーニング・ハンズ・カスタム',
    system: { identifier: 'burning-hands' }
};
assert.equal(pf2eAdapter.getSystemDefault({ item: customBurningHandsItem }), true);

// 5. Test shouldStickToToken resolution across mixed languages simultaneously
console.log('Testing shouldStickToToken across mixed English, Spanish, and Japanese names in PF2e...');
assert.equal(shouldStickToToken({ itemName: 'Burning Hands', stickToToken: 'default' }, 'cone', pf2eAdapter), true);
assert.equal(shouldStickToToken({ itemName: 'Manos ardientes', stickToToken: 'default' }, 'cone', pf2eAdapter), true);
assert.equal(shouldStickToToken({ itemName: 'バーニング・ハンズ', stickToToken: 'default' }, 'cone', pf2eAdapter), true);
assert.equal(shouldStickToToken({ itemName: 'Fireball', stickToToken: 'default' }, 'circle', pf2eAdapter), false);
assert.equal(shouldStickToToken({ itemName: 'Bola de fuego', stickToToken: 'default' }, 'circle', pf2eAdapter), false);
assert.equal(shouldStickToToken({ itemName: 'ファイアーボール', stickToToken: 'default' }, 'circle', pf2eAdapter), false);
assert.equal(shouldStickToToken({ itemName: 'Courageous Anthem', stickToToken: 'default' }, 'circle', pf2eAdapter), true);
assert.equal(shouldStickToToken({ itemName: 'Himno valeroso', stickToToken: 'default' }, 'circle', pf2eAdapter), true);
assert.equal(shouldStickToToken({ itemName: 'カレイジャス・アンセム', stickToToken: 'default' }, 'circle', pf2eAdapter), true);

console.log('ALL SIMULTANEOUS MULTI-LANGUAGE PF2E SYSTEM-DEFAULTS VERIFICATIONS PASSED PERFECTLY!');
