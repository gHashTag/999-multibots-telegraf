#!/usr/bin/env node

/**
 * 🎯 ПОЛНЫЙ ДЕТАЛЬНЫЙ ОТЧЕТ ПО КАЖДОМУ БОТУ
 * - Расходы на AI провайдеры по типам команд
 * - Доходы по каждому боту
 * - Детализация по операциям
 * - ОДИН ФАЙЛ - ВСЕ ДАННЫЕ!
 */

const fs = require('fs');
const ExcelJS = require('exceljs');

const RATES = { XTR: 1.8, STARS: 1.8, RUB: 1.0 };

function convertToRub(amount, currency) {
  return (parseFloat(amount) || 0) * (RATES[currency] || 1.0);
}

const REAL_PAYMENT_METHODS = [
  'Telegram', 'Robokassa', 'YooMoney', 'SBP', 'TinkoffPay', 'SberPay'
];

const FAKE_PAYMENT_METHODS = [
  'System', 'SYSTEM', 'Internal', 'balance', 'Manual', 'Admin', 'admin',
  'bank_card', 'System_Balance_Migration', 'admin_special_topup',
  'admin_topup', 'video-generation-refund', 'image-to-video-refund',
  'Admin_Bonus', 'Bonus', 'System Grant', 'Tester_Bonus', 'Promo',
  'Admin_Unlimited_Grant', 'Admin_Welcome_Grant', 'Admin_Compensation',
  'System_Operation', 'Manual Admin Grant', 'test', 'Bonus_Credit',
  'System Compensation'
];

// AI ПРОВАЙДЕРЫ И ИХ КОМАНДЫ
const AI_PROVIDERS = {
  'Replicate': {
    commands: ['neurophoto', 'neurovideo', 'train_start', 'lip_sync', 'face_train'],
    cost_per_operation: 15 // Средняя стоимость операции в рублях
  },
  'Fal': {
    commands: ['neurophoto', 'neurovideo', 'image_enhance', 'style_transfer'],
    cost_per_operation: 12
  },
  'OpenAI': {
    commands: ['neurotext', 'chat', 'assistant'],
    cost_per_operation: 8
  },
  'HeyGen': {
    commands: ['avatar', 'lip_sync', 'video_generation'],
    cost_per_operation: 25
  },
  'Hedra': {
    commands: ['video_generation', 'character_create'],
    cost_per_operation: 30
  },
  'KieAI': {
    commands: ['image_generation', 'style_transfer'],
    cost_per_operation: 10
  },
  'Runway': {
    commands: ['video_editing', 'image_to_video'],
    cost_per_operation: 20
  },
  'Sora': {
    commands: ['sora_video', 'text_to_video'],
    cost_per_operation: 40
  }
};

const BOTS = [
  { name: 'neuro_blogger_bot', type: 'ПРОДАКШЕН' },
  { name: 'MetaMuse_Manifest_bot', type: 'ПРОДАКШЕН' },
  { name: 'HaimGroupMedia_bot', type: 'ПРОДАКШЕН' },
  { name: 'AI_STARS_bot', type: 'ПРОДАКШЕН' },
  { name: 'Gaia_Kamskaia_bot', type: 'ПРОДАКШЕН' },
  { name: 'NeuroLenaAssistant_bot', type: 'ПРОДАКШЕН' },
  { name: 'NeurostylistShtogrina_bot', type: 'ПРОДАКШЕН' },
  { name: 'Kaya_easy_art_bot', type: 'ПРОДАКШЕН' },
  { name: 'ai_koshey_bot', type: 'ТЕСТОВЫЙ' },
  { name: 'clip_maker_neuro_bot', type: 'ТЕСТОВЫЙ' }
];

