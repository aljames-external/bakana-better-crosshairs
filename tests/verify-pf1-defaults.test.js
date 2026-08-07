import './setup.js';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { autorecManager } from '../src/autorec/autorecManager.js';
import { Pf1SystemAdapter } from '../src/adapter/system/pf1-adapter.js';
import { shouldStickToToken } from '../src/crosshair/util.js';

const jsonPath = path.resolve('./src/autorec/system-defaults/pf1.json');
const rawText = fs.readFileSync(jsonPath, 'utf8');

console.log('Validating slugified pf1.json dictionary in system-defaults...');
const data = JSON.parse(rawText);
const entriesCount = Object.keys(data).length;
assert.ok(entriesCount >= 200, `Must have at least 200 PF1e AoE spells/activities, found ${entriesCount}`);
console.log(`Validated ${entriesCount} PF1e AoE spell and activity definitions successfully!`);

console.log('Validating split lang/en/pf1.json, lang/es/pf1.json, and lang/ja/pf1.json files...');
const enMainPath = path.resolve('./lang/en.json');
const enMainData = JSON.parse(fs.readFileSync(enMainPath, 'utf8'));
assert.equal(enMainData.BBC.defaults, undefined, 'lang/en.json must not contain defaults');

const enDefaultsPath = path.resolve('./lang/en/pf1.json');
const enDefaultsData = JSON.parse(fs.readFileSync(enDefaultsPath, 'utf8'));
assert.ok(enDefaultsData.BBC?.defaults?.pf1, 'lang/en/pf1.json must contain BBC.defaults.pf1');
const enPf1Entries = enDefaultsData.BBC.defaults.pf1;
assert.equal(Object.keys(enPf1Entries).length, entriesCount, `lang/en/pf1.json must contain all ${entriesCount} spell translations`);

const esDefaultsPath = path.resolve('./lang/es/pf1.json');
const esDefaultsData = JSON.parse(fs.readFileSync(esDefaultsPath, 'utf8'));
assert.ok(esDefaultsData.BBC?.defaults?.pf1, 'lang/es/pf1.json must contain BBC.defaults.pf1');
const esPf1Entries = esDefaultsData.BBC.defaults.pf1;
assert.equal(Object.keys(esPf1Entries).length, entriesCount, `lang/es/pf1.json must contain all ${entriesCount} spell translations`);

const jaDefaultsPath = path.resolve('./lang/ja/pf1.json');
const jaDefaultsData = JSON.parse(fs.readFileSync(jaDefaultsPath, 'utf8'));
assert.ok(jaDefaultsData.BBC?.defaults?.pf1, 'lang/ja/pf1.json must contain BBC.defaults.pf1');
const jaPf1Entries = jaDefaultsData.BBC.defaults.pf1;
assert.equal(Object.keys(jaPf1Entries).length, entriesCount, `lang/ja/pf1.json must contain all ${entriesCount} spell translations`);

for (const slug of Object.keys(data)) {
    assert.ok(slug in enPf1Entries, `Slug ${slug} from pf1.json must be present in lang/en/pf1.json`);
    assert.ok(slug in esPf1Entries, `Slug ${slug} from pf1.json must be present in lang/es/pf1.json`);
    assert.ok(slug in jaPf1Entries, `Slug ${slug} from pf1.json must be present in lang/ja/pf1.json`);
}
console.log('Validated en, es, and ja split PF1e dictionaries successfully!');

// Initialize Pf1SystemAdapter with base system dataset
console.log('Testing Pf1SystemAdapter with multi-language (en, es, ja) system defaults...');
const pf1Adapter = new Pf1SystemAdapter('pf1');
pf1Adapter.setDefaultsData(data);
pf1Adapter.registerLocalizedDefaults(esPf1Entries, data);
pf1Adapter.registerLocalizedDefaults(jaPf1Entries, data);

// 1. Verify direct English Lookups
console.log('Testing English spell name lookups...');
assert.equal(pf1Adapter.getSystemDefault('Burning Hands'), true);
assert.equal(pf1Adapter.getSystemDefault('burning-hands'), true);
assert.equal(pf1Adapter.getSystemDefault('Fireball'), false);
assert.equal(pf1Adapter.getSystemDefault('Cone of Cold'), true);
assert.equal(pf1Adapter.getSystemDefault('Channel Energy'), true);
assert.equal(pf1Adapter.getSystemDefault('Bless'), true);
assert.equal(pf1Adapter.getSystemDefault('Bane'), true);
assert.equal(pf1Adapter.getSystemDefault('Bardic Performance'), true);

