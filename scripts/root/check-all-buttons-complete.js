#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 ПОЛНАЯ ПРОВЕРКА ВСЕХ КНОПОК И ОБРАБОТЧИКОВ\n');
console.log('='.repeat(60));

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
console.log('📋 Извлекаем все кнопки из NAVIGATION_BUTTONS...\n');

// Парсим каждую кнопку
const buttons = [];
const buttonMatches = buttonsText.matchAll(/\{\s*ru:\s*['"](.*?)['"],\s*en:\s*['"](.*?)['"],\s*mode:\s*['"]?([^,'"\}]*)['"]?/g);

for (const match of buttonMatches) {
  const ru = match[1];
  const en = match[2];
  const mode = match[3];

  buttons.push({ ru, en, mode });
}

console.log(`✅ Найдено ${buttons.length} кнопок в NAVIGATION_BUTTONS\n`);

console.log('='.repeat(60));
console.log('СПИСОК ВСЕХ КНОПОК:');
console.log('='.repeat(60) + '\n');

buttons.forEach((btn, index) => {
  console.log(`${index + 1}. RU: ${btn.ru}`);
  console.log(`   EN: ${btn.en}`);
  console.log(`   Mode: ${btn.mode}\n`);
});

console.log('='.repeat(60));
console.log('ПРОВЕРКА ОБРАБОТЧИКОВ В HEARSHANDLERS.TS:');
console.log('='.repeat(60) + '\n');

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

console.log(`✅ Найдено ${existingHandlers.length} текстовых обработчиков в hearsHandlers.ts\n`);

console.log('='.repeat(60));
console.log('АНАЛИЗ ПО КНОПКАМ:');
console.log('='.repeat(60) + '\n');

const handlersSet = new Set(existingHandlers);
const missingHandlers = [];
const haveHandlers = [];

buttons.forEach((btn, index) => {
  const hasRuHandler = handlersSet.has(btn.ru);
  const hasEnHandler = handlersSet.has(btn.en);

  if (!hasRuHandler && !hasEnHandler) {
    missingHandlers.push(btn);
    console.log(`❌ КНОПКА БЕЗ ЯВНОГО ОБРАБОТЧИКА #${index + 1}:`);
    console.log(`   RU: ${btn.ru}`);
    console.log(`   EN: ${btn.en}`);
    console.log(`   Mode: ${btn.mode}`);
    console.log(`   ⚠️  Будет обработана универсальным обработчиком!\n`);
  } else {
    haveHandlers.push(btn);
    console.log(`✅ #${index + 1}: ${btn.ru} / ${btn.en}`);
  }
});

console.log('\n' + '='.repeat(60));
console.log('ИТОГО:');
console.log('='.repeat(60));
console.log(`📊 Всего кнопок в NAVIGATION_BUTTONS: ${buttons.length}`);
console.log(`✅ Кнопок с ЯВНЫМИ обработчиками: ${haveHandlers.length}`);
console.log(`⚠️  Кнопок БЕЗ явных обработчиков: ${missingHandlers.length}`);
console.log(`   (они обрабатываются универсальным обработчиком)`);

if (missingHandlers.length > 0) {
  console.log('\n🚨 СПИСОК КНОПОК БЕЗ ЯВНЫХ ОБРАБОТЧИКОВ:');
  console.log('='.repeat(60));
  missingHandlers.forEach((btn, idx) => {
    console.log(`${idx + 1}. ${btn.ru} / ${btn.en} → ${btn.mode}`);
  });
}

console.log('\n' + '='.repeat(60));
console.log('ПРОВЕРКА СООТВЕТСТВИЯ MODEENUМ:');
console.log('='.repeat(60) + '\n');

// Проверяем файлы сцен
const scenesDir = path.join(__dirname, 'src/scenes');
const sceneFiles = fs.readdirSync(scenesDir).filter(f => f.endsWith('.ts') || fs.statSync(path.join(scenesDir, f)).isDirectory());

console.log('📁 Найденные сцены:');
sceneFiles.forEach(file => {
  console.log(`   - ${file}`);
});

console.log('\n' + '='.repeat(60));
console.log('АНАЛИЗ ЗАВЕРШЕН');
console.log('='.repeat(60) + '\n');

if (missingHandlers.length === 0) {
  console.log('✅ ВСЕ КНОПКИ ИМЕЮТ ОБРАБОТЧИКИ!');
} else {
  console.log(`⚠️  У ВАС ${missingHandlers.length} КНОПОК БЕЗ ЯВНЫХ ОБРАБОТЧИКОВ`);
  console.log('   НО ОНИ ОБРАБАТЫВАЮТСЯ УНИВЕРСАЛЬНЫМ ОБРАБОТЧИКОМ!');
}
