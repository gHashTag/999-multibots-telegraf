/**
 * ПРАВИЛЬНЫЙ АНАЛИЗ ТРЕХ ГОЛОВ ЗМЕЯ ГОРЫНЫЧА
 * С корректными фильтрами
 */

const fs = require('fs');
const ExcelJS = require('exceljs');

console.log('🐍 ТРИ ГОЛОВЫ ЗМЕЯ ГОРЫНЫЧА - ПРАВИЛЬНЫЙ АНАЛИЗ');
console.log('='.repeat(80));

const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

const bots = require('./scripts/constants/bots.js');
const FAKE_BOTS = bots.FAKE_BOTS;

console.log(`Всего записей в payments_data.json: ${data.length}\n`);

// ПРАВИЛЬНАЯ ФИЛЬТРАЦИЯ
const filtered = data.filter(row => {
  const desc = (row.description || '').toUpperCase();
  const botName = (row.bot_name || '');

  // Исключаем ТОЛЬКО аномальные записи VIBECODER
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

  // Исключаем тестовые данные (но НЕ все STARS!)
  if (row.is_test === true) return false;
  if (desc.includes('TEST_DATA')) return false;

  return true;
});

console.log(`✅ После фильтрации: ${filtered.length} записей (из ${data.length})\n`);

// Удаляем дубликаты
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

console.log(`✅ После удаления дубликатов: ${uniqueData.length} записей\n`);

// РАЗДЕЛЯЕМ НА ТРИ КАТЕГОРИИ
console.log('🎯 РАЗДЕЛЕНИЕ НА ТРИ ГОЛОВЫ ЗМЕЯ:');
console.log('-'.repeat(80));

// 1. RUB - все рублевые доходы (кроме VIBECODER)
const RUB_TRANSACTIONS = uniqueData.filter(row =>
  row.currency === 'RUB' &&
  row.type === 'MONEY_INCOME' &&
  row.amount > 0
);

// 2. STARS - все звездные доходы (кроме TEST_DATA)
const STARS_TRANSACTIONS = uniqueData.filter(row =>
  row.currency === 'STARS' &&
  row.type === 'MONEY_INCOME' &&
  row.amount > 0 &&
  !row.description?.toUpperCase().includes('TEST_DATA')
);

// 3. BONUS - только тип BONUS
const BONUS_TRANSACTIONS = uniqueData.filter(row =>
  row.type === 'BONUS'
);

console.log(`💰 RUB (рубли): ${RUB_TRANSACTIONS.length} транзакций`);
console.log(`⭐ STARS (звезды): ${STARS_TRANSACTIONS.length} транзакций`);
console.log(`🎁 BONUS (бонусы): ${BONUS_TRANSACTIONS.length} транзакций`);
console.log(`📊 ИТОГО: ${RUB_TRANSACTIONS.length + STARS_TRANSACTIONS.length + BONUS_TRANSACTIONS.length} транзакций\n`);

// ФУНКЦИЯ ПОДСЧЕТА СУММ
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

// ПОКАЗЫВАЕМ СТАТИСТИКУ ПО КАТЕГОРИЯМ
const rubStats = calculateStats(RUB_TRANSACTIONS);
const starsStats = calculateStats(STARS_TRANSACTIONS);
const bonusStats = calculateStats(BONUS_TRANSACTIONS);

console.log('='.repeat(80));
console.log('📊 ДЕТАЛЬНАЯ СТАТИСТИКА ПО ТРЕМ ГОЛОВАМ:');
console.log('='.repeat(80));

console.log(`\n💰 1. РУБЛИ (RUB) - самая большая голова:`);
console.log(`   Транзакций: ${rubStats.count}`);
console.log(`   Сумма: ${rubStats.totalAmount.toLocaleString()}₽`);
console.log(`   Пользователей: ${rubStats.uniqueUsers}`);
console.log(`   Ботов: ${rubStats.uniqueBots}`);

console.log(`\n⭐ 2. ЗВЕЗДЫ (STARS) - звездная голова:`);
console.log(`   Транзакций: ${starsStats.count}`);
console.log(`   Сумма: ${starsStats.totalAmount.toLocaleString()}⭐`);
console.log(`   Пользователей: ${starsStats.uniqueUsers}`);
console.log(`   Ботов: ${starsStats.uniqueBots}`);

console.log(`\n🎁 3. БОНУСЫ (BONUS) - административная голова:`);
console.log(`   Транзакций: ${bonusStats.count}`);
console.log(`   Сумма: ${bonusStats.totalAmount.toLocaleString()}`);
console.log(`   Пользователей: ${bonusStats.uniqueUsers}`);
console.log(`   Ботов: ${bonusStats.uniqueBots}`);

