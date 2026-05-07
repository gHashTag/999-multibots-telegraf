/**
 * АНАЛИЗ АНОМАЛЬНЫХ ДАННЫХ В PAYMENTS_DATA.JSON
 * Ищет подозрительные записи, но НЕ удаляет их
 */

const fs = require('fs');

console.log('🔍 АНАЛИЗ АНОМАЛЬНЫХ ДАННЫХ\n');
console.log('='.repeat(80));

// Загружаем данные
const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));
console.log(`📊 Всего записей: ${data.length.toLocaleString()}\n`);

// Уже удаленные фильтрами (справка)
console.log('✅ УЖЕ УДАЛЕНЫ ФИЛЬТРАМИ:');
console.log('  - VIBECODER academy: 30,500,000 RUB');
console.log('  - VIBECODER training program: 350,000 RUB');
console.log('  - TEST_DATA entries');
console.log('  - 🎁 ПРОМО entries');
console.log('  - 🔥 ADMIN GRANT entries');
console.log('  - Amounts > 5,000 RUB');
console.log('  - Дубликаты\n');

// 1. АНАЛИЗ БОЛЬШИХ СУММ
console.log('1️⃣ ЗАПИСИ С БОЛЬШИМИ СУММАМИ (топ-20):');
const sortedByAmount = data
  .map(row => ({
    ...row,
    absAmount: Math.abs(parseFloat(row.amount) || 0)
  }))
  .filter(row => row.absAmount > 0)
  .sort((a, b) => b.absAmount - a.absAmount)
  .slice(0, 20);

sortedByAmount.forEach((row, i) => {
  console.log(`${i + 1}. ${row.absAmount.toLocaleString()} ${row.currency} | ${row.bot_name} | ${row.description.substring(0, 60)}${row.description.length > 60 ? '...' : ''}`);
});

// 2. ПОИСК ПОДОЗРИТЕЛЬНЫХ ПАТТЕРНОВ В DESCRIPTIONS
console.log('\n\n2️⃣ ПОДОЗРИТЕЛЬНЫЕ ПАТТЕРНЫ В ОПИСАНИЯХ:');

// Собираем все уникальные описания и их количество
const descriptionStats = {};
data.forEach(row => {
  const desc = row.description || '';
  const key = desc.toUpperCase();
  if (!descriptionStats[key]) {
    descriptionStats[key] = {
      count: 0,
      totalAmount: 0,
      sample: row
    };
  }
  descriptionStats[key].count++;
  descriptionStats[key].totalAmount += Math.abs(parseFloat(row.amount) || 0);
});

// Ищем подозрительные паттерны
const suspiciousPatterns = [
  { pattern: /ADMIN/i, name: 'ADMIN entries' },
  { pattern: /GRANT/i, name: 'GRANT entries' },
  { pattern: /BONUS/i, name: 'BONUS entries' },
  { pattern: /TEST/i, name: 'TEST entries' },
  { pattern: /DEMO/i, name: 'DEMO entries' },
  { pattern: /SAMPLE/i, name: 'SAMPLE entries' },
  { pattern: /ПРОМО/i, name: 'ПРОМО entries' },
  { pattern: /АКЦИЯ/i, name: 'Промо-акция entries' },
  { pattern: /БОНУС/i, name: 'БОНУС entries' },
  { pattern: /АКАДЕМИЯ/i, name: 'АКАДЕМИЯ entries' },
  { pattern: /VIBECODER/i, name: 'VIBECODER entries' },
  { pattern: /МАСТЕР-КЛАСС/i, name: 'МАСТЕР-КЛАСС entries' },
  { pattern: /ОБУЧЕНИЕ/i, name: 'ОБУЧЕНИЕ entries' },
  { pattern: /КУРС/i, name: 'КУРС entries' },
  { pattern: /TRAINING/i, name: 'TRAINING entries' },
  { pattern: /ACADEMY/i, name: 'ACADEMY entries' },
  { pattern: /SYSTEM/i, name: 'SYSTEM entries' },
  { pattern: /INTERNAL/i, name: 'INTERNAL entries' },
  { pattern: /REFUND/i, name: 'REFUND entries' },
  { pattern: /RETURN/i, name: 'RETURN entries' }
];

