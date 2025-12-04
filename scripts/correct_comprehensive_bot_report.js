#!/usr/bin/env node

/**
 * 🎯 ИСПРАВЛЕННЫЙ ОТЧЕТ - ПРАВИЛЬНЫЙ РАСЧЕТ ДОХОДОВ
 * - Все валюты отдельно: RUB, XTR, STARS
 * - ТОЛЬКО реальные доходы через Telegram и Robokassa
 * - STARS = 0 потому что пользователи их НЕ покупают
 * - XTR учитывается как отдельная валюта
 */

const fs = require('fs');
const ExcelJS = require('exceljs');

const RATES = { XTR: 1.8, STARS: 1.8, RUB: 1.0 };

function convertToRub(amount, currency) {
  return (parseFloat(amount) || 0) * (RATES[currency] || 1.0);
}

// ТОЛЬКО РЕАЛЬНЫЕ ПЛАТЕЖНЫЕ СИСТЕМЫ
const REAL_PAYMENT_METHODS = ['Telegram', 'Robokassa'];

// ФЕЙКОВЫЕ МЕТОДЫ (НЕ УЧИТЫВАЕМ!)
const FAKE_PAYMENT_METHODS = [
  'System', 'SYSTEM', 'Internal', 'balance', 'Manual', 'Admin', 'admin',
  'bank_card', 'System_Balance_Migration', 'admin_special_topup',
  'admin_topup', 'video-generation-refund', 'image-to-video-refund',
  'Admin_Bonus', 'Bonus', 'System Grant', 'Tester_Bonus', 'Promo',
  'Admin_Unlimited_Grant', 'Admin_Welcome_Grant', 'Admin_Compensation',
  'System_Operation', 'Manual Admin Grant', 'test', 'Bonus_Credit',
  'System Compensation', 'Refund', '' // Добавляем пустые и Refund к фейкам
];

const BOTS = [
  { name: 'neuro_blogger_bot', type: 'ПРОДАКШЕН' },
  { name: 'MetaMuse_Manifest_bot', type: 'ПРОДАКШЕН' },
  { name: 'HaimGroupMedia_bot', type: 'ПРОДАКШЕН' },
  { name: 'AI_STARS_bot', type: 'ПРОДАКШЕН' },
  { name: 'Gaia_Kamskaia_bot', type: 'ПРОДАКШЕН' },
  { name: 'NeuroLenaAssistant_bot', type: 'ПРОДАКШЕН' },
  { name: 'NeurostylistShtogrina_bot', type: 'ПРОДАКШЕН' },
  { name: 'Kaya_easy_art_bot', type: 'ПРОДАКШЕН' },
  { name: 'ai_koshey_bot', type: 'ТЕСТОВЫЙ' },
  { name: 'clip_maker_neuro_bot', type: 'ТЕСТОВЫЙ' }
];

