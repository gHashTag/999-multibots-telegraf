/**
 * АНАЛИЗ: какие описания НЕ попадают в CSV
 */

const fs = require('fs');
const { exec } = require('child_process');

console.log('🔍 КАКИЕ ОПИСАНИЯ НЕ ПОПАДАЮТ В CSV');
console.log('='.repeat(80));

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

// Группируем по описанию
const byDescription = {};
robokassaTransactions.forEach(tx => {
  const desc = tx.description || 'UNKNOWN';

  if (!byDescription[desc]) {
    byDescription[desc] = {
      count: 0,
      total: 0,
      sample: tx
    };
  }

  byDescription[desc].count++;
  byDescription[desc].total += Math.abs(parseFloat(tx.amount) || 0);
});

console.log(`Всего транзакций Robokassa в БД: ${robokassaTransactions.length}\n`);

// Сортируем по сумме
const descriptionsArray = Object.entries(byDescription)
  .map(([desc, stats]) => ({ desc, ...stats }))
  .sort((a, b) => b.total - a.total);

console.log('📝 ОПИСАНИЯ В БД (по убыванию суммы):');
console.log('-'.repeat(80));

descriptionsArray.forEach((item, i) => {
  console.log(`\n${i + 1}. "${item.desc}"`);
  console.log(`   Транзакций: ${item.count}`);
  console.log(`   Сумма: ${Math.round(item.total).toLocaleString()}₽`);
});

// Теперь ищем в CSV какие из этих описаний есть
exec('iconv -f WINDOWS-1251 -t UTF-8 "/Users/playra/999-multibots-telegraf/Spisok operacij s 30.01.2025 po 30.11.2025.csv" | tail -n +2', (error, stdout) => {
  if (error) {
    console.error('Ошибка чтения CSV:', error);
    return;
  }

  const csvLines = stdout.split('\n').filter(line => line.trim());

  const csvDescriptions = new Set();
  csvLines.forEach((line) => {
    const columns = line.split(';');
    if (columns.length >= 7) {
      const desc = columns[6]; // Описание в CSV
      if (desc && desc.trim()) {
        csvDescriptions.add(desc.trim());
      }
    }
  });

  console.log('\n' + '='.repeat(80));
  console.log('🔍 КАКИЕ ОПИСАНИЯ ЕСТЬ В CSV:');
  console.log('='.repeat(80));

  let foundInCsv = 0;
  let notFoundInCsv = 0;
  let foundSum = 0;
  let notFoundSum = 0;

  descriptionsArray.forEach((item) => {
    // Проверяем есть ли это описание или похожее в CSV
    const found = Array.from(csvDescriptions).some(csvDesc => {
      const similarity = calculateSimilarity(item.desc.toLowerCase(), csvDesc.toLowerCase());
      return similarity > 0.5; // 50% похожесть
    });

    if (found) {
      foundInCsv++;
      foundSum += item.total;
      console.log(`\n✅ В CSV: "${item.desc}"`);
      console.log(`   ${item.count} транз., ${Math.round(item.total).toLocaleString()}₽`);
    } else {
      notFoundInCsv++;
      notFoundSum += item.total;
      console.log(`\n❌ НЕТ В CSV: "${item.desc}"`);
      console.log(`   ${item.count} транз., ${Math.round(item.total).toLocaleString()}₽`);
    }
  });

  console.log('\n' + '='.repeat(80));
  console.log('📊 ИТОГИ:');
  console.log('='.repeat(80));
  console.log(`Описания в БД: ${descriptionsArray.length}`);
  console.log(`Найдено в CSV: ${foundInCsv} (${Math.round(foundSum).toLocaleString()}₽)`);
  console.log(`НЕ найдено в CSV: ${notFoundInCsv} (${Math.round(notFoundSum).toLocaleString()}₽)`);
  console.log(`\nCSV покрывает: ${Math.round(foundSum / (foundSum + notFoundSum) * 100)}% от суммы!`);
});

function calculateSimilarity(str1, str2) {
  // Простая функция похожести - количество общих слов
  const words1 = str1.split(/\s+/);
  const words2 = str2.split(/\s+/);

  let commonWords = 0;
  words1.forEach(word => {
    if (words2.includes(word)) {
      commonWords++;
    }
  });

  const maxWords = Math.max(words1.length, words2.length);
  return maxWords > 0 ? commonWords / maxWords : 0;
}
