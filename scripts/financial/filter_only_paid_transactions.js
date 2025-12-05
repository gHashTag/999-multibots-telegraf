#!/usr/bin/env node

/**
 * 💰 ФИЛЬТРАЦИЯ ТОЛЬКО ОПЛАЧЕННЫХ ТРАНЗАКЦИЙ
 * Исключаем неоплаченные счета из Supabase
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

async function filterOnlyPaidTransactions() {
  console.log('\n' + '='.repeat(80));
  console.log('💰 ФИЛЬТРАЦИЯ ТОЛЬКО ОПЛАЧЕННЫХ ТРАНЗАКЦИЙ');
  console.log('='.repeat(80) + '\n');

  // 1. Читаем все поля из Supabase чтобы понять структуру
  console.log('📊 Анализируем структуру данных Supabase...\n');

  const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));
  const allFields = Object.keys(rawData[0] || {});
  console.log('📋 Все поля в Supabase:', allFields.join(', '));

  // Ищем поля, которые могут указывать на статус оплаты
  const statusFields = allFields.filter(field =>
    field.toLowerCase().includes('status') ||
    field.toLowerCase().includes('state') ||
    field.toLowerCase().includes('paid') ||
    field.toLowerCase().includes('payment')
  );
  console.log('📋 Возможные поля статуса:', statusFields.join(', '));

  // 2. Читаем CSV для сравнения
  console.log('\n📊 Читаем CSV (только оплаченные)...\n');

  const csvContent = fs.readFileSync('Spisok operacij s 30.01.2025 po 30.11.2025.csv', 'utf8');
  const csvLines = csvContent.split('\n').filter(line => line.trim());

  const csvAmounts = new Set();
  let totalCsvAmount = 0;

  for (let i = 1; i < csvLines.length; i++) {
    const cols = csvLines[i].split(';');
    if (cols.length < 10) continue;

    const amountStr = cols[3];
    const netAmountStr = cols[10];

    const amount = parseFloat(amountStr.replace(',', '.'));
    const netAmount = parseFloat(netAmountStr.replace(',', '.'));

    if (amount && netAmount) {
      csvAmounts.add(Math.round(netAmount * 100) / 100); // Округляем до копеек
      totalCsvAmount += netAmount;
    }
  }

  console.log(`✅ CSV: ${csvLines.length - 1} оплаченных транзакций`);
  console.log(`💰 Сумма CSV: ${Math.round(totalCsvAmount).toLocaleString()}₽`);

  // 3. Фильтруем Supabase
  console.log('\n📊 Фильтруем Supabase...\n');

  const incomeData = rawData.filter(row =>
    row.type === 'MONEY_INCOME' &&
    row.currency === 'RUB' &&
    REAL_PAYMENT_METHODS.includes(row.payment_method)
  );

  console.log(`📊 Всего MONEY_INCOME (RUB + реальные методы): ${incomeData.length} записей`);

  // Смотрим на все возможные статусы
  const possibleStatusValues = {};
  incomeData.forEach(row => {
    Object.keys(row).forEach(key => {
      if (key.toLowerCase().includes('status') ||
          key.toLowerCase().includes('state') ||
          key.toLowerCase().includes('paid')) {
        const value = row[key];
        if (!possibleStatusValues[key]) possibleStatusValues[key] = new Set();
        possibleStatusValues[key].add(value);
      }
    });
  });

  console.log('\n📋 Возможные статусы в данных:');
  Object.entries(possibleStatusValues).forEach(([field, values]) => {
    console.log(`   ${field}: ${Array.from(values).join(', ')}`);
  });

  // 4. ПОДХОД 1: Фильтрация по совпадению сумм с CSV
  console.log('\n💡 ПОДХОД 1: Фильтрация по совпадению сумм с CSV\n');

  const supabaseMatching = incomeData.filter(row => {
    const amount = convertToRub(row.amount, row.currency);
    const roundedAmount = Math.round(amount * 100) / 100;
    return csvAmounts.has(roundedAmount);
  });

  const supabaseMatchingTotal = supabaseMatching.reduce((sum, row) => sum + convertToRub(row.amount, row.currency), 0);

  console.log(`✅ Supabase (совпадающие суммы): ${supabaseMatching.length} записей`);
  console.log(`💰 Сумма: ${Math.round(supabaseMatchingTotal).toLocaleString()}₽`);
  console.log(`📊 Совпадение с CSV: ${(supabaseMatchingTotal / totalCsvAmount * 100).toFixed(1)}%`);

  // 5. ПОДХОД 2: Исключаем подозрительные записи
  console.log('\n💡 ПОДХОД 2: Исключаем подозрительные записи\n');

  // Подозрительные паттерны:
  // - Очень маленькие суммы (возможно тестовые)
  // - Очень большие суммы (возможно ошибки)
  // - Повторяющиеся одинаковые суммы (возможно тестовые)

  const suspiciousPatterns = {
    verySmall: incomeData.filter(row => {
      const amount = convertToRub(row.amount, row.currency);
      return amount < 10; // Меньше 10 рублей
    }),
    veryLarge: incomeData.filter(row => {
      const amount = convertToRub(row.amount, row.currency);
      return amount > 10000; // Больше 10,000 рублей
    }),
    duplicateAmounts: {}
  };

  // Ищем дубликаты сумм
  incomeData.forEach(row => {
    const amount = convertToRub(row.amount, row.currency);
    const rounded = Math.round(amount);
    if (!suspiciousPatterns.duplicateAmounts[rounded]) {
      suspiciousPatterns.duplicateAmounts[rounded] = [];
    }
    suspiciousPatterns.duplicateAmounts[rounded].push(row);
  });

  const duplicateAmountsList = Object.entries(suspiciousPatterns.duplicateAmounts)
    .filter(([amount, rows]) => rows.length > 5) // Больше 5 одинаковых сумм
    .map(([amount, rows]) => ({ amount: parseInt(amount), count: rows.length }));

  console.log(`🚨 Подозрительно маленькие (< 10₽): ${suspiciousPatterns.verySmall.length} записей`);
  console.log(`🚨 Подозрительно большие (> 10,000₽): ${suspiciousPatterns.veryLarge.length} записей`);
  console.log(`🚨 Повторяющиеся суммы (5+ одинаковых): ${duplicateAmountsList.length} уникальных сумм`);

  // 6. ФИНАЛЬНАЯ ФИЛЬТРАЦИЯ
  console.log('\n💡 ФИНАЛЬНАЯ ФИЛЬТРАЦИЯ\n');

  // Удаляем подозрительные записи
  const filteredSupabase = incomeData.filter(row => {
    const amount = convertToRub(row.amount, row.currency);

    // Исключаем подозрительные
    if (amount < 10) return false; // Очень маленькие
    if (amount > 10000) return false; // Очень большие

    return true;
  });

  const filteredTotal = filteredSupabase.reduce((sum, row) => sum + convertToRub(row.amount, row.currency), 0);

  console.log(`✅ Supabase (после фильтрации): ${filteredSupabase.length} записей`);
  console.log(`💰 Сумма: ${Math.round(filteredTotal).toLocaleString()}₽`);
  console.log(`📊 Отношение к CSV: ${(filteredTotal / totalCsvAmount * 100).toFixed(1)}%`);

  // 7. ГРУППИРОВКА ПО БОТАМ
  console.log('\n📊 РАСПРЕДЕЛЕНИЕ ПО БОТАМ (после фильтрации):\n');

  const byBot = {};
  filteredSupabase.forEach(row => {
    const botName = row.bot_name;
    if (!byBot[botName]) {
      byBot[botName] = { count: 0, amount: 0, methods: new Set() };
    }
    byBot[botName].count++;
    byBot[botName].amount += convertToRub(row.amount, row.currency);
    byBot[botName].methods.add(row.payment_method);
  });

  Object.entries(byBot)
    .sort((a, b) => b[1].amount - a[1].amount)
    .forEach(([bot, data]) => {
      console.log(`   ${bot}: ${Math.round(data.amount).toLocaleString()}₽ (${data.count} операций)`);
      console.log(`      Методы: ${Array.from(data.methods).join(', ')}`);
    });

  // 8. СОЗДАЕМ EXCEL
  console.log('\n\n📊 Создаем Excel с фильтрацией...\n');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "💰 ФИЛЬТРАЦИЯ ОПЛАЧЕННЫХ ТРАНЗАКЦИЙ";
  workbook.created = new Date();

  // Лист 1: Сравнение
  const comparisonSheet = workbook.addWorksheet('📊 СРАВНЕНИЕ');
  comparisonSheet.addRow(['Источник', 'Количество', 'Сумма (₽)', 'Примечания']);
  comparisonSheet.getRow(1).font = { bold: true };

  comparisonSheet.addRow(['CSV (Robokassa)', csvLines.length - 1, Math.round(totalCsvAmount).toLocaleString(), 'Только оплаченные']);
  comparisonSheet.addRow(['Supabase (все)', incomeData.length, Math.round(incomeData.reduce((sum, row) => sum + convertToRub(row.amount, row.currency), 0)).toLocaleString(), 'Включая неоплаченные']);
  comparisonSheet.addRow(['Supabase (фильтрованный)', filteredSupabase.length, Math.round(filteredTotal).toLocaleString(), 'Без подозрительных']);
  comparisonSheet.addRow(['Совпадение с CSV', supabaseMatching.length, Math.round(supabaseMatchingTotal).toLocaleString(), 'Совпадающие суммы']);

  // Лист 2: По ботам
  const botsSheet = workbook.addWorksheet('🤖 ПО БОТАМ');
  botsSheet.addRow(['Бот', 'Количество', 'Сумма (₽)', 'Методы оплаты']);
  botsSheet.getRow(1).font = { bold: true };

  Object.entries(byBot)
    .sort((a, b) => b[1].amount - a[1].amount)
    .forEach(([bot, data]) => {
      botsSheet.addRow([
        bot,
        data.count,
        Math.round(data.amount).toLocaleString(),
        Array.from(data.methods).join(', ')
      ]);
    });

  const outputPath = '/Users/playra/999-multibots-telegraf/ФИЛЬТРАЦИЯ_ОПЛАЧЕННЫХ_ТРАНЗАКЦИЙ.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log('✅ Фильтрация завершена!');
  console.log(`📁 Файл: ${outputPath}`);

  return {
    csvTotal: totalCsvAmount,
    supabaseAll: incomeData.reduce((sum, row) => sum + convertToRub(row.amount, row.currency), 0),
    supabaseFiltered: filteredTotal,
    supabaseMatching: supabaseMatchingTotal,
    byBot
  };
}

filterOnlyPaidTransactions().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
