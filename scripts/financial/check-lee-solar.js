// Скрипт для проверки реальных данных по LeeSolarbot
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fbgmxbvzwgxfkagxkmqc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZ214Ynp2d2d4ZmdhZ3hzbXFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUwNzcyNzYsImV4cCI6MjA1MDY1MzI3Nn0.CqYl7p2vJ6f6dJ0dU2xC8bKqj_1eJ0dD4L5z6N3c2A';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLeeSolarData() {
  console.log('🔍 Анализ LeeSolarbot...');

  // Проверим все транзакции по LeeSolarbot
  const { data: transactions, error } = await supabase
    .from('payments')
    .select('*')
    .eq('bot_name', 'LeeSolarbot')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('❌ Ошибка:', error);
    return;
  }

  console.log('\n📊 ВСЕ ТРАНЗАКЦИИ LeeSolarbot:');
  console.log('='.repeat(80));

  let totalIncome = 0;
  let totalOutcome = 0;
  let incomeCount = 0;
  let outcomeCount = 0;

  transactions.forEach((t, i) => {
    const amount = parseFloat(t.amount);
    console.log(`${i+1}. [${t.type}] ${t.currency} ${amount} - ${t.payment_method} - ${t.description?.substring(0, 60)}`);

    if (t.type === 'MONEY_INCOME') {
      totalIncome += amount;
      incomeCount++;
    } else {
      totalOutcome += amount;
      outcomeCount++;
    }
  });

  console.log('\n='.repeat(80));
  console.log(`📈 ИТОГО ДОХОДОВ: ${totalIncome} (${incomeCount} транзакций)`);
  console.log(`📉 ИТОГО РАСХОДОВ: ${totalOutcome} (${outcomeCount} транзакций)`);
  console.log(`💰 ЧИСТЫЙ РЕЗУЛЬТАТ: ${totalIncome - totalOutcome}`);

  // Проверим типы платежей
  const methods = {};
  transactions.forEach(t => {
    methods[t.payment_method] = (methods[t.payment_method] || 0) + 1;
  });

  console.log('\n💳 МЕТОДЫ ПЛАТЕЖЕЙ:');
  Object.entries(methods).forEach(([method, count]) => {
    console.log(`  ${method}: ${count}`);
  });

  // Проверим категории
  const categories = {};
  transactions.forEach(t => {
    categories[t.category] = (categories[t.category] || 0) + 1;
  });

  console.log('\n🏷️ КАТЕГОРИИ:');
  Object.entries(categories).forEach(([cat, count]) => {
    console.log(`  ${cat}: ${count}`);
  });

  // Проверим валюты
  const currencies = {};
  transactions.forEach(t => {
    currencies[t.currency] = (currencies[t.currency] || 0) + 1;
  });

  console.log('\n💱 ВАЛЮТЫ:');
  Object.entries(currencies).forEach(([cur, count]) => {
    console.log(`  ${cur}: ${count} транзакций`);
  });

  // Анализ реальных платежей от пользователей
  const realUserPayments = transactions.filter(t =>
    t.type === 'MONEY_INCOME' &&
    t.category === 'REAL' &&
    (t.payment_method === 'Telegram' || t.payment_method === 'Robokassa')
  );

  console.log('\n💳 РЕАЛЬНЫЕ ПЛАТЕЖИ ОТ ПОЛЬЗОВАТЕЛЕЙ:');
  if (realUserPayments.length === 0) {
    console.log('  ❌ НЕТ РЕАЛЬНЫХ ПЛАТЕЖЕЙ ОТ ПОЛЬЗОВАТЕЛЕЙ!');
  } else {
    realUserPayments.forEach((t, i) => {
      console.log(`  ${i+1}. ${t.currency} ${t.amount} - ${t.payment_method} - ${t.description?.substring(0, 50)}`);
    });
  }
}

checkLeeSolarData()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Критическая ошибка:', err);
    process.exit(1);
  });
