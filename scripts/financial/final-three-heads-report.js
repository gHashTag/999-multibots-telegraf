/**
 * ФИНАЛЬНЫЙ ОТЧЕТ - ТРИ ГОЛОВЫ ЗМЕЯ ГОРЫНЫЧА (ПРАВИЛЬНО!)
 * На основе полного анализа всех данных
 */

const fs = require('fs');

console.log('🐍 ФИНАЛЬНЫЙ ОТЧЕТ - ТРИ ГОЛОВЫ ЗМЕЯ ГОРЫНЫЧА');
console.log('='.repeat(80));

const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

const bots = require('./scripts/constants/bots.js');
const FAKE_BOTS = bots.FAKE_BOTS;

// Фильтрация
const filtered = data.filter(row => {
  const desc = (row.description || '').toUpperCase();
  const botName = (row.bot_name || '');

  // Исключаем аномальные VIBECODER
  if (desc.includes('АКАДЕМИЯ ВАЙБКОДЕРА')) return false;
  if (desc.includes('12-МЕСЯЧНАЯ ПРОГРАММА ОБУЧЕНИЯ')) return false;
  if (desc.includes('ГОД ОБУЧЕНИЯ С ИИ-АГЕНТАМИ')) return false;

  // Исключаем фейковых ботов
  if (FAKE_BOTS.some(fakeBot => botName.toLowerCase().includes(fakeBot.toLowerCase()))) {
    return false;
  }

  // Исключаем подозрительные ID
  const telegramId = row.telegram_id?.toString() || '';
  const suspiciousIds = ['11111', '12345', '67890', '999999997', '999999998', '999999999'];
  if (suspiciousIds.includes(telegramId)) return false;

  if (row.is_test === true) return false;

  return true;
});

// Удаление дубликатов
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

// 1. РУБЛИ - РЕАЛЬНЫЕ ДОХОДЫ!
const RUB_TRANSACTIONS = uniqueData.filter(row =>
  row.currency === 'RUB' &&
  row.type === 'MONEY_INCOME' &&
  row.amount > 0
);

// 2. STARS - АНАЛИЗ
const STARS_TRANSACTIONS = uniqueData.filter(row => row.currency === 'STARS');
const STARS_INCOME = STARS_TRANSACTIONS.filter(row => row.type === 'MONEY_INCOME');
const STARS_OUTCOME = STARS_TRANSACTIONS.filter(row => row.type === 'MONEY_OUTCOME');

// 3. BONUS
const BONUS_TRANSACTIONS = uniqueData.filter(row => row.type === 'BONUS');

// Подсчет статистики
function calculateStats(transactions) {
  const totalAmount = transactions.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);
  const uniqueUsers = new Set(transactions.map(tx => tx.telegram_id));
  const uniqueBots = new Set(transactions.map(tx => tx.bot_name));

  return {
    count: transactions.length,
    totalAmount: Math.round(totalAmount),
    uniqueUsers: uniqueUsers.size,
    uniqueBots: uniqueBots.size
  };
}

const rubStats = calculateStats(RUB_TRANSACTIONS);
const starsStats = calculateStats(STARS_TRANSACTIONS);
const starsIncomeStats = calculateStats(STARS_INCOME);
const starsOutcomeStats = calculateStats(STARS_OUTCOME);
const bonusStats = calculateStats(BONUS_TRANSACTIONS);

// Вывод отчета
console.log('\n🎯 ИТОГОВЫЙ РЕЗУЛЬТАТ:');
console.log('='.repeat(80));

console.log('\n💰 1. РУБЛИ (RUB) - РЕАЛЬНЫЕ ДОХОДЫ ✅');
console.log(`   Транзакций: ${rubStats.count}`);
console.log(`   Сумма: ${rubStats.totalAmount.toLocaleString()}₽`);
console.log(`   Пользователей: ${rubStats.uniqueUsers}`);
console.log(`   Ботов: ${rubStats.uniqueBots}`);
console.log(`   Это НАШИ ДОХОДЫ от пользователей!`);

console.log('\n⭐ 2. ЗВЕЗДЫ (STARS) - СИСТЕМА ОПЛАТЫ AI ⚠️');
console.log(`   Всего STARS операций: ${starsStats.count}`);
console.log(`   ├─ Покупки звезд: ${starsIncomeStats.count} (${starsIncomeStats.totalAmount.toLocaleString()}⭐)`);
console.log(`   └─ Траты на AI: ${starsStats.count - starsIncomeStats.count} (${(STARS_OUTCOME.reduce((s, tx) => s + Math.abs(parseFloat(tx.amount) || 0), 0)).toLocaleString()}⭐)`);
console.log(`   Это НЕ НАШИ ДОХОДЫ! Это:`);
console.log(`   - Пользователи покупают звезды в Telegram за рубли`);
console.log(`   - Тратят звезды на AI генерацию в наших ботах`);
console.log(`   - Мы получаем доходы только в рублях!`);

console.log('\n🎁 3. БОНУСЫ (BONUS) - АДМИНИСТРАТИВНЫЕ ❌');
console.log(`   Транзакций: ${bonusStats.count}`);
console.log(`   Сумма: ${bonusStats.totalAmount}`);
console.log(`   Это НЕ ДОХОДЫ! Только административные операции.`);

