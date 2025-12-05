// ПОЛУЧЕНИЕ РЕАЛЬНЫХ ДАННЫХ ИЗ ТАБЛИЦЫ PMSV2
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fbgmxbvzwgxfkagxkmqc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZ214Ynp2d2d4ZmdhZ3hzbXFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUwNzcyNzYsImV4cCI6MjA1MDY1MzI3Nn0.CqYl7p2vJ6f6dJ0dU2xC8bKqj_1eJ0dD4L5z6N3c2A';

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  global: { headers: { 'apikey': supabaseKey } }
});

// Список всех ботов
const botNames = [
  'neuro_blogger_bot',
  'MetaMuse_Manifest_bot',
  'Gaia_Kamskaia_bot',
  'AI_STARS_bot',
  'Kaya_easy_art_bot',
  'NeuroLenaAssistant_bot',
  'HaimGroupMedia_bot',
  'LeeSolarbot',
  'NeurostylistShtogrina_bot',
  'ZavaraBot'
];

async function getRealDataFromPMSV2() {
  console.log('🔍 ПОЛУЧЕНИЕ РЕАЛЬНЫХ ДАННЫХ ИЗ PMSV2\n');

  const results = [];

  for (const botName of botNames) {
    console.log(`📊 ${botName}...`);

    try {
      // Получаем ВСЕ транзакции из PMSV2
      const { data: transactions, error } = await supabase
        .from('PMSV2')
        .select('*')
        .eq('bot_name', botName)
        .order('created_at', { ascending: false });

      if (error) {
        console.error(`❌ Ошибка для ${botName}:`, error.message);
        continue;
      }

      if (!transactions || transactions.length === 0) {
        console.log(`   ⚠️  Нет транзакций`);
        results.push({ botName, transactions: 0, data: {} });
        continue;
      }

      console.log(`   ✅ ${transactions.length} транзакций найдено`);

      // Анализируем транзакции
      let realIncomeXTR = 0;
      let realIncomeSTARS = 0;
      let realIncomeRUB = 0;

      let systemIncomeXTR = 0;
      let systemIncomeSTARS = 0;
      let systemIncomeRUB = 0;

      let realExpenseXTR = 0;
      let realExpenseSTARS = 0;
      let realExpenseRUB = 0;

      // Группируем по типам
      const incomeTypes = {};
      const expenseTypes = {};

      transactions.forEach(t => {
        const amount = parseFloat(t.amount) || 0;
        const currency = t.currency;
        const type = t.type;
        const category = t.category;
        const paymentMethod = t.payment_method;
        const description = t.description || '';

        if (type === 'MONEY_INCOME') {
          // Определяем, это реальный доход или системный
          const isReal = (paymentMethod === 'Telegram' || paymentMethod === 'Robokassa') && category === 'REAL';
          const isSystem = description.includes('System Grant') || description.includes('Manual') ||
                          description.includes('BONUS') || category === 'BONUS' || paymentMethod === 'SYSTEM';

          if (isReal) {
            if (currency === 'XTR') realIncomeXTR += amount;
            else if (currency === 'STARS') realIncomeSTARS += amount;
            else if (currency === 'RUB') realIncomeRUB += amount;
          } else if (isSystem) {
            if (currency === 'XTR') systemIncomeXTR += amount;
            else if (currency === 'STARS') systemIncomeSTARS += amount;
            else if (currency === 'RUB') systemIncomeRUB += amount;
          }

          incomeTypes[`${paymentMethod}_${category}`] = (incomeTypes[`${paymentMethod}_${category}`] || 0) + amount;
        } else if (type === 'MONEY_OUTCOME') {
          // Все расходы - реальные
          if (currency === 'XTR') realExpenseXTR += amount;
          else if (currency === 'STARS') realExpenseSTARS += amount;
          else if (currency === 'RUB') realExpenseRUB += amount;

          expenseTypes[`${paymentMethod}_${category}`] = (expenseTypes[`${paymentMethod}_${category}`] || 0) + amount;
        }
      });

      const botData = {
        botName,
        transactions: transactions.length,
        realIncome: { xtr: realIncomeXTR, stars: realIncomeSTARS, rub: realIncomeRUB },
        systemIncome: { xtr: systemIncomeXTR, stars: systemIncomeSTARS, rub: systemIncomeRUB },
        realExpense: { xtr: realExpenseXTR, stars: realExpenseSTARS, rub: realExpenseRUB },
        incomeTypes,
        expenseTypes
      };

      results.push(botData);

      // Выводим краткую сводку
      console.log(`   💰 Реальные доходы: XTR ${realIncomeXTR.toFixed(2)}, STARS ${realIncomeSTARS.toFixed(2)}, RUB ${realIncomeRUB.toFixed(2)}`);
      console.log(`   📦 Системные доходы: XTR ${systemIncomeXTR.toFixed(2)}, STARS ${systemIncomeSTARS.toFixed(2)}, RUB ${systemIncomeRUB.toFixed(2)}`);
      console.log(`   💸 Расходы: XTR ${realExpenseXTR.toFixed(2)}, STARS ${realExpenseSTARS.toFixed(2)}, RUB ${realExpenseRUB.toFixed(2)}`);
      console.log();

    } catch (err) {
      console.error(`❌ Критическая ошибка для ${botName}:`, err.message);
    }

    // Пауза между запросами
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Сохраняем данные в файл
  const fs = require('fs');
  fs.writeFileSync('real_bot_data_from_pmsv2.json', JSON.stringify(results, null, 2));
  console.log('\n💾 Данные сохранены в real_bot_data_from_pmsv2.json\n');

  // Итоговая сводка
  console.log('='.repeat(80));
  console.log('📊 ИТОГОВАЯ СВОДКА ПО ВСЕМ БОТАМ (ИЗ PMSV2)');
  console.log('='.repeat(80));

  let totalRealIncomeXTR = 0;
  let totalRealIncomeSTARS = 0;
  let totalRealIncomeRUB = 0;
  let totalSystemIncomeXTR = 0;
  let totalSystemIncomeSTARS = 0;
  let totalSystemIncomeRUB = 0;
  let totalExpenseXTR = 0;
  let totalExpenseSTARS = 0;
  let totalExpenseRUB = 0;

  results.forEach(bot => {
    const income = bot.realIncome;
    const system = bot.systemIncome;
    const expense = bot.realExpense;

    totalRealIncomeXTR += income.xtr;
    totalRealIncomeSTARS += income.stars;
    totalRealIncomeRUB += income.rub;
    totalSystemIncomeXTR += system.xtr;
    totalSystemIncomeSTARS += system.stars;
    totalSystemIncomeRUB += system.rub;
    totalExpenseXTR += expense.xtr;
    totalExpenseSTARS += expense.stars;
    totalExpenseRUB += expense.rub;

    console.log(`\n${bot.botName}:`);
    console.log(`  Транзакций: ${bot.transactions}`);
    console.log(`  РЕАЛЬНЫЕ доходы: XTR ${income.xtr.toFixed(2)}, STARS ${income.stars.toFixed(2)}, RUB ${income.rub.toFixed(2)}`);
    console.log(`  СИСТЕМНЫЕ доходы: XTR ${system.xtr.toFixed(2)}, STARS ${system.stars.toFixed(2)}, RUB ${system.rub.toFixed(2)}`);
    console.log(`  Расходы: XTR ${expense.xtr.toFixed(2)}, STARS ${expense.stars.toFixed(2)}, RUB ${expense.rub.toFixed(2)}`);
  });

  console.log('\n' + '='.repeat(80));
  console.log('🎯 ИТОГО ПО ПОРТФЕЛЮ (ИЗ PMSV2):');
  console.log('='.repeat(80));
  console.log(`Реальные доходы: XTR ${totalRealIncomeXTR.toFixed(2)}, STARS ${totalRealIncomeSTARS.toFixed(2)}, RUB ${totalRealIncomeRUB.toFixed(2)}`);
  console.log(`Системные доходы: XTR ${totalSystemIncomeXTR.toFixed(2)}, STARS ${totalSystemIncomeSTARS.toFixed(2)}, RUB ${totalSystemIncomeRUB.toFixed(2)}`);
  console.log(`Расходы: XTR ${totalExpenseXTR.toFixed(2)}, STARS ${totalExpenseSTARS.toFixed(2)}, RUB ${totalExpenseRUB.toFixed(2)}`);

  return results;
}

getRealDataFromPMSV2()
  .then(() => {
    console.log('\n✅ Анализ из PMSV2 завершен!');
  })
  .catch(err => {
    console.error('\n❌ Ошибка:', err);
  });