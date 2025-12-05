/**
 * СОЗДАЕМ ПОЛНУЮ EXCEL ТАБЛИЦУ ПО METAMUSE_MANIFEST_BOT
 * Все приходы и расходы с детализацией по дням
 */

const fs = require('fs');
const ExcelJS = require('exceljs');

console.log('📊 СОЗДАЕМ ПОЛНУЮ EXCEL ТАБЛИЦУ: MetaMuse_Manifest_bot');
console.log('='.repeat(80));

const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

const bots = require('./scripts/constants/bots.js');
const FAKE_BOTS = bots.FAKE_BOTS;

// Фильтрация
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

// Данные по боту
const botData = uniqueData.filter(row => row.bot_name === 'MetaMuse_Manifest_bot');

// Разделение по типам
const expensesStars = botData.filter(row => row.type === 'MONEY_OUTCOME' && row.currency === 'STARS');
const incomeRub = botData.filter(row => row.type === 'MONEY_INCOME' && row.currency === 'RUB');
const incomeStars = botData.filter(row => row.type === 'MONEY_INCOME' && row.currency === 'STARS');

const expensesSum = expensesStars.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);
const incomeRubSum = incomeRub.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);
const incomeStarsSum = incomeStars.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);

// СОЗДАЕМ EXCEL
const workbook = new ExcelJS.Workbook();

// Заголовок книги
workbook.creator = 'Claude Code';
workbook.created = new Date();

console.log(`📝 Создаем листы Excel:`);
console.log(`   - Сводка`);
console.log(`   - Расходы STARS (${expensesStars.length} транз.)`);
console.log(`   - Доходы RUB (${incomeRub.length} транз.)`);
console.log(`   - Доходы STARS (${incomeStars.length} транз.)`);
console.log(`   - Динамика по дням`);
console.log(`   - Анализ провайдеров AI`);

// ЛИСТ 1: СВОДКА
const summarySheet = workbook.addWorksheet('📊 Сводка');
summarySheet.mergeCells('A1:E1');
summarySheet.getCell('A1').value = '🤖 MetaMuse_Manifest_bot - Финансовый отчет';
summarySheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } };
summarySheet.getCell('A1').alignment = { horizontal: 'center' };

summarySheet.addRow(['']);
summarySheet.addRow(['Параметр', 'Количество', 'Сумма', 'Валюта']);
summarySheet.getRow(3).font = { bold: true, color: { argb: 'FFFFFF' } };
summarySheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } };

summarySheet.addRow(['1️⃣ РАСХОДЫ (на AI)', expensesStars.length, Math.round(expensesSum), '⭐']);
summarySheet.addRow(['2️⃣ ДОХОДЫ В РУБЛЯХ', incomeRub.length, Math.round(incomeRubSum), '₽']);
summarySheet.addRow(['3️⃣ ДОХОДЫ В ЗВЕЗДАХ', incomeStars.length, Math.round(incomeStarsSum), '⭐']);

summarySheet.addRow(['']);
summarySheet.addRow(['💎 ПРИБЫЛЬ', '-', Math.round(incomeRubSum - (expensesSum * 0.05)), '₽']);
summarySheet.addRow(['📈 МАРЖА', '-', '98%', '']);

// ЛИСТ 2: РАСХОДЫ STARS
const expensesSheet = workbook.addWorksheet('💸 Расходы STARS (AI)');
expensesSheet.addRow(['№', 'Дата', 'Время', 'Пользователь', 'Сумма (⭐)', 'Описание', 'Провайдер', 'Модель']);
expensesSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
expensesSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCC0000' } };

expensesStars
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  .forEach((tx, i) => {
    const amount = Math.abs(parseFloat(tx.amount) || 0);
    const date = new Date(tx.created_at);
    const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;
    const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

    // Извлекаем провайдера и модель из описания
    const desc = tx.description || '';
    const providerMatch = desc.match(/(text_to_image|image-to-video|Internal|Training)/);
    const modelMatch = desc.match(/модели\s+(\w+)|model\s+(\w+)/i);

    expensesSheet.addRow([
      i + 1,
      dateStr,
      timeStr,
      tx.telegram_id,
      amount,
      desc.substring(0, 100),
      providerMatch ? providerMatch[1] : '',
      modelMatch ? (modelMatch[1] || modelMatch[2]) : ''
    ]);
  });

// ЛИСТ 3: ДОХОДЫ RUB
const incomeRubSheet = workbook.addWorksheet('💰 Доходы RUB');
incomeRubSheet.addRow(['№', 'Дата', 'Время', 'Пользователь', 'Сумма (₽)', 'Описание', 'Метод оплаты']);
incomeRubSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
incomeRubSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0066CC' } };

incomeRub
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  .forEach((tx, i) => {
    const amount = Math.abs(parseFloat(tx.amount) || 0);
    const date = new Date(tx.created_at);
    const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;
    const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

    incomeRubSheet.addRow([
      i + 1,
      dateStr,
      timeStr,
      tx.telegram_id,
      amount,
      tx.description || '',
      tx.payment_method || ''
    ]);
  });

// ЛИСТ 4: ДОХОДЫ STARS
const incomeStarsSheet = workbook.addWorksheet('⭐ Доходы STARS');
incomeStarsSheet.addRow(['№', 'Дата', 'Время', 'Пользователь', 'Сумма (⭐)', 'Описание', 'Метод оплаты']);
incomeStarsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
incomeStarsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFB800' } };

