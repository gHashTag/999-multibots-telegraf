/**
 * ПРОВЕРЯЕМ ТОЛЬКО ТРАНЗАКЦИИ СО СТАТУСОМ COMPLETED
 * Сколько их и все ли они в CSV?
 */

const fs = require('fs');

console.log('🔍 АНАЛИЗ ТОЛЬКО УСПЕШНЫХ ТРАНЗАКЦИЙ (COMPLETED)');
console.log('='.repeat(80));

const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

const bots = require('./scripts/constants/bots.js');
const FAKE_BOTS = bots.FAKE_BOTS;

// Фильтруем как в тестах
const filtered = data.filter(row => {
  if (row.currency !== 'RUB') return false;
  if (row.type !== 'MONEY_INCOME') return false;
  if (row.payment_method !== 'Robokassa') return false;
  if (row.status !== 'COMPLETED') return false; // ВАЖНО: только COMPLETED!

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

  const amount = parseFloat(row.amount) || 0;
  // RUB не ограничиваем по сумме

  return true;
});

// Удаляем дубликаты
const seen = new Set();
const completedTransactions = [];

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
    completedTransactions.push(row);
  }
});

console.log(`✅ Успешных Robokassa транзакций (COMPLETED) в БД: ${completedTransactions.length}\n`);

// Показываем их
console.log('📊 ТОП-30 УСПЕШНЫХ ТРАНЗАКЦИЙ:');
console.log('-'.repeat(80));

completedTransactions
  .sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0))
  .slice(0, 30)
  .forEach((tx, i) => {
    const amount = Math.abs(parseFloat(tx.amount) || 0);
    const date = new Date(tx.created_at);
    const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

    console.log(`\n${i + 1}. ${amount.toLocaleString()}₽ | ${dateStr}`);
    console.log(`   User: ${tx.telegram_id} | Bot: ${tx.bot_name}`);
    console.log(`   Desc: ${tx.description}`);
  });

const totalCompletedSum = completedTransactions.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);
console.log(`\n${'='.repeat(80)}`);
console.log(`💰 ОБЩАЯ СУММА УСПЕШНЫХ ТРАНЗАКЦИЙ: ${Math.round(totalCompletedSum).toLocaleString()}₽`);
console.log(`${'='.repeat(80)}\n`);

// Теперь проверим - сколько из этих есть в CSV?
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

  console.log(`🔍 ПРОВЕРЯЕМ - СКОЛЬКО УСПЕШНЫХ ТРАНЗАКЦИЙ ЕСТЬ В CSV:`);
  console.log('-'.repeat(80));

  let foundInCsv = 0;
  let notFoundInCsv = 0;

  completedTransactions.forEach((tx) => {
    const txAmount = Math.abs(parseFloat(tx.amount) || 0);
    const txDate = new Date(tx.created_at);
    const txDateStr = `${txDate.getDate().toString().padStart(2, '0')}.${(txDate.getMonth() + 1).toString().padStart(2, '0')}.${txDate.getFullYear()}`;

    // Ищем в CSV
    const foundInCsvFlag = csvTransactions.find(csvTx => {
      const csvAmountMatch = csvTx.date.match(/(\d{2})\.(\d{2})\.(\d{4})/);
      if (!csvAmountMatch) return false;

      const csvDateStr = `${csvAmountMatch[1]}.${csvAmountMatch[2]}.${csvAmountMatch[3]}`;
      const amountDiff = Math.abs(csvTx.amount - txAmount);

      return amountDiff < 1 && txDateStr === csvDateStr;
    });

    if (foundInCsvFlag) {
      foundInCsv++;
    } else {
      notFoundInCsv++;
    }
  });

  const foundSum = completedTransactions
    .filter((tx, idx) => {
      const txAmount = Math.abs(parseFloat(tx.amount) || 0);
      const txDate = new Date(tx.created_at);
      const txDateStr = `${txDate.getDate().toString().padStart(2, '0')}.${(txDate.getMonth() + 1).toString().padStart(2, '0')}.${txDate.getFullYear()}`;

      return csvTransactions.find(csvTx => {
        const csvAmountMatch = csvTx.date.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        if (!csvAmountMatch) return false;

        const csvDateStr = `${csvAmountMatch[1]}.${csvAmountMatch[2]}.${csvAmountMatch[3]}`;
        const amountDiff = Math.abs(csvTx.amount - txAmount);

        return amountDiff < 1 && txDateStr === csvDateStr;
      });
    })
    .reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);

  const notFoundSum = totalCompletedSum - foundSum;

  console.log(`\n📊 РЕЗУЛЬТАТЫ СРАВНЕНИЯ УСПЕШНЫХ ТРАНЗАКЦИЙ:`);
  console.log(`   В БД (COMPLETED): ${completedTransactions.length} транз., ${Math.round(totalCompletedSum).toLocaleString()}₽`);
  console.log(`   Найдено в CSV: ${foundInCsv} транз., ${Math.round(foundSum).toLocaleString()}₽`);
  console.log(`   НЕ найдено в CSV: ${notFoundInCsv} транз., ${Math.round(notFoundSum).toLocaleString()}₽`);

  const coverage = Math.round((foundSum / totalCompletedSum) * 100);
  console.log(`\n🎯 ПОКРЫТИЕ CSV: ${coverage}%`);

  if (coverage === 100) {
    console.log(`\n✅ ОТЛИЧНО! Все успешные транзакции есть в CSV!`);
  } else if (coverage >= 90) {
    console.log(`\n✅ ХОРОШО! Почти все успешные транзакции есть в CSV!`);
  } else if (coverage >= 50) {
    console.log(`\n⚠️ НОРМАЛЬНО. Часть успешных транзакций есть в CSV.`);
  } else {
    console.log(`\n❌ ПРОБЛЕМА! Множество успешных транзакций отсутствует в CSV!`);
  }

  console.log(`\n💡 ВЫВОД:`);
  console.log(`   В базе ${completedTransactions.length} успешных транзакций на ${Math.round(totalCompletedSum).toLocaleString()}₽`);
  console.log(`   Из них ${foundInCsv} (${Math.round(foundSum).toLocaleString()}₽) подтверждены в CSV`);
  if (notFoundInCsv > 0) {
    console.log(`   И ${notFoundInCsv} (${Math.round(notFoundSum).toLocaleString()}₽) НЕ найдены в CSV`);
    console.log(`   Это может означать:`);
    console.log(`   1. CSV неполный (выгружен не весь период)`);
    console.log(`   2. Транзакции прошли после выгрузки CSV`);
    console.log(`   3. Проблема в сопоставлении данных`);
  }
});
