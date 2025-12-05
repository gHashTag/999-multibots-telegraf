/**
 * ДЕТАЛЬНЫЙ АНАЛИЗ БОТА METAMUSE_MANIFEST_BOT
 * Три цифры: расходы, доходы RUB, доходы STARS + Excel детализация
 */

const fs = require('fs');
const ExcelJS = require('exceljs');

console.log('🤖 ДЕТАЛЬНЫЙ АНАЛИЗ: METAMUSE_MANIFEST_BOT');
console.log('='.repeat(80));

const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

const bots = require('./scripts/constants/bots.js');
const FAKE_BOTS = bots.FAKE_BOTS;

console.log(`Всего записей в payments_data.json: ${data.length}\n`);

// Фильтруем данные
const filtered = data.filter(row => {
  const desc = (row.description || '').toUpperCase();
  const botName = (row.bot_name || '');

  // Исключаем аномальные VIBECODER
  if (desc.includes('АКАДЕМИЯ ВАЙБКОДЕРА')) return false;
  if (desc.includes('12-МЕСЯЦНАЯ ПРОГРАММА ОБУЧЕНИЯ')) return false;
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
  if (desc.includes('TEST_DATA')) return false;

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

// Берем только транзакции MetaMuse_Manifest_bot
const botData = uniqueData.filter(row => row.bot_name === 'MetaMuse_Manifest_bot');

console.log(`✅ Найдено транзакций MetaMuse_Manifest_bot: ${botData.length}\n`);

// РАЗДЕЛЯЕМ НА КАТЕГОРИИ
console.log('📊 РАЗДЕЛЕНИЕ ПО ТИПАМ И ВАЛЮТАМ:');
console.log('-'.repeat(80));

// 1. РАСХОДЫ (MONEY_OUTCOME)
const expenses = botData.filter(row => row.type === 'MONEY_OUTCOME');
const expensesRub = expenses.filter(row => row.currency === 'RUB');
const expensesStars = expenses.filter(row => row.currency === 'STARS');

// 2. ДОХОДЫ (MONEY_INCOME)
const income = botData.filter(row => row.type === 'MONEY_INCOME');
const incomeRub = income.filter(row => row.currency === 'RUB');
const incomeStars = income.filter(row => row.currency === 'STARS');

// Подсчитываем суммы
const expensesRubSum = expensesRub.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);
const expensesStarsSum = expensesStars.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);
const incomeRubSum = incomeRub.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);
const incomeStarsSum = incomeStars.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);

console.log(`💸 РАСХОДЫ (MONEY_OUTCOME):`);
console.log(`   RUB: ${expensesRub.length} транз., ${Math.round(expensesRubSum).toLocaleString()}₽`);
console.log(`   STARS: ${expensesStars.length} транз., ${Math.round(expensesStarsSum).toLocaleString()}⭐`);
console.log(`   ИТОГО РАСХОДОВ: ${expensesRub.length + expensesStars.length}`);

console.log(`\n💰 ДОХОДЫ (MONEY_INCOME):`);
console.log(`   RUB: ${incomeRub.length} транз., ${Math.round(incomeRubSum).toLocaleString()}₽`);
console.log(`   STARS: ${incomeStars.length} транз., ${Math.round(incomeStarsSum).toLocaleString()}⭐`);
console.log(`   ИТОГО ДОХОДОВ: ${incomeRub.length + incomeStars.length}`);

// ТРИ ЦИФРЫ!
console.log('\n' + '='.repeat(80));
console.log('🎯 ТРИ ЦИФРЫ ПО METAMUSE_MANIFEST_BOT:');
console.log('='.repeat(80));

console.log(`\n1️⃣ РЕАЛЬНЫЕ РАСХОДЫ: ${Math.round(expensesRubSum).toLocaleString()}₽`);
console.log(`   Из них ${Math.round(expensesRubSum).toLocaleString()}₽ в рублях`);

console.log(`\n2️⃣ РЕАЛЬНЫЕ ДОХОДЫ В РУБЛЯХ: ${Math.round(incomeRubSum).toLocaleString()}₽`);
console.log(`   ${incomeRub.length} транзакций от пользователей`);

console.log(`\n3️⃣ РЕАЛЬНЫЕ ДОХОДЫ В ЗВЕЗДАХ: ${Math.round(incomeStarsSum).toLocaleString()}⭐`);
console.log(`   ${incomeStars.length} транзакций (покупки звезд пользователями)`);

const profitRub = incomeRubSum - expensesRubSum;
console.log(`\n💎 ПРИБЫЛЬ В РУБЛЯХ: ${Math.round(profitRub).toLocaleString()}₽`);
console.log(`   (Доходы RUB - Расходы RUB = ${Math.round(incomeRubSum).toLocaleString()} - ${Math.round(expensesRubSum).toLocaleString()})`);

// ТОП ТРАНЗАКЦИИ
console.log('\n' + '='.repeat(80));
console.log('🔝 ТОП-5 ДОХОДОВ В РУБЛЯХ:');
console.log('='.repeat(80));