// ТОП ТРАНЗАКЦИИ В КАЖДОЙ КАТЕГОРИИ
console.log('\n' + '='.repeat(80));
console.log('🔝 ТОП-5 ТРАНЗАКЦИЙ В КАЖДОЙ КАТЕГОРИИ:');
console.log('='.repeat(80));

function showTopTransactions(transactions, categoryName, currencySymbol) {
  console.log(`\n💎 ${categoryName}:`);
  console.log('-'.repeat(80));

  transactions
    .sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0))
    .slice(0, 5)
    .forEach((tx, i) => {
      const amount = Math.abs(parseFloat(tx.amount) || 0);
      const date = new Date(tx.created_at);
      const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

      console.log(`   ${i + 1}. ${amount.toLocaleString()}${currencySymbol} | ${dateStr}`);
      console.log(`      ${tx.bot_name} | User: ${tx.telegram_id}`);
      console.log(`      ${tx.description.substring(0, 60)}...`);
    });
}

showTopTransactions(RUB_TRANSACTIONS, 'RUB - ПЛАТЕЖИ В РУБЛЯХ', '₽');
showTopTransactions(STARS_TRANSACTIONS, 'STARS - ПОКУПКИ ЗВЕЗД', '⭐');
showTopTransactions(BONUS_TRANSACTIONS, 'BONUS - АДМИН/ТЕСТ', '');

// АНАЛИЗ ПО БОТАМ В КАЖДОЙ КАТЕГОРИИ
console.log('\n' + '='.repeat(80));
console.log('🤖 ТОП-3 БОТА ПО СУММЕ В КАЖДОЙ КАТЕГОРИИ:');
console.log('='.repeat(80));

function analyzeByBot(transactions, categoryName) {
  const byBot = {};
  transactions.forEach(tx => {
    const bot = tx.bot_name;
    if (!byBot[bot]) {
      byBot[bot] = { count: 0, total: 0, users: new Set() };
    }
    byBot[bot].count++;
    byBot[bot].total += Math.abs(parseFloat(tx.amount) || 0);
    byBot[bot].users.add(tx.telegram_id);
  });

  console.log(`\n📊 ${categoryName}:`);
  Object.entries(byBot)
    .map(([bot, data]) => ({ bot, ...data, uniqueUsers: data.users.size }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3)
    .forEach(botData => {
      console.log(`   ${botData.bot}:`);
      console.log(`      💰 Сумма: ${Math.round(botData.total).toLocaleString()}`);
      console.log(`      📊 Транзакций: ${botData.count}`);
      console.log(`      👥 Пользователей: ${botData.uniqueUsers}`);
    });
}

analyzeByBot(RUB_TRANSACTIONS, '💰 RUB - ПЛАТЕЖИ В РУБЛЯХ');
analyzeByBot(STARS_TRANSACTIONS, '⭐ STARS - ПОКУПКИ ЗВЕЗД');
analyzeByBot(BONUS_TRANSACTIONS, '🎁 BONUS - АДМИН/ТЕСТ');

// СОЗДАЕМ EXCEL
console.log('\n' + '='.repeat(80));
console.log('📊 СОЗДАЕМ EXCEL С ПРАВИЛЬНЫМИ ДАННЫМИ...');
console.log('='.repeat(80));

const workbook = new ExcelJS.Workbook();

// Стили для заголовков
const headerStyle = {
  font: { bold: true, color: { argb: 'FFFFFF' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } }
};

// ЛИСТ 1: RUB
const rubSheet = workbook.addWorksheet('💰 RUB (Рубли)');
rubSheet.addRow(['№', 'Сумма (₽)', 'Пользователь', 'Бот', 'Описание', 'Дата', 'Метод оплаты']);
rubSheet.getRow(1).font = headerStyle.font;
rubSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0066CC' } };

RUB_TRANSACTIONS.forEach((tx, i) => {
  const amount = Math.abs(parseFloat(tx.amount) || 0);
  const date = new Date(tx.created_at);
  const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

  rubSheet.addRow([
    i + 1,
    amount,
    tx.telegram_id,
    tx.bot_name,
    tx.description,
    dateStr,
    tx.payment_method || ''
  ]);
});

// ЛИСТ 2: STARS
const starsSheet = workbook.addWorksheet('⭐ STARS (Звезды)');
starsSheet.addRow(['№', 'Сумма (⭐)', 'Пользователь', 'Бот', 'Описание', 'Дата', 'Метод оплаты']);
starsSheet.getRow(1).font = headerStyle.font;
starsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFB800' } };

STARS_TRANSACTIONS.forEach((tx, i) => {
  const amount = Math.abs(parseFloat(tx.amount) || 0);
  const date = new Date(tx.created_at);
  const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

  starsSheet.addRow([
    i + 1,
    amount,
    tx.telegram_id,
    tx.bot_name,
    tx.description,
    dateStr,
    tx.payment_method || ''
  ]);
});

// ЛИСТ 3: BONUS
const bonusSheet = workbook.addWorksheet('🎁 BONUS (Бонусы)');
bonusSheet.addRow(['№', 'Пользователь', 'Бот', 'Описание', 'Дата', 'Метод оплаты']);
bonusSheet.getRow(1).font = headerStyle.font;
bonusSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9933CC' } };

BONUS_TRANSACTIONS.forEach((tx, i) => {
  const date = new Date(tx.created_at);
  const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

  bonusSheet.addRow([
    i + 1,
    tx.telegram_id,
    tx.bot_name,
    tx.description,
    dateStr,
    tx.payment_method || ''
  ]);
});

// ЛИСТ 4: СВОДКА
const summarySheet = workbook.addWorksheet('📊 СВОДКА');
summarySheet.addRow(['Категория', 'Транзакций', 'Сумма', 'Пользователей', 'Ботов', 'Средняя сумма']);
summarySheet.getRow(1).font = headerStyle.font;
summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } };

