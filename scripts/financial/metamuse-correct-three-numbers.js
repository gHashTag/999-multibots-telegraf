/**
 * ПРАВИЛЬНЫЙ АНАЛИЗ METAMUSE_MANIFEST_BOT
 * РАСХОДЫ = звезды (траты на AI)
 * ДОХОДЫ RUB = рубли (от пользователей)
 * ДОХОДЫ STARS = звезды (от пользователей)
 */

const fs = require('fs');

console.log('🤖 ПРАВИЛЬНЫЙ АНАЛИЗ: MetaMuse_Manifest_bot');
console.log('='.repeat(80));

const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

const bots = require('./scripts/constants/bots.js');
const FAKE_BOTS = bots.FAKE_BOTS;

// Фильтруем
const filtered = data.filter(row => {
  const desc = (row.description || '').toUpperCase();
  const botName = (row.bot_name || '');

  if (desc.includes('АКАДЕМИЯ ВАЙБКОДЕРА')) return false;
  if (desc.includes('12-МЕСЯЦНАЯ ПРОГРАММА ОБУЧЕНИЯ')) return false;
  if (desc.includes('ГОД ОБУЧЕНИЯ С ИИ-АГЕНТАМИ')) return false;

  if (FAKE_BOTS.some(fakeBot => botName.toLowerCase().includes(fakeBot.toLowerCase()))) {
    return false;
  }

  const telegramId = row.telegram_id?.toString() || '';
  const suspiciousIds = ['11111', '12345', '67890', '999999997', '999999998', '999999999'];
  if (suspiciousIds.includes(telegramId)) return false;

  if (row.is_test === true) return false;
  if (desc.includes('TEST_DATA')) return false;

  return true;
});

// Дубликаты
const seen = new Set();
const uniqueData = [];

filtered.forEach(row => {
  const key = JSON.stringify({
    telegram_id: row.telegram_id,
    description: row.description,
    amount: row.amount,
    currency: row.currency,
    type: row.type,
    bot_name: row.bot_name,
    created_at: row.created_at
  });

  if (!seen.has(key)) {
    seen.add(key);
    uniqueData.push(row);
  }
});

// Берем только MetaMuse_Manifest_bot
const botData = uniqueData.filter(row => row.bot_name === 'MetaMuse_Manifest_bot');

console.log(`✅ Всего транзакций MetaMuse_Manifest_bot: ${botData.length}\n`);

// ПРАВИЛЬНОЕ РАЗДЕЛЕНИЕ
console.log('📊 ПРАВИЛЬНАЯ ЛОГИКА:');
console.log('-'.repeat(80));

// 1. РАСХОДЫ = звезды (бот тратит на AI провайдеров)
const expenses = botData.filter(row => row.type === 'MONEY_OUTCOME');
const expensesStars = expenses.filter(row => row.currency === 'STARS');
const expensesRub = expenses.filter(row => row.currency === 'RUB');

// 2. ДОХОДЫ В РУБЛЯХ = рубли (пользователи платят боту)
const income = botData.filter(row => row.type === 'MONEY_INCOME');
const incomeRub = income.filter(row => row.currency === 'RUB');

// 3. ДОХОДЫ В ЗВЕЗДАХ = звезды (пользователи платят боту звездами)
const incomeStars = income.filter(row => row.currency === 'STARS');

// Суммы
const expensesStarsSum = expensesStars.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);
const expensesRubSum = expensesRub.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);
const incomeRubSum = incomeRub.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);
const incomeStarsSum = incomeStars.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);

console.log(`\n💸 РАСХОДЫ (бот тратит на AI):`);
console.log(`   В звездах: ${expensesStars.length} транз., ${Math.round(expensesStarsSum).toLocaleString()}⭐`);
console.log(`   В рублях: ${expensesRub.length} транз., ${Math.round(expensesRubSum).toLocaleString()}₽`);

console.log(`\n💰 ДОХОДЫ В РУБЛЯХ (от пользователей):`);
console.log(`   ${incomeRub.length} транз., ${Math.round(incomeRubSum).toLocaleString()}₽`);

