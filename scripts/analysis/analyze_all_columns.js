#!/usr/bin/env node

/**
 * 🔍 ПОЛНЫЙ АНАЛИЗ ВСЕХ КОЛОНОК В ДАННЫХ
 * Изучаем структуру правильно - все поля, все типы
 */

const fs = require('fs');

const RATES = { XTR: 1.8, STARS: 1.8, RUB: 1.0 };

function convertToRub(amount, currency) {
  return (parseFloat(amount) || 0) * (RATES[currency] || 1.0);
}

async function analyzeAllColumns() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 ПОЛНЫЙ АНАЛИЗ ВСЕХ КОЛОНОК - ИЗУЧАЕМ СТРУКТУРУ');
  console.log('='.repeat(80) + '\n');

  const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

  console.log(`📊 Всего записей: ${rawData.length}\n`);

  // Берем первые записи и показываем ВСЕ поля
  console.log('📋 ПРИМЕРЫ ЗАПИСЕЙ (все поля):');
  console.log('='.repeat(80));

  rawData.slice(0, 3).forEach((record, index) => {
    console.log(`\n🗂️  ЗАПИСЬ #${index + 1}:`);
    Object.entries(record).forEach(([key, value]) => {
      console.log(`   ${key}: ${value}`);
    });
  });

  // Анализируем все уникальные значения в каждой колонке
  console.log('\n\n📊 АНАЛИЗ УНИКАЛЬНЫХ ЗНАЧЕНИЙ ПО КОЛОНКАМ:');
  console.log('='.repeat(80));

  const columns = Object.keys(rawData[0]);
  const uniqueValues = {};

  columns.forEach(column => {
    const values = new Set();
    rawData.forEach(record => {
      if (record[column] !== null && record[column] !== undefined) {
        values.add(record[column]);
      }
    });

    uniqueValues[column] = Array.from(values);

    console.log(`\n${column}: ${uniqueValues[column].length} уникальных значений`);
    if (uniqueValues[column].length <= 20) {
      console.log(`   Значения: ${uniqueValues[column].join(', ')}`);
    } else {
      console.log(`   Примеры: ${uniqueValues[column].slice(0, 10).join(', ')}...`);
      console.log(`   И еще ${uniqueValues[column].length - 10} значений`);
    }
  });

  // Специальный анализ доходов
  console.log('\n\n💰 АНАЛИЗ ДОХОДОВ (MONEY_INCOME):');
  console.log('='.repeat(80));

  const moneyIncome = rawData.filter(row => row.type === 'MONEY_INCOME');

  console.log(`Всего MONEY_INCOME записей: ${moneyIncome.length}`);

  // Группируем по payment_method
  const incomeByMethod = {};
  moneyIncome.forEach(row => {
    const method = row.payment_method;
    if (!incomeByMethod[method]) {
      incomeByMethod[method] = { count: 0, total: 0, examples: [] };
    }
    incomeByMethod[method].count++;
    incomeByMethod[method].total += convertToRub(row.amount, row.currency);
    if (incomeByMethod[method].examples.length < 3) {
      incomeByMethod[method].examples.push({
        amount: row.amount,
        currency: row.currency,
        rubles: convertToRub(row.amount, row.currency),
        description: row.description || ''
      });
    }
  });

  console.log('\n💸 Доходы по методам оплаты:');
  Object.entries(incomeByMethod)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([method, data]) => {
      console.log(`\n${method}:`);
      console.log(`   💰 Сумма: ${Math.round(data.total).toLocaleString()}₽`);
      console.log(`   📊 Количество: ${data.count} операций`);
      console.log(`   📋 Примеры:`);
      data.examples.forEach(ex => {
        console.log(`      - ${ex.amount} ${ex.currency} = ${Math.round(ex.rubles)}₽`);
        if (ex.description) {
          console.log(`        Описание: ${ex.description.slice(0, 50)}...`);
        }
      });
    });

  // Анализ фейковых методов доходов
  console.log('\n\n🚫 ПОДОЗРИТЕЛЬНЫЕ МЕТОДЫ ДОХОДОВ:');
  console.log('='.repeat(80));

  const suspiciousMethods = [
    'SYSTEM', 'Internal', 'balance', 'Manual', 'Tester_Bonus',
    'System_Operation', 'Admin', 'bank_card', 'system_grant',
    'system_recovery', 'admin_cli', 'admin_fix'
  ];

  const suspiciousIncome = moneyIncome.filter(row =>
    suspiciousMethods.includes(row.payment_method)
  );

  console.log(`Подозрительных записей: ${suspiciousIncome.length}`);
  console.log(`Сумма подозрительных доходов: ${Math.round(suspiciousIncome.reduce((sum, row) => sum + convertToRub(row.amount, row.currency), 0)).toLocaleString()}₽`);

  // Группируем по ботам
  console.log('\n\n🤖 ДОХОДЫ ПО БОТАМ:');
  console.log('='.repeat(80));

  const incomeByBot = {};
  moneyIncome.forEach(row => {
    const bot = row.bot_name;
    if (!incomeByBot[bot]) {
      incomeByBot[bot] = { count: 0, total: 0, methods: new Set() };
    }
    incomeByBot[bot].count++;
    incomeByBot[bot].total += convertToRub(row.amount, row.currency);
    incomeByBot[bot].methods.add(row.payment_method);
  });

  Object.entries(incomeByBot)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([bot, data]) => {
      console.log(`${bot}:`);
      console.log(`   💰 ${Math.round(data.total).toLocaleString()}₽ (${data.count} операций)`);
      console.log(`   🔧 Методы: ${Array.from(data.methods).join(', ')}`);
    });

  console.log('\n' + '='.repeat(80) + '\n');
}

analyzeAllColumns().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