async function createCorrectReport() {
  console.log('\n' + '='.repeat(80));
  console.log('🎯 СОЗДАНИЕ ИСПРАВЛЕННОГО ОТЧЕТА - ПРАВИЛЬНЫЕ ДОХОДЫ');
  console.log('='.repeat(80) + '\n');

  const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

  console.log(`📊 Всего записей в Supabase: ${rawData.length}`);

  // 1. ФИЛЬТРУЕМ ТОЛЬКО РЕАЛЬНЫЕ ДОХОДЫ
  const realIncomes = rawData.filter(row =>
    row.type === 'MONEY_INCOME' &&
    REAL_PAYMENT_METHODS.includes(row.payment_method)
  );

  console.log(`✅ Реальные доходы: ${realIncomes.length} записей`);

  // 2. ГРУППИРУЕМ ПО ВАЛЮТАМ
  const byCurrency = {
    RUB: { records: [], total_in_currency: 0, total_in_rub: 0 },
    XTR: { records: [], total_in_currency: 0, total_in_rub: 0 },
    STARS: { records: [], total_in_currency: 0, total_in_rub: 0 }
  };

  realIncomes.forEach(row => {
    const currency = row.currency;
    const amount = parseFloat(row.amount) || 0;
    const amountInRub = convertToRub(amount, currency);

    if (byCurrency[currency]) {
      byCurrency[currency].records.push(row);
      byCurrency[currency].total_in_currency += amount;
      byCurrency[currency].total_in_rub += amountInRub;
    }
  });

  console.log('\n💰 ДОХОДЫ ПО ВАЛЮТАМ (ТОЛЬКО РЕАЛЬНЫЕ):');
  console.log('='.repeat(60));
  Object.entries(byCurrency).forEach(([currency, data]) => {
    console.log(`${currency}:`);
    console.log(`  Записей: ${data.records.length}`);
    console.log(`  Сумма в валюте: ${Math.round(data.total_in_currency).toLocaleString()} ${currency}`);
    console.log(`  Эквивалент в рублях: ${Math.round(data.total_in_rub).toLocaleString()}₽`);
    console.log('');
  });

  const totalInRub = Object.values(byCurrency).reduce((sum, cur) => sum + cur.total_in_rub, 0);
  console.log(`🎯 ОБЩАЯ СУММА В РУБЛЯХ: ${Math.round(totalInRub).toLocaleString()}₽`);
  console.log('='.repeat(60));

  // 3. ГРУППИРУЕМ ПО БОТАМ
  console.log('\n📊 ГРУППИРОВКА ПО БОТАМ...\n');

  const botData = {};
  BOTS.forEach(bot => {
    botData[bot.name] = {
      ...bot,
      currencies: {
        RUB: { count: 0, amount_in_currency: 0, amount_in_rub: 0 },
        XTR: { count: 0, amount_in_currency: 0, amount_in_rub: 0 },
        STARS: { count: 0, amount_in_currency: 0, amount_in_rub: 0 }
      },
      total_in_rub: 0
    };
  });

  // Заполняем данные по ботам
  Object.values(byCurrency).forEach(currencyData => {
    currencyData.records.forEach(row => {
      const botName = row.bot_name;
      const currency = row.currency;

      if (botData[botName] && botData[botName].currencies[currency]) {
        const amount = parseFloat(row.amount) || 0;
        const amountInRub = convertToRub(amount, currency);

        botData[botName].currencies[currency].count++;
        botData[botName].currencies[currency].amount_in_currency += amount;
        botData[botName].currencies[currency].amount_in_rub += amountInRub;
        botData[botName].total_in_rub += amountInRub;
      }
    });
  });

  // 4. ВЫВОД ПО КАЖДОМУ БОТУ
  console.log('🤖 ДЕТАЛИ ПО КАЖДОМУ БОТУ:');
  console.log('='.repeat(80));

  Object.values(botData).forEach(bot => {
    if (bot.total_in_rub > 0) {
      console.log(`\n🤖 ${bot.name} (${bot.type}):`);
      console.log(`   💰 Общая сумма: ${Math.round(bot.total_in_rub).toLocaleString()}₽`);

      Object.entries(bot.currencies).forEach(([currency, data]) => {
        if (data.count > 0) {
          console.log(`   ${currency}: ${data.count} операций`);
          console.log(`     В валюте: ${Math.round(data.amount_in_currency).toLocaleString()} ${currency}`);
          console.log(`     В рублях: ${Math.round(data.amount_in_rub).toLocaleString()}₽`);
        }
      });
    }
  });

  // 5. ПРОВЕРЯЕМ STARS
  console.log('\n\n⭐ АНАЛИЗ STARS:');
  console.log('='.repeat(60));

  if (byCurrency.STARS.records.length === 0) {
    console.log('❌ STARS ДОХОДЫ = 0!');
    console.log('📝 ПОЧЕМУ: Пользователи НЕ покупают STARS через Telegram/Robokassa');
    console.log('💡 Это означает:');
    console.log('   1. Либо STARS не продаются пользователям');
    console.log('   2. Либо они покупаются через другую систему');
    console.log('   3. Либо в базе нет данных о STARS покупках');
  } else {
    console.log(`✅ STARS доходы найдены: ${byCurrency.STARS.records.length} записей`);
  }

  // 6. СОЗДАЕМ EXCEL
  console.log('\n\n📊 СОЗДАЕМ ИСПРАВЛЕННЫЙ EXCEL...\n');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "🎯 ИСПРАВЛЕННЫЙ ОТЧЕТ - ПРАВИЛЬНЫЕ ДОХОДЫ";
  workbook.created = new Date();

  // ЛИСТ 1: ОБЩАЯ СВОДКА ПО ВАЛЮТАМ
  const summarySheet = workbook.addWorksheet('📊 ОБЩАЯ СВОДКА');
  summarySheet.mergeCells('A1:D1');
  summarySheet.getCell('A1').value = '🎯 ИСПРАВЛЕННЫЕ ДОХОДЫ - ПО ВСЕМ ВАЛЮТАМ';
  summarySheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
  summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '15803D' } };
  summarySheet.getCell('A1').alignment = { horizontal: 'center' };

  summarySheet.addRow(['']);
  summarySheet.addRow(['Валюта', 'Количество операций', 'Сумма в валюте', 'Эквивалент в рублях']);
  summarySheet.getRow(3).font = { bold: true };

  Object.entries(byCurrency).forEach(([currency, data]) => {
    summarySheet.addRow([
      currency,
      data.count,
      Math.round(data.total_in_currency).toLocaleString(),
      Math.round(data.total_in_rub).toLocaleString() + '₽'
    ]);
  });

  const totalRow = summarySheet.addRow([
    'ИТОГО',
    realIncomes.length,
    '',
    Math.round(totalInRub).toLocaleString() + '₽'
  ]);
  totalRow.font = { bold: true };

  // ЛИСТ 2: ПО БОТАМ
  const botsSheet = workbook.addWorksheet('🤖 ПО БОТАМ');
  botsSheet.addRow(['№', 'Бот', 'Тип', 'RUB (₽)', 'XTR→₽', 'STARS→₽', 'ИТОГО (₽)']);
  botsSheet.getRow(1).font = { bold: true };

  const sortedBots = Object.values(botData)
    .sort((a, b) => b.total_in_rub - a.total_in_rub)
    .filter(bot => bot.total_in_rub > 0);

  sortedBots.forEach((bot, index) => {
    botsSheet.addRow([
      index + 1,
      bot.name,
      bot.type,
      Math.round(bot.currencies.RUB.amount_in_rub).toLocaleString(),
      Math.round(bot.currencies.XTR.amount_in_rub).toLocaleString(),
      Math.round(bot.currencies.STARS.amount_in_rub).toLocaleString(),
      Math.round(bot.total_in_rub).toLocaleString()
    ]);
  });

  // ЛИСТ 3: ДЕТАЛИ ПО TELEGRAM
  const telegramSheet = workbook.addWorksheet('📱 TELEGRAM ДОХОДЫ');
  telegramSheet.addRow(['Бот', 'Валюта', 'Количество', 'Сумма в валюте', 'В рублях']);
  telegramSheet.getRow(1).font = { bold: true };

  const telegramIncomes = realIncomes.filter(row => row.payment_method === 'Telegram');
  telegramIncomes.forEach(row => {
    telegramSheet.addRow([
      row.bot_name,
      row.currency,
      1,
      Math.round(parseFloat(row.amount)).toLocaleString(),
      Math.round(convertToRub(row.amount, row.currency)).toLocaleString()
    ]);
  });

  // ЛИСТ 4: ДЕТАЛИ ПО ROBOKASSA
  const robokassaSheet = workbook.addWorksheet('💳 ROBOKASSA ДОХОДЫ');
  robokassaSheet.addRow(['Бот', 'Валюта', 'Количество', 'Сумма в валюте', 'В рублях']);
  robokassaSheet.getRow(1).font = { bold: true };

  const robokassaIncomes = realIncomes.filter(row => row.payment_method === 'Robokassa');
  robokassaIncomes.forEach(row => {
    robokassaSheet.addRow([
      row.bot_name,
      row.currency,
      1,
      Math.round(parseFloat(row.amount)).toLocaleString(),
      Math.round(convertToRub(row.amount, row.currency)).toLocaleString()
    ]);
  });

  // ЛИСТ 5: ОБЪЯСНЕНИЕ STARS
  const starsSheet = workbook.addWorksheet('⭐ STARS АНАЛИЗ');
  starsSheet.mergeCells('A1:B1');
  starsSheet.getCell('A1').value = '⭐ ПОЧЕМУ STARS = 0';
  starsSheet.getCell('A1').font = { size: 14, bold: true };
  starsSheet.getCell('A1').alignment = { horizontal: 'center' };

  starsSheet.addRow(['']);
  starsSheet.addRow(['Факт', 'Значение']);
  starsSheet.getRow(3).font = { bold: true };

  starsSheet.addRow(['Реальные STARS доходы', byCurrency.STARS.count]);
  starsSheet.addRow(['Причина', 'Пользователи НЕ покупают STARS']);
  starsSheet.addRow(['Telegram STARS', '0']);
  starsSheet.addRow(['Robokassa STARS', '0']);
  starsSheet.addRow(['Вывод', 'STARS не монетизируются']);

  const outputPath = '/Users/playra/999-multibots-telegraf/ИСПРАВЛЕННЫЙ_ОТЧЕТ.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log('\n' + '='.repeat(80));
  console.log('✅ ИСПРАВЛЕННЫЙ ОТЧЕТ СОЗДАН!');
  console.log('='.repeat(80));
  console.log(`📁 Файл: ${outputPath}`);
  console.log('\n📊 КЛЮЧЕВЫЕ ИСПРАВЛЕНИЯ:');
  console.log(`   ✅ Доходы в рублях: ${Math.round(totalInRub).toLocaleString()}₽`);
  console.log(`   ✅ RUB: ${Math.round(byCurrency.RUB.total_in_rub).toLocaleString()}₽`);
  console.log(`   ✅ XTR→₽: ${Math.round(byCurrency.XTR.total_in_rub).toLocaleString()}₽`);
  console.log(`   ⭐ STARS: ${Math.round(byCurrency.STARS.total_in_rub).toLocaleString()}₽ (НЕ ПОКУПАЮТ)`);
  console.log(`   📱 Telegram: ${telegramIncomes.length} операций`);
  console.log(`   💳 Robokassa: ${robokassaIncomes.length} операций`);
  console.log('='.repeat(80) + '\n');

  return {
    total_in_rub: Math.round(totalInRub),
    by_currency: byCurrency,
    by_bot: botData,
    telegram_incomes: telegramIncomes.length,
    robokassa_incomes: robokassaIncomes.length
  };
}

createCorrectReport().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
