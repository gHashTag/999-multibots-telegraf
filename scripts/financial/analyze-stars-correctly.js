/**
 * ПРАВИЛЬНЫЙ АНАЛИЗ ЗВЕЗД - ИСПРАВЛЕНО!
 * STARS: это расходы пользователей, НЕ доходы!
 */

const fs = require('fs');
const ExcelJS = require('exceljs');

console.log('⭐ АНАЛИЗ ЗВЕЗД (STARS) - ИСПРАВЛЕНО!');
console.log('='.repeat(80));

const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

const bots = require('./scripts/constants/bots.js');
const FAKE_BOTS = bots.FAKE_BOTS;

console.log(`Всего записей в payments_data.json: ${data.length}\n`);

// Фильтруем данные
const filtered = data.filter(row => {
  const desc = (row.description || '').toUpperCase();
  const botName = (row.bot_name || '');

  // Исключаем только аномальные VIBECODER
  if (desc.includes('АКАДЕМИЯ ВАЙБКОДЕРА')) return false;
  if (desc.includes('12-МЕСЯЧНАЯ ПРОГРАММА ОБУЧЕНИЯ')) return false;
  if (desc.includes('ГОД ОБУЧЕНИЯ С ИИ-АГЕНТАМИ')) return false;

  // Исключаем фейковых ботов
  if (FAKE_BOTS.some(fakeBot => botName.toLowerCase().includes(fakeBot.toLowerCase()))) {
    return false;
  }

  // Исключаем подозрительные ID
  const telegramId = row.telegram_id?.toString() || '';
  const suspiciousIds = ['11111', '12345', '67890', '999999997', '999999998', '999999999'];
  if (suspiciousIds.includes(telegramId)) return false;

  // НЕ исключаем тестовые данные STARS - они показывают реальные траты!
  // if (desc.includes('TEST_DATA')) return false;
  if (row.is_test === true) return false;

  return true;
});

console.log(`✅ После фильтрации: ${filtered.length} записей\n`);

// Удаляем дубликаты
const seen = new Set();
const uniqueData = [];

filtered.forEach(row => {
  const key = JSON.stringify({
    telegram_id: row.telegram_id,
    description: row.description,
    amount: row.amount,
    currency: row.currency,
    type: row.type,
    bot_name: row.bot_name,
    created_at: row.created_at
  });

  if (!seen.has(key)) {
    seen.add(key);
    uniqueData.push(row);
  }
});

console.log(`✅ После удаления дубликатов: ${uniqueData.length} записей\n`);

// АНАЛИЗИРУЕМ STARS
console.log('⭐ АНАЛИЗ STARS:');
console.log('-'.repeat(80));

const starsTransactions = uniqueData.filter(row => row.currency === 'STARS');
console.log(`Всего STARS транзакций: ${starsTransactions.length}\n`);

// Разделяем STARS по типам
const starsIncome = starsTransactions.filter(row => row.type === 'MONEY_INCOME'); // Покупки звезд
const starsOutcome = starsTransactions.filter(row => row.type === 'MONEY_OUTCOME'); // Траты звезд на AI
const starsRefund = starsTransactions.filter(row => row.type === 'REFUND'); // Возвраты

console.log(`📊 РАЗБИВКА STARS:`);
console.log(`   MONEY_INCOME (покупки звезд): ${starsIncome.length}`);
console.log(`   MONEY_OUTCOME (траты на AI): ${starsOutcome.length}`);
console.log(`   REFUND (возвраты): ${starsRefund.length}`);
console.log(`   ИТОГО: ${starsIncome.length + starsOutcome.length + starsRefund.length}\n`);

// Считаем суммы
const starsIncomeSum = starsIncome.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);
const starsOutcomeSum = starsOutcome.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);
const starsRefundSum = starsRefund.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);

console.log(`💰 СУММЫ STARS:`);
console.log(`   Покупки звезд: ${Math.round(starsIncomeSum).toLocaleString()}⭐`);
console.log(`   Траты на AI: ${Math.round(starsOutcomeSum).toLocaleString()}⭐`);
console.log(`   Возвраты: ${Math.round(starsRefundSum).toLocaleString()}⭐`);
console.log(`   Чистые траты: ${Math.round(starsOutcomeSum - starsIncomeSum).toLocaleString()}⭐\n`);

// ТОП-10 трат звезд
console.log('🔝 ТОП-10 ТРАТ ЗВЕЗД (пользователи тратят на AI):');
console.log('-'.repeat(80));

