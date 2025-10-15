#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔥 [FINAL CHECK] Starting comprehensive AI Heroes final validation...\n');

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

// Собираем все героев
const allHeroes = [...maleHeroes, ...femaleHeroes];

// Простая проверка промптов - ищем hero: ` в файле
const heroPromptsFound = [];
for (const hero of allHeroes) {
  // Ищем и с кавычками и без кавычек
  if (content.includes(`'${hero}': \``) || content.includes(`"${hero}": \``) || content.includes(`${hero}: \``)) {
    heroPromptsFound.push(hero);
  }
}

// Простая проверка buttonToHeroMap
const maleButtonsFound = [];
const femaleButtonsFound = [];

for (const hero of maleHeroes) {
  if (content.includes(`'🎨 ${hero}': '${hero}'`)) {
    maleButtonsFound.push(hero);
  }
}

for (const hero of femaleHeroes) {
  if (content.includes(`'✨ ${hero}': '${hero}'`)) {
    femaleButtonsFound.push(hero);
  }
}

console.log('📊 [FINAL STATISTICS]');
console.log(`Total Heroes in AI_HEROES: ${allHeroes.length}`);
console.log(`Male Heroes: ${maleHeroes.length}`);
console.log(`Female Heroes: ${femaleHeroes.length}`);
console.log(`Heroes with Prompts: ${heroPromptsFound.length}`);
console.log(`Male Heroes with Buttons: ${maleButtonsFound.length}`);
console.log(`Female Heroes with Buttons: ${femaleButtonsFound.length}`);
console.log(`Total Buttons Found: ${maleButtonsFound.length + femaleButtonsFound.length}\n`);

// КРИТИЧЕСКИЕ ПРОВЕРКИ
let allTestsPassed = true;
let errorCount = 0;

console.log('🔍 [CRITICAL FINAL CHECKS]\n');

// 1. Все герои имеют промпты
const missingPrompts = allHeroes.filter(hero => !heroPromptsFound.includes(hero));
if (missingPrompts.length > 0) {
  console.log(`❌ [FAIL] Heroes WITHOUT prompts (${missingPrompts.length}):`);
  missingPrompts.slice(0, 10).forEach(hero => console.log(`   - ${hero}`));
  if (missingPrompts.length > 10) {
    console.log(`   ... and ${missingPrompts.length - 10} more`);
  }
  allTestsPassed = false;
  errorCount += missingPrompts.length;
} else {
  console.log('✅ [PASS] All heroes have prompts');
}

// 2. Все мужские герои имеют button mappings
const missingMaleButtons = maleHeroes.filter(hero => !maleButtonsFound.includes(hero));
if (missingMaleButtons.length > 0) {
  console.log(`❌ [FAIL] Male heroes WITHOUT button mapping (${missingMaleButtons.length}):`);
  missingMaleButtons.slice(0, 10).forEach(hero => console.log(`   - 🎨 ${hero}`));
  if (missingMaleButtons.length > 10) {
    console.log(`   ... and ${missingMaleButtons.length - 10} more`);
  }
  allTestsPassed = false;
  errorCount += missingMaleButtons.length;
} else {
  console.log('✅ [PASS] All male heroes have button mappings');
}

// 3. Все женские герои имеют button mappings
const missingFemaleButtons = femaleHeroes.filter(hero => !femaleButtonsFound.includes(hero));
if (missingFemaleButtons.length > 0) {
  console.log(`❌ [FAIL] Female heroes WITHOUT button mapping (${missingFemaleButtons.length}):`);
  missingFemaleButtons.slice(0, 10).forEach(hero => console.log(`   - ✨ ${hero}`));
  if (missingFemaleButtons.length > 10) {
    console.log(`   ... and ${missingFemaleButtons.length - 10} more`);
  }
  allTestsPassed = false;
  errorCount += missingFemaleButtons.length;
} else {
  console.log('✅ [PASS] All female heroes have button mappings');
}

// 4. Проверим конкретно критических героев
const criticalHeroes = ['Киборг', 'Тор', 'Человек-паук', 'Железный человек', 'Супермен', 'Бэтмен', 'Гоку', 'Наруто'];
console.log('\n🎯 [CRITICAL HEROES CHECK]:');
for (const hero of criticalHeroes) {
  const hasPrompt = heroPromptsFound.includes(hero);
  const hasButton = maleButtonsFound.includes(hero) || femaleButtonsFound.includes(hero);
  const status = hasPrompt && hasButton ? '✅' : '❌';
  console.log(`${status} ${hero} - Prompt: ${hasPrompt ? '✅' : '❌'}, Button: ${hasButton ? '✅' : '❌'}`);
  
  if (!hasPrompt || !hasButton) {
    allTestsPassed = false;
    errorCount++;
  }
}

// 5. Coverage check
const promptCoverage = (heroPromptsFound.length / allHeroes.length * 100).toFixed(1);
const maleButtonCoverage = (maleButtonsFound.length / maleHeroes.length * 100).toFixed(1);
const femaleButtonCoverage = (femaleButtonsFound.length / femaleHeroes.length * 100).toFixed(1);

console.log('\n📈 [COVERAGE REPORT]:');
console.log(`Prompt Coverage: ${promptCoverage}% (${heroPromptsFound.length}/${allHeroes.length})`);
console.log(`Male Button Coverage: ${maleButtonCoverage}% (${maleButtonsFound.length}/${maleHeroes.length})`);
console.log(`Female Button Coverage: ${femaleButtonCoverage}% (${femaleButtonsFound.length}/${femaleHeroes.length})`);

// ФИНАЛЬНЫЙ РЕЗУЛЬТАТ
console.log('\n' + '='.repeat(70));
if (allTestsPassed) {
  console.log('🎉 [SUCCESS] ALL AI Heroes tests PASSED!');
  console.log('✅ System is READY FOR PRODUCTION DEPLOYMENT!');
  console.log(`✅ All ${allHeroes.length} heroes are fully configured`);
  console.log('✅ All prompts and button mappings are in place');
  console.log('✅ All critical heroes validated');
  console.log('\n🚀 READY TO DEPLOY TO PRODUCTION! 🚀');
} else {
  console.log(`💥 [FAILURE] ${errorCount} errors found in AI Heroes configuration`);
  console.log('🚨 Fix these issues before production deployment!');
  console.log('\n❌ NOT READY FOR PRODUCTION');
  process.exit(1);
}