/**
 * ОТЛАДКА ФИЛЬТРАЦИИ РУБЛЕВЫХ ЗАПИСЕЙ
 */

const fs = require('fs');

console.log('🔍 ОТЛАДКА ФИЛЬТРАЦИИ РУБЛЕВЫХ ЗАПИСЕЙ');
console.log('='.repeat(80));

const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

// Получаем списки ботов
const bots = require('./scripts/constants/bots.js');
const PRODUCTION_BOTS = bots.PRODUCTION_BOTS;
const TEST_BOTS = bots.TEST_BOTS;
const FAKE_BOTS = bots.FAKE_BOTS;

console.log('📊 Списки ботов:');
console.log(`   PRODUCTION_BOTS (${PRODUCTION_BOTS.length}): ${PRODUCTION_BOTS.join(', ')}`);
console.log(`   TEST_BOTS (${TEST_BOTS.length}): ${TEST_BOTS.join(', ')}`);
console.log(`   FAKE_BOTS (${FAKE_BOTS.length}): ${FAKE_BOTS.slice(0, 5).join(', ')}... и еще\n`);

// Берем только рублевые
const rubTransactions = data.filter(row => row.currency === 'RUB');

// Применяем фильтры ПОШАГОВО
console.log('1️⃣ ДО ФИЛЬТРАЦИИ:');
const step1 = rubTransactions.length;
const sum1 = rubTransactions.reduce((sum, row) => sum + Math.abs(parseFloat(row.amount) || 0), 0);
console.log(`   Записей: ${step1.toLocaleString()}`);
console.log(`   Сумма: ${Math.round(sum1).toLocaleString()}₽\n`);

// Фильтр 1: Конкретные аномальные VIBECODER
const step2 = rubTransactions.filter(row => {
  const desc = (row.description || '').toUpperCase();
  if (desc.includes('АКАДЕМИЯ ВАЙБКОДЕРА')) return false;
  if (desc.includes('12-МЕСЯЧНАЯ ПРОГРАММА ОБУЧЕНИЯ')) return false;
  if (desc.includes('ГОД ОБУЧЕНИЯ С ИИ-АГЕНТАМИ')) return false;
  return true;
});

console.log('2️⃣ ПОСЛЕ ФИЛЬТРА VIBECODER АКАДЕМИЯ/ПРОГРАММА:');
console.log(`   Удалено: ${(step1 - step2.length).toLocaleString()}`);
console.log(`   Осталось: ${step2.length.toLocaleString()}`);
const sum2 = step2.reduce((sum, row) => sum + Math.abs(parseFloat(row.amount) || 0), 0);
console.log(`   Сумма: ${Math.round(sum2).toLocaleString()}₽`);
console.log(`   Потеря: ${Math.round(sum1 - sum2).toLocaleString()}₽\n`);

// Показываем что удалилось
const deleted1 = rubTransactions.filter(row => {
  const desc = (row.description || '').toUpperCase();
  return desc.includes('АКАДЕМИЯ ВАЙБКОДЕРА') ||
         desc.includes('12-МЕСЯЧНАЯ ПРОГРАММА ОБУЧЕНИЯ') ||
         desc.includes('ГОД ОБУЧЕНИЯ С ИИ-АГЕНТАМИ');
});

if (deleted1.length > 0) {
  console.log('   Удаленные VIBECODER записи:');
  deleted1.forEach(row => {
    console.log(`      ${Math.abs(parseFloat(row.amount)).toLocaleString()}₽ | ${row.bot_name} | ${row.description?.substring(0, 60)}`);
  });
  console.log('');
}

// Фильтр 2: TEST_DATA, промо, админ гранты
const step3 = step2.filter(row => {
  const desc = (row.description || '').toUpperCase();
  if (desc.includes('TEST_DATA')) return false;
  if (desc.includes('🎁 ПРОМО-ДОСТУП')) return false;
  if (desc.includes('🔥 ADMIN GRANT')) return false;
  if (desc.includes('ADMIN GRANT')) return false;
  if (desc.includes('БЕССРОЧНАЯ ПОДПИСКА')) return false;
  if (desc.includes('ПОЖИЗНЕННАЯ ПОДПИСКА')) return false;
  if (desc.includes('НЕЙРОТЕСТЕР')) return false;
  return true;
});

console.log('3️⃣ ПОСЛЕ ФИЛЬТРА TEST_DATA/ПРОМО/АДМИН:');
console.log(`   Удалено: ${(step2.length - step3.length).toLocaleString()}`);
console.log(`   Осталось: ${step3.length.toLocaleString()}`);
const sum3 = step3.reduce((sum, row) => sum + Math.abs(parseFloat(row.amount) || 0), 0);
console.log(`   Сумма: ${Math.round(sum3).toLocaleString()}₽\n`);