starsOutcome
  .sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0))
  .slice(0, 10)
  .forEach((tx, i) => {
    const amount = Math.abs(parseFloat(tx.amount) || 0);
    const date = new Date(tx.created_at);
    const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

    console.log(`   ${i + 1}. ${amount.toLocaleString()}⭐ | ${dateStr}`);
    console.log(`      ${tx.bot_name} | User: ${tx.telegram_id}`);
    console.log(`      ${tx.payment_method} | ${tx.description.substring(0, 60)}...`);
  });

// ТОП-10 покупок звезд
if (starsIncome.length > 0) {
  console.log('\n🔝 ТОП-10 ПОКУПОК ЗВЕЗД:');
  console.log('-'.repeat(80));

  starsIncome
    .sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0))
    .slice(0, 10)
    .forEach((tx, i) => {
      const amount = Math.abs(parseFloat(tx.amount) || 0);
      const date = new Date(tx.created_at);
      const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

      console.log(`   ${i + 1}. ${amount.toLocaleString()}⭐ | ${dateStr}`);
      console.log(`      ${tx.bot_name} | User: ${tx.telegram_id}`);
      console.log(`      ${tx.payment_method} | ${tx.description.substring(0, 60)}...`);
    });
}

// Анализ по ботам (траты звезд)
console.log('\n🤖 ТОП-5 БОТОВ ПО РАСХОДУ ЗВЕЗД:');
console.log('-'.repeat(80));

const starsByBot = {};
starsOutcome.forEach(tx => {
  const bot = tx.bot_name;
  if (!starsByBot[bot]) {
    starsByBot[bot] = { count: 0, total: 0, users: new Set() };
  }
  starsByBot[bot].count++;
  starsByBot[bot].total += Math.abs(parseFloat(tx.amount) || 0);
  starsByBot[bot].users.add(tx.telegram_id);
});

Object.entries(starsByBot)
  .map(([bot, data]) => ({ bot, ...data, uniqueUsers: data.users.size }))
  .sort((a, b) => b.total - a.total)
  .slice(0, 5)
  .forEach(botData => {
    console.log(`   ${botData.bot}:`);
    console.log(`      💰 Потрачено звезд: ${Math.round(botData.total).toLocaleString()}⭐`);
    console.log(`      📊 Транзакций: ${botData.count}`);
    console.log(`      👥 Пользователей: ${botData.uniqueUsers}`);
  });

// СОЗДАЕМ EXCEL
console.log('\n📊 СОЗДАЕМ EXCEL С ПОЛНЫМИ ДАННЫМИ ПО STARS...');

const workbook = new ExcelJS.Workbook();

// ЛИСТ 1: Траты звезд (основной)
const starsOutcomeSheet = workbook.addWorksheet('⭐ Траты звезд (AI)');
starsOutcomeSheet.addRow(['№', 'Сумма (⭐)', 'Пользователь', 'Бот', 'Описание', 'Дата', 'Метод']);
starsOutcomeSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
starsOutcomeSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF6600' } };

starsOutcome.forEach((tx, i) => {
  const amount = Math.abs(parseFloat(tx.amount) || 0);
  const date = new Date(tx.created_at);
  const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

  starsOutcomeSheet.addRow([
    i + 1,
    amount,
    tx.telegram_id,
    tx.bot_name,
    tx.description,
    dateStr,
    tx.payment_method || ''
  ]);
});

// ЛИСТ 2: Покупки звезд
const starsIncomeSheet = workbook.addWorksheet('⭐ Покупки звезд');
starsIncomeSheet.addRow(['№', 'Сумма (⭐)', 'Пользователь', 'Бот', 'Описание', 'Дата', 'Метод']);
starsIncomeSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
starsIncomeSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFB800' } };

starsIncome.forEach((tx, i) => {
  const amount = Math.abs(parseFloat(tx.amount) || 0);
  const date = new Date(tx.created_at);
  const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

  starsIncomeSheet.addRow([
    i + 1,
    amount,
    tx.telegram_id,
    tx.bot_name,
    tx.description,
    dateStr,
    tx.payment_method || ''
  ]);
});

// ЛИСТ 3: Возвраты
const starsRefundSheet = workbook.addWorksheet('⭐ Возвраты звезд');
starsRefundSheet.addRow(['№', 'Сумма (⭐)', 'Пользователь', 'Бот', 'Описание', 'Дата', 'Метод']);
starsRefundSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
starsRefundSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9933CC' } };

starsRefund.forEach((tx, i) => {
  const amount = Math.abs(parseFloat(tx.amount) || 0);
  const date = new Date(tx.created_at);
  const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

  starsRefundSheet.addRow([
    i + 1,
    amount,
    tx.telegram_id,
    tx.bot_name,
    tx.description,
    dateStr,
    tx.payment_method || ''
  ]);
});

