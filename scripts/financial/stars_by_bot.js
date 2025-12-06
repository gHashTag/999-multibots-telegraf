const fs = require('fs');
const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

// Группируем STARS по ботам
const starsByBot = {};
const starsIncomes = data.filter(row =>
  row.currency === 'STARS' &&
  row.type === 'MONEY_INCOME'
);

starsIncomes.forEach(row => {
  const bot = row.bot_name;
  if (!starsByBot[bot]) {
    starsByBot[bot] = {
      count: 0,
      amount_stars: 0,
      amount_rub: 0,
      methods: []
    };
  }
  const amount = parseFloat(row.amount || 0);
  starsByBot[bot].count++;
  starsByBot[bot].amount_stars += amount;
  starsByBot[bot].amount_rub += amount * 1.8;
  starsByBot[bot].methods.push(row.payment_method || 'EMPTY');
});

console.log('⭐ STARS ДОХОДЫ ПО БОТАМ:');
console.log('='.repeat(60));
Object.entries(starsByBot)
  .sort((a, b) => b[1].amount_stars - a[1].amount_stars)
  .forEach(([bot, data]) => {
    console.log(`${bot}:`);
    console.log(`   STARS: ${Math.round(data.amount_stars).toLocaleString()}`);
    console.log(`   В рублях: ${Math.round(data.amount_rub).toLocaleString()}₽`);
    console.log(`   Операций: ${data.count}`);
    console.log('');
  });

// ТЕПЕРЬ СОЗДАЕМ ПОЛНЫЙ ОТЧЕТ С STARS
console.log('\n🎯 СОЗДАЕМ ОТЧЕТ С STARS...');

const RATES = { XTR: 1.8, STARS: 1.8, RUB: 1.0 };

// Берем ТОЛЬКО продакшн боты
const PRODUCTION_BOTS = [
  'neuro_blogger_bot',
  'MetaMuse_Manifest_bot',
  'HaimGroupMedia_bot',
  'AI_STARS_bot',
  'Gaia_Kamskaia_bot',
  'NeuroLenaAssistant_bot',
  'NeurostylistShtogrina_bot',
  'Kaya_easy_art_bot'
];

const botSummary = {};
PRODUCTION_BOTS.forEach(botName => {
  // Доходы в RUB
  const rubIncomes = data.filter(row =>
    row.bot_name === botName &&
    row.currency === 'RUB' &&
    row.type === 'MONEY_INCOME' &&
    (row.payment_method === 'Telegram' || row.payment_method === 'Robokassa')
  );

  // Доходы в XTR
  const xtrIncomes = data.filter(row =>
    row.bot_name === botName &&
    row.currency === 'XTR' &&
    row.type === 'MONEY_INCOME' &&
    (row.payment_method === 'Telegram' || row.payment_method === 'Robokassa')
  );

  // Доходы в STARS (ВСЕ!)
  const starsIncomes = data.filter(row =>
    row.bot_name === botName &&
    row.currency === 'STARS' &&
    row.type === 'MONEY_INCOME'
  );

  // Расходы
  const outcomes = data.filter(row =>
    row.bot_name === botName &&
    row.type === 'MONEY_OUTCOME'
  );

  const rubTotal = rubIncomes.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0);
  const xtrTotal = xtrIncomes.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0);
  const starsTotal = starsIncomes.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0);
  const outcomesTotal = outcomes.reduce((sum, row) => sum + (parseFloat(row.amount || 0) * RATES[row.currency]), 0);

  const totalIncome = rubTotal + (xtrTotal * RATES.XTR) + (starsTotal * RATES.STARS);

  botSummary[botName] = {
    rub: rubTotal,
    xtr: xtrTotal,
    xtr_rub: xtrTotal * RATES.XTR,
    stars: starsTotal,
    stars_rub: starsTotal * RATES.STARS,
    outcomes: outcomesTotal,
    profit: totalIncome - outcomesTotal
  };
});

console.log('\n📊 ИТОГ ПО ПРОДАКШН БОТАМ:');
console.log('='.repeat(80));
Object.entries(botSummary).forEach(([bot, data]) => {
  console.log(`${bot}:`);
  console.log(`   RUB: ${Math.round(data.rub).toLocaleString()}₽`);
  console.log(`   XTR: ${Math.round(data.xtr).toLocaleString()} (${Math.round(data.xtr_rub).toLocaleString()}₽)`);
  console.log(`   STARS: ${Math.round(data.stars).toLocaleString()} (${Math.round(data.stars_rub).toLocaleString()}₽)`);
  console.log(`   Расходы: ${Math.round(data.outcomes).toLocaleString()}₽`);
  console.log(`   Прибыль: ${Math.round(data.profit).toLocaleString()}₽`);
  console.log('');
});

const totalRub = Object.values(botSummary).reduce((sum, b) => sum + b.rub, 0);
const totalXtrRub = Object.values(botSummary).reduce((sum, b) => sum + b.xtr_rub, 0);
const totalStarsRub = Object.values(botSummary).reduce((sum, b) => sum + b.stars_rub, 0);
const totalOutcomes = Object.values(botSummary).reduce((sum, b) => sum + b.outcomes, 0);
const totalIncome = totalRub + totalXtrRub + totalStarsRub;
const totalProfit = totalIncome - totalOutcomes;

console.log('🎯 ИТОГО:');
console.log('='.repeat(60));
console.log(`RUB: ${Math.round(totalRub).toLocaleString()}₽`);
console.log(`XTR→₽: ${Math.round(totalXtrRub).toLocaleString()}₽`);
console.log(`STARS→₽: ${Math.round(totalStarsRub).toLocaleString()}₽`);
console.log(`ВСЕГО ДОХОДОВ: ${Math.round(totalIncome).toLocaleString()}₽`);
console.log(`Расходы: ${Math.round(totalOutcomes).toLocaleString()}₽`);
console.log(`Прибыль: ${Math.round(totalProfit).toLocaleString()}₽`);
