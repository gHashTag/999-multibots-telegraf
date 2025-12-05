#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Читаем unified-navigation.config.ts
const navConfigPath = path.join(__dirname, 'src/navigation/unified-navigation.config.ts');
const navContent = fs.readFileSync(navConfigPath, 'utf8');

// Читаем hearsHandlers.ts
const hearsPath = path.join(__dirname, 'src/hearsHandlers.ts');
const hearsContent = fs.readFileSync(hearsPath, 'utf8');

// Извлекаем NAVIGATION_BUTTONS
const navButtonsMatch = navContent.match(/export const NAVIGATION_BUTTONS: NavigationButton\[\] = \[([\s\S]*?)\];/);

if (!navButtonsMatch) {
  console.error('❌ Не удалось найти NAVIGATION_BUTTONS в unified-navigation.config.ts');
  process.exit(1);
}

const buttonsText = navButtonsMatch[1];
console.log('📋 Обнаружено NAVIGATION_BUTTONS, извлекаем кнопки...\n');

// Парсим каждую кнопку
const buttons = [];
const buttonMatches = buttonsText.matchAll(/\{[\s\S]*?ru: ['"](.*?)['"],\s*en: ['"](.*?)['"],\s*mode: ['"]?([^,'}]*)['"]?[\s\S]*?\}/g);

for (const match of buttonMatches) {
  const ru = match[1];
  const en = match[2];
  const mode = match[3];

  buttons.push({ ru, en, mode });
}

console.log(`✅ Найдено ${buttons.length} кнопок в NAVIGATION_BUTTONS\n`);
console.log('====================================================');
console.log('СПИСОК ВСЕХ КНОПОК ИЗ NAVIGATION_BUTTONS:');
console.log('====================================================\n');

buttons.forEach((btn, index) => {
  console.log(`${index + 1}. ${btn.ru} / ${btn.en}`);
  console.log(`   Mode: ${btn.mode}\n`);
});

// Извлекаем все существующие bot.hears() обработчики
console.log('====================================================');
console.log('АНАЛИЗ СУЩЕСТВУЮЩИХ ОБРАБОТЧИКОВ:');
console.log('====================================================\n');

// Ищем все bot.hears()
const hearsRegex = /bot\.hears\(\s*\[([^\]]+)\]/g;
const existingHandlers = [];
let match;

while ((match = hearsRegex.exec(hearsContent)) !== null) {
  const arrayText = match[1];
  // Извлекаем все строки из массива
  const strings = arrayText.match(/['"]([^'"]+)['"]/g);
  if (strings) {
    strings.forEach(str => {
      const cleanStr = str.replace(/['"]/g, '');
      existingHandlers.push(cleanStr);
    });
  }
}

console.log(`✅ Найдено ${existingHandlers.length} текстовых обработчиков\n`);

console.log('====================================================');
console.log('СРАВНЕНИЕ: КНОПКИ БЕЗ ОБРАБОТЧИКОВ:');
console.log('====================================================\n');

const handlersSet = new Set(existingHandlers);
const missingHandlers = [];

buttons.forEach((btn, index) => {
  const hasRuHandler = handlersSet.has(btn.ru);
  const hasEnHandler = handlersSet.has(btn.en);

  if (!hasRuHandler && !hasEnHandler) {
    missingHandlers.push(btn);
    console.log(`❌ КНОПКА БЕЗ ОБРАБОТЧИКА #${index + 1}:`);
    console.log(`   RU: ${btn.ru}`);
    console.log(`   EN: ${btn.en}`);
    console.log(`   Mode: ${btn.mode}\n`);
  } else {
    console.log(`✅ #${index + 1}: ${btn.ru}`);
  }
});

console.log('\n====================================================');
console.log('ИТОГО:');
console.log('====================================================');
console.log(`📊 Всего кнопок в NAVIGATION_BUTTONS: ${buttons.length}`);
console.log(`✅ Кнопок с обработчиками: ${buttons.length - missingHandlers.length}`);
console.log(`❌ Кнопок БЕЗ обработчиков: ${missingHandlers.length}`);

if (missingHandlers.length > 0) {
  console.log('\n🚨 НУЖНО ДОБАВИТЬ ОБРАБОТЧИКИ ДЛЯ ЭТИХ КНОПОК!\n');

  missingHandlers.forEach((btn, idx) => {
    console.log(`${idx + 1}. ${btn.ru} / ${btn.en}`);
  });
} else {
  console.log('\n✅ ВСЕ КНОПКИ ИМЕЮТ ОБРАБОТЧИКИ!');
}

console.log('\n====================================================');
console.log('АНАЛИЗ ЗАВЕРШЕН');
console.log('====================================================\n');
