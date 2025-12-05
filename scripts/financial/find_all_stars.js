const fs = require('fs');
const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

// Ищем ВСЕ STARS доходы (ЛЮБЫЕ методы оплаты)
const allStars = data.filter(row =>
  row.currency === 'STARS' &&
  row.type === 'MONEY_INCOME'
);

console.log('⭐ ВСЕ STARS ДОХОДЫ (ЛЮБЫЕ МЕТОДЫ):');
console.log('Всего записей:', allStars.length);

// Группируем по методам
const byMethod = {};
allStars.forEach(row => {
  const method = row.payment_method || 'EMPTY';
  if (!byMethod[method]) {
    byMethod[method] = { count: 0, amount: 0, bots: new Set() };
  }
  byMethod[method].count++;
  byMethod[method].amount += parseFloat(row.amount || 0);
  byMethod[method].bots.add(row.bot_name);
});

console.log('\n📊 По методам оплаты:');
Object.entries(byMethod).forEach(([method, data]) => {
  console.log(`${method}:`);
  console.log(`   Количество: ${data.count}`);
  console.log(`   Сумма: ${Math.round(data.amount).toLocaleString()} STARS`);
  console.log(`   Боты: ${Array.from(data.bots).join(', ')}`);
  console.log('');
});

// Сумма всех STARS
const totalStars = allStars.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0);
console.log(`⭐ ИТОГО STARS: ${Math.round(totalStars).toLocaleString()} STARS`);
console.log(`💰 В рублях: ${Math.round(totalStars * 1.8).toLocaleString()}₽`);

// Проверим какие есть методы оплаты вообще
console.log('\n📋 ВСЕ УНИКАЛЬНЫЕ МЕТОДЫ ОПЛАТЫ:');
const allMethods = [...new Set(data.map(row => row.payment_method || 'EMPTY'))];
console.log(allMethods);
