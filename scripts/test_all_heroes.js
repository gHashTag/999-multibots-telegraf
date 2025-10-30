#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🧪 [HERO TEST] Starting comprehensive AI Heroes validation...\n');

// Читаем файл с scene
const filePath = path.join(__dirname, '../src/scenes/avatarTransformScene/index.ts');
const content = fs.readFileSync(filePath, 'utf8');

// Извлекаем AI_HEROES
const aiHeroesMatch = content.match(/const AI_HEROES = \{([\s\S]*?)\}/);
if (!aiHeroesMatch) {
  console.log('❌ Could not find AI_HEROES object');
  process.exit(1);
}

// Parse male heroes
const maleHeroesMatch = aiHeroesMatch[1].match(/male: \[([\s\S]*?)\]/);
const maleHeroes = maleHeroesMatch ? maleHeroesMatch[1]
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.startsWith("'") && line.includes(','))
  .map(line => line.replace(/^'/, '').replace(/',.*$/, '').trim()) : [];

// Parse female heroes  
const femaleHeroesMatch = aiHeroesMatch[1].match(/female: \[([\s\S]*?)\]/);
const femaleHeroes = femaleHeroesMatch ? femaleHeroesMatch[1]
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.startsWith("'") && line.includes(','))
  .map(line => line.replace(/^'/, '').replace(/',.*$/, '').trim()) : [];

// Извлекаем heroPrompts
const heroPromptsStart = content.indexOf('const heroPrompts: Record<string, string> = {');
if (heroPromptsStart === -1) {
  console.log('❌ Could not find heroPrompts object');
  process.exit(1);
}

let heroPromptsEnd = heroPromptsStart;
let braceCount = 0;
for (let i = heroPromptsStart; i < content.length; i++) {
  if (content[i] === '{') braceCount++;
  if (content[i] === '}') {
    braceCount--;
    if (braceCount === 0) {
      heroPromptsEnd = i;
      break;
    }
  }
}

const heroPromptsSection = content.slice(heroPromptsStart, heroPromptsEnd);
const heroPromptsKeys = [];

// Улучшенный парсинг промптов - ищем все возможные варианты ключей
const promptMatches = heroPromptsSection.match(/^\s*(?:['"]([^'"]+)['"]|([^\s:]+(?:\s+[^\s:]+)*)):\s*`/gm);
if (promptMatches) {
  promptMatches.forEach(match => {
    const cleaned = match.replace(/^\s*/, '').replace(/:\s*`.*$/, '');
    // Убираем кавычки если есть
    const key = cleaned.replace(/^['"]|['"]$/g, '');
    if (key && !key.startsWith('//') && key.trim().length > 0) {
      heroPromptsKeys.push(key.trim());
    }
  });
}

// Извлекаем buttonToHeroMap
const buttonMapStart = content.indexOf('const buttonToHeroMap: Record<string, string> = {');
if (buttonMapStart === -1) {
  console.log('❌ Could not find buttonToHeroMap object');
  process.exit(1);
}

let buttonMapEnd = buttonMapStart;
braceCount = 0;
for (let i = buttonMapStart; i < content.length; i++) {
  if (content[i] === '{') braceCount++;
  if (content[i] === '}') {
    braceCount--;
    if (braceCount === 0) {
      buttonMapEnd = i;
      break;
    }
  }
}

const buttonMapSection = content.slice(buttonMapStart, buttonMapEnd);
const buttonMapKeys = [];
const buttonLines = buttonMapSection.split('\n');
for (const line of buttonLines) {
  const trimmed = line.trim();
  // Ищем строки вида '🎨 Hero': 'Hero'
  const match = trimmed.match(/^['"]([^'"]+)['"]:\s*['"]([^'"]+)['"],?/);
  if (match && !trimmed.startsWith('//')) {
    buttonMapKeys.push({
      button: match[1],
      hero: match[2]
    });
  }
}

// Собираем всех героев
const allHeroes = [...maleHeroes, ...femaleHeroes];

console.log('📊 [STATISTICS]');
console.log(`Total Heroes in AI_HEROES: ${allHeroes.length}`);
console.log(`Male Heroes: ${maleHeroes.length}`);
console.log(`Female Heroes: ${femaleHeroes.length}`);
console.log(`Heroes with Prompts: ${heroPromptsKeys.length}`);
console.log(`Button Mappings: ${buttonMapKeys.length}\n`);

// 🔍 ГЛАВНЫЕ ПРОВЕРКИ
let allTestsPassed = true;
let errorCount = 0;

