/**
 * ПРОВЕРЯЕМ ВСЕ ВАЛЮТЫ В ИСХОДНЫХ ДАННЫХ
 * Без агрессивных фильтров
 */

const fs = require('fs');

console.log('🔍 ПРОВЕРКА ВСЕХ ВАЛЮТ В ИСХОДНЫХ ДАННЫХ');
console.log('='.repeat(80));

const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

console.log(`Всего записей в payments_data.json: ${data.length}\n`);

// Анализируем все валюты
const currencyStats = {};
const typeStats = {};
const paymentMethodStats = {};

data.forEach(row => {
  const currency = row.currency || 'UNKNOWN';
  const type = row.type || 'UNKNOWN';
  const paymentMethod = row.payment_method || 'UNKNOWN';

  currencyStats[currency] = (currencyStats[currency] || 0) + 1;
  typeStats[type] = (typeStats[type] || 0) + 1;
  paymentMethodStats[paymentMethod] = (paymentMethodStats[paymentMethod] || 0) + 1;
});

console.log('💱 ВСЕ ВАЛЮТЫ:');
Object.entries(currencyStats)
  .sort((a, b) => b[1] - a[1])
  .forEach(([currency, count]) => {
    console.log(`   ${currency}: ${count.toLocaleString()} записей`);
  });

console.log('\n📊 ВСЕ ТИПЫ ОПЕРАЦИЙ:');
Object.entries(typeStats)
  .sort((a, b) => b[1] - a[1])
  .forEach(([type, count]) => {
    console.log(`   ${type}: ${count.toLocaleString()} записей`);
  });

console.log('\n💳 ВСЕ МЕТОДЫ ПЛАТЕЖА:');
Object.entries(paymentMethodStats)
  .sort((a, b) => b[1] - a[1])
  .forEach(([method, count]) => {
    console.log(`   ${method}: ${count.toLocaleString()} записей`);
  });

// Проверяем STARS подробнее
console.log('\n' + '='.repeat(80));
console.log('⭐ ДЕТАЛЬНЫЙ АНАЛИЗ STARS:');
console.log('='.repeat(80));

const starsTransactions = data.filter(row => row.currency === 'STARS');
console.log(`Всего STARS записей: ${starsTransactions.length}\n`);

if (starsTransactions.length > 0) {
  console.log('ТОП-10 STARS транзакций:');
  starsTransactions
    .sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0))
    .slice(0, 10)
    .forEach((tx, i) => {
      const amount = Math.abs(parseFloat(tx.amount) || 0);
      const date = new Date(tx.created_at);
      const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

      console.log(`   ${i + 1}. ${amount.toLocaleString()}⭐ | ${dateStr} | ${tx.bot_name}`);
      console.log(`      User: ${tx.telegram_id} | Type: ${tx.type} | Method: ${tx.payment_method}`);
      console.log(`      Desc: ${tx.description.substring(0, 80)}...`);
    });
}

// Проверяем RUB подробнее
console.log('\n' + '='.repeat(80));
console.log('💰 ДЕТАЛЬНЫЙ АНАЛИЗ RUB:');
console.log('='.repeat(80));

const rubTransactions = data.filter(row => row.currency === 'RUB');
console.log(`Всего RUB записей: ${rubTransactions.length}\n`);

if (rubTransactions.length > 0) {
  console.log('ТОП-10 RUB транзакций:');
  rubTransactions
    .sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0))
    .slice(0, 10)
    .forEach((tx, i) => {
      const amount = Math.abs(parseFloat(tx.amount) || 0);
      const date = new Date(tx.created_at);
      const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

      console.log(`   ${i + 1}. ${amount.toLocaleString()}₽ | ${dateStr} | ${tx.bot_name}`);
      console.log(`      User: ${tx.telegram_id} | Type: ${tx.type} | Method: ${tx.payment_method}`);
      console.log(`      Desc: ${tx.description.substring(0, 80)}...`);
    });
}

// Считаем суммы
const rubSum = rubTransactions.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);
const starsSum = starsTransactions.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);

console.log('\n' + '='.repeat(80));
console.log('💎 СВОДКА ПО ВАЛЮТАМ:');
console.log('='.repeat(80));
console.log(`RUB: ${rubTransactions.length} транзакций, ${Math.round(rubSum).toLocaleString()}₽`);
console.log(`STARS: ${starsTransactions.length} транзакций, ${Math.round(starsSum).toLocaleString()}⭐`);

console.log('\n🎯 ВЫВОД:');
console.log(`В исходных данных больше RUB и STARS транзакций, чем показал мой анализ.`);
console.log(`Нужно пересмотреть фильтры и включить все реальные транзакции в анализ.`);
