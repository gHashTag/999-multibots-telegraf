#!/usr/bin/env node

/**
 * Скрипт для проверки корректности обработки кнопок "Баланс" и "Пополнить баланс"
 * Проверяет, что обработчики зарегистрированы правильно и не путаются
 */

const path = require('path');
const fs = require('fs');

// Подключаем файл с levels
const levelsFile = fs.readFileSync(
  path.join(__dirname, '../src/menu/mainMenu.ts'),
  'utf8'
);

// Извлекаем значения levels[100] и levels[101]
const level100Match = levelsFile.match(/100:\s*{\s*title_ru:\s*'([^']+)',\s*title_en:\s*'([^']+)'/);
const level101Match = levelsFile.match(/101:\s*{\s*title_ru:\s*'([^']+)',\s*title_en:\s*'([^']+)'/);

if (!level100Match || !level101Match) {
  console.error('❌ Не удалось найти определения levels[100] или levels[101]');
  process.exit(1);
}

const topUpButtons = {
  ru: level100Match[1],
  en: level100Match[2]
};

const balanceButtons = {
  ru: level101Match[1],
  en: level101Match[2]
};

console.log('\n=== ПРОВЕРКА КНОПОК БАЛАНСА ===\n');

console.log('📋 Найденные определения кнопок:');
console.log(`  levels[100] (Пополнить баланс):`);
console.log(`    RU: "${topUpButtons.ru}"`);
console.log(`    EN: "${topUpButtons.en}"`);
console.log(`  levels[101] (Баланс):`);
console.log(`    RU: "${balanceButtons.ru}"`);
console.log(`    EN: "${balanceButtons.en}"`);

// Проверяем, что кнопки различаются
console.log('\n🔍 Проверка различий:');

const checks = [
  {
    name: 'Русские версии различаются',
    pass: topUpButtons.ru !== balanceButtons.ru
  },
  {
    name: 'Английские версии различаются',
    pass: topUpButtons.en !== balanceButtons.en
  },
  {
    name: 'RU: "Пополнить баланс" не содержится в "Баланс"',
    pass: !balanceButtons.ru.includes(topUpButtons.ru)
  },
  {
    name: 'EN: "Top up balance" не содержится в "Balance"',
    pass: !balanceButtons.en.includes(topUpButtons.en)
  },
  {
    name: 'Слово "Пополнить" есть только в кнопке пополнения',
    pass: topUpButtons.ru.includes('Пополнить') && !balanceButtons.ru.includes('Пополнить')
  },
  {
    name: 'Слово "Top up" есть только в кнопке пополнения',
    pass: topUpButtons.en.includes('Top up') && !balanceButtons.en.includes('Top up')
  }
];

let allPassed = true;
checks.forEach(check => {
  if (check.pass) {
    console.log(`  ✅ ${check.name}`);
  } else {
    console.log(`  ❌ ${check.name}`);
    allPassed = false;
  }
});

// Проверяем обработчики в hearsHandlers.ts
console.log('\n📝 Проверка обработчиков:');

const handlersFile = fs.readFileSync(
  path.join(__dirname, '../src/hearsHandlers.ts'),
  'utf8'
);

// Ищем обработчики для levels[100] и levels[101]
const handler100Match = handlersFile.match(/bot\.hears\(\s*\[levels\[100\].*?\n.*?await ctx\.scene\.enter\(([^)]+)\)/s);
const handler101Match = handlersFile.match(/bot\.hears\(\s*\[levels\[101\].*?\n.*?await ctx\.scene\.enter\(([^)]+)\)/s);

if (handler100Match) {
  const scene100 = handler100Match[1].trim();
  console.log(`  ✅ Обработчик для levels[100] найден → ${scene100}`);
  
  if (scene100.includes('PaymentScene')) {
    console.log('    ✅ Корректно ведет в PaymentScene');
  } else {
    console.log(`    ⚠️  Ведет в ${scene100} вместо PaymentScene`);
    allPassed = false;
  }
} else {
  console.log('  ❌ Обработчик для levels[100] не найден');
  allPassed = false;
}

if (handler101Match) {
  const scene101 = handler101Match[1].trim();
  console.log(`  ✅ Обработчик для levels[101] найден → ${scene101}`);
  
  if (scene101.includes('BalanceScene')) {
    console.log('    ✅ Корректно ведет в BalanceScene');
  } else {
    console.log(`    ⚠️  Ведет в ${scene101} вместо BalanceScene`);
    allPassed = false;
  }
} else {
  console.log('  ❌ Обработчик для levels[101] не найден');
  allPassed = false;
}

// Проверяем возможные конфликты
console.log('\n⚠️  Проверка возможных конфликтов:');

// Проверяем, нет ли дублирующих обработчиков
const balanceHandlersCount = (handlersFile.match(/bot\.hears\([^)]*Баланс/g) || []).length;
const topUpHandlersCount = (handlersFile.match(/bot\.hears\([^)]*Пополнить баланс/g) || []).length;

console.log(`  Обработчиков с "Баланс": ${balanceHandlersCount}`);
console.log(`  Обработчиков с "Пополнить баланс": ${topUpHandlersCount}`);

if (balanceHandlersCount > 1) {
  console.log('    ⚠️  Найдено несколько обработчиков для "Баланс"');
}
if (topUpHandlersCount > 1) {
  console.log('    ⚠️  Найдено несколько обработчиков для "Пополнить баланс"');
}

// Итоговый результат
console.log('\n' + '='.repeat(40));
if (allPassed) {
  console.log('✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ УСПЕШНО!');
  console.log('\nКнопки настроены корректно и должны работать правильно.');
  console.log('Если пользователь испытывает проблемы, возможные причины:');
  console.log('  1. Пользователь нажимает не на кнопку, а вводит текст вручную');
  console.log('  2. У пользователя устаревшая клавиатура (нужно обновить через /menu)');
  console.log('  3. Проблемы с активной сценой (нужно выйти из всех сцен через /menu)');
} else {
  console.log('❌ ОБНАРУЖЕНЫ ПРОБЛЕМЫ!');
  console.log('\nНеобходимо исправить найденные проблемы для корректной работы.');
}

process.exit(allPassed ? 0 : 1);