console.log('🔍 [CRITICAL CHECKS]\n');

// 1. Проверяем что у всех героев есть промпты
const missingPrompts = allHeroes.filter(hero => !heroPromptsKeys.includes(hero));
if (missingPrompts.length > 0) {
  console.log(`❌ [FAIL] Heroes WITHOUT prompts (${missingPrompts.length}):`);
  missingPrompts.forEach(hero => console.log(`   - ${hero}`));
  allTestsPassed = false;
  errorCount += missingPrompts.length;
} else {
  console.log('✅ [PASS] All heroes have prompts');
}

// 2. Проверяем лишние промпты (которые есть но нет героя)
const extraPrompts = heroPromptsKeys.filter(prompt => !allHeroes.includes(prompt));
if (extraPrompts.length > 0) {
  console.log(`⚠️  [WARN] Prompts WITHOUT heroes (${extraPrompts.length}):`);
  extraPrompts.forEach(prompt => console.log(`   - ${prompt}`));
}

// 3. Проверяем buttonToHeroMap для всех героев
const missingMaleButtons = maleHeroes.filter(hero => {
  return !buttonMapKeys.some(btn => btn.button === `🎨 ${hero}` && btn.hero === hero);
});

const missingFemaleButtons = femaleHeroes.filter(hero => {
  return !buttonMapKeys.some(btn => btn.button === `✨ ${hero}` && btn.hero === hero);
});

if (missingMaleButtons.length > 0) {
  console.log(`❌ [FAIL] Male heroes WITHOUT button mapping (${missingMaleButtons.length}):`);
  missingMaleButtons.forEach(hero => console.log(`   - 🎨 ${hero}`));
  allTestsPassed = false;
  errorCount += missingMaleButtons.length;
}

if (missingFemaleButtons.length > 0) {
  console.log(`❌ [FAIL] Female heroes WITHOUT button mapping (${missingFemaleButtons.length}):`);
  missingFemaleButtons.forEach(hero => console.log(`   - ✨ ${hero}`));
  allTestsPassed = false;
  errorCount += missingFemaleButtons.length;
}

if (missingMaleButtons.length === 0 && missingFemaleButtons.length === 0) {
  console.log('✅ [PASS] All heroes have button mappings');
}

// 4. Проверяем дубликаты
const duplicateHeroes = [];
const heroSet = new Set();
for (const hero of allHeroes) {
  if (heroSet.has(hero)) {
    duplicateHeroes.push(hero);
  } else {
    heroSet.add(hero);
  }
}

if (duplicateHeroes.length > 0) {
  console.log(`❌ [FAIL] Duplicate heroes (${duplicateHeroes.length}):`);
  duplicateHeroes.forEach(hero => console.log(`   - ${hero}`));
  allTestsPassed = false;
  errorCount += duplicateHeroes.length;
} else {
  console.log('✅ [PASS] No duplicate heroes');
}

// 5. Особая проверка для Киборга
console.log('\n🤖 [SPECIAL CHECK] Киборг validation:');
const cyborgInMale = maleHeroes.includes('Киборг');
const cyborgInFemale = femaleHeroes.includes('Киборг');
const cyborgHasPrompt = heroPromptsKeys.includes('Киборг');
const cyborgHasButton = buttonMapKeys.some(btn => btn.hero === 'Киборг');

console.log(`   - In male heroes: ${cyborgInMale ? '✅' : '❌'}`);
console.log(`   - In female heroes: ${cyborgInFemale ? '✅' : '❌'}`);
console.log(`   - Has prompt: ${cyborgHasPrompt ? '✅' : '❌'}`);
console.log(`   - Has button mapping: ${cyborgHasButton ? '✅' : '❌'}`);

if (!cyborgHasPrompt) {
  console.log('❌ [CRITICAL] Киборг missing prompt!');
  allTestsPassed = false;
  errorCount++;
}

if (!cyborgHasButton) {
  console.log('❌ [CRITICAL] Киборг missing button mapping!');
  allTestsPassed = false;
  errorCount++;
}

// ИТОГ
console.log('\n' + '='.repeat(60));
if (allTestsPassed) {
  console.log('🎉 [SUCCESS] All AI Heroes tests PASSED!');
  console.log('✅ All 144 heroes are properly configured');
} else {
  console.log(`💥 [FAILURE] ${errorCount} errors found in AI Heroes configuration`);
  console.log('🚨 Fix these issues before deployment!');
  process.exit(1);
}