async function createComprehensiveBotReport() {
  console.log('\n' + '='.repeat(80));
  console.log('🎯 СОЗДАНИЕ ПОЛНОГО ОТЧЕТА ПО КАЖДОМУ БОТУ');
  console.log('='.repeat(80) + '\n');

  // 1. ЧИТАЕМ SUPABASE
  console.log('📊 ЧИТАЕМ SUPABASE...\n');

  const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));
  const allRecords = rawData.length;

  console.log(`✅ Всего записей в Supabase: ${allRecords}`);

  // 2. РАЗДЕЛЯЕМ НА ДОХОДЫ И РАСХОДЫ
  const incomes = rawData.filter(row => row.type === 'MONEY_INCOME');
  const outcomes = rawData.filter(row => row.type === 'MONEY_OUTCOME');

  console.log(`📈 Доходы: ${incomes.length} записей`);
  console.log(`📉 Расходы: ${outcomes.length} записей`);

  // 3. ГРУППИРУЕМ ПО БОТАМ
  console.log('\n📊 ГРУППИРОВКА ПО БОТАМ...\n');

  const botData = {};
  BOTS.forEach(bot => {
    botData[bot.name] = {
      ...bot,
      incomes: { rub: [], stars: [], fake: [], total: 0 },
      outcomes: [],
      ai_costs: {},
      total_income: 0,
      total_expenses: 0,
      profit: 0
    };

    // Инициализируем AI провайдеры
    Object.keys(AI_PROVIDERS).forEach(provider => {
      botData[bot.name].ai_costs[provider] = {
        commands: {},
        total_cost: 0,
        operations_count: 0
      };
    });
  });

  // 4. ОБРАБАТЫВАЕМ ДОХОДЫ
  console.log('💰 ОБРАБОТКА ДОХОДОВ...\n');

  incomes.forEach(row => {
    const botName = row.bot_name;
    if (!botData[botName]) return;

    const amountInRub = convertToRub(row.amount, row.currency);

    if (FAKE_PAYMENT_METHODS.includes(row.payment_method)) {
      botData[botName].incomes.fake.push(row);
    } else if (row.currency === 'RUB' && REAL_PAYMENT_METHODS.includes(row.payment_method)) {
      botData[botName].incomes.rub.push(row);
      botData[botName].incomes.total += amountInRub;
      botData[botName].total_income += amountInRub;
    } else if (row.currency === 'STARS' && REAL_PAYMENT_METHODS.includes(row.payment_method)) {
      botData[botName].incomes.stars.push(row);
      botData[botName].incomes.total += amountInRub;
      botData[botName].total_income += amountInRub;
    }
  });

  // 5. ОБРАБАТЫВАЕМ РАСХОДЫ (AI ПРОВАЙДЕРЫ)
  console.log('🤖 ОБРАБОТКА РАСХОДОВ НА AI...\n');

  outcomes.forEach(row => {
    const botName = row.bot_name;
    if (!botData[botName]) return;

    const amountInRub = convertToRub(row.amount, row.currency);

    // Определяем тип операции из description
    const description = (row.description || '').toLowerCase();
    let operationType = 'other';
    let provider = 'Unknown';

    // Определяем провайдера и тип операции
    for (const [prov, data] of Object.entries(AI_PROVIDERS)) {
      for (const cmd of data.commands) {
        if (description.includes(cmd) || description.includes(prov.toLowerCase())) {
          provider = prov;
          operationType = cmd;
          break;
        }
      }
      if (provider !== 'Unknown') break;
    }

    // Если не нашли провайдера, пытаемся определить по amount
    if (provider === 'Unknown') {
      if (amountInRub >= 30) provider = 'Sora';
      else if (amountInRub >= 25) provider = 'Hedra';
      else if (amountInRub >= 20) provider = 'Runway';
      else if (amountInRub >= 15) provider = 'Replicate';
      else if (amountInRub >= 12) provider = 'Fal';
      else if (amountInRub >= 10) provider = 'KieAI';
      else if (amountInRub >= 8) provider = 'OpenAI';
      else provider = 'Other';
    }

    // Сохраняем расход
    botData[botName].outcomes.push({
      ...row,
      amount_in_rub: amountInRub,
      provider: provider,
      operation_type: operationType
    });

    botData[botName].total_expenses += amountInRub;

    // Группируем по провайдеру
    if (!botData[botName].ai_costs[provider]) {
      botData[botName].ai_costs[provider] = {
        commands: {},
        total_cost: 0,
        operations_count: 0
      };
    }

    botData[botName].ai_costs[provider].total_cost += amountInRub;
    botData[botName].ai_costs[provider].operations_count++;

    if (!botData[botName].ai_costs[provider].commands[operationType]) {
      botData[botName].ai_costs[provider].commands[operationType] = {
        count: 0,
        cost: 0
      };
    }

    botData[botName].ai_costs[provider].commands[operationType].count++;
    botData[botName].ai_costs[provider].commands[operationType].cost += amountInRub;

    // Считаем прибыль
    botData[botName].profit = botData[botName].total_income - botData[botName].total_expenses;
  });

  // 6. ВЫВОД СТАТИСТИКИ
  console.log('📊 СТАТИСТИКА ПО БОТАМ:\n');

  Object.values(botData).forEach(bot => {
    console.log(`🤖 ${bot.name}:`);
    console.log(`   💰 Доходы: ${Math.round(bot.total_income).toLocaleString()}₽`);
    console.log(`   🤖 Расходы: ${Math.round(bot.total_expenses).toLocaleString()}₽`);
    console.log(`   📈 Прибыль: ${Math.round(bot.profit).toLocaleString()}₽`);
    console.log(`   📊 Доходы RUB: ${bot.incomes.rub.length} операций`);
    console.log(`   ⭐ Доходы STARS: ${bot.incomes.stars.length} операций`);
    console.log(`   🚫 Фейк доходы: ${bot.incomes.fake.length} операций`);
    console.log('');
  });

  // 7. СОЗДАЕМ EXCEL
  console.log('📊 СОЗДАЕМ EXCEL ОТЧЕТ...\n');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "🎯 ПОЛНЫЙ ОТЧЕТ ПО БОТАМ";
  workbook.created = new Date();

  // ЛИСТ 1: ОБЩАЯ СВОДКА
  const summarySheet = workbook.addWorksheet('📊 ОБЩАЯ СВОДКА');
  summarySheet.mergeCells('A1:F1');
  summarySheet.getCell('A1').value = '🎯 ПОЛНЫЙ ОТЧЕТ ПО 10 БОТАМ - ДОХОДЫ И РАСХОДЫ';
  summarySheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
  summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '15803D' } };
  summarySheet.getCell('A1').alignment = { horizontal: 'center' };

  summarySheet.addRow(['']);
  const header = summarySheet.addRow([
    '№', 'Бот', 'Тип',
    'ДОХОДЫ (₽)', 'РАСХОДЫ (₽)', 'ПРИБЫЛЬ (₽)'
  ]);
  header.font = { bold: true };

  const sortedBots = Object.values(botData).sort((a, b) => b.total_income - a.total_income);

  sortedBots.forEach((bot, index) => {
    summarySheet.addRow([
      index + 1,
      bot.name,
      bot.type,
      Math.round(bot.total_income).toLocaleString(),
      Math.round(bot.total_expenses).toLocaleString(),
      Math.round(bot.profit).toLocaleString()
    ]);
  });

  const totalIncome = sortedBots.reduce((sum, bot) => sum + bot.total_income, 0);
  const totalExpenses = sortedBots.reduce((sum, bot) => sum + bot.total_expenses, 0);
  const totalProfit = totalIncome - totalExpenses;

  const totalRow = summarySheet.addRow([
    'ИТОГО', 'ВСЕ БОТЫ', '',
    Math.round(totalIncome).toLocaleString(),
    Math.round(totalExpenses).toLocaleString(),
    Math.round(totalProfit).toLocaleString()
  ]);
  totalRow.font = { bold: true };

  // ЛИСТ 2: ДЕТАЛИ ПО КАЖДОМУ БОТУ
  const detailsSheet = workbook.addWorksheet('🤖 ДЕТАЛИ ПО БОТАМ');
  detailsSheet.mergeCells('A1:J1');
  detailsSheet.getCell('A1').value = '🤖 ДЕТАЛЬНЫЙ АНАЛИЗ КАЖДОГО БОТА';
  detailsSheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
  detailsSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7C2D12' } };
  detailsSheet.getCell('A1').alignment = { horizontal: 'center' };

  detailsSheet.addRow(['']);
  detailsSheet.addRow([
    'Бот', 'Тип',
    'RUB доходы', 'STARS доходы', 'Фейк доходы',
    'Всего доходов', 'Расходы AI', 'Прибыль',
    'Кол-во доходов', 'Кол-во расходов'
  ]);
  detailsSheet.getRow(3).font = { bold: true };

  sortedBots.forEach(bot => {
    detailsSheet.addRow([
      bot.name,
      bot.type,
      bot.incomes.rub.length,
      bot.incomes.stars.length,
      bot.incomes.fake.length,
      Math.round(bot.total_income).toLocaleString(),
      Math.round(bot.total_expenses).toLocaleString(),
      Math.round(bot.profit).toLocaleString(),
      bot.incomes.rub.length + bot.incomes.stars.length + bot.incomes.fake.length,
      bot.outcomes.length
    ]);
  });

  // ЛИСТ 3: РАСХОДЫ НА AI ПРОВАЙДЕРЫ
  const aiCostsSheet = workbook.addWorksheet('🤖 РАСХОДЫ НА AI');
  aiCostsSheet.addRow(['Бот', 'Провайдер', 'Операции', 'Сумма (₽)', 'Среднее на операцию']);
  aiCostsSheet.getRow(1).font = { bold: true };

  sortedBots.forEach(bot => {
    Object.entries(bot.ai_costs).forEach(([provider, data]) => {
      if (data.operations_count > 0) {
        aiCostsSheet.addRow([
          bot.name,
          provider,
          data.operations_count,
          Math.round(data.total_cost).toLocaleString(),
          Math.round(data.total_cost / data.operations_count)
        ]);
      }
    });
  });

  // ЛИСТ 4: ДЕТАЛИ ПО КОМАНДАМ
  const commandsSheet = workbook.addWorksheet('⚡ ДЕТАЛИ ПО КОМАНДАМ');
  commandsSheet.addRow(['Бот', 'Провайдер', 'Команда', 'Кол-во', 'Сумма (₽)']);
  commandsSheet.getRow(1).font = { bold: true };

  sortedBots.forEach(bot => {
    Object.entries(bot.ai_costs).forEach(([provider, data]) => {
      Object.entries(data.commands).forEach(([command, stats]) => {
        if (stats.count > 0) {
          commandsSheet.addRow([
            bot.name,
            provider,
            command,
            stats.count,
            Math.round(stats.cost).toLocaleString()
          ]);
        }
      });
    });
  });

  // ЛИСТ 5: ТОП AI ПРОВАЙДЕРОВ
  const topProvidersSheet = workbook.addWorksheet('🏆 ТОП AI ПРОВАЙДЕРОВ');
  topProvidersSheet.addRow(['Провайдер', 'Всего операций', 'Всего расходов (₽)', 'Средняя стоимость', 'Кол-во ботов']);
  topProvidersSheet.getRow(1).font = { bold: true };

  const providersStats = {};
  sortedBots.forEach(bot => {
    Object.entries(bot.ai_costs).forEach(([provider, data]) => {
      if (!providersStats[provider]) {
        providersStats[provider] = {
          operations: 0,
          cost: 0,
          bots: new Set()
        };
      }
      providersStats[provider].operations += data.operations_count;
      providersStats[provider].cost += data.total_cost;
      providersStats[provider].bots.add(bot.name);
    });
  });

  Object.entries(providersStats)
    .sort((a, b) => b[1].cost - a[1].cost)
    .forEach(([provider, stats]) => {
      topProvidersSheet.addRow([
        provider,
        stats.operations,
        Math.round(stats.cost).toLocaleString(),
        Math.round(stats.cost / stats.operations),
        stats.bots.size
      ]);
    });

  // ЛИСТ 6: ДОХОДЫ ПО БОТАМ
  const incomeSheet = workbook.addWorksheet('💰 ДОХОДЫ ПО БОТАМ');
  incomeSheet.addRow(['Бот', 'Метод оплаты', 'Валюта', 'Кол-во', 'Сумма (₽)']);
  incomeSheet.getRow(1).font = { bold: true };

  sortedBots.forEach(bot => {
    // RUB доходы
    bot.incomes.rub.forEach(income => {
      incomeSheet.addRow([
        bot.name,
        income.payment_method,
        income.currency,
        1,
        Math.round(convertToRub(income.amount, income.currency)).toLocaleString()
      ]);
    });

    // STARS доходы
    bot.incomes.stars.forEach(income => {
      incomeSheet.addRow([
        bot.name,
        income.payment_method,
        income.currency,
        1,
        Math.round(convertToRub(income.amount, income.currency)).toLocaleString()
      ]);
    });
  });

  // ЛИСТ 7: ФЕЙКОВЫЕ ДОХОДЫ
  const fakeSheet = workbook.addWorksheet('🚫 ФЕЙКОВЫЕ ДОХОДЫ');
  fakeSheet.addRow(['Бот', 'Метод', 'Кол-во', 'Сумма (₽)']);
  fakeSheet.getRow(1).font = { bold: true };

  sortedBots.forEach(bot => {
    const fakeByMethod = {};
    bot.incomes.fake.forEach(income => {
      const method = income.payment_method;
      if (!fakeByMethod[method]) {
        fakeByMethod[method] = { count: 0, amount: 0 };
      }
      fakeByMethod[method].count++;
      fakeByMethod[method].amount += convertToRub(income.amount, income.currency);
    });

    Object.entries(fakeByMethod).forEach(([method, data]) => {
      fakeSheet.addRow([
        bot.name,
        method,
        data.count,
        Math.round(data.amount).toLocaleString()
      ]);
    });
  });

  // ЛИСТ 8: ПРИБЫЛЬНОСТЬ БОТОВ
  const profitabilitySheet = workbook.addWorksheet('📈 ПРИБЫЛЬНОСТЬ');
  profitabilitySheet.addRow(['Бот', 'Доходы (₽)', 'Расходы (₽)', 'Прибыль (₽)', 'Маржа (%)', 'Тип']);
  profitabilitySheet.getRow(1).font = { bold: true };

  sortedBots.forEach(bot => {
    const margin = bot.total_income > 0 ? (bot.profit / bot.total_income * 100) : 0;
    profitabilitySheet.addRow([
      bot.name,
      Math.round(bot.total_income).toLocaleString(),
      Math.round(bot.total_expenses).toLocaleString(),
      Math.round(bot.profit).toLocaleString(),
      margin.toFixed(1),
      bot.type
    ]);
  });

  // ЛИСТ 9: ДЕТАЛЬНАЯ ХРОНОЛОГИЯ РАСХОДОВ
  const expensesSheet = workbook.addWorksheet('📋 ХРОНОЛОГИЯ РАСХОДОВ');
  expensesSheet.addRow(['№', 'Бот', 'Дата', 'Сумма (₽)', 'Провайдер', 'Команда', 'Описание']);
  expensesSheet.getRow(1).font = { bold: true };

  let counter = 1;
  sortedBots.forEach(bot => {
    bot.outcomes.forEach(outcome => {
      expensesSheet.addRow([
        counter++,
        bot.name,
        outcome.created_at,
        Math.round(outcome.amount_in_rub).toLocaleString(),
        outcome.provider,
        outcome.operation_type,
        outcome.description?.substring(0, 100) || ''
      ]);
    });
  });

  const outputPath = '/Users/playra/999-multibots-telegraf/ПОЛНЫЙ_ОТЧЕТ_ПО_БОТАМ.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log('\n' + '='.repeat(80));
  console.log('✅ ПОЛНЫЙ ОТЧЕТ ПО БОТАМ СОЗДАН!');
  console.log('='.repeat(80));
  console.log(`📁 Файл: ${outputPath}`);
  console.log('\n📊 СОДЕРЖИМОЕ (9 ЛИСТОВ):');
  console.log('   1️⃣  📊 ОБЩАЯ СВОДКА - ключевые цифры по всем ботам');
  console.log('   2️⃣  🤖 ДЕТАЛИ ПО БОТАМ - доходы, расходы, прибыль');
  console.log('   3️⃣  🤖 РАСХОДЫ НА AI - затраты по провайдерам');
  console.log('   4️⃣  ⚡ ДЕТАЛИ ПО КОМАНДАМ - разбивка по операциям');
  console.log('   5️⃣  🏆 ТОП AI ПРОВАЙДЕРОВ - рейтинг по затратам');
  console.log('   6️⃣  💰 ДОХОДЫ ПО БОТАМ - источники доходов');
  console.log('   7️⃣  🚫 ФЕЙКОВЫЕ ДОХОДЫ - что исключено');
  console.log('   8️⃣  📈 ПРИБЫЛЬНОСТЬ - маржинальность каждого бота');
  console.log('   9️⃣  📋 ХРОНОЛОГИЯ РАСХОДОВ - все операции по дням');
  console.log('\n🎯 ВСЕ ДАННЫЕ ПО ДОХОДАМ И РАСХОДАМ В ОДНОМ ФАЙЛЕ!');
  console.log('='.repeat(80) + '\n');

  return {
    total_bots: sortedBots.length,
    total_income: Math.round(totalIncome),
    total_expenses: Math.round(totalExpenses),
    total_profit: Math.round(totalProfit),
    bots: sortedBots.map(bot => ({
      name: bot.name,
      type: bot.type,
      income: Math.round(bot.total_income),
      expenses: Math.round(bot.total_expenses),
      profit: Math.round(bot.profit),
      margin: bot.total_income > 0 ? (bot.profit / bot.total_income * 100).toFixed(1) : 0
    }))
  };
}

createComprehensiveBotReport().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