// ЛИСТ 4: Сводка STARS
const starsSummarySheet = workbook.addWorksheet('📊 Сводка STARS');
starsSummarySheet.addRow(['Тип операции', 'Количество', 'Сумма (⭐)', 'Пользователей', 'Ботов']);
starsSummarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
starsSummarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } };

const starsOutcomeUsers = new Set(starsOutcome.map(tx => tx.telegram_id));
const starsIncomeUsers = new Set(starsIncome.map(tx => tx.telegram_id));
const starsRefundUsers = new Set(starsRefund.map(tx => tx.telegram_id));

const starsOutcomeBots = new Set(starsOutcome.map(tx => tx.bot_name));
const starsIncomeBots = new Set(starsIncome.map(tx => tx.bot_name));
const starsRefundBots = new Set(starsRefund.map(tx => tx.bot_name));

starsSummarySheet.addRow(['⭐ Траты на AI (MONEY_OUTCOME)', starsOutcome.length, Math.round(starsOutcomeSum), starsOutcomeUsers.size, starsOutcomeBots.size]);
starsSummarySheet.addRow(['💰 Покупки звезд (MONEY_INCOME)', starsIncome.length, Math.round(starsIncomeSum), starsIncomeUsers.size, starsIncomeBots.size]);
starsSummarySheet.addRow(['🔄 Возвраты (REFUND)', starsRefund.length, Math.round(starsRefundSum), starsRefundUsers.size, starsRefundBots.size]);
starsSummarySheet.addRow(['ИТОГО', starsOutcome.length + starsIncome.length + starsRefund.length, Math.round(starsOutcomeSum + starsIncomeSum + starsRefundSum), starsOutcomeUsers.size + starsIncomeUsers.size + starsRefundUsers.size, starsOutcomeBots.size + starsIncomeBots.size + starsRefundBots.size]);

// Сохраняем файл
const filename = 'STARS_COMPLETE_ANALYSIS.xlsx';
workbook.xlsx.writeFile(filename)
  .then(() => {
    console.log(`\n✅ Excel файл создан: ${filename}`);

    // ИТОГОВЫЙ ОТЧЕТ
    console.log('\n' + '='.repeat(80));
    console.log('⭐ ИТОГОВЫЙ ОТЧЕТ - ЗВЕЗДЫ (STARS)');
    console.log('='.repeat(80));

    console.log(`\n💡 КЛЮЧЕВОЙ ВЫВОД: STARS - ЭТО НЕ ДОХОДЫ, А РАСХОДЫ!`);
    console.log(`   Пользователи покупают звезды в Telegram за рубли,`);
    console.log(`   а потом тратят их на AI генерацию в наших ботах.\n`);

    console.log(`📊 СТАТИСТИКА STARS:`);
    console.log(`   Траты на AI: ${starsOutcome.length} транз., ${Math.round(starsOutcomeSum).toLocaleString()}⭐`);
    console.log(`   Покупки звезд: ${starsIncome.length} транз., ${Math.round(starsIncomeSum).toLocaleString()}⭐`);
    console.log(`   Возвраты: ${starsRefund.length} транз., ${Math.round(starsRefundSum).toLocaleString()}⭐`);

    console.log(`\n🎯 ПОЧЕМУ STARS - ЭТО РАСХОДЫ:`);
    console.log(`   1. ${Math.round(starsOutcomeSum).toLocaleString()}⭐ потрачено на AI (text-to-video, image-to-video и т.д.)`);
    console.log(`   2. ${Math.round(starsIncomeSum).toLocaleString()}⭐ куплено пользователями`);
    console.log(`   3. Чистый расход: ${Math.round(starsOutcomeSum - starsIncomeSum).toLocaleString()}⭐`);

    console.log(`\n🤖 ТОП-3 AI УСЛУГИ ПО РАСХОДУ ЗВЕЗД:`);
    const topMethods = {};
    starsOutcome.forEach(tx => {
      const method = tx.payment_method || 'unknown';
      if (!topMethods[method]) {
        topMethods[method] = 0;
      }
      topMethods[method] += Math.abs(parseFloat(tx.amount) || 0);
    });

    Object.entries(topMethods)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .forEach(([method, sum], i) => {
        console.log(`   ${i + 1}. ${method}: ${Math.round(sum).toLocaleString()}⭐`);
      });
  })
  .catch(error => {
    console.error('❌ Ошибка создания Excel:', error);
  });
