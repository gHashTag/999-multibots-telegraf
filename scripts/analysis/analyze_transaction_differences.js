#!/usr/bin/env node

/**
 * 🔍 АНАЛИЗ РАЗЛИЧИЙ В ТРАНЗАКЦИЯХ
 * Почему в Supabase в 3 раза больше денег и нет совпадений с CSV?
 */

const fs = require('fs');
const ExcelJS = require('exceljs');

const RATES = { XTR: 1.8, STARS: 1.8, RUB: 1.0 };

function convertToRub(amount, currency) {
  return (parseFloat(amount) || 0) * (RATES[currency] || 1.0);
}

const REAL_PAYMENT_METHODS = [
  'Telegram', 'Robokassa', 'YooMoney', 'SBP', 'TinkoffPay', 'SberPay'
];

async function analyzeTransactionDifferences() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 АНАЛИЗ РАЗЛИЧИЙ В ТРАНЗАКЦИЯХ');
  console.log('='.repeat(80) + '\n');

  // 1. Читаем CSV
  console.log('📊 ЧИТАЕМ CSV...\n');

  const csvContent = fs.readFileSync('Spisok operacij s 30.01.2025 po 30.11.2025.csv', 'utf8');
  const csvLines = csvContent.split('\n').filter(line => line.trim());

  const csvTransactions = [];
  for (let i = 1; i < csvLines.length; i++) {
    const cols = csvLines[i].split(';');
    if (cols.length < 10) continue;

    const amountStr = cols[3];
    const description = cols[6];
    const date = cols[4];
    const email = cols[5];

    const amount = parseFloat(amountStr.replace(',', '.'));
    if (!amount) continue;

    csvTransactions.push({
      source: 'CSV',
      amount,
      date,
      email,
      description
    });
  }

  console.log(`✅ CSV: ${csvTransactions.length} транзакций`);
  console.log(`💰 Сумма CSV: ${Math.round(csvTransactions.reduce((s, t) => s + t.amount, 0)).toLocaleString()}₽`);

  // 2. Читаем Supabase
  console.log('\n📊 ЧИТАЕМ SUPABASE...\n');

  const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

  // ВСЕ доходы (включая STARS, XTR)
  const allIncome = rawData.filter(row => row.type === 'MONEY_INCOME');

  // Только реальные методы оплаты
  const realIncome = allIncome.filter(row => REAL_PAYMENT_METHODS.includes(row.payment_method));

  // Только рубли + реальные методы
  const rubIncome = realIncome.filter(row => row.currency === 'RUB');

  console.log(`📊 Всего MONEY_INCOME: ${allIncome.length} записей`);
  console.log(`📊 Реальные методы оплаты: ${realIncome.length} записей`);
  console.log(`📊 RUB + реальные методы: ${rubIncome.length} записей`);

  // 3. АНАЛИЗИРУЕМ ВАЛЮТЫ
  console.log('\n💰 АНАЛИЗ ВАЛЮТ В SUPABASE:\n');

  const byCurrency = {};
  realIncome.forEach(row => {
    const currency = row.currency;
    if (!byCurrency[currency]) {
      byCurrency[currency] = { count: 0, amount: 0, methods: new Set() };
    }
    byCurrency[currency].count++;
    byCurrency[currency].amount += convertToRub(row.amount, row.currency);
    byCurrency[currency].methods.add(row.payment_method);
  });

  console.log('📊 По валютам:');
  Object.entries(byCurrency)
    .sort((a, b) => b[1].amount - a[1].amount)
    .forEach(([currency, data]) => {
      console.log(`   ${currency}: ${Math.round(data.amount).toLocaleString()}₽ (${data.count} операций)`);
      console.log(`      Методы: ${Array.from(data.methods).join(', ')}`);
    });

  // 4. СРАВНИВАЕМ ПЕРИОДЫ
  console.log('\n📅 АНАЛИЗ ПЕРИОДОВ:\n');

  // Берем даты из CSV
  const csvDates = csvTransactions.map(t => {
    const dateMatch = t.date.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (dateMatch) {
      const [, day, month, year] = dateMatch;
      return new Date(year, month - 1, day);
    }
    return null;
  }).filter(d => d !== null);

  const csvMinDate = new Date(Math.min(...csvDates));
  const csvMaxDate = new Date(Math.max(...csvDates));

  console.log(`📅 CSV период: ${csvMinDate.toLocaleDateString()} - ${csvMaxDate.toLocaleDateString()}`);

  // Берем даты из Supabase
  const supabaseDates = rubIncome.map(row => new Date(row.created_at));
  const supabaseMinDate = new Date(Math.min(...supabaseDates));
  const supabaseMaxDate = new Date(Math.max(...supabaseDates));

  console.log(`📅 Supabase период: ${supabaseMinDate.toLocaleDateString()} - ${supabaseMaxDate.toLocaleDateString()}`);

  // 5. АНАЛИЗИРУЕМ БОТЫ
  console.log('\n🤖 АНАЛИЗ ПО БОТАМ:\n');

  const supabaseByBot = {};
  rubIncome.forEach(row => {
    const botName = row.bot_name;
    if (!supabaseByBot[botName]) {
      supabaseByBot[botName] = {
        count: 0,
        amount: 0,
        methods: new Set(),
        examples: []
      };
    }
    supabaseByBot[botName].count++;
    supabaseByBot[botName].amount += convertToRub(row.amount, row.currency);
    supabaseByBot[botName].methods.add(row.payment_method);

    if (supabaseByBot[botName].examples.length < 3) {
      supabaseByBot[botName].examples.push({
        amount: row.amount,
        currency: row.currency,
        method: row.payment_method,
        date: row.created_at,
        description: row.description
      });
    }
  });

  console.log('📊 ТОП ботов в Supabase (RUB):');
  Object.entries(supabaseByBot)
    .sort((a, b) => b[1].amount - a[1].amount)
    .forEach(([bot, data]) => {
      console.log(`\n   ${bot}: ${Math.round(data.amount).toLocaleString()}₽ (${data.count} операций)`);
      console.log(`      Методы: ${Array.from(data.methods).join(', ')}`);
      console.log(`      Примеры:`);
      data.examples.forEach(ex => {
        console.log(`         - ${ex.amount} ${ex.currency} | ${ex.method} | ${new Date(ex.date).toLocaleDateString()} | ${ex.description?.substring(0, 50)}...`);
      });
    });

  // 6. ПРОВЕРЯЕМ НЕБОЛЬШИЕ СУММЫ
  console.log('\n💰 ПРОВЕРЯЕМ НЕБОЛЬШИЕ СУММЫ В CSV:\n');

  const csvSmallAmounts = csvTransactions
    .filter(t => t.amount < 100)
    .sort((a, b) => a.amount - b.amount);

  console.log(`📊 Небольшие суммы в CSV (< 100₽): ${csvSmallAmounts.length} записей`);
  csvSmallAmounts.forEach(t => {
    console.log(`   ${t.amount}₽ | ${t.email} | ${t.description?.substring(0, 50)}...`);
  });

  // 7. ПРОВЕРЯЕМ STARS В SUPABASE
  console.log('\n⭐ ПРОВЕРЯЕМ STARS В SUPABASE:\n');

  const starsTransactions = realIncome.filter(row => row.currency === 'STARS');
  const totalStars = starsTransactions.reduce((sum, row) => sum + convertToRub(row.amount, 'STARS'), 0);

  console.log(`⭐ STARS в Supabase: ${Math.round(totalStars).toLocaleString()}₽ (${starsTransactions.length} операций)`);

  if (starsTransactions.length > 0) {
    console.log('\n📋 Примеры STARS транзакций:');
    starsTransactions.slice(0, 10).forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.amount} STARS (${Math.round(convertToRub(row.amount, 'STARS'))}₽) | ${row.bot_name} | ${row.description}`);
    });
  }

  // 8. СОЗДАЕМ EXCEL
  console.log('\n\n📊 Создаем Excel с анализом различий...\n');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "🔍 АНАЛИЗ РАЗЛИЧИЙ В ТРАНЗАКЦИЯХ";
  workbook.created = new Date();

  // Лист 1: Сравнение периодов и сумм
  const summarySheet = workbook.addWorksheet('📊 СВОДКА');
  summarySheet.addRow(['Параметр', 'CSV', 'Supabase']);
  summarySheet.getRow(1).font = { bold: true };

  summarySheet.addRow(['Количество транзакций', csvTransactions.length, rubIncome.length]);
  summarySheet.addRow(['Сумма (₽)', Math.round(csvTransactions.reduce((s, t) => s + t.amount, 0)).toLocaleString(), Math.round(rubIncome.reduce((s, row) => s + convertToRub(row.amount, row.currency), 0)).toLocaleString()]);
  summarySheet.addRow(['Период с', csvMinDate.toLocaleDateString(), supabaseMinDate.toLocaleDateString()]);
  summarySheet.addRow(['Период по', csvMaxDate.toLocaleDateString(), supabaseMaxDate.toLocaleDateString()]);
  summarySheet.addRow(['Валюты', 'RUB', 'RUB + STARS + XTR']);

  // Лист 2: По валютам
  const currencySheet = workbook.addWorksheet('💰 ПО ВАЛЮТАМ');
  currencySheet.addRow(['Валюта', 'Количество', 'Сумма (₽)', 'Методы']);
  currencySheet.getRow(1).font = { bold: true };

  Object.entries(byCurrency)
    .sort((a, b) => b[1].amount - a[1].amount)
    .forEach(([currency, data]) => {
      currencySheet.addRow([
        currency,
        data.count,
        Math.round(data.amount).toLocaleString(),
        Array.from(data.methods).join(', ')
      ]);
    });

  // Лист 3: По ботам
  const botsSheet = workbook.addWorksheet('🤖 ПО БОТАМ');
  botsSheet.addRow(['Бот', 'Количество', 'Сумма (₽)', 'Методы']);
  botsSheet.getRow(1).font = { bold: true };

  Object.entries(supabaseByBot)
    .sort((a, b) => b[1].amount - a[1].amount)
    .forEach(([bot, data]) => {
      botsSheet.addRow([
        bot,
        data.count,
        Math.round(data.amount).toLocaleString(),
        Array.from(data.methods).join(', ')
      ]);
    });

  const outputPath = '/Users/playra/999-multibots-telegraf/АНАЛИЗ_РАЗЛИЧИЙ_ТРАНЗАКЦИЙ.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log('✅ Анализ завершен!');
  console.log(`📁 Файл: ${outputPath}`);

  return {
    csv: {
      count: csvTransactions.length,
      amount: csvTransactions.reduce((s, t) => s + t.amount, 0),
      period: [csvMinDate, csvMaxDate]
    },
    supabase: {
      byCurrency,
      byBot: supabaseByBot,
      totalRUB: rubIncome.reduce((s, row) => s + convertToRub(row.amount, row.currency), 0),
      totalSTARS: totalStars
    }
  };
}

analyzeTransactionDifferences().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
