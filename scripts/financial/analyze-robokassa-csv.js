/**
 * АНАЛИЗ CSV ФАЙЛА ROBOKASSA
 * Сравнение с данными из БД
 */

const fs = require('fs');

console.log('📊 АНАЛИЗ CSV ФАЙЛА ROBOKASSA');
console.log('='.repeat(80));

const csvContent = fs.readFileSync('/Users/playra/999-multibots-telegraf/Spisok operacij s 30.01.2025 po 30.11.2025.csv', 'utf-8');

// Разбиваем на строки
const lines = csvContent.split('\n').filter(line => line.trim());

console.log(`Всего строк в CSV: ${lines.length}\n`);

// Пропускаем заголовок
const dataLines = lines.slice(1);

console.log(`Транзакций в CSV: ${dataLines.length}\n`);

// Парсим каждую строку (разделитель - точка с запятой)
const transactions = [];

dataLines.forEach((line, index) => {
  const columns = line.split(';');

  if (columns.length >= 4) {
    const dateRange = columns[3]; // Дата операции
    const amountStr = columns[4]; // Сумма (например: 2999,00 RUR)

    // Извлекаем сумму из строки типа "2999,00 RUR"
    const amountMatch = amountStr.match(/([\d,\.]+)\s*RUR/);
    if (amountMatch) {
      const amount = parseFloat(amountMatch[1].replace(',', '.'));
      transactions.push({
        lineNum: index + 2,
        amount: amount,
        rawLine: line.substring(0, 100) // Первые 100 символов строки
      });
    }
  }
});

console.log(`Успешно распарсено: ${transactions.length} транзакций\n`);

// Подсчитываем общую сумму
const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);

console.log('💰 ИТОГО В CSV ROBOKASSA:');
console.log(`   Сумма: ${Math.round(totalAmount).toLocaleString()}₽`);
console.log(`   Транзакций: ${transactions.length}\n`);

// ТОП-10 самых крупных транзакций
console.log('🔟 ТОП-10 КРУПНЕЙШИХ ТРАНЗАКЦИЙ В CSV:');
console.log('-'.repeat(80));

transactions
  .sort((a, b) => b.amount - a.amount)
  .slice(0, 10)
  .forEach((t, i) => {
    console.log(`${i + 1}. ${t.amount.toLocaleString()}₽`);
    console.log(`   Строка: ${t.lineNum}\n`);
  });

// Подсчет по размерам
const byAmount = {};
transactions.forEach(t => {
  const rounded = Math.round(t.amount);
  if (!byAmount[rounded]) {
    byAmount[rounded] = { count: 0, total: 0 };
  }
  byAmount[rounded].count++;
  byAmount[rounded].total += t.amount;
});

console.log('📊 СТАТИСТИКА ПО РАЗМЕРАМ ПЛАТЕЖЕЙ:');
console.log('-'.repeat(80));

Object.entries(byAmount)
  .map(([amount, stats]) => ({ amount: parseInt(amount), ...stats }))
  .sort((a, b) => b.amount - a.amount)
  .forEach(item => {
    console.log(`${item.amount.toLocaleString()}₽: ${item.count} платежей, итого ${Math.round(item.total).toLocaleString()}₽`);
  });

console.log('\n' + '='.repeat(80));
console.log('✅ СРАВНЕНИЕ С БД:');
console.log(`   CSV Robokassa: ${Math.round(totalAmount).toLocaleString()}₽`);
console.log(`   payments_data.json (после фильтров): 296,253₽`);
console.log(`   Разница: ${Math.round(totalAmount - 296253).toLocaleString()}₽`);

if (Math.abs(totalAmount - 296253) < 10000) {
  console.log(`   ✅ РАЗНИЦА НЕЗНАЧИТЕЛЬНА (менее 10,000₽)`);
} else {
  console.log(`   ⚠️ ЕСТЬ РАЗНИЦА - нужно разобраться!`);
}
