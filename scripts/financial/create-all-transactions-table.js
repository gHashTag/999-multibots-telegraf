/**
 * СОЗДАЕМ EXCEL ТАБЛИЦУ СО ВСЕМИ ТРАНЗАКЦИЯМИ ROBOKASSA
 * Для самостоятельного изучения пользователем
 */

const ExcelJS = require('exceljs');
const fs = require('fs');

console.log('📊 СОЗДАЕМ EXCEL СО ВСЕМИ ТРАНЗАКЦИЯМИ ROBOKASSA');
console.log('='.repeat(80));

const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

const bots = require('./scripts/constants/bots.js');
const FAKE_BOTS = bots.FAKE_BOTS;

// Фильтруем ВСЕ транзакции Robokassa (как в тестах)
const filtered = data.filter(row => {
  if (row.currency !== 'RUB') return false;
  if (row.type !== 'MONEY_INCOME') return false;
  if (row.payment_method !== 'Robokassa') return false;

  const desc = (row.description || '').toUpperCase();
  const botName = (row.bot_name || '');

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

  if (FAKE_BOTS.some(fakeBot => botName.toLowerCase().includes(fakeBot.toLowerCase()))) {
    return false;
  }

  const telegramId = row.telegram_id?.toString() || '';
  const suspiciousIds = ['11111', '12345', '67890', '999999997', '999999998', '999999999'];
  if (suspiciousIds.includes(telegramId)) return false;

  if (row.is_test === true) return false;

  return true;
});

// Удаляем дубликаты
const seen = new Set();
const uniqueTransactions = [];

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
    uniqueTransactions.push(row);
  }
});

console.log(`Всего уникальных транзакций: ${uniqueTransactions.length}\n`);

// Сортируем по сумме (по убыванию)
uniqueTransactions.sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0));

// Создаем Excel
const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('Все транзакции Robokassa');

// Заголовки
worksheet.columns = [
  { header: '№', key: 'number', width: 5 },
  { header: 'Сумма (₽)', key: 'amount', width: 15 },
  { header: 'Пользователь (ID)', key: 'telegram_id', width: 20 },
  { header: 'Бот', key: 'bot_name', width: 25 },
  { header: 'Описание', key: 'description', width: 40 },
  { header: 'Дата', key: 'date', width: 20 },
  { header: 'Время', key: 'time', width: 12 },
  { header: 'Полная дата', key: 'created_at', width: 25 }
];

// Стиль заголовков
worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
worksheet.getRow(1).fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF366092' }
};
worksheet.getRow(1).alignment = { horizontal: 'center' };

// Заполняем данные
uniqueTransactions.forEach((tx, index) => {
  const amount = Math.abs(parseFloat(tx.amount) || 0);
  const date = new Date(tx.created_at);

  const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;
  const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

  worksheet.addRow({
    number: index + 1,
    amount: amount,
    telegram_id: tx.telegram_id,
    bot_name: tx.bot_name,
    description: tx.description,
    date: dateStr,
    time: timeStr,
    created_at: tx.created_at
  });
});

// Форматирование
worksheet.eachRow((row, rowNumber) => {
  if (rowNumber === 1) return; // пропускаем заголовок

  // Чередующиеся цвета строк
  if (rowNumber % 2 === 0) {
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF2F2F2' }
    };
  }

  // Цвет по сумме
  const amountCell = row.getCell(2);
  const amount = amountCell.value;
  if (amount >= 5000) {
    amountCell.font = { bold: true, color: { argb: 'FF0066CC' } };
  } else if (amount >= 2000) {
    amountCell.font = { color: { argb: 'FF008800' } };
  } else if (amount >= 1000) {
    amountCell.font = { color: { argb: 'FF996633' } };
  }
});

// Замораживаем первую строку
worksheet.views = [
  { state: 'frozen', ySplit: 1 }
];

// Добавляем лист со статистикой
const statsSheet = workbook.addWorksheet('Статистика');

// Заголовок статистики
statsSheet.getCell('A1').value = 'СТАТИСТИКА ПО ТРАНЗАКЦИЯМ';
statsSheet.getCell('A1').font = { bold: true, size: 16 };
statsSheet.mergeCells('A1:D1');

statsSheet.getCell('A3').value = 'Общее количество:';
statsSheet.getCell('B3').value = uniqueTransactions.length;

statsSheet.getCell('A4').value = 'Общая сумма:';
statsSheet.getCell('B4').value = Math.round(uniqueTransactions.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0));
statsSheet.getCell('C4').value = '₽';

