#!/usr/bin/env node

/**
 * 🔧 ПРАВИЛЬНАЯ ФИЛЬТРАЦИЯ ДОХОДОВ - ИСКЛЮЧАЕМ ВСЕ ФЕЙКОВЫЕ
 * Только Telegram и Robokassa - остальное фейк!
 */

const ExcelJS = require('exceljs');
const fs = require('fs');

const RATES = { XTR: 1.8, STARS: 1.8, RUB: 1.0 };

function convertToRub(amount, currency) {
  return (parseFloat(amount) || 0) * (RATES[currency] || 1.0);
}

const REAL_INCOME_METHODS = [
  'Telegram',      // Реальные платежи через Telegram
  'Robokassa',     // Реальные платежи через Robokassa
  'YooMoney',      // Если есть
  'SBP',           // Система быстрых платежей
  'TinkoffPay',
  'SberPay'
];

const FAKE_INCOME_METHODS = [
  'System', 'SYSTEM', 'Internal', 'balance', 'Manual', 'Admin', 'admin',
  'bank_card', 'System_Balance_Migration', 'admin_special_topup',
  'admin_topup', 'video-generation-refund', 'image-to-video-refund',
  'Admin_Bonus', 'Bonus', 'System Grant', 'Tester_Bonus', 'Promo',
  'Admin_Unlimited_Grant', 'Admin_Welcome_Grant', 'Admin_Compensation',
  'System_Operation', 'Manual Admin Grant', 'test', 'Bonus_Credit',
  'System Compensation'
];

const FAKE_BOTS = [
  'ai_koshey_bot', 'vibecoder999', 'admin_system', 'admin_script',
  'admin_grant', 'diagnostic_test', 'test_bot', 'webhook-test-bot',
  'public_test', 'admin_cli', 'admin_fix', 'admin_unlimited',
  'system_grant', 'system_recovery', 'vibecoding', 'neuroblogger',
  'neuroblogger_bot', 'unknown_bot'
];

function isRealIncome(paymentMethod, botName, description) {
  // Исключаем фейковые боты
  if (FAKE_BOTS.includes(botName)) {
    return false;
  }

  // Исключаем фейковые методы
  if (FAKE_INCOME_METHODS.includes(paymentMethod)) {
    return false;
  }

  // Исключаем пустые методы
  if (!paymentMethod || paymentMethod === '') {
    return false;
  }

  // Исключаем методы с фейковыми ключевыми словами
  if (description && (
    description.includes('TEST_DATA') ||
    description.includes('тестовые данные') ||
    description.includes('test_data') ||
    description.includes('Admin') ||
    description.includes('SYSTEM')
  )) {
    return false;
  }

  // Проверяем на реальные методы
  return REAL_INCOME_METHODS.some(method => paymentMethod.includes(method));
}