incomeRub
  .sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0))
  .slice(0, 5)
  .forEach((tx, i) => {
    const amount = Math.abs(parseFloat(tx.amount) || 0);
    const date = new Date(tx.created_at);
    const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

    console.log(`   ${i + 1}. ${amount.toLocaleString()}₽ | ${dateStr} | User: ${tx.telegram_id}`);
    console.log(`      ${tx.description.substring(0, 80)}...`);
  });

console.log('\n🔝 ТОП-5 РАСХОДОВ В РУБЛЯХ:');
console.log('='.repeat(80));

expensesRub
  .sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0))
  .slice(0, 5)
  .forEach((tx, i) => {
    const amount = Math.abs(parseFloat(tx.amount) || 0);
    const date = new Date(tx.created_at);
    const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

    console.log(`   ${i + 1}. ${amount.toLocaleString()}₽ | ${dateStr} | ${tx.payment_method}`);
    console.log(`      ${tx.description.substring(0, 80)}...`);
  });

// СОЗДАЕМ EXCEL С ДЕТАЛИЗАЦИЕЙ
console.log('\n' + '='.repeat(80));
console.log('📊 СОЗДАЕМ EXCEL С ПОЛНОЙ ДЕТАЛИЗАЦИЕЙ...');
console.log('='.repeat(80));

const workbook = new ExcelJS.Workbook();

// Стили заголовков
const headerStyle = {
  font: { bold: true, color: { argb: 'FFFFFF' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } }
};

// ЛИСТ 1: ИТОГОВАЯ СВОДКА
const summarySheet = workbook.addWorksheet('📊 Итоговая сводка');
summarySheet.addRow(['Параметр', 'Количество', 'Сумма', 'Валюта']);
summarySheet.getRow(1).font = headerStyle.font;
summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } };

summarySheet.addRow(['1️⃣ РАСХОДЫ', expensesRub.length + expensesStars.length, Math.round(expensesRubSum), '₽']);
summarySheet.addRow(['   └─ В рублях (RUB)', expensesRub.length, Math.round(expensesRubSum), '₽']);
summarySheet.addRow(['   └─ В звездах (STARS)', expensesStars.length, Math.round(expensesStarsSum), '⭐']);

summarySheet.addRow(['']);
summarySheet.addRow(['2️⃣ ДОХОДЫ В РУБЛЯХ', incomeRub.length, Math.round(incomeRubSum), '₽']);
summarySheet.addRow(['3️⃣ ДОХОДЫ В ЗВЕЗДАХ', incomeStars.length, Math.round(incomeStarsSum), '⭐']);

summarySheet.addRow(['']);
summarySheet.addRow(['💎 ПРИБЫЛЬ В РУБЛЯХ', '-', Math.round(profitRub), '₽']);

summarySheet.addRow(['']);
summarySheet.addRow(['📈 ROI', '-', Math.round((profitRub / expensesRubSum) * 100), '%']);

// ЛИСТ 2: ДЕТАЛЬНЫЕ РУБЛЕВЫЕ ДОХОДЫ
const incomeRubSheet = workbook.addWorksheet('💰 Доходы RUB (детально)');
incomeRubSheet.addRow(['№', 'Дата', 'Пользователь', 'Сумма (₽)', 'Описание', 'Метод оплаты']);
incomeRubSheet.getRow(1).font = headerStyle.font;
incomeRubSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0066CC' } };

incomeRub
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  .forEach((tx, i) => {
    const amount = Math.abs(parseFloat(tx.amount) || 0);
    const date = new Date(tx.created_at);
    const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

    incomeRubSheet.addRow([
      i + 1,
      dateStr,
      tx.telegram_id,
      amount,
      tx.description,
      tx.payment_method || ''
    ]);
  });

// ЛИСТ 3: ДЕТАЛЬНЫЕ РУБЛЕВЫЕ РАСХОДЫ
const expensesRubSheet = workbook.addWorksheet('💸 Расходы RUB (детально)');
expensesRubSheet.addRow(['№', 'Дата', 'Сумма (₽)', 'Описание', 'Метод']);
expensesRubSheet.getRow(1).font = headerStyle.font;
expensesRubSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCC0000' } };

expensesRub
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  .forEach((tx, i) => {
    const amount = Math.abs(parseFloat(tx.amount) || 0);
    const date = new Date(tx.created_at);
    const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

    expensesRubSheet.addRow([
      i + 1,
      dateStr,
      amount,
      tx.description,
      tx.payment_method || ''
    ]);
  });

// ЛИСТ 4: ДЕТАЛЬНЫЕ STARS ДОХОДЫ
const incomeStarsSheet = workbook.addWorksheet('⭐ Доходы STARS (детально)');
incomeStarsSheet.addRow(['№', 'Дата', 'Пользователь', 'Сумма (⭐)', 'Описание', 'Метод']);
incomeStarsSheet.getRow(1).font = headerStyle.font;
incomeStarsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFB800' } };

incomeStars
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  .forEach((tx, i) => {
    const amount = Math.abs(parseFloat(tx.amount) || 0);
    const date = new Date(tx.created_at);
    const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

    incomeStarsSheet.addRow([
      i + 1,
      dateStr,
      tx.telegram_id,
      amount,
      tx.description,
      tx.payment_method || ''
    ]);
  });