statsSheet.getCell('A6').value = 'ТОП-10 СУММ:';
statsSheet.getCell('A6').font = { bold: true };

uniqueTransactions.slice(0, 10).forEach((tx, index) => {
  const row = index + 7;
  statsSheet.getCell(`A${row}`).value = `${index + 1}.`;
  statsSheet.getCell(`B${row}`).value = Math.abs(parseFloat(tx.amount) || 0);
  statsSheet.getCell(`C${row}`).value = '₽';
  statsSheet.getCell(`D${row}`).value = `${tx.bot_name} | ${tx.description}`;
});

// Группировка по ботам
statsSheet.getCell('A18').value = 'ГРУППИРОВКА ПО БОТАМ:';
statsSheet.getCell('A18').font = { bold: true };

const byBot = {};
uniqueTransactions.forEach(tx => {
  const bot = tx.bot_name;
  if (!byBot[bot]) {
    byBot[bot] = { count: 0, total: 0 };
  }
  byBot[bot].count++;
  byBot[bot].total += Math.abs(parseFloat(tx.amount) || 0);
});

const sortedBots = Object.entries(byBot)
  .map(([bot, stats]) => ({ bot, ...stats }))
  .sort((a, b) => b.total - a.total);

sortedBots.forEach((botData, index) => {
  const row = index + 20;
  statsSheet.getCell(`A${row}`).value = botData.bot;
  statsSheet.getCell(`B${row}`).value = botData.count;
  statsSheet.getCell(`C${row}`).value = Math.round(botData.total);
  statsSheet.getCell(`D${row}`).value = '₽';
});

// Группировка по месяцам
statsSheet.getCell('A35').value = 'ГРУППИРОВКА ПО МЕСЯЦАМ:';
statsSheet.getCell('A35').font = { bold: true };

const byMonth = {};
uniqueTransactions.forEach(tx => {
  const date = new Date(tx.created_at);
  const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  const monthName = date.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' });

  if (!byMonth[monthKey]) {
    byMonth[monthKey] = { name: monthName, count: 0, total: 0 };
  }
  byMonth[monthKey].count++;
  byMonth[monthKey].total += Math.abs(parseFloat(tx.amount) || 0);
});

const sortedMonths = Object.entries(byMonth)
  .map(([key, data]) => ({ key, ...data }))
  .sort((a, b) => a.key.localeCompare(b.key));

sortedMonths.forEach((monthData, index) => {
  const row = index + 37;
  statsSheet.getCell(`A${row}`).value = monthData.name;
  statsSheet.getCell(`B${row}`).value = monthData.count;
  statsSheet.getCell(`C${row}`).value = Math.round(monthData.total);
  statsSheet.getCell(`D${row}`).value = '₽';
});

// Сохраняем файл
const filename = 'ALL_ROBOKASSA_TRANSACTIONS_2025.xlsx';
workbook.xlsx.writeFile(filename)
  .then(() => {
    console.log(`✅ Excel файл создан: ${filename}`);
    console.log(`\n📊 ИНФОРМАЦИЯ:`);
    console.log(`   Всего транзакций: ${uniqueTransactions.length}`);
    console.log(`   Общая сумма: ${Math.round(uniqueTransactions.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0)).toLocaleString()}₽`);

    console.log(`\n🎯 ТОП-10 ТРАНЗАКЦИЙ:`);
    uniqueTransactions.slice(0, 10).forEach((tx, i) => {
      const amount = Math.abs(parseFloat(tx.amount) || 0);
      const date = new Date(tx.created_at);
      const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;
      console.log(`   ${i + 1}. ${amount.toLocaleString()}₽ | ${dateStr} | ${tx.bot_name}`);
    });

    console.log(`\n📈 СТАТИСТИКА ПО БОТАМ:`);
    sortedBots.slice(0, 5).forEach(botData => {
      console.log(`   ${botData.bot}: ${botData.count} транз., ${Math.round(botData.total).toLocaleString()}₽`);
    });

    console.log(`\n📅 СТАТИСТИКА ПО МЕСЯЦАМ:`);
    sortedMonths.forEach(monthData => {
      console.log(`   ${monthData.name}: ${monthData.count} транз., ${Math.round(monthData.total).toLocaleString()}₽`);
    });

    console.log(`\n💡 ЛИСТЫ В EXCEL:`);
    console.log(`   1. 'Все транзакции Robokassa' - полный список с фильтрацией`);
    console.log(`   2. 'Статистика' - агрегированные данные по ботам и месяцам`);
  })
  .catch(error => {
    console.error('❌ Ошибка создания файла:', error);
  });
