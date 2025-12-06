/**
 * АНАЛИЗ ТРЕХ ГОЛОВ ЗМЕЯ ГОРЫНЫЧА
 * Три категории доходов: RUB, STARS, BONUS
 */

const fs = require('fs');
const ExcelJS = require('exceljs');

console.log('🐍 АНАЛИЗ ТРЕХ ГОЛОВ ЗМЕЯ ГОРЫНЫЧА');
console.log('='.repeat(80));
console.log('   1. 💰 RUB - Платежи в рублях');
console.log('   2. ⭐ STARS - Платежи в звездах');
console.log('   3. 🎁 BONUS - Бонусные транзакции');
console.log('='.repeat(80) + '\n');

const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

const bots = require('./scripts/constants/bots.js');
const FAKE_BOTS = bots.FAKE_BOTS;

// Фильтруем все данные
const filtered = data.filter(row => {
  const desc = (row.description || '').toUpperCase();
  const botName = (row.bot_name || '');

  // Исключаем аномальные записи
  if (desc.includes('АКАДЕМИЯ ВАЙБКОДЕРА')) return false;
  if (desc.includes('12-МЕСЯЧНАЯ ПРОГРАММА ОБУЧЕНИЯ')) return false;
  if (desc.includes('ГОД ОБУЧЕНИЯ С ИИ-АГЕНТАМИ')) return false;
  if (desc.includes('TEST_DATA')) return false;
  if (desc.includes('🎁 ПРОМО-ДОСТУП')) return false;
  if (desc.includes('🔥 ADMIN GRANT')) return false;
  if (desc.includes('ADMIN GRANT')) return false;
  if (desc.includes('БЕССРОЧНАЯ ПОДПИСКА')) return false;
  if (desc.includes('ПОЖИЗНЕННАЯ ПОДПИСКА')) return false;
  if (desc.includes('НЕЙРОТЕСТЕР')) return false;

  // Исключаем фейковых ботов
  if (FAKE_BOTS.some(fakeBot => botName.toLowerCase().includes(fakeBot.toLowerCase()))) {
    return false;
  }

  // Исключаем подозрительные ID
  const telegramId = row.telegram_id?.toString() || '';
  const suspiciousIds = ['11111', '12345', '67890', '999999997', '999999998', '999999999'];
  if (suspiciousIds.includes(telegramId)) return false;

  // Исключаем тестовые данные
  if (row.is_test === true) return false;

  // Исключаем UNKNOWN статусы для Robokassa (они все равно не пройдут)
  if (row.payment_method === 'Robokassa' && (!row.status || row.status === 'UNKNOWN')) {
    return false;
  }

  // Исключаем записи больше 5000 ТОЛЬКО для STARS и XTR
  const amount = parseFloat(row.amount) || 0;
  const currency = row.currency || '';
  if (currency !== 'RUB' && currency !== 'BONUS' && Math.abs(amount) > 5000) {
    return false;
  }

  return true;
});

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

console.log(`✅ После фильтрации: ${uniqueData.length} записей\n`);

// РАЗДЕЛЯЕМ НА ТРИ КАТЕГОРИИ
const RUB_TRANSACTIONS = uniqueData.filter(row => row.currency === 'RUB' && row.type === 'MONEY_INCOME' && row.amount > 0);
const STARS_TRANSACTIONS = uniqueData.filter(row => row.currency === 'STARS' && row.type === 'MONEY_INCOME' && row.amount > 0);
const BONUS_TRANSACTIONS = uniqueData.filter(row => row.type === 'BONUS' || (row.type === 'MONEY_INCOME' && row.currency === 'RUB' && row.description?.toUpperCase().includes('BONUS')));

console.log('🎯 РАЗДЕЛЕНИЕ ПО КАТЕГОРИЯМ:');
console.log('-'.repeat(80));
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

console.log('📊 ДЕТАЛЬНАЯ СТАТИСТИКА:');
console.log('='.repeat(80));

console.log('\n💰 1. РУБЛИ (RUB):');
console.log(`   Транзакций: ${rubStats.count}`);
console.log(`   Сумма: ${rubStats.totalAmount.toLocaleString()}₽`);
console.log(`   Пользователей: ${rubStats.uniqueUsers}`);
console.log(`   Ботов: ${rubStats.uniqueBots}`);

