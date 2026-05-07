#!/usr/bin/env node

/**
 * 🎯 ФИНАЛЬНЫЙ ОТЧЕТ ПО ВСЕМ 10 БОТАМ - ПРАВИЛЬНЫЕ STARS
 * - Все боты включены
 * - STARS только реальные (НЕ System/Admin/balance)
 * - RUB + XTR только Telegram + Robokassa
 * - 9 листов Excel
 */

const fs = require('fs');
const ExcelJS = require('exceljs');
const { spawn } = require('child_process');
const path = require('path');

// Импорт констант ботов
const {
  PRODUCTION_BOTS,
  TEST_BOTS,
  FAKE_PAYMENT_METHODS,
  FAKE_STARS_METHODS
} = require('./constants/bots');

// Валютные курсы
const RATES = { XTR: 1.8, STARS: 1.8, RUB: 1.0 };

function convertToRub(amount, currency) {
  return (parseFloat(amount) || 0) * (RATES[currency] || 1.0);
}

// Реальные методы оплаты
const REAL_PAYMENT_METHODS = ['Telegram', 'Robokassa'];

// ВСЕ 10 БОТОВ!
const ALL_BOTS = [
  ...PRODUCTION_BOTS.map(name => ({ name, type: 'ПРОДАКШЕН' })),
  ...TEST_BOTS.map(name => ({ name, type: 'ТЕСТОВЫЙ' }))
];

const AI_PROVIDERS = ['Replicate', 'Fal', 'OpenAI', 'HeyGen', 'Hedra', 'KieAI', 'Runway', 'Sora', 'Other'];

/**
 * Получение данных ВСЕХ пользователей из Supabase
 * БЕЗ создания промежуточных файлов!
 */