// ЛИСТ 5: ДЕТАЛЬНЫЕ STARS РАСХОДЫ
const expensesStarsSheet = workbook.addWorksheet('⭐ Расходы STARS (детально)');
expensesStarsSheet.addRow(['№', 'Дата', 'Пользователь', 'Сумма (⭐)', 'Описание', 'Метод']);
expensesStarsSheet.getRow(1).font = headerStyle.font;
expensesStarsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF6600' } };

expensesStars
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  .slice(0, 100) // Ограничиваем для читаемости
  .forEach((tx, i) => {
    const amount = Math.abs(parseFloat(tx.amount) || 0);
    const date = new Date(tx.created_at);
    const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

    expensesStarsSheet.addRow([
      i + 1,
      dateStr,
      tx.telegram_id,
      amount,
      tx.description,
      tx.payment_method || ''
    ]);
  });

// ЛИСТ 6: ДИНАМИКА ПО ДНЯМ
const dailySheet = workbook.addWorksheet('📈 Динамика по дням');
dailySheet.addRow(['Дата', 'Доходы RUB', 'Расходы RUB', 'Прибыль RUB', 'Доходы STARS', 'Расходы STARS']);

const dailyStats = {};
botData.forEach(tx => {
  const date = new Date(tx.created_at);
  const dateKey = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

  if (!dailyStats[dateKey]) {
    dailyStats[dateKey] = { incomeRub: 0, expensesRub: 0, incomeStars: 0, expensesStars: 0 };
  }

  const amount = Math.abs(parseFloat(tx.amount) || 0);
  if (tx.type === 'MONEY_INCOME') {
    if (tx.currency === 'RUB') dailyStats[dateKey].incomeRub += amount;
    if (tx.currency === 'STARS') dailyStats[dateKey].incomeStars += amount;
  } else if (tx.type === 'MONEY_OUTCOME') {
    if (tx.currency === 'RUB') dailyStats[dateKey].expensesRub += amount;
    if (tx.currency === 'STARS') dailyStats[dateKey].expensesStars += amount;
  }
});

Object.entries(dailyStats)
  .sort((a, b) => a[0].split('.').reverse().join('-').localeCompare(b[0].split('.').reverse().join('-')))
  .forEach(([date, stats]) => {
    const profit = stats.incomeRub - stats.expensesRub;
    dailySheet.addRow([
      date,
      Math.round(stats.incomeRub),
      Math.round(stats.expensesRub),
      Math.round(profit),
      Math.round(stats.incomeStars),
      Math.round(stats.expensesStars)
    ]);
  });

// Сохраняем файл
const filename = 'METAMUSE_MANIFEST_BOT_DETAILED.xlsx';
workbook.xlsx.writeFile(filename)
  .then(() => {
    console.log(`\n✅ Excel файл создан: ${filename}`);

    // ИТОГОВЫЙ ОТЧЕТ
    console.log('\n' + '='.repeat(80));
    console.log('🤖 ИТОГОВЫЙ ОТЧЕТ - METAMUSE_MANIFEST_BOT');
    console.log('='.repeat(80));

    console.log('\n📊 ТРИ ЦИФРЫ:');
    console.log(`   1️⃣ РАСХОДЫ: ${Math.round(expensesRubSum).toLocaleString()}₽`);
    console.log(`   2️⃣ ДОХОДЫ В РУБЛЯХ: ${Math.round(incomeRubSum).toLocaleString()}₽`);
    console.log(`   3️⃣ ДОХОДЫ В ЗВЕЗДАХ: ${Math.round(incomeStarsSum).toLocaleString()}⭐`);

    console.log('\n💎 ФИНАНСОВЫЕ ПОКАЗАТЕЛИ:');
    console.log(`   Прибыль в рублях: ${Math.round(profitRub).toLocaleString()}₽`);
    console.log(`   ROI: ${Math.round((profitRub / expensesRubSum) * 100)}%`);
    console.log(`   Маржа: ${Math.round((profitRub / incomeRubSum) * 100)}%`);

    console.log('\n👥 ПОЛЬЗОВАТЕЛИ:');
    const uniqueUsers = new Set(botData.map(tx => tx.telegram_id));
    console.log(`   Всего пользователей: ${uniqueUsers.size}`);
    console.log(`   Средний доход на пользователя: ${Math.round(incomeRubSum / uniqueUsers.size)}₽`);

    console.log('\n📁 EXCEL ЛИСТЫ:');
    console.log(`   1. 📊 Итоговая сводка`);
    console.log(`   2. 💰 Доходы RUB (детально) - ${incomeRub.length} транз.`);
    console.log(`   3. 💸 Расходы RUB (детально) - ${expensesRub.length} транз.`);
    console.log(`   4. ⭐ Доходы STARS (детально) - ${incomeStars.length} транз.`);
    console.log(`   5. ⭐ Расходы STARS (детально) - ${expensesStars.length} транз.`);
    console.log(`   6. 📈 Динамика по дням`);
  })
  .catch(error => {
    console.error('❌ Ошибка создания Excel:', error);
  });
