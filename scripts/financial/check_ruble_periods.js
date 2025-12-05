#!/usr/bin/env node

/**
 * 📅 ТОЧНАЯ ПРОВЕРКА ПЕРИОДОВ ДЛЯ РУБЛЕВЫХ ОПЕРАЦИЙ
 * Сравниваем только RUB транзакции по датам
 */

const fs = require('fs');
const ExcelJS = require('exceljs');

const RATES = { XTR: 1.8, STARS: 1.8, RUB: 1.0 };

function convertToRub(amount, currency) {
  return (parseFloat(amount) || 0) * (RATES[currency] || 1.0);
}

function parseDate(dateStr) {
  // Парсим даты в формате DD.MM.YYYY HH:MM:SS
  const match = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    return new Date(year, month - 1, day);
  }
  return null;
}

const REAL_PAYMENT_METHODS = [
  'Telegram', 'Robokassa', 'YooMoney', 'SBP', 'TinkoffPay', 'SberPay'
];

async function checkRublePeriods() {
  console.log('\n' + '='.repeat(80));
  console.log('📅 ТОЧНАЯ ПРОВЕРКА ПЕРИОДОВ ДЛЯ РУБЛЕВЫХ ОПЕРАЦИЙ');
  console.log('='.repeat(80) + '\n');

  // 1. Читаем CSV (все транзакции - это рубли)
  console.log('📊 АНАЛИЗ CSV (все транзакции - рубли):\n');

  const csvContent = fs.readFileSync('Spisok operacij s 30.01.2025 po 30.11.2025.csv', 'utf8');
  const csvLines = csvContent.split('\n').filter(line => line.trim());

  const csvTransactions = [];
  for (let i = 1; i < csvLines.length; i++) {
    const cols = csvLines[i].split(';');
    if (cols.length < 10) continue;

    const paymentMethod = cols[2];
    const amountStr = cols[3];
    const dateStr = cols[4];
    const description = cols[6];

    const amount = parseFloat(amountStr.replace(',', '.'));
    const parsedDate = parseDate(dateStr);

    if (amount && parsedDate) {
      csvTransactions.push({
        amount,
        date: parsedDate,
        dateStr,
        paymentMethod,
        description
      });
    }
  }

  // Сортируем по дате
  csvTransactions.sort((a, b) => a.date - b.date);

  const csvMinDate = csvTransactions[0].date;
  const csvMaxDate = csvTransactions[csvTransactions.length - 1].date;
  const csvTotal = csvTransactions.reduce((sum, t) => sum + t.amount, 0);

  console.log(`✅ CSV: ${csvTransactions.length} рублевых транзакций`);
  console.log(`📅 Период CSV: ${csvMinDate.toLocaleDateString()} - ${csvMaxDate.toLocaleDateString()}`);
  console.log(`💰 Сумма CSV: ${Math.round(csvTotal).toLocaleString()}₽`);
  console.log(`📊 Первая транзакция: ${csvTransactions[0].dateStr} | ${Math.round(csvTransactions[0].amount)}₽`);
  console.log(`📊 Последняя транзакция: ${csvTransactions[csvTransactions.length - 1].dateStr} | ${Math.round(csvTransactions[csvTransactions.length - 1].amount)}₽`);

  // 2. Читаем Supabase (только RUB + реальные методы)
  console.log('\n📊 АНАЛИЗ SUPABASE (только RUB + реальные методы):\n');

  const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));
  const rubTransactions = rawData.filter(row =>
    row.type === 'MONEY_INCOME' &&
    row.currency === 'RUB' &&
    REAL_PAYMENT_METHODS.includes(row.payment_method)
  );

  const supabaseTransactions = rubTransactions.map(row => ({
    amount: convertToRub(row.amount, row.currency),
    date: new Date(row.created_at),
    dateStr: row.created_at,
    paymentMethod: row.payment_method,
    botName: row.bot_name,
    description: row.description
  }));

  // Сортируем по дате
  supabaseTransactions.sort((a, b) => a.date - b.date);

  const supabaseMinDate = supabaseTransactions[0].date;
  const supabaseMaxDate = supabaseTransactions[supabaseTransactions.length - 1].date;
  const supabaseTotal = supabaseTransactions.reduce((sum, t) => sum + t.amount, 0);

  console.log(`✅ Supabase: ${supabaseTransactions.length} рублевых транзакций`);
  console.log(`📅 Период Supabase: ${supabaseMinDate.toLocaleDateString()} - ${supabaseMaxDate.toLocaleDateString()}`);
  console.log(`💰 Сумма Supabase: ${Math.round(supabaseTotal).toLocaleString()}₽`);
  console.log(`📊 Первая транзакция: ${supabaseTransactions[0].dateStr} | ${Math.round(supabaseTransactions[0].amount)}₽`);
  console.log(`📊 Последняя транзакция: ${supabaseTransactions[supabaseTransactions.length - 1].dateStr} | ${Math.round(supabaseTransactions[supabaseTransactions.length - 1].amount)}₽`);

  // 3. СРАВНИВАЕМ ПЕРИОДЫ
  console.log('\n📊 СРАВНЕНИЕ ПЕРИОДОВ:');
  console.log('='.repeat(80));

  console.log(`\nCSV:   ${csvMinDate.toLocaleDateString()} - ${csvMaxDate.toLocaleDateString()}`);
  console.log(`Supa:  ${supabaseMinDate.toLocaleDateString()} - ${supabaseMaxDate.toLocaleDateString()}`);

  // Проверяем пересечения
  const csvStartBeforeSupabase = csvMinDate <= supabaseMinDate;
  const csvEndAfterSupabase = csvMaxDate >= supabaseMaxDate;

  if (csvMinDate === supabaseMinDate && csvMaxDate === supabaseMaxDate) {
    console.log('\n✅ ПЕРИОДЫ ИДЕНТИЧНЫ!');
  } else if (csvMinDate <= supabaseMinDate && csvMaxDate >= supabaseMaxDate) {
    console.log('\n⚠️  CSV полностью покрывает Supabase');
  } else if (supabaseMinDate <= csvMinDate && supabaseMaxDate >= csvMaxDate) {
    console.log('\n⚠️  Supabase полностью покрывает CSV');
  } else {
    console.log('\n⚠️  ПЕРИОДЫ ЧАСТИЧНО ПЕРЕСЕКАЮТСЯ');
  }

  // 4. НАХОДИМ ПЕРЕСЕЧЕНИЯ
  console.log('\n📊 АНАЛИЗ ПЕРЕСЕЧЕНИЙ:\n');

  // Берем пересекающийся период
  const overlapStart = csvMinDate > supabaseMinDate ? csvMinDate : supabaseMinDate;
  const overlapEnd = csvMaxDate < supabaseMaxDate ? csvMaxDate : supabaseMaxDate;

  if (overlapStart <= overlapEnd) {
    console.log(`📅 Пересекающийся период: ${overlapStart.toLocaleDateString()} - ${overlapEnd.toLocaleDateString()}`);

    // Фильтруем транзакции в пересекающемся периоде
    const csvInOverlap = csvTransactions.filter(t => t.date >= overlapStart && t.date <= overlapEnd);
    const supabaseInOverlap = supabaseTransactions.filter(t => t.date >= overlapStart && t.date <= overlapEnd);

    const csvOverlapTotal = csvInOverlap.reduce((sum, t) => sum + t.amount, 0);
    const supabaseOverlapTotal = supabaseInOverlap.reduce((sum, t) => sum + t.amount, 0);

    console.log(`\n📊 В пересекающемся периоде:`);
    console.log(`   CSV:        ${csvInOverlap.length} операций | ${Math.round(csvOverlapTotal).toLocaleString()}₽`);
    console.log(`   Supabase:   ${supabaseInOverlap.length} операций | ${Math.round(supabaseOverlapTotal).toLocaleString()}₽`);
    console.log(`   Разница:    ${Math.round(supabaseOverlapTotal - csvOverlapTotal).toLocaleString()}₽`);
  }

  // 5. ПОКАЗЫВАЕМ ГРАНИЦЫ ПЕРИОДОВ
  console.log('\n📋 ДЕТАЛИ ПО ПЕРИОДАМ:\n');

  console.log('📊 CSV - первые 5 операций:');
  csvTransactions.slice(0, 5).forEach((t, i) => {
    console.log(`   ${i + 1}. ${t.dateStr} | ${Math.round(t.amount)}₽ | ${t.paymentMethod}`);
  });

  console.log('\n📊 Supabase - первые 5 операций:');
  supabaseTransactions.slice(0, 5).forEach((t, i) => {
    console.log(`   ${i + 1}. ${t.dateStr} | ${Math.round(t.amount)}₽ | ${t.paymentMethod}`);
  });

  console.log('\n📊 CSV - последние 5 операций:');
  csvTransactions.slice(-5).forEach((t, i) => {
    console.log(`   ${csvTransactions.length - 4 + i}. ${t.dateStr} | ${Math.round(t.amount)}₽ | ${t.paymentMethod}`);
  });

  console.log('\n📊 Supabase - последние 5 операций:');
  supabaseTransactions.slice(-5).forEach((t, i) => {
    console.log(`   ${supabaseTransactions.length - 4 + i}. ${t.dateStr} | ${Math.round(t.amount)}₽ | ${t.paymentMethod}`);
  });

  // 6. СОЗДАЕМ EXCEL
  console.log('\n\n📊 Создаем Excel с анализом периодов...\n');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "📅 ПРОВЕРКА ПЕРИОДОВ РУБЛЕВЫХ ОПЕРАЦИЙ";
  workbook.created = new Date();

  // Лист 1: Сравнение периодов
  const periodsSheet = workbook.addWorksheet('📊 СРАВНЕНИЕ ПЕРИОДОВ');
  periodsSheet.addRow(['Источник', 'Количество', 'Сумма (₽)', 'Начало периода', 'Конец периода']);
  periodsSheet.getRow(1).font = { bold: true };

  periodsSheet.addRow([
    'CSV',
    csvTransactions.length,
    Math.round(csvTotal).toLocaleString(),
    csvMinDate.toLocaleDateString(),
    csvMaxDate.toLocaleDateString()
  ]);

  periodsSheet.addRow([
    'Supabase',
    supabaseTransactions.length,
    Math.round(supabaseTotal).toLocaleString(),
    supabaseMinDate.toLocaleDateString(),
    supabaseMaxDate.toLocaleDateString()
  ]);

  // Лист 2: Хронология CSV
  const csvSheet = workbook.addWorksheet('📋 CSV ХРОНОЛОГИЯ');
  csvSheet.addRow(['№', 'Дата', 'Сумма', 'Метод', 'Описание']);
  csvSheet.getRow(1).font = { bold: true };

  csvTransactions.forEach((t, i) => {
    csvSheet.addRow([
      i + 1,
      t.dateStr,
      Math.round(t.amount),
      t.paymentMethod,
      t.description?.substring(0, 50) || ''
    ]);
  });

  // Лист 3: Хронология Supabase
  const supabaseSheet = workbook.addWorksheet('📋 SUPABASE ХРОНОЛОГИЯ');
  supabaseSheet.addRow(['№', 'Дата', 'Сумма', 'Метод', 'Бот', 'Описание']);
  supabaseSheet.getRow(1).font = { bold: true };

  supabaseTransactions.forEach((t, i) => {
    supabaseSheet.addRow([
      i + 1,
      t.dateStr,
      Math.round(t.amount),
      t.paymentMethod,
      t.botName,
      t.description?.substring(0, 50) || ''
    ]);
  });

  const outputPath = '/Users/playra/999-multibots-telegraf/ПРОВЕРКА_ПЕРИОДОВ_РУБЛЕЙ.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log('✅ Анализ завершен!');
  console.log(`📁 Файл: ${outputPath}`);

  return {
    csv: {
      count: csvTransactions.length,
      amount: csvTotal,
      period: [csvMinDate, csvMaxDate]
    },
    supabase: {
      count: supabaseTransactions.length,
      amount: supabaseTotal,
      period: [supabaseMinDate, supabaseMaxDate]
    },
    overlap: overlapStart <= overlapEnd ? {
      start: overlapStart,
      end: overlapEnd
    } : null
  };
}

checkRublePeriods().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