summarySheet.addRow(['💰 RUB (Рубли)', rubStats.count, `${rubStats.totalAmount.toLocaleString()}₽`, rubStats.uniqueUsers, rubStats.uniqueBots, Math.round(rubStats.totalAmount / rubStats.count)]);
summarySheet.addRow(['⭐ STARS (Звезды)', starsStats.count, `${starsStats.totalAmount.toLocaleString()}⭐`, starsStats.uniqueUsers, starsStats.uniqueBots, Math.round(starsStats.totalAmount / starsStats.count)]);
summarySheet.addRow(['🎁 BONUS (Бонусы)', bonusStats.count, bonusStats.totalAmount, bonusStats.uniqueUsers, bonusStats.uniqueBots, 0]);
summarySheet.addRow(['ИТОГО', rubStats.count + starsStats.count + bonusStats.count, 'СМОТРИТЕ ДЕТАЛИ', rubStats.uniqueUsers + starsStats.uniqueUsers + bonusStats.uniqueUsers, rubStats.uniqueBots + starsStats.uniqueBots + bonusStats.uniqueBots, '']);

// Сохраняем файл
const filename = 'THREE_HEADS_GORYNYCH_CORRECTED.xlsx';
workbook.xlsx.writeFile(filename)
  .then(() => {
    console.log(`\n✅ Excel файл создан: ${filename}`);

    // ИТОГОВЫЙ ОТЧЕТ
    console.log('\n' + '='.repeat(80));
    console.log('🐍 ИТОГОВЫЙ ОТЧЕТ - ТРИ ГОЛОВЫ ЗМЕЯ ГОРЫНЫЧА');
    console.log('='.repeat(80));

    console.log(`\n💰 1. РУБЛИ (RUB) - реальные платежи:`);
    console.log(`   ${rubStats.count} транзакций на ${rubStats.totalAmount.toLocaleString()}₽`);
    console.log(`   ${rubStats.uniqueUsers} пользователей в ${rubStats.uniqueBots} ботах`);

    console.log(`\n⭐ 2. ЗВЕЗДЫ (STARS) - покупки звезд:`);
    console.log(`   ${starsStats.count} транзакций на ${starsStats.totalAmount.toLocaleString()}⭐`);
    console.log(`   ${starsStats.uniqueUsers} пользователей в ${starsStats.uniqueBots} ботах`);

    console.log(`\n🎁 3. БОНУСЫ (BONUS) - административные:`);
    console.log(`   ${bonusStats.count} транзакций`);
    console.log(`   ${bonusStats.uniqueUsers} пользователей в ${bonusStats.uniqueBots} ботах`);

    console.log(`\n🎯 КАЖДАЯ ГОЛОВА - ОТДЕЛЬНЫЙ БИЗНЕС-ПОТОК:`);
    console.log(`   💰 RUB - прямые рубли от пользователей`);
    console.log(`   ⭐ STARS - покупка звезд для использования AI`);
    console.log(`   🎁 BONUS - корпоративные/административные доступы`);
  })
  .catch(error => {
    console.error('❌ Ошибка создания Excel:', error);
  });