console.log('\n⭐ 2. ЗВЕЗДЫ (STARS):');
console.log(`   Транзакций: ${starsStats.count}`);
console.log(`   Сумма: ${starsStats.totalAmount.toLocaleString()}⭐`);
console.log(`   Пользователей: ${starsStats.uniqueUsers}`);
console.log(`   Ботов: ${starsStats.uniqueBots}`);

console.log('\n🎁 3. БОНУСЫ (BONUS):');
console.log(`   Транзакций: ${bonusStats.count}`);
console.log(`   Сумма: ${bonusStats.totalAmount.toLocaleString()}`);
console.log(`   Пользователей: ${bonusStats.uniqueUsers}`);
console.log(`   Ботов: ${bonusStats.uniqueBots}`);

// ТОП ТРАНЗАКЦИИ В КАЖДОЙ КАТЕГОРИИ
console.log('\n' + '='.repeat(80));
console.log('🔝 ТОП-10 ТРАНЗАКЦИЙ В КАЖДОЙ КАТЕГОРИИ:');
console.log('='.repeat(80));

function showTopTransactions(transactions, categoryName, currencySymbol) {
  console.log(`\n💎 ${categoryName}:`);
  console.log('-'.repeat(80));

  transactions
    .sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0))
    .slice(0, 10)
    .forEach((tx, i) => {
      const amount = Math.abs(parseFloat(tx.amount) || 0);
      const date = new Date(tx.created_at);
      const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

      console.log(`   ${i + 1}. ${amount.toLocaleString()}${currencySymbol} | ${dateStr} | ${tx.bot_name}`);
      console.log(`      User: ${tx.telegram_id} | ${tx.description}`);
    });
}

showTopTransactions(RUB_TRANSACTIONS, 'RUB - ПЛАТЕЖИ В РУБЛЯХ', '₽');
showTopTransactions(STARS_TRANSACTIONS, 'STARS - ПЛАТЕЖИ В ЗВЕЗДАХ', '⭐');
showTopTransactions(BONUS_TRANSACTIONS, 'BONUS - БОНУСНЫЕ ТРАНЗАКЦИИ', '');

// АНАЛИЗ ПО БОТАМ В КАЖДОЙ КАТЕГОРИИ
console.log('\n' + '='.repeat(80));
console.log('🤖 СТАТИСТИКА ПО БОТАМ В КАЖДОЙ КАТЕГОРИИ:');
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
    .slice(0, 5)
    .forEach(botData => {
      console.log(`   ${botData.bot}:`);
      console.log(`      Транзакций: ${botData.count}`);
      console.log(`      Сумма: ${Math.round(botData.total).toLocaleString()}`);
      console.log(`      Пользователей: ${botData.uniqueUsers}`);
    });
}

analyzeByBot(RUB_TRANSACTIONS, '💰 RUB - ПЛАТЕЖИ В РУБЛЯХ');
analyzeByBot(STARS_TRANSACTIONS, '⭐ STARS - ПЛАТЕЖИ В ЗВЕЗДАХ');
analyzeByBot(BONUS_TRANSACTIONS, '🎁 BONUS - БОНУСНЫЕ ТРАНЗАКЦИИ');

// СОЗДАЕМ EXCEL
console.log('\n' + '='.repeat(80));
console.log('📊 СОЗДАЕМ EXCEL ФАЙЛ С ТРЕМЯ КАТЕГОРИЯМИ...');
console.log('='.repeat(80));

const workbook = new ExcelJS.Workbook();

// ЛИСТ 1: RUB
const rubSheet = workbook.addWorksheet('💰 RUB (Рубли)');
rubSheet.addRow(['№', 'Сумма (₽)', 'Пользователь', 'Бот', 'Описание', 'Дата']);
rubSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
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
    dateStr
  ]);
});

// ЛИСТ 2: STARS
const starsSheet = workbook.addWorksheet('⭐ STARS (Звезды)');
starsSheet.addRow(['№', 'Сумма (⭐)', 'Пользователь', 'Бот', 'Описание', 'Дата']);
starsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
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
    dateStr
  ]);
});

