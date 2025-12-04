/**
 * ПРОВЕРЯЕМ СТАТУСЫ ТРАНЗАКЦИЙ ROBOKASSA
 * Которых нет в CSV - значит они НЕ ПРОШЛИ!
 */

const fs = require('fs');

console.log('🔍 ПРОВЕРКА СТАТУСОВ ROBOKASSA ТРАНЗАКЦИЙ');
console.log('='.repeat(80));

const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

const bots = require('./scripts/constants/bots.js');
const FAKE_BOTS = bots.FAKE_BOTS;

// Фильтруем как в тестах
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

  // НЕ ИСКЛЮЧАЕМ по статусу - проверим все!
  // if (row.status && row.status !== 'COMPLETED') return false;

  if (row.is_test === true) return false;

  const amount = parseFloat(row.amount) || 0;
  // RUB не ограничиваем по сумме - там могут быть реальные крупные платежи!
  // if (Math.abs(amount) > 5000) return false;

  return true;
});

// Удаляем дубликаты
const seen = new Set();
const robokassaTransactions = [];

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
    robokassaTransactions.push(row);
  }
});

console.log(`Всего Robokassa транзакций в БД: ${robokassaTransactions.length}\n`);

// Загружаем CSV для сравнения
const { exec } = require('child_process');
exec('iconv -f WINDOWS-1251 -t UTF-8 "/Users/playra/999-multibots-telegraf/Spisok operacij s 30.01.2025 po 30.11.2025.csv" | tail -n +2', (error, stdout) => {
  if (error) {
    console.error('Ошибка чтения CSV:', error);
    return;
  }

  const csvLines = stdout.split('\n').filter(line => line.trim());

  const csvTransactions = [];
  csvLines.forEach((line) => {
    const columns = line.split(';');

    if (columns.length >= 4) {
      const amountStr = columns[3];
      const amountMatch = amountStr.match(/([\d,\.]+)\s*RUR/);
      if (amountMatch) {
        const amount = parseFloat(amountMatch[1].replace(',', '.'));
        csvTransactions.push({
          amount: amount,
          date: columns[4],
          email: columns[5],
          description: columns[6],
          line: line
        });
      }
    }
  });

  // Находим транзакции НЕ в CSV
  const notInCsv = [];

  robokassaTransactions.forEach((tx) => {
    const txAmount = Math.abs(parseFloat(tx.amount) || 0);
    const txDate = new Date(tx.created_at);
    const txDateStr = `${txDate.getDate().toString().padStart(2, '0')}.${(txDate.getMonth() + 1).toString().padStart(2, '0')}.${txDate.getFullYear()}`;

    // Ищем в CSV
    const foundInCsv = csvTransactions.find(csvTx => {
      const csvAmountMatch = csvTx.date.match(/(\d{2})\.(\d{2})\.(\d{4})/);
      if (!csvAmountMatch) return false;

      const csvDateStr = `${csvAmountMatch[1]}.${csvAmountMatch[2]}.${csvAmountMatch[3]}`;
      const amountDiff = Math.abs(csvTx.amount - txAmount);

      return amountDiff < 1 && txDateStr === csvDateStr;
    });

    if (!foundInCsv) {
      notInCsv.push(tx);
    }
  });

  console.log(`Транзакций НЕ в CSV: ${notInCsv.length}\n`);

  // Анализируем статусы
  console.log('📊 АНАЛИЗ ПО СТАТУСАМ:');
  console.log('-'.repeat(80));

  const byStatus = {};
  notInCsv.forEach(tx => {
    const status = tx.status || 'UNKNOWN';

    if (!byStatus[status]) {
      byStatus[status] = {
        count: 0,
        total: 0,
        transactions: []
      };
    }

    byStatus[status].count++;
    byStatus[status].total += Math.abs(parseFloat(tx.amount) || 0);
    byStatus[status].transactions.push(tx);
  });

  Object.entries(byStatus)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([status, stats]) => {
      console.log(`\n${status}:`);
      console.log(`   Количество: ${stats.count}`);
      console.log(`   Сумма: ${Math.round(stats.total).toLocaleString()}₽`);

      if (status === 'COMPLETED') {
        console.log(`   ✅ УСПЕШНЫЕ - НО НЕТ В CSV! Странно...`);
      } else if (status === 'FAILED' || status === 'CANCELLED' || status === 'ERROR') {
        console.log(`   ❌ НЕ УСПЕШНЫЕ - понятно, почему нет в CSV`);
      } else if (!status || status === 'UNKNOWN') {
        console.log(`   ⚠️ НЕИЗВЕСТНЫЙ СТАТУС`);
      }
    });

  // Показываем детали по каждому статусу
  console.log('\n' + '='.repeat(80));
  console.log('🔍 ДЕТАЛИ ПО СТАТУСАМ:');
  console.log('='.repeat(80));

  Object.entries(byStatus).forEach(([status, stats]) => {
    console.log(`\n📋 ${status} (${stats.count} транз., ${Math.round(stats.total).toLocaleString()}₽):`);
    console.log('-'.repeat(80));

    stats.transactions
      .sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0))
      .slice(0, 10) // топ-10 для примера
      .forEach((tx, i) => {
        const amount = Math.abs(parseFloat(tx.amount) || 0);
        const date = new Date(tx.created_at);
        const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

        console.log(`\n${i + 1}. ${amount.toLocaleString()}₽ | ${dateStr}`);
        console.log(`   User: ${tx.telegram_id} | Bot: ${tx.bot_name}`);
        console.log(`   Desc: ${tx.description}`);
        console.log(`   Status: ${tx.status || 'UNKNOWN'}`);
      });

    if (stats.transactions.length > 10) {
      console.log(`\n   ... и еще ${stats.transactions.length - 10} транзакций`);
    }
  });

  // ИТОГ
  console.log('\n' + '='.repeat(80));
  console.log('💡 ВЫВОДЫ:');
  console.log('='.repeat(80));

  const completedNotInCsv = byStatus['COMPLETED']?.count || 0;
  const completedSum = byStatus['COMPLETED']?.total || 0;

  if (completedNotInCsv > 0) {
    console.log(`⚠️ НАЙДЕНО ${completedNotInCsv} УСПЕШНЫХ транзакций НЕ в CSV!`);
    console.log(`   Это странно - успешные платежи должны быть в выгрузке Robokassa`);
    console.log(`   Сумма: ${Math.round(completedSum).toLocaleString()}₽`);
  }

  const failedCount = (byStatus['FAILED']?.count || 0) + (byStatus['CANCELLED']?.count || 0) + (byStatus['ERROR']?.count || 0);
  const failedSum = (byStatus['FAILED']?.total || 0) + (byStatus['CANCELLED']?.total || 0) + (byStatus['ERROR']?.total || 0);

  if (failedCount > 0) {
    console.log(`\n✅ ОБЪЯСНЕНО: ${failedCount} неуспешных транзакций`);
    console.log(`   Понятно, почему их нет в CSV - они не прошли!`);
    console.log(`   Сумма: ${Math.round(failedSum).toLocaleString()}₽`);
  }

  const unknownCount = byStatus['UNKNOWN']?.count || 0;
  const unknownSum = byStatus['UNKNOWN']?.total || 0;

  if (unknownCount > 0) {
    console.log(`\n❓ ${unknownCount} транзакций с неизвестным статусом`);
    console.log(`   Сумма: ${Math.round(unknownSum).toLocaleString()}₽`);
  }

  console.log('\n🎯 ИТОГОВЫЙ ВЫВОД:');
  const totalNotInCsv = notInCsv.length;
  const totalSum = notInCsv.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);

  console.log(`   Транзакций НЕ в CSV: ${totalNotInCsv}`);
  console.log(`   Сумма: ${Math.round(totalSum).toLocaleString()}₽`);

  if (completedNotInCsv === 0 && failedCount + unknownCount === totalNotInCsv) {
    console.log(`\n✅ ВСЕ ПОНЯТНО! Неуспешные транзакции правильно отсутствуют в CSV!`);
  } else if (completedNotInCsv > 0) {
    console.log(`\n⚠️ НУЖНО РАЗОБРАТЬСЯ! Успешные транзакции должны быть в CSV!`);
  }
});