async function getAllUsersData() {
  console.log('👤 Загружаем данные ВСЕХ пользователей...\n');

  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'get-all-users-data.ts');
    const child = spawn('npx', ['ts-node', scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Script failed with code ${code}: ${stderr}`));
        return;
      }

      try {
        // Парсим JSON после маркера JSON_START до следующей строки
        const jsonStart = stdout.indexOf('---JSON_START---');

        if (jsonStart !== -1) {
          const jsonStartIndex = jsonStart + '---JSON_START---'.length;
          const afterJsonStart = stdout.substring(jsonStartIndex);

          // Находим конец JSON - это может быть перенос строки или конец строки
          let jsonEnd = afterJsonStart.indexOf('\n');
          if (jsonEnd === -1) jsonEnd = afterJsonStart.length;

          const jsonString = afterJsonStart.substring(0, jsonEnd).trim();
          const usersData = JSON.parse(jsonString);
          resolve(usersData);
        } else {
          reject(new Error('JSON_START marker not found in output'));
        }
      } catch (error) {
        reject(error);
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

async function createFinalAllBotsReport() {
  console.log('\n' + '='.repeat(80));
  console.log('🎯 ФИНАЛЬНЫЙ ОТЧЕТ ПО ВСЕМ 10 БОТАМ');
  console.log('   ПРАВИЛЬНЫЕ STARS (БЕЗ System/Admin/balance)');
  console.log('='.repeat(80) + '\n');

  const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

  const botData = {};
  ALL_BOTS.forEach(bot => {
    botData[bot.name] = {
      ...bot,
      incomes: {
        RUB: { count: 0, amount: 0 },
        XTR: { count: 0, amount: 0, in_rub: 0 },
        STARS: { count: 0, amount: 0, in_rub: 0, fake: 0 },
        total_rub: 0
      },
      outcomes: { total: 0, by_provider: {} },
      profit: 0,
      margin: 0
    };
  });

  // RUB доходы - только реальные методы
  rawData.filter(row =>
    row.type === 'MONEY_INCOME' &&
    row.currency === 'RUB' &&
    REAL_PAYMENT_METHODS.includes(row.payment_method)
  ).forEach(row => {
    const botName = row.bot_name;
    if (!botData[botName]) return;

    const amount = parseFloat(row.amount) || 0;
    botData[botName].incomes.RUB.count++;
    botData[botName].incomes.RUB.amount += amount;
    botData[botName].incomes.total_rub += amount;
  });

  // XTR доходы - только реальные методы
  rawData.filter(row =>
    row.type === 'MONEY_INCOME' &&
    row.currency === 'XTR' &&
    REAL_PAYMENT_METHODS.includes(row.payment_method)
  ).forEach(row => {
    const botName = row.bot_name;
    if (!botData[botName]) return;

    const amount = parseFloat(row.amount) || 0;
    const amountInRub = convertToRub(amount, row.currency);
    botData[botName].incomes.XTR.count++;
    botData[botName].incomes.XTR.amount += amount;
    botData[botName].incomes.XTR.in_rub += amountInRub;
    botData[botName].incomes.total_rub += amountInRub;
  });

  // STARS доходы - ТОЛЬКО РЕАЛЬНЫЕ (НЕ System/Admin/balance)!
  rawData.filter(row =>
    row.type === 'MONEY_INCOME' &&
    row.currency === 'STARS'
  ).forEach(row => {
    const botName = row.bot_name;
    if (!botData[botName]) return;

    const amount = parseFloat(row.amount) || 0;
    const amountInRub = convertToRub(amount, row.currency);
    const method = row.payment_method || '';

    if (FAKE_STARS_METHODS.includes(method)) {
      // Фейковые STARS - записываем отдельно но НЕ включаем в доходы
      botData[botName].incomes.STARS.fake += amountInRub;
    } else {
      // Реальные STARS
      botData[botName].incomes.STARS.count++;
      botData[botName].incomes.STARS.amount += amount;
      botData[botName].incomes.STARS.in_rub += amountInRub;
      botData[botName].incomes.total_rub += amountInRub;
    }
  });

  // Расходы - все боты
  rawData.filter(row =>
    row.type === 'MONEY_OUTCOME'
  ).forEach(row => {
    const botName = row.bot_name;
    if (!botData[botName]) return;

    const amount = convertToRub(row.amount, row.currency);
    botData[botName].outcomes.total += amount;

    // Определяем провайдера
    const description = (row.description || '').toLowerCase();
    let provider = 'Other';

    for (const prov of AI_PROVIDERS) {
      if (prov !== 'Other' && description.includes(prov.toLowerCase())) {
        provider = prov;
        break;
      }
    }

    if (!botData[botName].outcomes.by_provider[provider]) {
      botData[botName].outcomes.by_provider[provider] = 0;
    }
    botData[botName].outcomes.by_provider[provider] += amount;
  });

  // Прибыль
  Object.values(botData).forEach(bot => {
    bot.profit = bot.incomes.total_rub - bot.outcomes.total;
    bot.margin = bot.incomes.total_rub > 0 ? (bot.profit / bot.incomes.total_rub * 100) : -100;
  });

  console.log('🤖 ДЕТАЛИ ПО ВСЕМ 10 БОТАМ:');
  console.log('='.repeat(80));

  const sortedBots = Object.values(botData)
    .sort((a, b) => b.incomes.total_rub - a.incomes.total_rub);

  sortedBots.forEach(bot => {
    console.log(`\n🤖 ${bot.name} (${bot.type}):`);
    console.log(`   💰 RUB: ${Math.round(bot.incomes.RUB.amount).toLocaleString()}₽ (${bot.incomes.RUB.count} операций)`);
    console.log(`   💎 XTR: ${Math.round(bot.incomes.XTR.amount).toLocaleString()} (${Math.round(bot.incomes.XTR.in_rub).toLocaleString()}₽) (${bot.incomes.XTR.count} операций)`);
    console.log(`   ⭐ STARS: ${Math.round(bot.incomes.STARS.amount).toLocaleString()} (${Math.round(bot.incomes.STARS.in_rub).toLocaleString()}₽) (${bot.incomes.STARS.count} операций)`);
    if (bot.incomes.STARS.fake > 0) {
      console.log(`   🚫 Фейк STARS: ${Math.round(bot.incomes.STARS.fake).toLocaleString()}₽ (исключены)`);
    }
    console.log(`   📊 ИТОГО: ${Math.round(bot.incomes.total_rub).toLocaleString()}₽`);
    console.log(`   🤖 Расходы: ${Math.round(bot.outcomes.total).toLocaleString()}₽`);
    console.log(`   📈 Прибыль: ${Math.round(bot.profit).toLocaleString()}₽ (маржа: ${bot.margin.toFixed(1)}%)`);
  });

  // Итоги
  const totalIncome = sortedBots.reduce((sum, bot) => sum + bot.incomes.total_rub, 0);
  const totalExpenses = sortedBots.reduce((sum, bot) => sum + bot.outcomes.total, 0);
  const totalProfit = totalIncome - totalExpenses;
  const totalMargin = totalIncome > 0 ? (totalProfit / totalIncome * 100) : 0;

  console.log('\n\n🎯 ИТОГО ПО ВСЕМ 10 БОТАМ:');
  console.log('='.repeat(80));
  console.log(`💰 RUB доходы: ${Math.round(sortedBots.reduce((s, b) => s + b.incomes.RUB.amount, 0)).toLocaleString()}₽`);
  console.log(`💎 XTR→₽ доходы: ${Math.round(sortedBots.reduce((s, b) => s + b.incomes.XTR.in_rub, 0)).toLocaleString()}₽`);
  console.log(`⭐ STARS→₽ доходы (реальные): ${Math.round(sortedBots.reduce((s, b) => s + b.incomes.STARS.in_rub, 0)).toLocaleString()}₽`);
  console.log(`📊 ВСЕГО ДОХОДОВ: ${Math.round(totalIncome).toLocaleString()}₽`);
  console.log(`🤖 ВСЕГО РАСХОДОВ: ${Math.round(totalExpenses).toLocaleString()}₽`);
  console.log(`📈 ВСЕГО ПРИБЫЛИ: ${Math.round(totalProfit).toLocaleString()}₽`);
  console.log(`📊 ОБЩАЯ МАРЖА: ${totalMargin.toFixed(1)}%`);
  console.log('='.repeat(80));

  // Excel
  console.log('\n📊 СОЗДАЕМ EXCEL С 9 ЛИСТАМИ...\n');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "🎯 ФИНАЛЬНЫЙ ОТЧЕТ ПО ВСЕМ 10 БОТАМ";
  workbook.created = new Date();

  // ЛИСТ 1: ОБЩАЯ СВОДКА
  const summarySheet = workbook.addWorksheet('📊 ОБЩАЯ СВОДКА');
  summarySheet.mergeCells('A1:N1');
  summarySheet.getCell('A1').value = '🎯 ОТЧЕТ ПО ВСЕМ 10 БОТАМ: ПРАВИЛЬНЫЕ STARS';
  summarySheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
  summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '15803D' } };
  summarySheet.getCell('A1').alignment = { horizontal: 'center' };

  summarySheet.addRow(['']);
  summarySheet.addRow([
    '№', 'Бот', 'Тип',
    'RUB', 'RUB кол',
    'XTR', 'XTR→₽', 'XTR кол',
    'STARS', 'STARS→₽', 'STARS кол',
    'ИТОГО (₽)', 'РАСХОДЫ (₽)', 'ПРИБЫЛЬ (₽)', 'МАРЖА (%)'
  ]);
  summarySheet.getRow(3).font = { bold: true };

  sortedBots.forEach((bot, index) => {
    summarySheet.addRow([
      index + 1,
      bot.name,
      bot.type,
      Math.round(bot.incomes.RUB.amount).toLocaleString(),
      bot.incomes.RUB.count,
      Math.round(bot.incomes.XTR.amount).toLocaleString(),
      Math.round(bot.incomes.XTR.in_rub).toLocaleString(),
      bot.incomes.XTR.count,
      Math.round(bot.incomes.STARS.amount).toLocaleString(),
      Math.round(bot.incomes.STARS.in_rub).toLocaleString(),
      bot.incomes.STARS.count,
      Math.round(bot.incomes.total_rub).toLocaleString(),
      Math.round(bot.outcomes.total).toLocaleString(),
      Math.round(bot.profit).toLocaleString(),
      bot.margin.toFixed(1)
    ]);
  });

  const totalRow = summarySheet.addRow([
    'ИТОГО', 'ВСЕ БОТЫ', '',
    Math.round(sortedBots.reduce((s, b) => s + b.incomes.RUB.amount, 0)).toLocaleString(),
    sortedBots.reduce((s, b) => s + b.incomes.RUB.count, 0),
    Math.round(sortedBots.reduce((s, b) => s + b.incomes.XTR.amount, 0)).toLocaleString(),
    Math.round(sortedBots.reduce((s, b) => s + b.incomes.XTR.in_rub, 0)).toLocaleString(),
    sortedBots.reduce((s, b) => s + b.incomes.XTR.count, 0),
    Math.round(sortedBots.reduce((s, b) => s + b.incomes.STARS.amount, 0)).toLocaleString(),
    Math.round(sortedBots.reduce((s, b) => s + b.incomes.STARS.in_rub, 0)).toLocaleString(),
    sortedBots.reduce((s, b) => s + b.incomes.STARS.count, 0),
    Math.round(totalIncome).toLocaleString(),
    Math.round(totalExpenses).toLocaleString(),
    Math.round(totalProfit).toLocaleString(),
    totalMargin.toFixed(1)
  ]);
  totalRow.font = { bold: true };

  // ЛИСТ 2: ПРОДАКШЕН vs ТЕСТОВЫЕ
  const prodTestSheet = workbook.addWorksheet('🆚 ПРОДАКШЕН vs ТЕСТ');
  prodTestSheet.addRow(['Параметр', 'ПРОДАКШЕН', 'ТЕСТОВЫЕ', 'ИТОГО']);
  prodTestSheet.getRow(1).font = { bold: true };

  const prodBots = sortedBots.filter(b => b.type === 'ПРОДАКШЕН');
  const testBots = sortedBots.filter(b => b.type === 'ТЕСТОВЫЙ');

  const prodIncome = prodBots.reduce((s, b) => s + b.incomes.total_rub, 0);
  const prodExpenses = prodBots.reduce((s, b) => s + b.outcomes.total, 0);
  const testIncome = testBots.reduce((s, b) => s + b.incomes.total_rub, 0);
  const testExpenses = testBots.reduce((s, b) => s + b.outcomes.total, 0);

  prodTestSheet.addRow(['Количество ботов', prodBots.length, testBots.length, sortedBots.length]);
  prodTestSheet.addRow(['Доходы (₽)', Math.round(prodIncome).toLocaleString(), Math.round(testIncome).toLocaleString(), Math.round(totalIncome).toLocaleString()]);
  prodTestSheet.addRow(['Расходы (₽)', Math.round(prodExpenses).toLocaleString(), Math.round(testExpenses).toLocaleString(), Math.round(totalExpenses).toLocaleString()]);
  prodTestSheet.addRow(['Прибыль (₽)', Math.round(prodIncome - prodExpenses).toLocaleString(), Math.round(testIncome - testExpenses).toLocaleString(), Math.round(totalProfit).toLocaleString()]);

  // ЛИСТ 3: ТОП БОТЫ
  const topBotsSheet = workbook.addWorksheet('🏆 ТОП БОТЫ');
  topBotsSheet.addRow(['Параметр', 'Доходы (₽)', 'Расходы (₽)', 'Прибыль (₽)', 'Маржа (%)', 'Бот', 'Тип']);
  topBotsSheet.getRow(1).font = { bold: true };

  const topByIncome = sortedBots.slice(0, 5);
  topByIncome.forEach((bot, i) => {
    topBotsSheet.addRow([
      `ТОП-${i + 1} по доходам`,
      Math.round(bot.incomes.total_rub).toLocaleString(),
      Math.round(bot.outcomes.total).toLocaleString(),
      Math.round(bot.profit).toLocaleString(),
      bot.margin.toFixed(1) + '%',
      bot.name,
      bot.type
    ]);
  });

  topBotsSheet.addRow(['']);

  const topByProfit = sortedBots
    .filter(b => b.profit > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5);

  topByProfit.forEach((bot, i) => {
    topBotsSheet.addRow([
      `ТОП-${i + 1} по прибыли`,
      Math.round(bot.incomes.total_rub).toLocaleString(),
      Math.round(bot.outcomes.total).toLocaleString(),
      Math.round(bot.profit).toLocaleString(),
      bot.margin.toFixed(1) + '%',
      bot.name,
      bot.type
    ]);
  });

  topBotsSheet.addRow(['']);

  const topLosses = sortedBots
    .filter(b => b.profit < 0)
    .sort((a, b) => a.profit - b.profit)
    .slice(0, 5);

  topLosses.forEach((bot, i) => {
    topBotsSheet.addRow([
      `ТОП-${i + 1} убыточные`,
      Math.round(bot.incomes.total_rub).toLocaleString(),
      Math.round(bot.outcomes.total).toLocaleString(),
      Math.round(bot.profit).toLocaleString(),
      bot.margin.toFixed(1) + '%',
      bot.name,
      bot.type
    ]);
  });

  // ЛИСТ 4: РАСХОДЫ НА AI
  const aiCostsSheet = workbook.addWorksheet('🤖 РАСХОДЫ НА AI');
  aiCostsSheet.addRow(['Бот', 'Тип', 'Провайдер', 'Сумма (₽)']);
  aiCostsSheet.getRow(1).font = { bold: true };

  sortedBots.forEach(bot => {
    Object.entries(bot.outcomes.by_provider).forEach(([provider, cost]) => {
      aiCostsSheet.addRow([
        bot.name,
        bot.type,
        provider,
        Math.round(cost).toLocaleString()
      ]);
    });
  });

  // ЛИСТ 5: ДОХОДЫ ПО МЕТОДАМ
  const methodsSheet = workbook.addWorksheet('💰 ДОХОДЫ ПО МЕТОДАМ');
  methodsSheet.addRow(['Бот', 'Тип', 'Метод оплаты', 'Валюта', 'Сумма']);
  methodsSheet.getRow(1).font = { bold: true };

  rawData.filter(row =>
    row.type === 'MONEY_INCOME' &&
    (REAL_PAYMENT_METHODS.includes(row.payment_method) ||
     (row.currency === 'STARS' && !FAKE_STARS_METHODS.includes(row.payment_method || '')))
  ).forEach(row => {
    if (botData[row.bot_name]) {
      methodsSheet.addRow([
        row.bot_name,
        botData[row.bot_name].type,
        row.payment_method,
        row.currency,
        Math.round(parseFloat(row.amount)).toLocaleString()
      ]);
    }
  });

  // ЛИСТ 6: РЕАЛЬНЫЕ STARS
  const realStarsSheet = workbook.addWorksheet('⭐ РЕАЛЬНЫЕ STARS');
  realStarsSheet.addRow(['Бот', 'Тип', 'Метод оплаты', 'STARS', 'В рублях']);
  realStarsSheet.getRow(1).font = { bold: true };

  rawData.filter(row =>
    row.type === 'MONEY_INCOME' &&
    row.currency === 'STARS' &&
    !FAKE_STARS_METHODS.includes(row.payment_method || '')
  ).forEach(row => {
    if (botData[row.bot_name]) {
      realStarsSheet.addRow([
        row.bot_name,
        botData[row.bot_name].type,
        row.payment_method || 'EMPTY',
        Math.round(parseFloat(row.amount)).toLocaleString(),
        Math.round(convertToRub(row.amount, row.currency)).toLocaleString()
      ]);
    }
  });

  // ЛИСТ 7: ФЕЙКОВЫЕ STARS (для информации)
  const fakeStarsSheet = workbook.addWorksheet('🚫 ФЕЙК STARS');
  fakeStarsSheet.addRow(['Бот', 'Тип', 'Метод', 'STARS', 'В рублях']);
  fakeStarsSheet.getRow(1).font = { bold: true };

  rawData.filter(row =>
    row.type === 'MONEY_INCOME' &&
    row.currency === 'STARS' &&
    FAKE_STARS_METHODS.includes(row.payment_method || '')
  ).forEach(row => {
    if (botData[row.bot_name]) {
      fakeStarsSheet.addRow([
        row.bot_name,
        botData[row.bot_name].type,
        row.payment_method,
        Math.round(parseFloat(row.amount)).toLocaleString(),
        Math.round(convertToRub(row.amount, row.currency)).toLocaleString()
      ]);
    }
  });

  // ЛИСТ 8: ПРИБЫЛЬНОСТЬ
  const profitabilitySheet = workbook.addWorksheet('📈 ПРИБЫЛЬНОСТЬ');
  profitabilitySheet.addRow(['Бот', 'Тип', 'Доходы (₽)', 'Расходы (₽)', 'Прибыль (₽)', 'Маржа (%)', 'Статус']);
  profitabilitySheet.getRow(1).font = { bold: true };

  sortedBots.forEach(bot => {
    const status = bot.profit > 0 ? '✅ ПРИБЫЛЬНЫЙ' : '❌ УБЫТОЧНЫЙ';
    profitabilitySheet.addRow([
      bot.name,
      bot.type,
      Math.round(bot.incomes.total_rub).toLocaleString(),
      Math.round(bot.outcomes.total).toLocaleString(),
      Math.round(bot.profit).toLocaleString(),
      bot.margin.toFixed(1),
      status
    ]);
  });

  // ЛИСТ 9: СВОДКА ПО ВАЛЮТАМ
  const currencySheet = workbook.addWorksheet('💎 СВОДКА ВАЛЮТ');
  currencySheet.addRow(['Валюта', 'Количество', 'Сумма в валюте', 'Эквивалент в рублях', 'Доля (%)']);
  currencySheet.getRow(1).font = { bold: true };

  const rubTotal = sortedBots.reduce((s, b) => s + b.incomes.RUB.amount, 0);
  const xtrTotal = sortedBots.reduce((s, b) => s + b.incomes.XTR.in_rub, 0);
  const starsTotal = sortedBots.reduce((s, b) => s + b.incomes.STARS.in_rub, 0);

  currencySheet.addRow(['RUB', sortedBots.reduce((s, b) => s + b.incomes.RUB.count, 0), Math.round(rubTotal).toLocaleString(), Math.round(rubTotal).toLocaleString(), (rubTotal / totalIncome * 100).toFixed(1)]);
  currencySheet.addRow(['XTR', sortedBots.reduce((s, b) => s + b.incomes.XTR.count, 0), Math.round(sortedBots.reduce((s, b) => s + b.incomes.XTR.amount, 0)).toLocaleString(), Math.round(xtrTotal).toLocaleString(), (xtrTotal / totalIncome * 100).toFixed(1)]);
  currencySheet.addRow(['STARS', sortedBots.reduce((s, b) => s + b.incomes.STARS.count, 0), Math.round(sortedBots.reduce((s, b) => s + b.incomes.STARS.amount, 0)).toLocaleString(), Math.round(starsTotal).toLocaleString(), (starsTotal / totalIncome * 100).toFixed(1)]);

  // ЛИСТ 10: ТОП ПОЛЬЗОВАТЕЛИ ПО ДОХОДАМ (кто принес больше денег)
  const incomeSheet = workbook.addWorksheet('💰 ТОП ПО ДОХОДАМ');
  incomeSheet.addRow(['№', 'Telegram ID', 'Username', 'Имя', 'Доходы (₽)', 'Опер. доходов', 'Ботов доходов', 'Боты (доходы)', 'Расходы (₽)', 'Опер. расходов', 'Доход RUB', 'Доход XTR', 'Доход STARS', 'Расход RUB', 'Расход XTR', 'Расход STARS']);
  incomeSheet.getRow(1).font = { bold: true };

  // Получаем данные ВСЕХ пользователей из Supabase
  console.log('👤 Загружаем данные ВСЕХ пользователей...\n');
  const usersData = await getAllUsersData();

  // Подготавливаем данные для листа "ТОП ПО ДОХОДАМ"
  const incomeUsersList = Object.values(usersData)
    .filter(user => user.total_income_rub > 0)
    .sort((a, b) => b.total_income_rub - a.total_income_rub)
    .slice(0, 500); // ТОП-500 по доходам

  console.log(`✅ Добавлено ${incomeUsersList.length} пользователей в лист "ТОП ПО ДОХОДАМ"\n`);

  incomeUsersList.forEach((user, index) => {
    incomeSheet.addRow([
      index + 1,
      user.telegram_id,
      '', // username (если будет в данных)
      '', // name (если будет в данных)
      Math.round(user.total_income_rub).toLocaleString(),
      user.income_operations,
      user.income_bots.size,
      Array.from(user.income_bots).join(', '),
      Math.round(user.total_spent_rub).toLocaleString(),
      user.spending_operations,
      Math.round(user.income_currency.RUB).toLocaleString(),
      Math.round(user.income_currency.XTR).toLocaleString(),
      Math.round(user.income_currency.STARS).toLocaleString(),
      Math.round(user.spending_currency.RUB).toLocaleString(),
      Math.round(user.spending_currency.XTR).toLocaleString(),
      Math.round(user.spending_currency.STARS).toLocaleString()
    ]);
  });

  // ЛИСТ 11: ТОП ПОЛЬЗОВАТЕЛИ ПО РАСХОДАМ (кто больше потратил)
  const spendingSheet = workbook.addWorksheet('👤 ТОП ПО РАСХОДАМ');
  spendingSheet.addRow(['№', 'Telegram ID', 'Username', 'Имя', 'Расходы (₽)', 'Опер. расходов', 'Ботов расходов', 'Боты (расходы)', 'Доходы (₽)', 'Опер. доходов', 'Расход RUB', 'Расход XTR', 'Расход STARS', 'Доход RUB', 'Доход XTR', 'Доход STARS']);
  spendingSheet.getRow(1).font = { bold: true };

  // Подготавливаем данные для листа "ТОП ПО РАСХОДАМ"
  const spendingUsersList = Object.values(usersData)
    .filter(user => user.total_spent_rub > 0)
    .sort((a, b) => b.total_spent_rub - a.total_spent_rub)
    .slice(0, 500); // ТОП-500 по расходам

  console.log(`✅ Добавлено ${spendingUsersList.length} пользователей в лист "ТОП ПО РАСХОДАМ"\n`);

  spendingUsersList.forEach((user, index) => {
    spendingSheet.addRow([
      index + 1,
      user.telegram_id,
      '', // username (если будет в данных)
      '', // name (если будет в данных)
      Math.round(user.total_spent_rub).toLocaleString(),
      user.spending_operations,
      user.spending_bots.size,
      Array.from(user.spending_bots).join(', '),
      Math.round(user.total_income_rub).toLocaleString(),
      user.income_operations,
      Math.round(user.spending_currency.RUB).toLocaleString(),
      Math.round(user.spending_currency.XTR).toLocaleString(),
      Math.round(user.spending_currency.STARS).toLocaleString(),
      Math.round(user.income_currency.RUB).toLocaleString(),
      Math.round(user.income_currency.XTR).toLocaleString(),
      Math.round(user.income_currency.STARS).toLocaleString()
    ]);
  });

  const outputPath = '/Users/playra/999-multibots-telegraf/ФИНАЛЬНЫЙ_ОТЧЕТ_ВСЕ_10_БОТОВ.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log('\n' + '='.repeat(80));
  console.log('✅ ФИНАЛЬНЫЙ ОТЧЕТ ПО ВСЕМ 10 БОТАМ ГОТОВ!');
  console.log('='.repeat(80));
  console.log(`📁 Файл: ${outputPath}`);
  console.log('\n📊 СОДЕРЖИМОЕ (11 ЛИСТОВ):');
  console.log('   1️⃣  📊 ОБЩАЯ СВОДКА - все 10 ботов с правильными STARS');
  console.log('   2️⃣  🆚 ПРОДАКШЕН vs ТЕСТ - сравнение типов ботов');
  console.log('   3️⃣  🏆 ТОП БОТЫ - рейтинги по всем категориям');
  console.log('   4️⃣  🤖 РАСХОДЫ НА AI - по всем ботам');
  console.log('   5️⃣  💰 ДОХОДЫ ПО МЕТОДАМ - все операции');
  console.log('   6️⃣  ⭐ РЕАЛЬНЫЕ STARS - только не фейковые');
  console.log('   7️⃣  🚫 ФЕЙК STARS - System/Admin (для информации)');
  console.log('   8️⃣  📈 ПРИБЫЛЬНОСТЬ - статус всех 10 ботов');
  console.log('   9️⃣  💎 СВОДКА ВАЛЮТ - RUB, XTR, STARS');
  console.log('   🔟  💰 ТОП ПО ДОХОДАМ - кто принес больше денег');
  console.log('   1️⃣1️⃣ 👤 ТОП ПО РАСХОДАМ - кто больше потратил');
  console.log('\n🎯 КЛЮЧЕВЫЕ ДАННЫЕ:');
  console.log(`   💰 RUB: ${Math.round(sortedBots.reduce((s, b) => s + b.incomes.RUB.amount, 0)).toLocaleString()}₽`);
  console.log(`   💎 XTR→₽: ${Math.round(sortedBots.reduce((s, b) => s + b.incomes.XTR.in_rub, 0)).toLocaleString()}₽`);
  console.log(`   ⭐ STARS→₽ (реальные): ${Math.round(sortedBots.reduce((s, b) => s + b.incomes.STARS.in_rub, 0)).toLocaleString()}₽`);
  console.log(`   📊 ИТОГО: ${Math.round(totalIncome).toLocaleString()}₽`);
  console.log(`   🤖 РАСХОДЫ: ${Math.round(totalExpenses).toLocaleString()}₽`);
  console.log(`   📈 ПРИБЫЛЬ: ${Math.round(totalProfit).toLocaleString()}₽ (${totalMargin.toFixed(1)}%)`);
  console.log('\n🎯 ПРОДАКШЕН vs ТЕСТОВЫЕ:');
  console.log(`   ПРОДАКШЕН: ${prodBots.length} ботов | Доходы: ${Math.round(prodIncome).toLocaleString()}₽ | Прибыль: ${Math.round(prodIncome - prodExpenses).toLocaleString()}₽`);
  console.log(`   ТЕСТОВЫЕ: ${testBots.length} ботов | Доходы: ${Math.round(testIncome).toLocaleString()}₽ | Расходы: ${Math.round(testExpenses).toLocaleString()}₽`);
  console.log('='.repeat(80) + '\n');

  return {
    total_income: Math.round(totalIncome),
    total_expenses: Math.round(totalExpenses),
    total_profit: Math.round(totalProfit),
    margin: totalMargin.toFixed(1)
  };
}

createFinalAllBotsReport().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