// Фильтр 3: Фейковые боты
const step4 = step3.filter(row => {
  const botName = (row.bot_name || '');
  return !FAKE_BOTS.some(fakeBot => botName.toLowerCase().includes(fakeBot.toLowerCase()));
});

console.log('4️⃣ ПОСЛЕ ФИЛЬТРА ФЕЙКОВЫХ БОТОВ:');
console.log(`   Удалено: ${(step3.length - step4.length).toLocaleString()}`);
console.log(`   Осталось: ${step4.length.toLocaleString()}`);
const sum4 = step4.reduce((sum, row) => sum + Math.abs(parseFloat(row.amount) || 0), 0);
console.log(`   Сумма: ${Math.round(sum4).toLocaleString()}₽\n`);

// Показываем какие боты удалились
const deleted3 = step3.filter(row => {
  const botName = (row.bot_name || '');
  return FAKE_BOTS.some(fakeBot => botName.toLowerCase().includes(fakeBot.toLowerCase()));
});

if (deleted3.length > 0) {
  console.log('   Удаленные фейковые боты:');
  const deletedByBot = {};
  deleted3.forEach(row => {
    const bot = row.bot_name;
    if (!deletedByBot[bot]) {
      deletedByBot[bot] = { count: 0, sum: 0 };
    }
    deletedByBot[bot].count++;
    deletedByBot[bot].sum += Math.abs(parseFloat(row.amount) || 0);
  });

  Object.entries(deletedByBot).forEach(([bot, stats]) => {
    console.log(`      ${bot}: ${stats.count} записей, ${Math.round(stats.sum).toLocaleString()}₽`);
  });
  console.log('');
}

// Фильтр 4: Подозрительные ID
const step5 = step4.filter(row => {
  const telegramId = row.telegram_id?.toString() || '';
  const suspiciousIds = ['11111', '12345', '67890', '999999997', '999999998', '999999999'];
  return !suspiciousIds.includes(telegramId);
});

console.log('5️⃣ ПОСЛЕ ФИЛЬТРА ПОДОЗРИТЕЛЬНЫХ ID:');
console.log(`   Удалено: ${(step4.length - step5.length).toLocaleString()}`);
console.log(`   Осталось: ${step5.length.toLocaleString()}`);
const sum5 = step5.reduce((sum, row) => sum + Math.abs(parseFloat(row.amount) || 0), 0);
console.log(`   Сумма: ${Math.round(sum5).toLocaleString()}₽\n`);

// Фильтр 5: Лимит 5000₽ для не-RUB
const step6 = step5.filter(row => {
  const amount = parseFloat(row.amount) || 0;
  const currency = row.currency || '';
  if (currency !== 'RUB' && Math.abs(amount) > 5000) {
    return false;
  }
  return true;
});

console.log('6️⃣ ПОСЛЕ ФИЛЬТРА >5000₽ (только для STARS/XTR):');
console.log(`   Удалено: ${(step5.length - step6.length).toLocaleString()}`);
console.log(`   Осталось: ${step6.length.toLocaleString()}`);
const sum6 = step6.reduce((sum, row) => sum + Math.abs(parseFloat(row.amount) || 0), 0);
console.log(`   Сумма: ${Math.round(sum6).toLocaleString()}₽\n`);

// ИТОГО
console.log('='.repeat(80));
console.log('✅ ИТОГОВАЯ СТАТИСТИКА:');
console.log(`   Начальная сумма: ${Math.round(sum1).toLocaleString()}₽`);
console.log(`   Конечная сумма: ${Math.round(sum6).toLocaleString()}₽`);
console.log(`   Потеряно: ${Math.round(sum1 - sum6).toLocaleString()}₽`);
console.log(`   Процент потерь: ${((1 - sum6 / sum1) * 100).toFixed(1)}%`);
console.log('');

// Топ-5 ботов в итоговом результате
console.log('7️⃣ ТОП-5 БОТОВ В ИТОГОВОМ РЕЗУЛЬТАТЕ:');
const finalByBot = {};
step6.forEach(row => {
  const bot = row.bot_name || 'unknown';
  if (!finalByBot[bot]) {
    finalByBot[bot] = { count: 0, total: 0 };
  }
  finalByBot[bot].count++;
  finalByBot[bot].total += Math.abs(parseFloat(row.amount) || 0);
});

Object.entries(finalByBot)
  .map(([name, stats]) => ({ name, ...stats }))
  .sort((a, b) => b.total - a.total)
  .slice(0, 5)
  .forEach((bot, i) => {
    console.log(`${i + 1}. ${bot.name}`);
    console.log(`   Сумма: ${Math.round(bot.total).toLocaleString()}₽`);
    console.log(`   Транзакций: ${bot.count}\n`);
  });