console.log(`\n⭐ ДОХОДЫ В ЗВЕЗДАХ (от пользователей):`);
console.log(`   ${incomeStars.length} транз., ${Math.round(incomeStarsSum).toLocaleString()}⭐`);

// ПРОВЕРКА - покажем примеры
console.log('\n🔍 ПРОВЕРКА ЛОГИКИ - примеры транзакций:');
console.log('='.repeat(80));

console.log('\n💸 ТОП-3 РАСХОДА В ЗВЕЗДАХ:');
expensesStars
  .sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0))
  .slice(0, 3)
  .forEach((tx, i) => {
    const amount = Math.abs(parseFloat(tx.amount) || 0);
    const date = new Date(tx.created_at);
    const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;
    console.log(`   ${i + 1}. ${amount.toLocaleString()}⭐ | ${dateStr}`);
    console.log(`      ${tx.payment_method} | ${tx.description.substring(0, 80)}...`);
  });

console.log('\n💰 ТОП-3 ДОХОДА В РУБЛЯХ:');
incomeRub
  .sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0))
  .slice(0, 3)
  .forEach((tx, i) => {
    const amount = Math.abs(parseFloat(tx.amount) || 0);
    const date = new Date(tx.created_at);
    const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;
    console.log(`   ${i + 1}. ${amount.toLocaleString()}₽ | ${dateStr}`);
    console.log(`      User: ${tx.telegram_id} | ${tx.description.substring(0, 80)}...`);
  });

if (incomeStars.length > 0) {
  console.log('\n⭐ ТОП-3 ДОХОДА В ЗВЕЗДАХ:');
  incomeStars
    .sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0))
    .slice(0, 3)
    .forEach((tx, i) => {
      const amount = Math.abs(parseFloat(tx.amount) || 0);
      const date = new Date(tx.created_at);
      const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;
      console.log(`   ${i + 1}. ${amount.toLocaleString()}⭐ | ${dateStr}`);
      console.log(`      User: ${tx.telegram_id} | ${tx.description.substring(0, 80)}...`);
    });
}

// ТРИ ЦИФРЫ!
console.log('\n' + '='.repeat(80));
console.log('🎯 ТРИ ЦИФРЫ (ИСПРАВЛЕНО):');
console.log('='.repeat(80));

console.log(`\n1️⃣ РАСХОДЫ (бот тратит на AI):`);
console.log(`   В звездах: ${Math.round(expensesStarsSum).toLocaleString()}⭐ (${expensesStars.length} транз.)`);
console.log(`   В рублях: ${Math.round(expensesRubSum).toLocaleString()}₽ (${expensesRub.length} транз.)`);
console.log(`   ИТОГО РАСХОДОВ: звезды = ${Math.round(expensesStarsSum).toLocaleString()}⭐`);

console.log(`\n2️⃣ ДОХОДЫ В РУБЛЯХ (от пользователей):`);
console.log(`   ${Math.round(incomeRubSum).toLocaleString()}₽ (${incomeRub.length} транз.)`);

console.log(`\n3️⃣ ДОХОДЫ В ЗВЕЗДАХ (от пользователей):`);
console.log(`   ${Math.round(incomeStarsSum).toLocaleString()}⭐ (${incomeStars.length} транз.)`);

// ЭКОНОМИЧЕСКАЯ МОДЕЛЬ
console.log('\n💡 ЭКОНОМИЧЕСКАЯ МОДЕЛЬ:');
console.log('='.repeat(80));
console.log(`\n📈 ПОТОК ДЕНЕГ:`);
console.log(`   Пользователи → РУБЛИ → MetaMuse_bot: ${Math.round(incomeRubSum).toLocaleString()}₽`);
console.log(`   Пользователи → ЗВЕЗДЫ → MetaMuse_bot: ${Math.round(incomeStarsSum).toLocaleString()}⭐`);
console.log(`   MetaMuse_bot → ЗВЕЗДЫ → AI провайдеры: ${Math.round(expensesStarsSum).toLocaleString()}⭐`);

