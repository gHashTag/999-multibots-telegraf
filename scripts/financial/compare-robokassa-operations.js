/**
 * СРАВНЕНИЕ ОПЕРАЦИЙ: CSV ROBOKASSA vs БД
 * Найдем что не совпадает
 */

const fs = require('fs');
const { exec } = require('child_process');

console.log('🔍 СРАВНЕНИЕ ОПЕРАЦИЙ: CSV vs БД');
console.log('='.repeat(80));

// 1. Загружаем данные из БД
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
const dbTransactions = [];

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
    dbTransactions.push(row);
  }
});

console.log(`Транзакций в БД (Robokassa): ${dbTransactions.length}`);

// 2. Загружаем CSV через конвертацию
exec('iconv -f WINDOWS-1251 -t UTF-8 "/Users/playra/999-multibots-telegraf/Spisok operacij s 30.01.2025 po 30.11.2025.csv" | tail -n +2', (error, stdout) => {
  if (error) {
    console.error('Ошибка чтения CSV:', error);
    return;
  }

  const csvLines = stdout.split('\n').filter(line => line.trim());

  console.log(`Транзакций в CSV: ${csvLines.length}\n`);

  // Парсим CSV
  const csvTransactions = [];
  csvLines.forEach((line, index) => {
    const columns = line.split(';');

    if (columns.length >= 4) {
      const orderNum = columns[1];
      const method = columns[2];
      const amountStr = columns[3]; // 2999,00 RUR
      const dateStr = columns[4];
      const email = columns[5];
      const description = columns[6];

      // Извлекаем сумму
      const amountMatch = amountStr.match(/([\d,\.]+)\s*RUR/);
      if (amountMatch) {
        const amount = parseFloat(amountMatch[1].replace(',', '.'));

        csvTransactions.push({
          orderNum: orderNum,
          amount: amount,
          date: dateStr,
          email: email,
          description: description,
          lineNum: index + 2
        });
      }
    }
  });

  console.log(`Успешно распарсено из CSV: ${csvTransactions.length}\n`);

  // 3. Сравниваем
  console.log('🔍 ПОИСК СОВПАДАЮЩИХ ТРАНЗАКЦИЙ...');

  const matched = [];
  const unmatchedInDb = [...dbTransactions];
  const unmatchedInCsv = [...csvTransactions];

  // Ищем совпадения по сумме и дате (с небольшой погрешностью)
  dbTransactions.forEach(dbTx => {
    const dbAmount = Math.abs(parseFloat(dbTx.amount) || 0);
    const dbDate = new Date(dbTx.created_at).toISOString().split('T')[0];

    let found = false;
    for (let i = 0; i < unmatchedInCsv.length; i++) {
      const csvTx = unmatchedInCsv[i];

      // Сравниваем сумму (с точностью до копейки)
      const csvAmount = Math.abs(parseFloat(csvTx.amount) || 0);
      const amountDiff = Math.abs(dbAmount - csvAmount);

      // Сравниваем дату
      const csvDateMatch = csvTx.date.match(/(\d{2})\.(\d{2})\.(\d{4})/);
      let csvDate = null;
      if (csvDateMatch) {
        csvDate = `${csvDateMatch[3]}-${csvDateMatch[2]}-${csvDateMatch[1]}`;
      }

      // Если сумма совпадает (с погрешностью 1₽) и дата совпадает
      if (amountDiff < 1 && dbDate === csvDate) {
        matched.push({
          db: dbTx,
          csv: csvTx,
          amountDiff: amountDiff
        });
        unmatchedInDb.splice(unmatchedInDb.indexOf(dbTx), 1);
        unmatchedInCsv.splice(i, 1);
        found = true;
        break;
      }
    }
  });

  console.log(`Найдено совпадений: ${matched.length}`);
  console.log(`Не найдено в CSV: ${unmatchedInDb.length}`);
  console.log(`Не найдено в БД: ${unmatchedInCsv.length}\n`);

  // 4. Показываем несовпадения
  console.log('='.repeat(80));
  console.log('❌ ТРАНЗАКЦИИ В БД, НЕ НАЙДЕННЫЕ В CSV:');
  console.log('='.repeat(80));

  if (unmatchedInDb.length > 0) {
    unmatchedInDb
      .sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0))
      .forEach((tx, i) => {
        const amount = Math.abs(parseFloat(tx.amount) || 0);
        const date = new Date(tx.created_at).toISOString().split('T')[0];
        console.log(`\n${i + 1}. ${amount.toLocaleString()}₽ | ${date} | ${tx.bot_name}`);
        console.log(`   Order: ${tx.telegram_id}`);
        console.log(`   Desc: ${tx.description?.substring(0, 70)}`);
      });
  } else {
    console.log('✅ Все транзакции из БД найдены в CSV!\n');
  }

  console.log('\n' + '='.repeat(80));
  console.log('❓ ТРАНЗАКЦИИ В CSV, НЕ НАЙДЕННЫЕ В БД:');
  console.log('='.repeat(80));

  if (unmatchedInCsv.length > 0) {
    unmatchedInCsv
      .sort((a, b) => b.amount - a.amount)
      .forEach((tx, i) => {
        console.log(`\n${i + 1}. ${tx.amount.toLocaleString()}₽ | ${tx.date} | ${tx.email}`);
        console.log(`   Order: ${tx.orderNum}`);
        console.log(`   Desc: ${tx.description?.substring(0, 70)}`);
      });
  } else {
    console.log('✅ Все транзакции из CSV найдены в БД!\n');
  }

  // 5. Статистика
  console.log('\n' + '='.repeat(80));
  console.log('📊 СТАТИСТИКА СОВПАДЕНИЙ:');
  console.log('='.repeat(80));

  const matchedSumDb = matched.reduce((sum, pair) => sum + Math.abs(parseFloat(pair.db.amount) || 0), 0);
  const matchedSumCsv = matched.reduce((sum, pair) => sum + pair.csv.amount, 0);
  const unmatchedSumDb = unmatchedInDb.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);
  const unmatchedSumCsv = unmatchedInCsv.reduce((sum, tx) => sum + tx.amount, 0);

  console.log(`Совпадающие:`);
  console.log(`   БД: ${matched.length} транз., ${Math.round(matchedSumDb).toLocaleString()}₽`);
  console.log(`   CSV: ${matched.length} транз., ${Math.round(matchedSumCsv).toLocaleString()}₽`);
  console.log(`\nНе найденные в CSV:`);
  console.log(`   БД: ${unmatchedInDb.length} транз., ${Math.round(unmatchedSumDb).toLocaleString()}₽`);
  console.log(`\nНе найденные в БД:`);
  console.log(`   CSV: ${unmatchedInCsv.length} транз., ${Math.round(unmatchedSumCsv).toLocaleString()}₽`);

  console.log('\n' + '='.repeat(80));
  console.log('✅ ИТОГ:');
  console.log(`   В БД всего: ${dbTransactions.length} транз., ${Math.round(dbTransactions.reduce((s, tx) => s + Math.abs(parseFloat(tx.amount) || 0), 0)).toLocaleString()}₽`);
  console.log(`   В CSV всего: ${csvTransactions.length} транз., ${Math.round(csvTransactions.reduce((s, tx) => s + tx.amount, 0)).toLocaleString()}₽`);
  console.log(`   Совпало: ${matched.length} транз., ${Math.round(matchedSumDb).toLocaleString()}₽`);
  console.log(`   Почему не совпадает: CSV неполная выгрузка или разные периоды!`);
});
