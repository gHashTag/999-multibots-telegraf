#!/usr/bin/env node

/**
 * 🔍 ПРОВЕРКА ПРИМЕРОВ SYSTEM И INTERNAL ТРАНЗАКЦИЙ
 */

const fs = require('fs');

const RATES = { XTR: 1.8, STARS: 1.8, RUB: 1.0 };

function convertToRub(amount, currency) {
  return (parseFloat(amount) || 0) * (RATES[currency] || 1.0);
}

async function checkSystemInternalExamples() {
  console.log('\n' + '='.repeat(70));
  console.log('🔍 ПРОВЕРКА ПРИМЕРОВ SYSTEM И INTERNAL ТРАНЗАКЦИЙ');
  console.log('='.repeat(70) + '\n');

  const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

  // Фильтруем System и Internal
  const systemTransactions = rawData.filter(row =>
    row.type === 'MONEY_OUTCOME' &&
    row.payment_method === 'System'
  );

  const internalTransactions = rawData.filter(row =>
    row.type === 'MONEY_OUTCOME' &&
    row.payment_method === 'Internal'
  );

  console.log(`📊 System транзакций: ${systemTransactions.length}`);
  console.log(`📊 Internal транзакций: ${internalTransactions.length}\n`);

  console.log('💻 ПРИМЕРЫ SYSTEM ТРАНЗАКЦИЙ:');
  console.log('='.repeat(70));
  systemTransactions.slice(0, 10).forEach((trans, index) => {
    console.log(`\n${index + 1}. ${Math.round(convertToRub(trans.amount, trans.currency)).toLocaleString()}₽`);
    console.log(`   🤖 Бот: ${trans.bot_name}`);
    console.log(`   💱 Валюта: ${trans.currency} (${trans.amount})`);
    console.log(`   📝 Описание: ${trans.description || 'БЕЗ ОПИСАНИЯ'}`);
    console.log(`   📅 Дата: ${trans.created_at || 'НЕТ ДАТЫ'}`);
  });

  console.log('\n\n💻 ПРИМЕРЫ INTERNAL ТРАНЗАКЦИЙ:');
  console.log('='.repeat(70));
  internalTransactions.slice(0, 10).forEach((trans, index) => {
    console.log(`\n${index + 1}. ${Math.round(convertToRub(trans.amount, trans.currency)).toLocaleString()}₽`);
    console.log(`   🤖 Бот: ${trans.bot_name}`);
    console.log(`   💱 Валюта: ${trans.currency} (${trans.amount})`);
    console.log(`   📝 Описание: ${trans.description || 'БЕЗ ОПИСАНИЯ'}`);
    console.log(`   📅 Дата: ${trans.created_at || 'НЕТ ДАТЫ'}`);
  });

  // Статистика по ботам
  console.log('\n\n🤖 SYSTEM ТРАНЗАКЦИИ ПО БОТАМ:');
  console.log('='.repeat(70));
  const systemByBot = {};
  systemTransactions.forEach(trans => {
    const bot = trans.bot_name;
    if (!systemByBot[bot]) {
      systemByBot[bot] = { count: 0, amount: 0, examples: [] };
    }
    systemByBot[bot].count++;
    systemByBot[bot].amount += convertToRub(trans.amount, trans.currency);
    if (systemByBot[bot].examples.length < 3) {
      systemByBot[bot].examples.push(trans.description || 'БЕЗ ОПИСАНИЯ');
    }
  });

  Object.entries(systemByBot)
    .sort((a, b) => b[1].amount - a[1].amount)
    .forEach(([bot, data]) => {
      console.log(`${bot}:`);
      console.log(`   💰 ${Math.round(data.amount).toLocaleString()}₽ (${data.count} операций)`);
      console.log(`   📋 Примеры: ${data.examples.join(', ')}`);
    });

  console.log('\n\n🤖 INTERNAL ТРАНЗАКЦИИ ПО БОТАМ:');
  console.log('='.repeat(70));
  const internalByBot = {};
  internalTransactions.forEach(trans => {
    const bot = trans.bot_name;
    if (!internalByBot[bot]) {
      internalByBot[bot] = { count: 0, amount: 0, examples: [] };
    }
    internalByBot[bot].count++;
    internalByBot[bot].amount += convertToRub(trans.amount, trans.currency);
    if (internalByBot[bot].examples.length < 3) {
      internalByBot[bot].examples.push(trans.description || 'БЕЗ ОПИСАНИЯ');
    }
  });

  Object.entries(internalByBot)
    .sort((a, b) => b[1].amount - a[1].amount)
    .forEach(([bot, data]) => {
      console.log(`${bot}:`);
      console.log(`   💰 ${Math.round(data.amount).toLocaleString()}₽ (${data.count} операций)`);
      console.log(`   📋 Примеры: ${data.examples.join(', ')}`);
    });

  console.log('\n' + '='.repeat(70) + '\n');
}

checkSystemInternalExamples().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