console.log(`\n💰 ФИНАНСОВЫЙ РЕЗУЛЬТАТ (В РУБЛЯХ):`);
console.log(`   Доходы: ${Math.round(incomeRubSum).toLocaleString()}₽`);
console.log(`   Расходы: ???₽ (звезды конвертируются в рубли для оплаты AI)`);

// КОНВЕРТАЦИЯ ЗВЕЗД В РУБЛИ
// Если знаем курс (примерно 1⭐ = 0.05₽ в Telegram)
const starsToRubRate = 0.05; // Примерный курс
const expensesInRub = expensesStarsSum * starsToRubRate;
const profit = incomeRubSum - expensesInRub;

console.log(`\n📊 ПРОФИТ (с конвертацией звезд):`);
console.log(`   Доходы: ${Math.round(incomeRubSum).toLocaleString()}₽`);
console.log(`   Расходы: ${Math.round(expensesInRub).toLocaleString()}₽ (${Math.round(expensesStarsSum).toLocaleString()}⭐ × ${starsToRubRate})`);
console.log(`   Прибыль: ${Math.round(profit).toLocaleString()}₽`);
console.log(`   Маржа: ${Math.round((profit / incomeRubSum) * 100)}%`);

// СОХРАНЯЕМ ОТЧЕТ
const reportContent = `# 🤖 MetaMuse_Manifest_bot - ПРАВИЛЬНЫЙ АНАЛИЗ

## 🎯 ТРИ ЦИФРЫ:

| № | Показатель | Сумма | Транзакций |
|---|------------|-------|------------|
| **1️⃣** | **РАСХОДЫ (звезды на AI)** | **${Math.round(expensesStarsSum).toLocaleString()}⭐** | ${expensesStars.length} |
| **2️⃣** | **ДОХОДЫ В РУБЛЯХ** | **${Math.round(incomeRubSum).toLocaleString()}₽** | ${incomeRub.length} |
| **3️⃣** | **ДОХОДЫ В ЗВЕЗДАХ** | **${Math.round(incomeStarsSum).toLocaleString()}⭐** | ${incomeStars.length} |

## 💡 ЭКОНОМИЧЕСКАЯ МОДЕЛЬ:

**Поток денег:**
1. Пользователи → РУБЛИ → MetaMuse_bot: ${Math.round(incomeRubSum).toLocaleString()}₽
2. Пользователи → ЗВЕЗДЫ → MetaMuse_bot: ${Math.round(incomeStarsSum).toLocaleString()}⭐
3. MetaMuse_bot → ЗВЕЗДЫ → AI провайдеры: ${Math.round(expensesStarsSum).toLocaleString()}⭐

**Финансовый результат:**
- Доходы: ${Math.round(incomeRubSum).toLocaleString()}₽
- Расходы: ${Math.round(expensesInRub).toLocaleString()}₽ (${Math.round(expensesStarsSum).toLocaleString()}⭐ × ${starsToRubRate})
- Прибыль: ${Math.round(profit).toLocaleString()}₽
- Маржа: ${Math.round((profit / incomeRubSum) * 100)}%

## 📊 ДЕТАЛИ:

### Расходы (бот тратит на AI):
- В звездах: ${expensesStars.length} транз., ${Math.round(expensesStarsSum).toLocaleString()}⭐
- В рублях: ${expensesRub.length} транз., ${Math.round(expensesRubSum).toLocaleString()}₽

### Доходы:
- В рублях: ${incomeRub.length} транз., ${Math.round(incomeRubSum).toLocaleString()}₽
- В звездах: ${incomeStars.length} транз., ${Math.round(incomeStarsSum).toLocaleString()}⭐
`;

fs.writeFileSync('METAMUSE_CORRECT_ANALYSIS.md', reportContent);
console.log(`\n✅ Отчет сохранен: METAMUSE_CORRECT_ANALYSIS.md`);
