#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Читаем файл
const filePath = path.join(__dirname, '../src/scenes/avatarTransformScene/index.ts');
const content = fs.readFileSync(filePath, 'utf8');

// Извлекаем AI_HEROES
const aiHeroesMatch = content.match(/const AI_HEROES = \{([\s\S]*?)\}/);
const maleHeroesMatch = aiHeroesMatch[1].match(/male: \[([\s\S]*?)\]/);
const maleHeroes = maleHeroesMatch ? maleHeroesMatch[1]
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.startsWith("'") && line.includes(','))
  .map(line => line.replace(/^'/, '').replace(/',.*$/, '').trim()) : [];

// Извлекаем heroPrompts секцию
const heroPromptsStart = content.indexOf('const heroPrompts: Record<string, string> = {');
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

console.log('🔍 Checking specific heroes...\n');

// Проверяем конкретно Тора
console.log('=== ТОР ===');
console.log('In male heroes:', maleHeroes.includes('Тор'));
console.log('In heroPrompts section:', heroPromptsSection.includes('Тор:'));

// Ищем все вхождения Тора
const torMatches = heroPromptsSection.match(/Тор[^\w]/g);
console.log('All Tor matches:', torMatches);

// Ищем все строки с двоеточием после имени
const promptMatches = heroPromptsSection.match(/^\s*([^:]+):\s*`/gm);
console.log('\nAll prompt keys found:');
if (promptMatches) {
  promptMatches.forEach((match, i) => {
    const key = match.replace(/^\s*/, '').replace(/:\s*`.*$/, '');
    if (i < 10) {
      console.log(`${i+1}. "${key}"`);
    }
  });
}

// Специальная проверка для проблемных героев
const problemHeroes = ['Тор', 'Шури', 'Валькирия', 'Гамора'];
console.log('\n=== PROBLEM HEROES ===');
problemHeroes.forEach(hero => {
  const inSection = heroPromptsSection.includes(hero + ':');
  const inSectionQuoted = heroPromptsSection.includes(`'${hero}':`);
  const inSectionDoubleQuoted = heroPromptsSection.includes(`"${hero}":`);
  console.log(`${hero}:`);
  console.log(`  - Without quotes: ${inSection}`);
  console.log(`  - With single quotes: ${inSectionQuoted}`);
  console.log(`  - With double quotes: ${inSectionDoubleQuoted}`);
});