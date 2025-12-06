#!/usr/bin/env node

/**
 * 🔍 ДЕТАЛЬНОЕ СРАВНЕНИЕ ТРАНЗАКЦИЙ
 * Находим точные различия между CSV и Supabase (рубли)
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

async function detailedTransactionAnalysis() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 ДЕТАЛЬНОЕ СРАВНЕНИЕ ТРАНЗАКЦИЙ');
  console.log('='.repeat(80) + '\n');

  // 1. ЧИТАЕМ CSV
  console.log('📊 ЧИТАЕМ CSV (ROBOKASSA)...\n');

  const csvContent = fs.readFileSync('Spisok operacij s 30.01.2025 po 30.11.2025.csv', 'utf8');
  const csvLines = csvContent.split('\n').filter(line => line.trim());

  const csvTransactions = [];
  for (let i = 1; i < csvLines.length; i++) {
    const cols = csvLines[i].split(';');
    if (cols.length < 10) continue;

    const paymentMethod = cols[2];
    const amountStr = cols[3];
    const email = cols[5];
    const description = cols[6];
    const netAmountStr = cols[10];

    const amount = parseFloat(amountStr.replace(',', '.'));
    const netAmount = parseFloat(netAmountStr.replace(',', '.'));

    if (!amount || !netAmount) continue;

    csvTransactions.push({
      source: 'CSV',
      paymentMethod,
      amount: netAmount, // Используем нетто как основную сумму
      email,
      description,
      rawAmount: amount
    });
  }

  console.log(`✅ CSV: ${csvTransactions.length} транзакций`);

  // 2. ЧИТАЕМ SUPABASE (только рубли + реальные методы)
  console.log('\n📊 ЧИТАЕМ SUPABASE (только RUB + реальные методы)...\n');

  const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));
  const incomeData = rawData.filter(row =>
    row.type === 'MONEY_INCOME' &&
    row.currency === 'RUB' &&
    REAL_PAYMENT_METHODS.includes(row.payment_method)
  );

  const supabaseTransactions = incomeData.map(row => ({
    source: 'SUPABASE',
    paymentMethod: row.payment_method,
    amount: convertToRub(row.amount, row.currency),
    email: row.user_id || '',
    description: row.description || '',
    botName: row.bot_name,
    amountOriginal: row.amount
  }));

  console.log(`✅ Supabase: ${supabaseTransactions.length} транзакций`);

  // 3. ГРУППИРУЕМ ПО МЕТОДАМ ОПЛАТЫ
  console.log('\n📊 ГРУППИРОВКА ПО МЕТОДАМ ОПЛАТЫ:\n');

  const csvByMethod = {};
  csvTransactions.forEach(t => {
    if (!csvByMethod[t.paymentMethod]) {
      csvByMethod[t.paymentMethod] = { count: 0, amount: 0, transactions: [] };
    }
    csvByMethod[t.paymentMethod].count++;
    csvByMethod[t.paymentMethod].amount += t.amount;
    csvByMethod[t.paymentMethod].transactions.push(t);
  });

  const supabaseByMethod = {};
  supabaseTransactions.forEach(t => {
    if (!supabaseByMethod[t.paymentMethod]) {
      supabaseByMethod[t.paymentMethod] = { count: 0, amount: 0, transactions: [] };
    }
    supabaseByMethod[t.paymentMethod].count++;
    supabaseByMethod[t.paymentMethod].amount += t.amount;
    supabaseByMethod[t.paymentMethod].transactions.push(t);
  });

  // 4. СРАВНИВАЕМ ПО МЕТОДАМ
  console.log('💰 СРАВНЕНИЕ ПО МЕТОДАМ:');
  console.log('='.repeat(80));

  const allMethods = new Set([...Object.keys(csvByMethod), ...Object.keys(supabaseByMethod)]);
  const comparisonData = [];

  Array.from(allMethods).sort().forEach(method => {
    const csvData = csvByMethod[method] || { count: 0, amount: 0 };
    const supabaseData = supabaseByMethod[method] || { count: 0, amount: 0 };
    const difference = supabaseData.amount - csvData.amount;

    comparisonData.push({
      method,
      csv_count: csvData.count,
      csv_amount: csvData.amount,
      supabase_count: supabaseData.count,
      supabase_amount: supabaseData.amount,
      difference
    });

    console.log(`\n${method}:`);
    console.log(`   CSV:        ${csvData.count} операций | ${Math.round(csvData.amount).toLocaleString()}₽`);
    console.log(`   Supabase:   ${supabaseData.count} операций | ${Math.round(supabaseData.amount).toLocaleString()}₽`);
    console.log(`   Разница:    ${Math.round(difference).toLocaleString()}₽`);
  });

  const totalCsv = csvTransactions.reduce((sum, t) => sum + t.amount, 0);
  const totalSupabase = supabaseTransactions.reduce((sum, t) => sum + t.amount, 0);
  const totalDifference = totalSupabase - totalCsv;

  console.log('\n' + '='.repeat(80));
  console.log('📊 ИТОГО:');
  console.log(`   CSV:        ${csvTransactions.length} операций | ${Math.round(totalCsv).toLocaleString()}₽`);
  console.log(`   Supabase:   ${supabaseTransactions.length} операций | ${Math.round(totalSupabase).toLocaleString()}₽`);
  console.log(`   Разница:    ${Math.round(totalDifference).toLocaleString()}₽`);
  console.log('='.repeat(80));

  // 5. АНАЛИЗИРУЕМ ПЕРЕСЕЧЕНИЯ
  console.log('\n\n🔍 АНАЛИЗ ПЕРЕСЕЧЕНИЙ И РАЗЛИЧИЙ:\n');

  // Поиск возможных совпадений по email (если есть)
  const csvByEmail = {};
  csvTransactions.forEach(t => {
    if (t.email) {
      if (!csvByEmail[t.email]) csvByEmail[t.email] = [];
      csvByEmail[t.email].push(t);
    }
  });

  const supabaseByBot = {};
  supabaseTransactions.forEach(t => {
    if (!supabaseByBot[t.botName]) supabaseByBot[t.botName] = [];
    supabaseByBot[t.botName].push(t);
  });

  console.log('📊 ТОП ботов в Supabase (рубли):');
  Object.entries(supabaseByBot)
    .sort((a, b) => b[1].reduce((sum, t) => sum + t.amount, 0) - a[1].reduce((sum, t) => sum + t.amount, 0))
    .forEach(([bot, transactions]) => {
      const total = transactions.reduce((sum, t) => sum + t.amount, 0);
      console.log(`   ${bot}: ${Math.round(total).toLocaleString()}₽ (${transactions.length} операций)`);
    });

  console.log('\n📊 ТОП email в CSV:');
  Object.entries(csvByEmail)
    .sort((a, b) => b[1].reduce((sum, t) => sum + t.amount, 0) - a[1].reduce((sum, t) => sum + t.amount, 0))
    .slice(0, 10)
    .forEach(([email, transactions]) => {
      const total = transactions.reduce((sum, t) => sum + t.amount, 0);
      console.log(`   ${email}: ${Math.round(total).toLocaleString()}₽ (${transactions.length} операций)`);
    });

  // 6. ПРИМЕРЫ ТРАНЗАКЦИЙ
  console.log('\n\n📋 ПРИМЕРЫ ТРАНЗАКЦИЙ:\n');

  console.log('📋 CSV (первые 5):');
  csvTransactions.slice(0, 5).forEach((t, i) => {
    console.log(`   ${i + 1}. ${t.paymentMethod}: ${Math.round(t.amount)}₽ | ${t.email} | ${t.description.substring(0, 50)}...`);
  });

  console.log('\n📋 Supabase (первые 5):');
  supabaseTransactions.slice(0, 5).forEach((t, i) => {
    console.log(`   ${i + 1}. ${t.paymentMethod}: ${Math.round(t.amount)}₽ | ${t.botName} | ${t.description.substring(0, 50)}...`);
  });

  // 7. СОЗДАЕМ EXCEL
  console.log('\n\n📊 Создаем Excel с детальным анализом...\n');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "🔍 ДЕТАЛЬНОЕ СРАВНЕНИЕ ТРАНЗАКЦИЙ";
  workbook.created = new Date();

  // Лист 1: Сравнение по методам
  const methodSheet = workbook.addWorksheet('📊 СРАВНЕНИЕ ПО МЕТОДАМ');
  methodSheet.mergeCells('A1:F1');
  methodSheet.getCell('A1').value = '🔍 СРАВНЕНИЕ CSV VS SUPABASE ПО МЕТОДАМ ОПЛАТЫ';
  methodSheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
  methodSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7C2D12' } };
  methodSheet.getCell('A1').alignment = { horizontal: 'center' };

  const methodHeader = methodSheet.addRow([
    'Метод оплаты',
    'CSV (кол-во)',
    'CSV (сумма)',
    'Supabase (кол-во)',
    'Supabase (сумма)',
    'Разница'
  ]);
  methodHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
  methodHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7C2D12' } };

  comparisonData
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
    .forEach(row => {
      const sheetRow = methodSheet.addRow([
        row.method,
        row.csv_count,
        Math.round(row.csv_amount).toLocaleString(),
        row.supabase_count,
        Math.round(row.supabase_amount).toLocaleString(),
        Math.round(row.difference).toLocaleString()
      ]);

      if (row.difference > 0) {
        sheetRow.getCell(6).font = { bold: true, color: { argb: 'DC2626' } };
      } else if (row.difference < 0) {
        sheetRow.getCell(6).font = { bold: true, color: { argb: '16A34A' } };
      }
    });

  // Лист 2: Транзакции CSV
  const csvSheet = workbook.addWorksheet('📋 CSV ТРАНЗАКЦИИ');
  csvSheet.addRow(['№', 'Метод', 'Сумма', 'Email', 'Описание']);
  csvSheet.getRow(1).font = { bold: true };

  csvTransactions.forEach((t, i) => {
    csvSheet.addRow([
      i + 1,
      t.paymentMethod,
      Math.round(t.amount),
      t.email,
      t.description
    ]);
  });

  // Лист 3: Транзакции Supabase
  const supabaseSheet = workbook.addWorksheet('📋 SUPABASE ТРАНЗАКЦИИ');
  supabaseSheet.addRow(['№', 'Метод', 'Сумма', 'Бот', 'Описание']);
  supabaseSheet.getRow(1).font = { bold: true };

  supabaseTransactions.forEach((t, i) => {
    supabaseSheet.addRow([
      i + 1,
      t.paymentMethod,
      Math.round(t.amount),
      t.botName,
      t.description
    ]);
  });

  const outputPath = '/Users/playra/999-multibots-telegraf/ДЕТАЛЬНОЕ_СРАВНЕНИЕ_ТРАНЗАКЦИЙ.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log('✅ Анализ завершен!');
  console.log(`📁 Файл: ${outputPath}`);

  return {
    csvTransactions,
    supabaseTransactions,
    comparisonData,
    totalCsv,
    totalSupabase,
    totalDifference
  };
}

detailedTransactionAnalysis().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
