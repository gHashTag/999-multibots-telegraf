/**
 * ДЕТАЛЬНОЕ СРАВНЕНИЕ: берем конкретные примеры из БД и проверяем в CSV
 */

const fs = require('fs');
const { exec } = require('child_process');

console.log('🔍 ДЕТАЛЬНАЯ ПРОВЕРКА КОНКРЕТНЫХ ТРАНЗАКЦИЙ');
console.log('='.repeat(80));

// Берем топ-10 транзакций из БД с методом Robokassa
const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

const bots = require('./scripts/constants/bots.js');
const FAKE_BOTS = bots.FAKE_BOTS;

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

  if (row.status && row.status !== 'COMPLETED') return false;
  if (row.is_test === true) return false;

  const amount = parseFloat(row.amount) || 0;
  if (Math.abs(amount) > 5000) return false;

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

console.log(`Транзакций Robokassa в БД: ${robokassaTransactions.length}\n`);

// Берем топ-20 по сумме
const topTransactions = robokassaTransactions
  .sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0))
  .slice(0, 20);

console.log('ТОП-20 ТРАНЗАКЦИЙ ИЗ БД ДЛЯ ПРОВЕРКИ:');
console.log('-'.repeat(80));

topTransactions.forEach((tx, i) => {
  const amount = Math.abs(parseFloat(tx.amount) || 0);
  const date = new Date(tx.created_at);
  const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

  console.log(`\n${i + 1}. ${amount.toLocaleString()}₽ | ${dateStr} | ${tx.bot_name}`);
  console.log(`   User: ${tx.telegram_id}`);
  console.log(`   Desc: ${tx.description}`);
});

// Теперь ищем их в CSV
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

  console.log('\n' + '='.repeat(80));
  console.log('🔍 ПОИСК ЭТИХ ТРАНЗАКЦИЙ В CSV:');
  console.log('='.repeat(80));

  let found = 0;
  let notFound = 0;

  topTransactions.forEach((tx) => {
    const txAmount = Math.abs(parseFloat(tx.amount) || 0);
    const txDate = new Date(tx.created_at);
    const txDateStr = `${txDate.getDate().toString().padStart(2, '0')}.${(txDate.getMonth() + 1).toString().padStart(2, '0')}.${txDate.getFullYear()}`;

    // Ищем в CSV по сумме и дате
    const foundInCsv = csvTransactions.find(csvTx => {
      const csvAmountMatch = csvTx.date.match(/(\d{2})\.(\d{2})\.(\d{4})/);
      if (!csvAmountMatch) return false;

      const csvDateStr = `${csvAmountMatch[1]}.${csvAmountMatch[2]}.${csvAmountMatch[3]}`;
      const amountDiff = Math.abs(csvTx.amount - txAmount);

      return amountDiff < 1 && txDateStr === csvDateStr;
    });

    if (foundInCsv) {
      found++;
      console.log(`\n✅ НАЙДЕН: ${txAmount.toLocaleString()}₽ | ${txDateStr}`);
      console.log(`   CSV: ${foundInCsv.email}`);
    } else {
      notFound++;
      console.log(`\n❌ НЕ НАЙДЕН: ${txAmount.toLocaleString()}₽ | ${txDateStr} | ${tx.bot_name}`);
      console.log(`   Desc: ${tx.description}`);
    }
  });

  console.log('\n' + '='.repeat(80));
  console.log('📊 РЕЗУЛЬТАТЫ ПОИСКА:');
  console.log('='.repeat(80));
  console.log(`Из топ-20:`);
  console.log(`   Найдено в CSV: ${found}`);
  console.log(`   НЕ найдено в CSV: ${notFound}`);

  if (notFound > 0) {
    console.log(`\n⚠️ ПРОБЛЕМА: ${notFound} крупных транзакций из БД отсутствуют в CSV!`);
    console.log(`   Это означает, что CSV неполный!`);
  }
});
