#!/usr/bin/env node

/**
 * 🎯 ТОЧНОЕ СРАВНЕНИЕ ПО 3 КАТЕГОРИЯМ
 * 1. РУБЛИ (RUB) - сравнение CSV vs Supabase
 * 2. ЗВЕЗДЫ (STARS) - конвертация в рубли
 * 3. ФЕЙКОВЫЕ ДАННЫЕ - выделение отдельно
 */

const fs = require('fs');
const ExcelJS = require('exceljs');

const RATES = { XTR: 1.8, STARS: 1.8, RUB: 1.0 };

function convertToRub(amount, currency) {
  return (parseFloat(amount) || 0) * (RATES[currency] || 1.0);
}

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

// Фейковые методы оплаты
const FAKE_PAYMENT_METHODS = [
  'System', 'SYSTEM', 'Internal', 'balance', 'Manual', 'Admin', 'admin',
  'bank_card', 'System_Balance_Migration', 'admin_special_topup',
  'admin_topup', 'video-generation-refund', 'image-to-video-refund',
  'Admin_Bonus', 'Bonus', 'System Grant', 'Tester_Bonus', 'Promo',
  'Admin_Unlimited_Grant', 'Admin_Welcome_Grant', 'Admin_Compensation',
  'System_Operation', 'Manual Admin Grant', 'test', 'Bonus_Credit',
  'System Compensation'
];

// Реальные методы оплаты
const REAL_PAYMENT_METHODS = [
  'Telegram', 'Robokassa', 'YooMoney', 'SBP', 'TinkoffPay', 'SberPay'
];