suspiciousPatterns.forEach(({ pattern, name }) => {
  const matches = Object.keys(descriptionStats).filter(desc => pattern.test(desc));
  if (matches.length > 0) {
    console.log(`\n${name}:`);
    matches.slice(0, 10).forEach(desc => {
      const info = descriptionStats[desc];
      console.log(`  - "${desc.substring(0, 80)}${desc.length > 80 ? '...' : ''}"`);
      console.log(`    Count: ${info.count}, Total: ${info.totalAmount.toLocaleString()} ${info.sample.currency}`);
    });
  }
});

// 3. АНАЛИЗ ПОЛЬЗОВАТЕЛЕЙ С АНОМАЛЬНОЙ АКТИВНОСТЬЮ
console.log('\n\n3️⃣ ПОЛЬЗОВАТЕЛИ С АНОМАЛЬНОЙ АКТИВНОСТЬЮ:');

const userStats = {};
data.forEach(row => {
  const userId = row.telegram_id;
  if (!userStats[userId]) {
    userStats[userId] = {
      count: 0,
      totalAmount: 0,
      bots: new Set(),
      sample: row
    };
  }
  userStats[userId].count++;
  userStats[userId].totalAmount += Math.abs(parseFloat(row.amount) || 0);
  userStats[userId].bots.add(row.bot_name);
});

// Топ-10 пользователей по суммам
const topUsersByAmount = Object.entries(userStats)
  .map(([id, stats]) => ({
    userId: id,
    ...stats,
    uniqueBots: stats.bots.size
  }))
  .sort((a, b) => b.totalAmount - a.totalAmount)
  .slice(0, 10);

console.log('\nТоп-10 пользователей по суммам:');
topUsersByAmount.forEach((user, i) => {
  console.log(`${i + 1}. ID: ${user.userId} | ${user.totalAmount.toLocaleString()} | ${user.count} операций | ${user.uniqueBots} ботов`);
  console.log(`   Bots: ${Array.from(user.bots).join(', ')}`);
});

// 4. АНАЛИЗ ПОЛЬЗОВАТЕЛЕЙ С НЕОБЫЧНЫМИ ID
console.log('\n\n4️⃣ ПОДОЗРИТЕЛЬНЫЕ TELEGRAM ID:');

// Проверяем ID на подозрительные паттерны
const suspiciousIds = Object.keys(userStats).filter(id => {
  // Очень короткие ID (возможно тестовые)
  if (id.length < 7) return true;

  // Очень длинные ID (возможно фейковые)
  if (id.length > 12) return true;

  // ID с повторяющимися цифрами
  const uniqueDigits = new Set(id.split('')).size;
  if (uniqueDigits < 3) return true;

  return false;
});

if (suspiciousIds.length > 0) {
  console.log(`Найдено ${suspiciousIds.length} подозрительных ID:`);
  suspiciousIds.slice(0, 20).forEach(id => {
    const stats = userStats[id];
    console.log(`  - ID: ${id} | ${stats.totalAmount.toLocaleString()} | ${stats.count} операций | Bot: ${stats.sample.bot_name}`);
  });
} else {
  console.log('✅ Подозрительных Telegram ID не найдено');
}

// 5. АНАЛИЗ БОТОВ
console.log('\n\n5️⃣ АНАЛИЗ ПО БОТАМ:');

const botStats = {};
data.forEach(row => {
  const bot = row.bot_name;
  if (!botStats[bot]) {
    botStats[bot] = {
      count: 0,
      totalAmount: 0,
      uniqueUsers: new Set(),
      sample: row
    };
  }
  botStats[bot].count++;
  botStats[bot].totalAmount += Math.abs(parseFloat(row.amount) || 0);
  botStats[bot].uniqueUsers.add(row.telegram_id);
});