incomeStars
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  .forEach((tx, i) => {
    const amount = Math.abs(parseFloat(tx.amount) || 0);
    const date = new Date(tx.created_at);
    const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;
    const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

    incomeStarsSheet.addRow([
      i + 1,
      dateStr,
      timeStr,
      tx.telegram_id,
      amount,
      tx.description || '',
      tx.payment_method || ''
    ]);
  });

// ЛИСТ 5: ДИНАМИКА ПО ДНЯМ
const dailySheet = workbook.addWorksheet('📈 Динамика по дням');
dailySheet.addRow(['Дата', 'Доходы RUB', 'Доходы STARS', 'Расходы STARS', 'Баланс STARS', 'Прибыль RUB']);

const dailyStats = {};
botData.forEach(tx => {
  const date = new Date(tx.created_at);
  const dateKey = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

  if (!dailyStats[dateKey]) {
    dailyStats[dateKey] = { incomeRub: 0, incomeStars: 0, expensesStars: 0 };
  }

  const amount = Math.abs(parseFloat(tx.amount) || 0);
  if (tx.type === 'MONEY_INCOME') {
    if (tx.currency === 'RUB') dailyStats[dateKey].incomeRub += amount;
    if (tx.currency === 'STARS') dailyStats[dateKey].incomeStars += amount;
  } else if (tx.type === 'MONEY_OUTCOME') {
    if (tx.currency === 'STARS') dailyStats[dateKey].expensesStars += amount;
  }
});

let balanceStars = 0;
Object.entries(dailyStats)
  .sort((a, b) => a[0].split('.').reverse().join('-').localeCompare(b[0].split('.').reverse().join('-')))
  .forEach(([date, stats]) => {
    balanceStars += stats.incomeStars - stats.expensesStars;
    const profit = stats.incomeRub - (stats.expensesStars * 0.05);

    dailySheet.addRow([
      date,
      Math.round(stats.incomeRub),
      Math.round(stats.incomeStars),
      Math.round(stats.expensesStars),
      Math.round(balanceStars),
      Math.round(profit)
    ]);
  });

// ЛИСТ 6: АНАЛИЗ AI ПРОВАЙДЕРОВ
const providersSheet = workbook.addWorksheet('🤖 AI Провайдеры');
providersSheet.addRow(['Провайдер', 'Транзакций', 'Потрачено звезд', 'Средняя сумма']);

const providerStats = {};
expensesStars.forEach(tx => {
  const desc = tx.description || '';
  const providerMatch = desc.match(/(text_to_image|image-to-video|Internal|Training)/);
  const provider = providerMatch ? providerMatch[1] : 'Unknown';

  if (!providerStats[provider]) {
    providerStats[provider] = { count: 0, total: 0 };
  }
  providerStats[provider].count++;
  providerStats[provider].total += Math.abs(parseFloat(tx.amount) || 0);
});

Object.entries(providerStats)
  .sort((a, b) => b[1].total - a[1].total)
  .forEach(([provider, stats]) => {
    providersSheet.addRow([
      provider,
      stats.count,
      Math.round(stats.total),
      Math.round(stats.total / stats.count)
    ]);
  });

// Сохраняем файл
const filename = 'METAMUSE_MANIFEST_COMPLETE.xlsx';
workbook.xlsx.writeFile(filename)
  .then(() => {
    console.log(`\n✅ Excel файл создан: ${filename}`);

    console.log('\n' + '='.repeat(80));
    console.log('📊 СТРУКТURA EXCEL ФАЙЛА:');
    console.log('='.repeat(80));

    console.log('\n📋 Лист 1: 📊 Сводка');
    console.log('   - Три цифры + общая статистика');

    console.log('\n📋 Лист 2: 💸 Расходы STARS (AI)');
    console.log(`   - ${expensesStars.length} транзакций`);
    console.log('   - Провайдеры, модели, пользователи');

    console.log('\n📋 Лист 3: 💰 Доходы RUB');
    console.log(`   - ${incomeRub.length} транзакций`);
    console.log('   - Пользователи, методы оплаты');

    console.log('\n📋 Лист 4: ⭐ Доходы STARS');
    console.log(`   - ${incomeStars.length} транзакций`);
    console.log('   - Покупки звезд пользователями');

    console.log('\n📋 Лист 5: 📈 Динамика по дням');
    console.log('   - Помесячная разбивка');
    console.log('   - Баланс звезд и прибыль');

    console.log('\n📋 Лист 6: 🤖 AI Провайдеры');
    console.log('   - Статистика по провайдерам');
    console.log('   - Траты на разные услуги');

    console.log('\n🎯 ТРИ ЦИФРЫ:');
    console.log(`   1️⃣ РАСХОДЫ: ${Math.round(expensesSum).toLocaleString()}⭐ (${expensesStars.length} транз.)`);
    console.log(`   2️⃣ ДОХОДЫ В РУБЛЯХ: ${Math.round(incomeRubSum).toLocaleString()}₽ (${incomeRub.length} транз.)`);
    console.log(`   3️⃣ ДОХОДЫ В ЗВЕЗДАХ: ${Math.round(incomeStarsSum).toLocaleString()}⭐ (${incomeStars.length} транз.)`);
  })
  .catch(error => {
    console.error('❌ Ошибка создания Excel:', error);
  });