async function createCorrectIncomeAnalysis() {
  console.log('\n' + '='.repeat(80));
  console.log('🔧 ПРАВИЛЬНАЯ ФИЛЬТРАЦИЯ ДОХОДОВ - ТОЛЬКО РЕАЛЬНЫЕ!');
  console.log('='.repeat(80) + '\n');

  const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

  // Фильтруем реальные доходы
  const realIncome = rawData.filter(row =>
    row.type === 'MONEY_INCOME' &&
    isRealIncome(row.payment_method, row.bot_name, row.description)
  );

  const fakeIncome = rawData.filter(row =>
    row.type === 'MONEY_INCOME' &&
    !isRealIncome(row.payment_method, row.bot_name, row.description)
  );

  console.log(`✅ Реальных доходов: ${realIncome.length} записей`);
  console.log(`🚫 Фейковых доходов: ${fakeIncome.length} записей`);
  console.log(`📊 Всего доходов: ${rawData.filter(r => r.type === 'MONEY_INCOME').length}`);

  // Группируем по ботам
  const botStats = {};
  realIncome.forEach(row => {
    const bot = row.bot_name;
    if (!botStats[bot]) {
      botStats[bot] = {
        name: bot,
        income_rub: 0,
        income_stars: 0,
        income_xtr: 0,
        income_count: 0,
        methods: new Set()
      };
    }

    const stats = botStats[bot];
    const amount = parseFloat(row.amount) || 0;
    const currency = row.currency;

    stats.methods.add(row.payment_method);

    if (currency === 'RUB') stats.income_rub += amount;
    else if (currency === 'STARS') stats.income_stars += amount;
    else if (currency === 'XTR') stats.income_xtr += amount;

    stats.income_count++;
  });

  const sortedBots = Object.values(botStats)
    .map(bot => ({
      ...bot,
      total_income: bot.income_rub + (bot.income_stars * 1.8) + (bot.income_xtr * 1.8)
    }))
    .sort((a, b) => b.total_income - a.total_income);

  // Общая статистика
  const totalRealIncome = sortedBots.reduce((sum, bot) => sum + bot.total_income, 0);

  console.log('\n💰 РЕАЛЬНЫЕ ДОХОДЫ ПО БОТАМ:');
  console.log('='.repeat(80));

  sortedBots.forEach((bot, index) => {
    console.log(`${index + 1}. ${bot.name}:`);
    console.log(`   💰 Всего: ${Math.round(bot.total_income).toLocaleString()}₽`);
    console.log(`   💱 RUB: ${Math.round(bot.income_rub).toLocaleString()}₽`);
    console.log(`   💱 STARS: ${Math.round(bot.income_stars).toLocaleString()}★`);
    console.log(`   💱 XTR: ${Math.round(bot.income_xtr).toLocaleString()}XTR`);
    console.log(`   📊 Операций: ${bot.income_count}`);
    console.log(`   🔧 Методы: ${Array.from(bot.methods).join(', ')}`);
  });

  console.log('\n\n🚫 ТОП ФЕЙКОВЫХ ДОХОДОВ:');
  console.log('='.repeat(80));

  const fakeByBot = {};
  fakeIncome.forEach(row => {
    const bot = row.bot_name;
    if (!fakeByBot[bot]) {
      fakeByBot[bot] = { amount: 0, count: 0, method: row.payment_method };
    }
    fakeByBot[bot].amount += convertToRub(row.amount, row.currency);
    fakeByBot[bot].count++;
  });

  Object.entries(fakeByBot)
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 10)
    .forEach(([bot, data]) => {
      console.log(`${bot}:`);
      console.log(`   💰 Фейк доходов: ${Math.round(data.amount).toLocaleString()}₽ (${data.count} операций)`);
      console.log(`   🔧 Метод: ${data.method}`);
    });

  // СОЗДАЕМ EXCEL
  console.log('\n\n📊 Создаем Excel с правильными доходами...\n');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "🔧 ПРАВИЛЬНЫЕ ДОХОДЫ - БЕЗ ФЕЙКА";
  workbook.created = new Date();

  // Лист 1: Реальные доходы
  const realSheet = workbook.addWorksheet('✅ РЕАЛЬНЫЕ ДОХОДЫ');
  realSheet.mergeCells('A1:E1');
  realSheet.getCell('A1').value = '✅ РЕАЛЬНЫЕ ДОХОДЫ - ТОЛЬКО TELEGRAM И ROBOKASSA';
  realSheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
  realSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '15803D' } };
  realSheet.getCell('A1').alignment = { horizontal: 'center' };

  const realHeader = realSheet.addRow(['№', 'Бот', 'Доходы (₽)', 'Операций', 'Методы']);
  realHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
  realHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '15803D' } };

  sortedBots.forEach((bot, index) => {
    realSheet.addRow([
      index + 1,
      bot.name,
      Math.round(bot.total_income).toLocaleString(),
      bot.income_count,
      Array.from(bot.methods).join(', ')
    ]);
  });

  // Лист 2: Фейковые доходы
  const fakeSheet = workbook.addWorksheet('🚫 ФЕЙКОВЫЕ ДОХОДЫ');
  fakeSheet.mergeCells('A1:D1');
  fakeSheet.getCell('A1').value = '🚫 ФЕЙКОВЫЕ ДОХОДЫ - ИСКЛЮЧЕНЫ';
  fakeSheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
  fakeSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DC2626' } };
  fakeSheet.getCell('A1').alignment = { horizontal: 'center' };

  const fakeHeader = fakeSheet.addRow(['№', 'Бот', 'Фейк доходы (₽)', 'Операций', 'Метод']);
  fakeHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
  fakeHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DC2626' } };

  Object.entries(fakeByBot)
    .sort((a, b) => b[1].amount - a[1].amount)
    .forEach(([bot, data], index) => {
      fakeSheet.addRow([
        index + 1,
        bot,
        Math.round(data.amount).toLocaleString(),
        data.count,
        data.method
      ]);
    });

  const outputPath = '/Users/playra/999-multibots-telegraf/ПРАВИЛЬНЫЕ_ДОХОДЫ_БЕЗ_ФЕЙКА.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log('\n' + '='.repeat(80));
  console.log('✅ ПРАВИЛЬНЫЕ ДОХОДЫ ПРОАНАЛИЗИРОВАНЫ!');
  console.log('='.repeat(80));
  console.log(`📁 Файл: ${outputPath}`);
  console.log('\n📊 РЕЗУЛЬТАТ:');
  console.log(`   💰 Реальных доходов: ${Math.round(totalRealIncome).toLocaleString()}₽`);
  console.log(`   🚫 Фейковых доходов исключено: ${fakeIncome.length} записей`);
  console.log(`   ✅ Только Telegram и Robokassa`);
  console.log('='.repeat(80) + '\n');

  return { realIncome, fakeIncome, totalRealIncome, sortedBots };
}

createCorrectIncomeAnalysis().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