const botsArray = Object.entries(botStats).map(([name, stats]) => ({
  name,
  ...stats,
  uniqueUsers: stats.uniqueUsers.size
})).sort((a, b) => b.totalAmount - a.totalAmount);

console.log('Топ-10 ботов по суммам:');
botsArray.slice(0, 10).forEach((bot, i) => {
  console.log(`${i + 1}. ${bot.name}`);
  console.log(`   Total: ${bot.totalAmount.toLocaleString()} | Operations: ${bot.count} | Users: ${bot.uniqueUsers}`);
});

// Проверяем на подозрительные названия ботов
const suspiciousBotNames = botsArray.filter(bot => {
  return /test|demo|sample|admin|system/i.test(bot.name);
});

if (suspiciousBotNames.length > 0) {
  console.log('\nПодозрительные названия ботов:');
  suspiciousBotNames.forEach(bot => {
    console.log(`  - ${bot.name} | ${bot.totalAmount.toLocaleString()} | ${bot.count} операций`);
  });
}

// 6. АНАЛИЗ ВРЕМЕННЫХ АНОМАЛИЙ
console.log('\n\n6️⃣ ВРЕМЕННЫЕ АНОМАЛИИ:');

const dateStats = {};
data.forEach(row => {
  const date = new Date(row.created_at);
  const dateKey = date.toISOString().slice(0, 10);
  if (!dateStats[dateKey]) {
    dateStats[dateKey] = { count: 0, total: 0 };
  }
  dateStats[dateKey].count++;
  dateStats[dateKey].total += Math.abs(parseFloat(row.amount) || 0);
});

const datesArray = Object.entries(dateStats).sort((a, b) => b[1].count - a[1].count);

// Дни с аномальным количеством операций
const avgOperationsPerDay = datesArray.reduce((sum, [, stats]) => sum + stats.count, 0) / datesArray.length;
const anomalousDays = datesArray.filter(([, stats]) => stats.count > avgOperationsPerDay * 5);

if (anomalousDays.length > 0) {
  console.log(`Дни с аномальным количеством операций (среднее: ${avgOperationsPerDay.toFixed(1)}):`);
  anomalousDays.slice(0, 10).forEach(([date, stats]) => {
    console.log(`  ${date}: ${stats.count} операций, ${stats.total.toLocaleString()} сумма`);
  });
}

// 7. ФИНАЛЬНАЯ СВОДКА
console.log('\n\n' + '='.repeat(80));
console.log('📋 СВОДКА НАЙДЕННЫХ АНОМАЛИЙ:');
console.log('='.repeat(80));

console.log('\n✅ ПОДТВЕРЖДЕНО К УДАЛЕНИЮ:');
console.log('  1. VIBECODER Академия - 30,500,000 RUB (уже удалено)');
console.log('  2. VIBECODER программа обучения - 350,000 RUB (уже удалено)');

console.log('\n⚠️ ТРЕБУЮТ ВНИМАНИЯ:');

if (suspiciousIds.length > 0) {
  console.log(`  1. Подозрительные Telegram ID: ${suspiciousIds.length} шт.`);
}

if (suspiciousBotNames.length > 0) {
  console.log(`  2. Подозрительные названия ботов: ${suspiciousBotNames.length} шт.`);
}

if (anomalousDays.length > 0) {
  console.log(`  3. Дни с аномальной активностью: ${anomalousDays.length} шт.`);
}

// Показываем записи с самыми большими суммами
console.log('\n  4. Записи с большими суммами (топ-10):');
sortedByAmount.slice(0, 10).forEach((row, i) => {
  console.log(`     ${i + 1}. ${row.absAmount.toLocaleString()} ${row.currency} | ${row.description.substring(0, 70)}${row.description.length > 70 ? '...' : ''}`);
});

console.log('\n💡 РЕКОМЕНДАЦИЯ:');
console.log('   Проанализируй список выше и реши, какие записи нужно удалить.');
console.log('   После твоего решения обновлю фильтры в full-analytics.test.ts\n');