// ЛИСТ 3: BONUS
const bonusSheet = workbook.addWorksheet('🎁 BONUS (Бонусы)');
bonusSheet.addRow(['№', 'Сумма', 'Пользователь', 'Бот', 'Описание', 'Дата']);
bonusSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
bonusSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9933CC' } };

BONUS_TRANSACTIONS.forEach((tx, i) => {
  const amount = Math.abs(parseFloat(tx.amount) || 0);
  const date = new Date(tx.created_at);
  const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

  bonusSheet.addRow([
    i + 1,
    amount,
    tx.telegram_id,
    tx.bot_name,
    tx.description,
    dateStr
  ]);
});

// ЛИСТ 4: СВОДКА
const summarySheet = workbook.addWorksheet('📊 СВОДКА');
summarySheet.addRow(['Категория', 'Транзакций', 'Сумма', 'Пользователей', 'Ботов']);
summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } };

summarySheet.addRow(['💰 RUB (Рубли)', rubStats.count, `${rubStats.totalAmount.toLocaleString()}₽`, rubStats.uniqueUsers, rubStats.uniqueBots]);
summarySheet.addRow(['⭐ STARS (Звезды)', starsStats.count, `${starsStats.totalAmount.toLocaleString()}⭐`, starsStats.uniqueUsers, starsStats.uniqueBots]);
summarySheet.addRow(['🎁 BONUS (Бонусы)', bonusStats.count, bonusStats.totalAmount, bonusStats.uniqueUsers, bonusStats.uniqueBots]);
summarySheet.addRow(['ИТОГО', rubStats.count + starsStats.count + bonusStats.count, 'СМОТРИТЕ ДЕТАЛИ', rubStats.uniqueUsers + starsStats.uniqueUsers + bonusStats.uniqueUsers, rubStats.uniqueBots + starsStats.uniqueBots + bonusStats.uniqueBots]);

// Сохраняем файл
const filename = 'THREE_HEADS_GORYNYCH_ANALYSIS.xlsx';
workbook.xlsx.writeFile(filename)
  .then(() => {
    console.log(`\n✅ Excel файл создан: ${filename}`);

    // ИТОГОВЫЙ ОТЧЕТ
    console.log('\n' + '='.repeat(80));
    console.log('🐍 ИТОГОВЫЙ ОТЧЕТ - ТРИ ГОЛОВЫ ЗМЕЯ ГОРЫНЫЧА');
    console.log('='.repeat(80));

    console.log(`\n💰 1. РУБЛИ (RUB) - ${rubStats.count} транзакций`);
    console.log(`   Сумма: ${rubStats.totalAmount.toLocaleString()}₽`);
    console.log(`   Пользователей: ${rubStats.uniqueUsers}`);
    console.log(`   Ботов: ${rubStats.uniqueBots}`);

    console.log(`\n⭐ 2. ЗВЕЗДЫ (STARS) - ${starsStats.count} транзакций`);
    console.log(`   Сумма: ${starsStats.totalAmount.toLocaleString()}⭐`);
    console.log(`   Пользователей: ${starsStats.uniqueUsers}`);
    console.log(`   Ботов: ${starsStats.uniqueBots}`);

    console.log(`\n🎁 3. БОНУСЫ (BONUS) - ${bonusStats.count} транзакций`);
    console.log(`   Сумма: ${bonusStats.totalAmount.toLocaleString()}`);
    console.log(`   Пользователей: ${bonusStats.uniqueUsers}`);
    console.log(`   Ботов: ${bonusStats.uniqueBots}`);

    console.log(`\n📊 ИТОГО:`);
    console.log(`   Всего транзакций: ${rubStats.count + starsStats.count + bonusStats.count}`);
    console.log(`   Уникальных пользователей: ${rubStats.uniqueUsers + starsStats.uniqueUsers + bonusStats.uniqueUsers}`);
    console.log(`   Активных ботов: ${rubStats.uniqueBots + starsStats.uniqueBots + bonusStats.uniqueBots}`);

    console.log(`\n🎯 КАЖДАЯ ГОЛОВА ЗМЕЯ - ЭТО ОТДЕЛЬНЫЙ ПОТОК ДОХОДОВ!`);
    console.log(`   Нужно развивать все три направления параллельно.`);
  })
  .catch(error => {
    console.error('❌ Ошибка создания Excel:', error);
  });