// 2. Verify Spanish Localized Name lookups
console.log('Testing Spanish localized spell name lookups...');
assert.equal(pf1Adapter.getSystemDefault('Manos ardientes'), true, 'Spanish "Manos ardientes" should stick (true)');
assert.equal(pf1Adapter.getSystemDefault('Bola de fuego'), false, 'Spanish "Bola de fuego" should not stick (false)');
assert.equal(pf1Adapter.getSystemDefault('Cono de frío'), true, 'Spanish "Cono de frío" should stick (true)');
assert.equal(pf1Adapter.getSystemDefault('Canalizar energía'), true, 'Spanish "Canalizar energía" should stick (true)');
assert.equal(pf1Adapter.getSystemDefault('Bendición'), true, 'Spanish "Bendición" should stick (true)');
assert.equal(pf1Adapter.getSystemDefault('Perdición'), true, 'Spanish "Perdición" should stick (true)');

// 3. Verify Japanese Localized Name lookups
console.log('Testing Japanese localized spell name lookups...');
assert.equal(pf1Adapter.getSystemDefault('バーニング・ハンズ'), true, 'Japanese "バーニング・ハンズ" should stick (true)');
assert.equal(pf1Adapter.getSystemDefault('ファイアーボール'), false, 'Japanese "ファイアーボール" should not stick (false)');
assert.equal(pf1Adapter.getSystemDefault('コーン・オブ・コールド'), true, 'Japanese "コーン・オブ・コールド" should stick (true)');
assert.equal(pf1Adapter.getSystemDefault('チャネル・エナジー'), true, 'Japanese "チャネル・エナジー" should stick (true)');
assert.equal(pf1Adapter.getSystemDefault('ブレス'), true, 'Japanese "ブレス" should stick (true)');

// 4. Verify item document with system.identifier / slug lookup
console.log('Testing item document with slug/identifier lookup...');
const customFireballItem = {
    documentName: 'Item',
    name: 'Bola de fuego personalizada',
    system: { identifier: 'fireball' }
};
assert.equal(pf1Adapter.getSystemDefault({ item: customFireballItem }), false);

const customBurningHandsItem = {
    documentName: 'Item',
    name: 'バーニング・ハンズ・カスタム',
    system: { identifier: 'burning-hands' }
};
assert.equal(pf1Adapter.getSystemDefault({ item: customBurningHandsItem }), true);

// 5. Test shouldStickToToken resolution across mixed languages simultaneously
console.log('Testing shouldStickToToken across mixed English, Spanish, and Japanese names in PF1e...');
assert.equal(shouldStickToToken({ itemName: 'Burning Hands', stickToToken: 'default' }, 'cone', pf1Adapter), true);
assert.equal(shouldStickToToken({ itemName: 'Manos ardientes', stickToToken: 'default' }, 'cone', pf1Adapter), true);
assert.equal(shouldStickToToken({ itemName: 'バーニング・ハンズ', stickToToken: 'default' }, 'cone', pf1Adapter), true);
assert.equal(shouldStickToToken({ itemName: 'Fireball', stickToToken: 'default' }, 'circle', pf1Adapter), false);
assert.equal(shouldStickToToken({ itemName: 'Bola de fuego', stickToToken: 'default' }, 'circle', pf1Adapter), false);
assert.equal(shouldStickToToken({ itemName: 'ファイアーボール', stickToToken: 'default' }, 'circle', pf1Adapter), false);
assert.equal(shouldStickToToken({ itemName: 'Channel Energy', stickToToken: 'default' }, 'circle', pf1Adapter), true);
assert.equal(shouldStickToToken({ itemName: 'Canalizar energía', stickToToken: 'default' }, 'circle', pf1Adapter), true);
assert.equal(shouldStickToToken({ itemName: 'チャネル・エナジー', stickToToken: 'default' }, 'circle', pf1Adapter), true);

console.log('ALL SIMULTANEOUS MULTI-LANGUAGE PF1E SYSTEM-DEFAULTS VERIFICATIONS PASSED PERFECTLY!');