async function exactComparison3Categories() {
  console.log('\n' + '='.repeat(80));
  console.log('🎯 ТОЧНОЕ СРАВНЕНИЕ ПО 3 КАТЕГОРИЯМ');
  console.log('='.repeat(80) + '\n');

  // 1. ЧИТАЕМ CSV (ROBOKASSA) - ТОЛЬКО РУБЛЕВЫЕ ОПЕРАЦИИ
  console.log('📊 ЭТАП 1: АНАЛИЗ РУБЛЕЙ (RUB)');
  console.log('-' .repeat(80) + '\n');

  const csvContent = fs.readFileSync('Spisok operacij s 30.01.2025 po 30.11.2025.csv', 'utf8');
  const csvLines = csvContent.split('\n').filter(line => line.trim());

  const csvRubPayments = [];
  let totalCsvRub = 0;

  for (let i = 1; i < csvLines.length; i++) {
    const cols = csvLines[i].split(';');
    if (cols.length < 10) continue;

    const paymentMethod = cols[2];
    const amountStr = cols[3];
    const netAmountStr = cols[10];

    // ТОЛЬКО РУБЛЕВЫЕ ОПЕРАЦИИ (где есть RUR)
    if (!paymentMethod.includes('RUR') && !paymentMethod.includes('Tinkoff') &&
        !paymentMethod.includes('Sber') && !paymentMethod.includes('SBP')) {
      continue;
    }

    const amount = parseFloat(amountStr.replace(',', '.'));
    const netAmount = parseFloat(netAmountStr.replace(',', '.'));

    if (!amount || !netAmount) continue;

    csvRubPayments.push({
      paymentMethod,
      amount,
      netAmount
    });

    totalCsvRub += netAmount;
  }

  console.log(`✅ CSV (рублевые операции): ${csvRubPayments.length} записей`);
  console.log(`💰 Сумма в рублях (CSV): ${Math.round(totalCsvRub).toLocaleString()}₽\n`);

  // 2. ЧИТАЕМ SUPABASE - РАЗДЕЛЯЕМ НА 3 КАТЕГОРИИ
  console.log('📊 АНАЛИЗ SUPABASE - РАЗДЕЛЕНИЕ НА 3 КАТЕГОРИИ');
  console.log('-' .repeat(80) + '\n');

  const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));
  const incomeData = rawData.filter(row => row.type === 'MONEY_INCOME');

  const categories = {
    RUB: {},
    STARS: {},
    FAKE: {}
  };

  // Инициализируем структуры по ботам
  BOTS.forEach(bot => {
    categories.RUB[bot.name] = { count: 0, amount: 0 };
    categories.STARS[bot.name] = { count: 0, amount: 0 };
    categories.FAKE[bot.name] = { count: 0, amount: 0 };
  });

  let totalSupabaseRUB = 0;
  let totalSupabaseSTARS = 0;
  let totalSupabaseFAKE = 0;

  // Статистика фейковых методов
  const fakeMethodsStats = {};

  incomeData.forEach(row => {
    const botName = row.bot_name;
    const currency = row.currency;
    const paymentMethod = row.payment_method;
    const amount = parseFloat(row.amount) || 0;

    if (!BOTS.find(b => b.name === botName)) return;

    const rubAmount = convertToRub(amount, currency);

    // ЗАМЕНЯЕМ ВСЕ ФЕЙКОВЫЕ МЕТОДЫ НА "FAKE"
    let normalizedMethod = paymentMethod;
    if (FAKE_PAYMENT_METHODS.includes(paymentMethod) || !REAL_PAYMENT_METHODS.includes(paymentMethod)) {
      normalizedMethod = 'FAKE';
    }

    if (currency === 'RUB' && REAL_PAYMENT_METHODS.includes(paymentMethod)) {
      // КАТЕГОРИЯ 1: РУБЛИ (реальные)
      categories.RUB[botName].count++;
      categories.RUB[botName].amount += rubAmount;
      totalSupabaseRUB += rubAmount;

    } else if (currency === 'STARS' && REAL_PAYMENT_METHODS.includes(paymentMethod)) {
      // КАТЕГОРИЯ 2: ЗВЕЗДЫ (конвертируем в рубли)
      categories.STARS[botName].count++;
      categories.STARS[botName].amount += rubAmount;
      totalSupabaseSTARS += rubAmount;

    } else {
      // КАТЕГОРИЯ 3: ФЕЙКОВЫЕ ДАННЫЕ (ВСЕ НЕ-РЕАЛЬНЫЕ МЕТОДЫ → FAKE)
      categories.FAKE[botName].count++;
      categories.FAKE[botName].amount += rubAmount;
      totalSupabaseFAKE += rubAmount;

      // Статистика фейковых методов
      if (!fakeMethodsStats[paymentMethod]) {
        fakeMethodsStats[paymentMethod] = { count: 0, amount: 0 };
      }
      fakeMethodsStats[paymentMethod].count++;
      fakeMethodsStats[paymentMethod].amount += rubAmount;
    }
  });

  console.log(`💰 SUPABASE - РУБЛИ (RUB): ${Math.round(totalSupabaseRUB).toLocaleString()}₽`);
  console.log(`⭐ SUPABASE - ЗВЕЗДЫ (STARS → RUB): ${Math.round(totalSupabaseSTARS).toLocaleString()}₽`);
  console.log(`🚫 SUPABASE - ФЕЙКОВЫЕ ДАННЫЕ: ${Math.round(totalSupabaseFAKE).toLocaleString()}₽`);
  console.log(`📊 ИТОГО SUPABASE: ${Math.round(totalSupabaseRUB + totalSupabaseSTARS + totalSupabaseFAKE).toLocaleString()}₽`);

  // Показываем топ фейковых методов
  console.log('\n🚫 ТОП ФЕЙКОВЫХ МЕТОДОВ (все заменены на FAKE):');
  Object.entries(fakeMethodsStats)
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 10)
    .forEach(([method, stats]) => {
      console.log(`   ${method}: ${Math.round(stats.amount).toLocaleString()}₽ (${stats.count} операций)`);
    });
  console.log('');

  // 3. СРАВНЕНИЕ РУБЛЕЙ: CSV vs SUPABASE
  console.log('📊 СРАВНЕНИЕ РУБЛЕЙ: CSV vs SUPABASE (RUB)');
  console.log('=' .repeat(80) + '\n');

  const rubDifference = totalCsvRub - totalSupabaseRUB;
  console.log(`💰 CSV (рубли): ${Math.round(totalCsvRub).toLocaleString()}₽`);
  console.log(`💰 Supabase (рубли): ${Math.round(totalSupabaseRUB).toLocaleString()}₽`);
  console.log(`⚠️  Разница: ${Math.round(Math.abs(rubDifference)).toLocaleString()}₽`);

  if (rubDifference > 0) {
    console.log(`   🚨 CSV показывает БОЛЬШЕ на ${Math.round(rubDifference).toLocaleString()}₽`);
  } else if (rubDifference < 0) {
    console.log(`   🚨 Supabase показывает БОЛЬШЕ на ${Math.round(Math.abs(rubDifference)).toLocaleString()}₽`);
  } else {
    console.log(`   ✅ Рублевые суммы совпадают!`);
  }

  // 4. ДЕТАЛИЗАЦИЯ ПО БОТАМ
  console.log('\n\n📋 ДЕТАЛИЗАЦИЯ ПО БОТАМ (3 категории):');
  console.log('=' .repeat(80) + '\n');

  const summaryByBot = BOTS.map(bot => {
    const rubData = categories.RUB[bot.name];
    const starsData = categories.STARS[bot.name];
    const fakeData = categories.FAKE[bot.name];

    const totalReal = rubData.amount + starsData.amount;
    const totalAll = totalReal + fakeData.amount;

    return {
      name: bot.name,
      type: bot.type,
      rub_count: rubData.count,
      rub_amount: rubData.amount,
      stars_count: starsData.count,
      stars_amount: starsData.amount,
      fake_count: fakeData.count,
      fake_amount: fakeData.amount,
      total_real: totalReal,
      total_all: totalAll
    };
  });

  console.log('№ | БОТ | РУБЛИ (RUB) | ЗВЕЗДЫ→₽ | ФЕЙК | ИТОГО РЕАЛЬНЫХ');
  console.log('-'.repeat(80));

  summaryByBot.forEach((bot, index) => {
    console.log(`${(index + 1).toString().padStart(2)} | ${bot.name.substring(0, 20).padEnd(20)} | ${Math.round(bot.rub_amount).toLocaleString().padStart(10)}₽ | ${Math.round(bot.stars_amount).toLocaleString().padStart(10)}₽ | ${Math.round(bot.fake_amount).toLocaleString().padStart(12)}₽ | ${Math.round(bot.total_real).toLocaleString().padStart(12)}₽`);
  });

  // 5. СОЗДАЕМ EXCEL С 3 ЛИСТАМИ
  console.log('\n\n📊 Создаем Excel с разделением по 3 категориям...\n');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "🎯 ТОЧНОЕ СРАВНЕНИЕ 3 КАТЕГОРИЙ";
  workbook.created = new Date();

  // ЛИСТ 1: СВОДКА ПО 3 КАТЕГОРИЯМ
  const summarySheet = workbook.addWorksheet('📊 СВОДКА 3 КАТЕГОРИЙ');
  summarySheet.mergeCells('A1:J1');
  summarySheet.getCell('A1').value = '📊 СВОДКА ПО 3 КАТЕГОРИЯМ: РУБЛИ | ЗВЕЗДЫ | ФЕЙК';
  summarySheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
  summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '15803D' } };
  summarySheet.getCell('A1').alignment = { horizontal: 'center' };

  const summaryHeader = summarySheet.addRow([
    '№', 'Бот', 'Тип',
    'РУБЛИ (RUB)', 'Кол-во RUB',
    'ЗВЕЗДЫ→₽', 'Кол-во STARS',
    'ФЕЙК', 'Кол-во ФЕЙК',
    'ИТОГО РЕАЛЬНЫХ'
  ]);
  summaryHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
  summaryHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '15803D' } };

  summaryByBot.forEach((bot, index) => {
    summarySheet.addRow([
      index + 1,
      bot.name,
      bot.type,
      Math.round(bot.rub_amount).toLocaleString(),
      bot.rub_count,
      Math.round(bot.stars_amount).toLocaleString(),
      bot.stars_count,
      Math.round(bot.fake_amount).toLocaleString(),
      bot.fake_count,
      Math.round(bot.total_real).toLocaleString()
    ]);
  });

  // Итоги
  const totalRow = summarySheet.addRow([
    'ИТОГО', 'ВСЕ БОТЫ', '',
    Math.round(totalSupabaseRUB).toLocaleString(),
    summaryByBot.reduce((sum, bot) => sum + bot.rub_count, 0),
    Math.round(totalSupabaseSTARS).toLocaleString(),
    summaryByBot.reduce((sum, bot) => sum + bot.stars_count, 0),
    Math.round(totalSupabaseFAKE).toLocaleString(),
    summaryByBot.reduce((sum, bot) => sum + bot.fake_count, 0),
    Math.round(totalSupabaseRUB + totalSupabaseSTARS).toLocaleString()
  ]);
  totalRow.font = { bold: true };

  // ЛИСТ 2: СРАВНЕНИЕ РУБЛЕЙ
  const rublesSheet = workbook.addWorksheet('💰 СРАВНЕНИЕ РУБЛЕЙ');
  rublesSheet.addRow(['Сравнение', 'Сумма (₽)', 'Кол-во операций']);
  rublesSheet.getRow(1).font = { bold: true };

  rublesSheet.addRow(['CSV (Robokassa)', Math.round(totalCsvRub).toLocaleString(), csvRubPayments.length]);
  rublesSheet.addRow(['Supabase (RUB)', Math.round(totalSupabaseRUB).toLocaleString(), summaryByBot.reduce((sum, bot) => sum + bot.rub_count, 0)]);
  rublesSheet.addRow(['РАЗНИЦА', Math.round(rubDifference).toLocaleString(), '']);

  if (rubDifference > 0) {
    rublesSheet.addRow(['Статус', 'CSV > Supabase', '']);
  } else if (rubDifference < 0) {
    rublesSheet.addRow(['Статус', 'Supabase > CSV', '']);
  } else {
    rublesSheet.addRow(['Статус', 'СОВПАДАЮТ', '']);
  }

  // ЛИСТ 3: ФЕЙКОВЫЕ ДАННЫЕ
  const fakeSheet = workbook.addWorksheet('🚫 ФЕЙКОВЫЕ ДАННЫЕ');
  fakeSheet.addRow(['Бот', 'Фейк сумма (₽)', 'Фейк кол-во', 'Доля от общего (%)']);
  fakeSheet.getRow(1).font = { bold: true };

  const sortedByFake = [...summaryByBot]
    .filter(bot => bot.fake_amount > 0)
    .sort((a, b) => b.fake_amount - a.fake_amount);

  sortedByFake.forEach(bot => {
    const share = bot.fake_amount / bot.total_all * 100;
    fakeSheet.addRow([
      bot.name,
      Math.round(bot.fake_amount).toLocaleString(),
      bot.fake_count,
      share.toFixed(1)
    ]);
  });

  const outputPath = '/Users/playra/999-multibots-telegraf/ТОЧНОЕ_СРАВНЕНИЕ_3_КАТЕГОРИИ.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log('✅ Анализ завершен!');
  console.log(`📁 Файл: ${outputPath}`);
  console.log('\n' + '='.repeat(80));
  console.log('🎯 ТОЧНОЕ СРАВНЕНИЕ ПО 3 КАТЕГОРИЯМ ЗАВЕРШЕНО!');
  console.log('='.repeat(80) + '\n');

  return {
    csvRub: totalCsvRub,
    supabaseRub: totalSupabaseRUB,
    supabaseStars: totalSupabaseSTARS,
    supabaseFake: totalSupabaseFAKE,
    difference: rubDifference,
    byBot: summaryByBot
  };
}

exactComparison3Categories().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
