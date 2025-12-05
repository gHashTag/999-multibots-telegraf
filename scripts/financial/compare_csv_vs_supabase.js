#!/usr/bin/env node

/**
 * 🔍 СРАВНЕНИЕ CSV (ROBOKASSA) VS SUPABASE ДАННЫХ
 * Находим несоответствия в суммах и методах оплаты
 */

const fs = require('fs');
const ExcelJS = require('exceljs');

const RATES = { XTR: 1.8, STARS: 1.8, RUB: 1.0 };

function convertToRub(amount, currency) {
  return (parseFloat(amount) || 0) * (RATES[currency] || 1.0);
}

async function compareCsvVsSupabase() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 СРАВНЕНИЕ CSV (ROBOKASSA) VS SUPABASE ДАННЫХ');
  console.log('='.repeat(80) + '\n');

  // 1. Читаем CSV (Robokassa)
  console.log('📊 Анализируем CSV файл Robokassa...\n');

  const csvContent = fs.readFileSync('Spisok operacij s 30.01.2025 po 30.11.2025.csv', 'utf8');
  const csvLines = csvContent.split('\n').filter(line => line.trim());
  const csvHeader = csvLines[0].split(';');

  console.log('📋 Колонки CSV:', csvHeader.map((h, i) => `${i}: ${h}`).join('\n'));

  const csvPayments = [];
  for (let i = 1; i < csvLines.length; i++) {
    const cols = csvLines[i].split(';');
    if (cols.length < 10) continue;

    const operationType = cols[0];
    const paymentMethod = cols[2];
    const amountStr = cols[3];
    const email = cols[5];
    const description = cols[6];
    const feeStr = cols[9];
    const netAmountStr = cols[10];

    // Парсим суммы
    const amount = parseFloat(amountStr.replace(',', '.'));
    const fee = parseFloat(feeStr.replace(',', '.'));
    const netAmount = parseFloat(netAmountStr.replace(',', '.'));

    if (!amount || !netAmount) continue;

    csvPayments.push({
      operationType,
      paymentMethod,
      amount,
      fee,
      netAmount,
      email,
      description
    });
  }

  console.log(`✅ Записей в CSV: ${csvPayments.length}`);

  // 2. Читаем Supabase данные
  console.log('\n📊 Анализируем Supabase данные...\n');

  const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));
  const supabaseIncome = rawData.filter(row =>
    row.type === 'MONEY_INCOME' &&
    (row.payment_method === 'Telegram' || row.payment_method === 'Robokassa')
  );

  console.log(`✅ Записей в Supabase (Telegram/Robokassa): ${supabaseIncome.length}`);

  // 3. Группируем по методам
  console.log('\n📊 СВОДКА ПО CSV (ROBOKASSA):');
  console.log('='.repeat(80));

  const csvByMethod = {};
  csvPayments.forEach(payment => {
    if (!csvByMethod[payment.paymentMethod]) {
      csvByMethod[payment.paymentMethod] = {
        count: 0,
        totalAmount: 0,
        totalFee: 0,
        totalNetAmount: 0,
        examples: []
      };
    }
    csvByMethod[payment.paymentMethod].count++;
    csvByMethod[payment.paymentMethod].totalAmount += payment.amount;
    csvByMethod[payment.paymentMethod].totalFee += payment.fee;
    csvByMethod[payment.paymentMethod].totalNetAmount += payment.netAmount;

    if (csvByMethod[payment.paymentMethod].examples.length < 3) {
      csvByMethod[payment.paymentMethod].examples.push(payment);
    }
  });

  Object.entries(csvByMethod)
    .sort((a, b) => b[1].totalNetAmount - a[1].totalNetAmount)
    .forEach(([method, data]) => {
      console.log(`\n${method}:`);
      console.log(`   📊 Количество: ${data.count}`);
      console.log(`   💰 Сумма брутто: ${Math.round(data.totalAmount).toLocaleString()}₽`);
      console.log(`   💸 Комиссия: ${Math.round(data.totalFee).toLocaleString()}₽`);
      console.log(`   ✅ Сумма нетто: ${Math.round(data.totalNetAmount).toLocaleString()}₽`);
      console.log(`   📋 Примеры:`);
      data.examples.forEach(ex => {
        console.log(`      - ${ex.amount}₽ (комиссия ${ex.fee}₽) = ${ex.netAmount}₽ | ${ex.description}`);
      });
    });

  // 4. Группируем Supabase по методам
  console.log('\n\n📊 СВОДКА ПО SUPABASE:');
  console.log('='.repeat(80));

  const supabaseByMethod = {};
  supabaseIncome.forEach(row => {
    const method = row.payment_method;
    if (!supabaseByMethod[method]) {
      supabaseByMethod[method] = {
        count: 0,
        totalAmount: 0,
        examples: []
      };
    }
    supabaseByMethod[method].count++;
    supabaseByMethod[method].totalAmount += convertToRub(row.amount, row.currency);

    if (supabaseByMethod[method].examples.length < 5) {
      supabaseByMethod[method].examples.push(row);
    }
  });

  Object.entries(supabaseByMethod)
    .sort((a, b) => b[1].totalAmount - a[1].totalAmount)
    .forEach(([method, data]) => {
      console.log(`\n${method}:`);
      console.log(`   📊 Количество: ${data.count}`);
      console.log(`   💰 Сумма: ${Math.round(data.totalAmount).toLocaleString()}₽`);
      console.log(`   📋 Примеры:`);
      data.examples.forEach(ex => {
        console.log(`      - ${ex.amount} ${ex.currency} | ${ex.bot_name} | ${ex.description || ''}`);
      });
    });

  // 5. Сравнение
  console.log('\n\n🔍 СРАВНЕНИЕ:');
  console.log('='.repeat(80));

  const csvRobokassaTotal = csvByMethod['RUR  îÏÌÎÙÑ ÎÁÍÎÎÌËÁÝÉ']?.totalNetAmount || 0;
  const csvSbpTotal = csvByMethod['SBP']?.totalNetAmount || 0;
  const csvTinkoffPayTotal = csvByMethod['TinkoffPay']?.totalNetAmount || 0;
  const csvSberPayTotal = csvByMethod['SberPay']?.totalNetAmount || 0;

  const supabaseRobokassaTotal = supabaseByMethod['Robokassa']?.totalAmount || 0;
  const supabaseTelegramTotal = supabaseByMethod['Telegram']?.totalAmount || 0;

  console.log('\n💰 СУММЫ В CSV (ROBOKASSA - нетто):');
  console.log(`   RUR банковская карта: ${Math.round(csvRobokassaTotal).toLocaleString()}₽`);
  console.log(`   SBP: ${Math.round(csvSbpTotal).toLocaleString()}₽`);
  console.log(`   TinkoffPay: ${Math.round(csvTinkoffPayTotal).toLocaleString()}₽`);
  console.log(`   SberPay: ${Math.round(csvSberPayTotal).toLocaleString()}₽`);
  console.log(`   📊 ИТОГО CSV: ${Math.round(csvRobokassaTotal + csvSbpTotal + csvTinkoffPayTotal + csvSberPayTotal).toLocaleString()}₽`);

  console.log('\n💰 СУММЫ В SUPABASE:');
  console.log(`   Robokassa: ${Math.round(supabaseRobokassaTotal).toLocaleString()}₽`);
  console.log(`   Telegram: ${Math.round(supabaseTelegramTotal).toLocaleString()}₽`);
  console.log(`   📊 ИТОГО SUPABASE: ${Math.round(supabaseRobokassaTotal + supabaseTelegramTotal).toLocaleString()}₽`);

  console.log('\n\n⚠️  НЕСООТВЕТСТВИЯ:');
  console.log('='.repeat(80));

  const difference = (csvRobokassaTotal + csvSbpTotal + csvTinkoffPayTotal + csvSberPayTotal) - (supabaseRobokassaTotal + supabaseTelegramTotal);
  console.log(`\n💸 Разница: ${Math.round(Math.abs(difference)).toLocaleString()}₽`);
  if (difference > 0) {
    console.log('   🚨 CSV показывает БОЛЬШЕ, чем Supabase');
  } else if (difference < 0) {
    console.log('   🚨 Supabase показывает БОЛЬШЕ, чем CSV');
  } else {
    console.log('   ✅ Суммы совпадают!');
  }

  // 6. Детальный анализ по датам
  console.log('\n\n📅 АНАЛИЗ ПО ДАТАМ:');
  console.log('='.repeat(80));

  // Берем первые 10 записей из CSV
  console.log('\n📋 Первые 10 операций из CSV:');
  csvPayments.slice(0, 10).forEach((payment, index) => {
    console.log(`${index + 1}. ${payment.paymentMethod}: ${payment.amount}₽ (нетто ${payment.netAmount}₽) - ${payment.description}`);
  });

  console.log('\n📋 Первые 10 операций из Supabase:');
  supabaseIncome.slice(0, 10).forEach((row, index) => {
    console.log(`${index + 1}. ${row.payment_method}: ${row.amount} ${row.currency} (${Math.round(convertToRub(row.amount, row.currency))}₽) - ${row.bot_name}`);
  });

  // 7. Создаем Excel с детальным сравнением
  console.log('\n\n📊 Создаем Excel с детальным сравнением...\n');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "🔍 СРАВНЕНИЕ CSV VS SUPABASE";
  workbook.created = new Date();

  // Лист 1: Сравнение методов
  const comparisonSheet = workbook.addWorksheet('🔍 СРАВНЕНИЕ МЕТОДОВ');
  comparisonSheet.mergeCells('A1:F1');
  comparisonSheet.getCell('A1').value = '🔍 СРАВНЕНИЕ CSV (ROBOKASSA) VS SUPABASE';
  comparisonSheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
  comparisonSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7C2D12' } };
  comparisonSheet.getCell('A1').alignment = { horizontal: 'center' };

  const headerRow = comparisonSheet.addRow([
    'Метод оплаты',
    'CSV (количество)',
    'CSV (сумма нетто)',
    'Supabase (количество)',
    'Supabase (сумма)',
    'Разница'
  ]);
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7C2D12' } };

  const methodsToCompare = [
    { csv: 'RUR îÏÌÎÙÑ ÎÁÍÎÎÌËÁÝÉ', supabase: 'Robokassa', csvTotal: csvRobokassaTotal, supabaseTotal: supabaseRobokassaTotal },
    { csv: 'Telegram', supabase: 'Telegram', csvTotal: 0, supabaseTotal: supabaseTelegramTotal },
    { csv: 'SBP', supabase: 'SBP', csvTotal: csvSbpTotal, supabaseTotal: 0 },
    { csv: 'TinkoffPay', supabase: 'TinkoffPay', csvTotal: csvTinkoffPayTotal, supabaseTotal: 0 },
    { csv: 'SberPay', supabase: 'SberPay', csvTotal: csvSberPayTotal, supabaseTotal: 0 }
  ];

  methodsToCompare.forEach(method => {
    comparisonSheet.addRow([
      `${method.csv} / ${method.supabase}`,
      csvByMethod[method.csv]?.count || 0,
      Math.round(method.csvTotal).toLocaleString() + '₽',
      supabaseByMethod[method.supabase]?.count || 0,
      Math.round(method.supabaseTotal).toLocaleString() + '₽',
      Math.round(method.csvTotal - method.supabaseTotal).toLocaleString() + '₽'
    ]);
  });

  // Лист 2: Детали CSV
  const csvSheet = workbook.addWorksheet('📊 CSV ДЕТАЛИ');
  csvSheet.addRow(['Метод', 'Сумма брутто', 'Комиссия', 'Сумма нетто', 'Email', 'Описание']);
  csvSheet.getRow(1).font = { bold: true };

  csvPayments.forEach(payment => {
    csvSheet.addRow([
      payment.paymentMethod,
      payment.amount,
      payment.fee,
      payment.netAmount,
      payment.email,
      payment.description
    ]);
  });

  // Лист 3: Детали Supabase
  const supabaseSheet = workbook.addWorksheet('📊 SUPABASE ДЕТАЛИ');
  supabaseSheet.addRow(['Метод', 'Сумма', 'Валюта', 'Сумма в ₽', 'Бот', 'Описание']);
  supabaseSheet.getRow(1).font = { bold: true };

  supabaseIncome.forEach(row => {
    supabaseSheet.addRow([
      row.payment_method,
      row.amount,
      row.currency,
      Math.round(convertToRub(row.amount, row.currency)),
      row.bot_name,
      row.description || ''
    ]);
  });

  const outputPath = '/Users/playra/999-multibots-telegraf/СРАВНЕНИЕ_CSV_VS_SUPABASE.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log('✅ Сравнение завершено!');
  console.log(`📁 Файл: ${outputPath}`);
  console.log('='.repeat(80) + '\n');

  return {
    csvTotal: csvRobokassaTotal + csvSbpTotal + csvTinkoffPayTotal + csvSberPayTotal,
    supabaseTotal: supabaseRobokassaTotal + supabaseTelegramTotal,
    difference
  };
}

compareCsvVsSupabase().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
