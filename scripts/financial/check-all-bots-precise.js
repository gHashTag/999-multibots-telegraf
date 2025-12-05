// ТОЧНАЯ ПРОВЕРКА ВСЕХ БОТОВ НА ФЕЙКОВЫЕ ДАННЫЕ
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fbgmxbvzwgxfkagxkmqc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZ214Ynp2d2d4ZmdhZ3hzbXFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUwNzcyNzYsImV4cCI6MjA1MDY1MzI3Nn0.CqYl7p2vJ6f6dJ0dU2xC8bKqj_1eJ0dD4L5z6N3c2A';

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  },
  global: {
    headers: {
      'apikey': supabaseKey
    }
  }
});

// Список всех ботов для проверки
const bots = [
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

// Функция проверки одного бота
async function checkBotPrecise(botName) {
  console.log(`\n🔍 ПРОВЕРКА: ${botName}`);
  console.log('='.repeat(80));

  try {
    // Получаем ВСЕ транзакции бота
    const { data: allTransactions, error: allError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', botName)
      .order('created_at', { ascending: false });

    if (allError) {
      console.error(`❌ ОШИБКА получения всех транзакций:`, allError.message);
      return null;
    }

    console.log(`📊 Всего транзакций в базе: ${allTransactions?.length || 0}`);

    if (!allTransactions || allTransactions.length === 0) {
      console.log(`⚠️  НЕТ ДАННЫХ для ${botName}`);
      return {
        botName,
        totalTransactions: 0,
        realIncome: 0,
        realIncomeXTR: 0,
        realIncomeSTARS: 0,
        realIncomeRUB: 0,
        hasRealPayments: false
      };
    }

    // Анализ РЕАЛЬНЫХ доходов (платежи от пользователей)
    const realIncomes = allTransactions.filter(t => {
      const isIncome = t.type === 'MONEY_INCOME';
      const isReal = t.category === 'REAL';
      const isUserPayment = t.payment_method === 'Telegram' || t.payment_method === 'Robokassa';

      return isIncome && isReal && isUserPayment;
    });

    // Анализ РЕАЛЬНЫХ расходов (операционные расходы)
    const realExpenses = allTransactions.filter(t => {
      const isOutcome = t.type === 'MONEY_OUTCOME';
      const isReal = t.category === 'REAL';
      return isOutcome && isReal;
    });

    // Подсчет доходов по валютам
    let realIncomeXTR = 0;
    let realIncomeSTARS = 0;
    let realIncomeRUB = 0;

    realIncomes.forEach(t => {
      const amount = parseFloat(t.amount) || 0;
      if (t.currency === 'XTR') {
        realIncomeXTR += amount;
      } else if (t.currency === 'STARS') {
        realIncomeSTARS += amount;
      } else if (t.currency === 'RUB') {
        realIncomeRUB += amount;
      }
    });

    const totalRealIncome = realIncomeXTR + realIncomeSTARS + realIncomeRUB;

    // Подсчет расходов по валютам
    let realExpenseXTR = 0;
    let realExpenseSTARS = 0;
    let realExpenseRUB = 0;

    realExpenses.forEach(t => {
      const amount = parseFloat(t.amount) || 0;
      if (t.currency === 'XTR') {
        realExpenseXTR += amount;
      } else if (t.currency === 'STARS') {
        realExpenseSTARS += amount;
      } else if (t.currency === 'RUB') {
        realExpenseRUB += amount;
      }
    });

    const totalRealExpense = realExpenseXTR + realExpenseSTARS + realExpenseRUB;

    console.log(`💰 РЕАЛЬНЫЕ ДОХОДЫ: ${totalRealIncome}`);
    console.log(`   XTR: ${realIncomeXTR}`);
    console.log(`   STARS: ${realIncomeSTARS}`);
    console.log(`   RUB: ${realIncomeRUB}`);

    console.log(`💸 РЕАЛЬНЫЕ РАСХОДЫ: ${totalRealExpense}`);
    console.log(`   XTR: ${realExpenseXTR}`);
    console.log(`   STARS: ${realExpenseSTARS}`);
    console.log(`   RUB: ${realExpenseRUB}`);

    console.log(`📈 ЧИСТАЯ ПРИБЫЛЬ: ${totalRealIncome - totalRealExpense}`);

    // Анализ методов доходов
    const incomeMethods = {};
    realIncomes.forEach(t => {
      incomeMethods[t.payment_method] = (incomeMethods[t.payment_method] || 0) + 1;
    });

    console.log(`\n💳 МЕТОДЫ РЕАЛЬНЫХ ПЛАТЕЖЕЙ:`);
    Object.entries(incomeMethods).forEach(([method, count]) => {
      console.log(`  ✅ ${method}: ${count} транзакций`);
    });

    // Анализ подозрительных транзакций
    const suspicious = allTransactions.filter(t =>
      t.description &&
      (t.description.includes('System Grant') ||
       t.description.includes('Manual') ||
       t.description.includes('Migration') ||
       t.description.includes('refund') ||
       t.description.includes('Refund') ||
       t.description.includes('BONUS') ||
       t.payment_method === 'SYSTEM')
    );

    if (suspicious.length > 0) {
      console.log(`\n⚠️  ПОДОЗРИТЕЛЬНЫХ ТРАНЗАКЦИЙ: ${suspicious.length} (НЕ УЧИТЫВАЮТСЯ)`);
      suspicious.slice(0, 3).forEach((t, i) => {
        console.log(`   ${i+1}. [${t.type}] ${t.currency} ${t.amount} - ${t.payment_method}`);
        console.log(`      ${t.description?.substring(0, 70)}`);
      });
    } else {
      console.log(`\n✅ ПОДОЗРИТЕЛЬНЫХ ТРАНЗАКЦИЙ НЕТ`);
    }

    return {
      botName,
      totalTransactions: allTransactions.length,
      realIncome: totalRealIncome,
      realIncomeXTR,
      realIncomeSTARS,
      realIncomeRUB,
      realExpense: totalRealExpense,
      realExpenseXTR,
      realExpenseSTARS,
      realExpenseRUB,
      realIncomeTransactions: realIncomes.length,
      realExpenseTransactions: realExpenses.length,
      hasRealPayments: realIncomes.length > 0,
      profit: totalRealIncome - totalRealExpense
    };

  } catch (error) {
    console.error(`❌ КРИТИЧЕСКАЯ ОШИБКА для ${botName}:`, error.message);
    return null;
  }
}

// Основная функция
async function analyzeAllBotsPrecise() {
  console.log('🎯 ТОЧНАЯ ПРОВЕРКА ВСЕХ БОТОВ');
  console.log('Критерий: ТОЛЬКО реальные платежи от пользователей!');
  console.log('='.repeat(80));

  const results = [];

  for (const botName of bots) {
    const result = await checkBotPrecise(botName);
    if (result) {
      results.push(result);
    }
    // Небольшая пауза между запросами
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Создание итоговой таблицы
  console.log('\n\n' + '='.repeat(100));
  console.log('📊 ИТОГОВАЯ ТАБЛИЦА БЕЗ ФЕЙКОВЫХ ДАННЫХ');
  console.log('='.repeat(100));

  console.log('\n┌─────────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐');
  console.log('│    БОТ      │ ТРАНЗАКЦ.│ ДОХОД XTR│ДОХОД STARS│ ДОХОД RUB│ ИТОГО ДОХ│ ПРИБЫЛЬ  │');
  console.log('├─────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤');

  let totalIncomeXTR = 0;
  let totalIncomeSTARS = 0;
  let totalIncomeRUB = 0;
  let totalExpenseXTR = 0;
  let totalExpenseSTARS = 0;
  let totalExpenseRUB = 0;
  let totalProfit = 0;

  results.forEach(result => {
    const name = result.botName.substring(0, 11);
    const transactions = result.totalTransactions.toString().padStart(8);
    const incomeXTR = result.realIncomeXTR.toFixed(0).padStart(8);
    const incomeSTARS = result.realIncomeSTARS.toFixed(0).padStart(8);
    const incomeRUB = result.realIncomeRUB.toFixed(0).padStart(8);
    const totalIncome = result.realIncome.toFixed(0).padStart(8);
    const profit = result.profit.toFixed(0).padStart(8);

    totalIncomeXTR += result.realIncomeXTR;
    totalIncomeSTARS += result.realIncomeSTARS;
    totalIncomeRUB += result.realIncomeRUB;
    totalExpenseXTR += result.realExpenseXTR;
    totalExpenseSTARS += result.realExpenseSTARS;
    totalExpenseRUB += result.realExpenseRUB;
    totalProfit += result.profit;

    const status = result.hasRealPayments ? '✅' : '❌';

    console.log(`│ ${status} ${name}  │${transactions}│${incomeXTR}│${incomeSTARS}│${incomeRUB}│${totalIncome}│${profit}│`);
  });

  console.log('├─────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤');

  const totalTransactions = results.reduce((sum, r) => sum + r.totalTransactions, 0);
  const totalTransactionsStr = totalTransactions.toString().padStart(8);
  const totalIncomeXTRStr = totalIncomeXTR.toFixed(0).padStart(8);
  const totalIncomeSTARSStr = totalIncomeSTARS.toFixed(0).padStart(8);
  const totalIncomeRUBStr = totalIncomeRUB.toFixed(0).padStart(8);
  const grandTotalIncome = (totalIncomeXTR + totalIncomeSTARS + totalIncomeRUB).toFixed(0).padStart(8);
  const totalProfitStr = totalProfit.toFixed(0).padStart(8);

  console.log(`│ ИТОГО:      │${totalTransactionsStr}│${totalIncomeXTRStr}│${totalIncomeSTARSStr}│${totalIncomeRUBStr}│${grandTotalIncome}│${totalProfitStr}│`);
  console.log('└─────────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘');

  // Дополнительная статистика
  const profitableBots = results.filter(r => r.profit > 0);
  const lossBots = results.filter(r => r.profit < 0);
  const noPaymentsBots = results.filter(r => !r.hasRealPayments);

  console.log(`\n📈 СТАТИСТИКА:`);
  console.log(`   Прибыльные боты: ${profitableBots.length} из ${results.length}`);
  console.log(`   Убыточные боты: ${lossBots.length}`);
  console.log(`   Без реальных платежей: ${noPaymentsBots.length}`);

  if (noPaymentsBots.length > 0) {
    console.log(`\n❌ БОТЫ БЕЗ РЕАЛЬНЫХ ПЛАТЕЖЕЙ:`);
    noPaymentsBots.forEach(bot => {
      console.log(`   - ${bot.botName}: ${bot.totalTransactions} транзакций (все системные)`);
    });
  }

  return results;
}

// Запуск
analyzeAllBotsPrecise()
  .then(results => {
    console.log(`\n\n✅ ПРОВЕРКА ЗАВЕРШЕНА! Проанализировано ботов: ${results.length}`);
    console.log('📁 Результаты готовы для обновления отчета');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА:', err);
    process.exit(1);
  });
