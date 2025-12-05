const fs = require('fs');
const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

// Проверяем доходы ai_koshey_bot
const aiKosheyIncomes = data.filter(row =>
  row.bot_name === 'ai_koshey_bot' &&
  row.type === 'MONEY_INCOME'
);

console.log('🤖 ai_koshey_bot - ВСЕ ДОХОДЫ:');
console.log('Всего записей:', aiKosheyIncomes.length);
console.log('');

// Группируем по методам оплаты
const byMethod = {};
aiKosheyIncomes.forEach(row => {
  const method = row.payment_method;
  if (!byMethod[method]) byMethod[method] = [];
  byMethod[method].push(row);
});

console.log('📊 По методам оплаты:');
Object.entries(byMethod).forEach(([method, rows]) => {
  console.log(`${method}: ${rows.length} записей`);
  rows.forEach(row => {
    console.log(`   - ${row.currency} ${row.amount} | ${row.created_at}`);
  });
  console.log('');
});

// Проверяем РЕАЛЬНЫЕ доходы только через Telegram и Robokassa
const realIncomes = aiKosheyIncomes.filter(row =>
  row.payment_method === 'Telegram' ||
  row.payment_method === 'Robokassa'
);

console.log('💰 РЕАЛЬНЫЕ доходы (Telegram + Robokassa):', realIncomes.length);
realIncomes.forEach(row => {
  console.log(`   ${row.payment_method}: ${row.currency} ${row.amount}`);
});

// Остальные - фейк
const fakeIncomes = aiKosheyIncomes.filter(row =>
  row.payment_method !== 'Telegram' &&
  row.payment_method !== 'Robokassa'
);

console.log('\n🚫 ФЕЙКОВЫЕ доходы:', fakeIncomes.length);
const totalFake = fakeIncomes.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0);
console.log('Сумма фейковых:', Math.round(totalFake).toLocaleString());