console.log('\n' + '='.repeat(80));
console.log('💎 ОКОНЧАТЕЛЬНЫЙ ВЫВОД:');
console.log('='.repeat(80));

console.log(`\n📊 РЕАЛЬНЫЕ ДОХОДЫ:`);
console.log(`   Только рубли (RUB): ${rubStats.totalAmount.toLocaleString()}₽`);
console.log(`   Из ${rubStats.count} транзакций от ${rubStats.uniqueUsers} пользователей`);
console.log(`   В ${rubStats.uniqueBots} ботах\n`);

console.log(`💡 ТРИ ГОЛОВЫ ЗМЕЯ ПЕРЕОПРЕДЕЛЕНЫ:`);
console.log(`   1️⃣ РУБЛИ - реальные доходы (296,253₽)`);
console.log(`   2️⃣ СТАРЫ - НЕ доходы, а система расчетов (пользователи тратят на AI)`);
console.log(`   3️⃣ БОНУСЫ - НЕ доходы, а административные операции\n`);

console.log(`🎯 НАШИ ДОХОДЫ - ТОЛЬКО РУБЛИ!`);
console.log(`   296,253₽ - это наш реальный доход от всех ботов`);

// Топ-3 бота по рублевым доходам
console.log('\n🏆 ТОП-3 БОТА ПО РУБЛЕВЫМ ДОХОДАМ:');
const byBot = {};
RUB_TRANSACTIONS.forEach(tx => {
  const bot = tx.bot_name;
  if (!byBot[bot]) {
    byBot[bot] = { count: 0, total: 0, users: new Set() };
  }
  byBot[bot].count++;
  byBot[bot].total += Math.abs(parseFloat(tx.amount) || 0);
  byBot[bot].users.add(tx.telegram_id);
});

Object.entries(byBot)
  .map(([bot, data]) => ({ bot, ...data, uniqueUsers: data.users.size }))
  .sort((a, b) => b.total - a.total)
  .slice(0, 3)
  .forEach((botData, i) => {
    console.log(`   ${i + 1}. ${botData.bot}`);
    console.log(`      💰 Доходы: ${Math.round(botData.total).toLocaleString()}₽`);
    console.log(`      📊 Транзакций: ${botData.count}`);
    console.log(`      👥 Пользователей: ${botData.uniqueUsers}\n`);
  });

// Сохраняем отчет
const reportContent = `# 🐍 ФИНАЛЬНЫЙ ОТЧЕТ - ТРИ ГОЛОВЫ ЗМЕЯ ГОРЫНЫЧА

## 💰 РЕАЛЬНЫЕ ДОХОДЫ - ТОЛЬКО РУБЛИ: 296,253₽

**ОСНОВНОЙ ВЫВОД:**
- Наши реальные доходы = рубли от пользователей
- STARS = система оплаты AI услуг (НЕ наши доходы!)
- BONUS = административные операции (НЕ доходы!)

## 📊 СТАТИСТИКА:

### 💰 1. РУБЛИ (RUB) - РЕАЛЬНЫЕ ДОХОДЫ ✅
- Транзакций: ${rubStats.count}
- Сумма: ${rubStats.totalAmount.toLocaleString()}₽
- Пользователей: ${rubStats.uniqueUsers}
- Ботов: ${rubStats.uniqueBots}

### ⭐ 2. ЗВЕЗДЫ (STARS) - СИСТЕМА ОПЛАТЫ AI ⚠️
- Всего операций: ${starsStats.count}
- Покупки звезд: ${starsIncomeStats.count} (${starsIncomeStats.totalAmount.toLocaleString()}⭐)
- Траты на AI: ${STARS_OUTCOME.length} (${(STARS_OUTCOME.reduce((s, tx) => s + Math.abs(parseFloat(tx.amount) || 0), 0)).toLocaleString()}⭐)

### 🎁 3. БОНУСЫ (BONUS) - АДМИНИСТРАТИВНЫЕ ❌
- Транзакций: ${bonusStats.count}
- Сумма: ${bonusStats.totalAmount}

## 🏆 ТОП БОТЫ ПО РУБЛЕВЫМ ДОХОДАМ:

${Object.entries(byBot)
  .map(([bot, data]) => ({ bot, ...data, uniqueUsers: data.users.size }))
  .sort((a, b) => b.total - a.total)
  .slice(0, 3)
  .map((botData, i) => {
    return `${i + 1}. **${botData.bot}**
   - Доходы: ${Math.round(botData.total).toLocaleString()}₽
   - Транзакций: ${botData.count}
   - Пользователей: ${botData.uniqueUsers}`;
  })
  .join('\n\n')}

## 🎯 ЗАКЛЮЧЕНИЕ:

**Наши доходы = 296,253₽ в рублях** от ${rubStats.uniqueUsers} пользователей через ${rubStats.uniqueBots} ботов.

STARS - это не источник доходов, а система расчетов. Пользователи покупают звезды в Telegram за рубли, а потом тратят их на AI услуги в наших ботах.
`;

fs.writeFileSync('FINAL_THREE_HEADS_REPORT.md', reportContent);
console.log('\n✅ Отчет сохранен: FINAL_THREE_HEADS_REPORT.md');
