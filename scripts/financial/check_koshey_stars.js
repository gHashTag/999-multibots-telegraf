const fs = require('fs');
const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

// Смотрим STARS у ai_koshey_bot
const aiKosheyStars = data.filter(row =>
  row.bot_name === 'ai_koshey_bot' &&
  row.currency === 'STARS' &&
  row.type === 'MONEY_INCOME'
);

console.log('🤖 ai_koshey_bot STARS:');
console.log('Всего записей:', aiKosheyStars.length);

// Группируем по методам
const byMethod = {};
aiKosheyStars.forEach(row => {
  const method = row.payment_method || 'EMPTY';
  if (!byMethod[method]) {
    byMethod[method] = { count: 0, amount: 0 };
  }
  byMethod[method].count++;
  byMethod[method].amount += parseFloat(row.amount || 0);
});

console.log('\nПо методам:');
Object.entries(byMethod).forEach(([method, data]) => {
  console.log(`${method}: ${data.count} записей, ${Math.round(data.amount).toLocaleString()} STARS`);
});

// ОПРЕДЕЛЯЕМ ФЕЙКОВЫЕ STARS
const FAKE_STARS_METHODS = ['System', 'SYSTEM', 'admin', 'Admin', 'balance', ''];

const fakeStars = aiKosheyStars.filter(row => FAKE_STARS_METHODS.includes(row.payment_method || ''));
const realStars = aiKosheyStars.filter(row => !FAKE_STARS_METHODS.includes(row.payment_method || ''));

console.log('\n📊 РАЗДЕЛЕНИЕ:');
console.log(`ФЕЙКОВЫЕ STARS: ${fakeStars.length} записей, ${Math.round(fakeStars.reduce((s, r) => s + parseFloat(r.amount), 0)).toLocaleString()} STARS`);
console.log(`РЕАЛЬНЫЕ STARS: ${realStars.length} записей, ${Math.round(realStars.reduce((s, r) => s + parseFloat(r.amount), 0)).toLocaleString()} STARS`);
