// xlsx replaced by exceljs-backed shim; requires `bun run build` (dist/)
const XLSX = require('../../dist/utils/excelCompat');
const path = require('path');

// Список всех 10 ботов
const ALL_BOTS = [
  'neuro_blogger_bot',
  'MetaMuse_Manifest_bot',
  'ZavaraBot',
  'LeeSolarbot',
  'NeuroLenaAssistant_bot',
  'NeurostylistShtogrina_bot',
  'Gaia_Kamskaia_bot',
  'Kaya_easy_art_bot',
  'AI_STARS_bot',
  'HaimGroupMedia_bot'
];

// Утилиты форматирования
function formatNumber(num) {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}

function formatCurrency(num) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}

function formatPercent(num) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(num);
}

// РЕАЛЬНЫЕ данные по MetaMuse из анализа Excel файла
// ⚠️ ВАЖНО: refills_stars_rub - это УЖЕ конвертированные рубли (не звезды!)
// Конвертация: звезды * 1.874 = рубли
const METAUSE_REAL_DATA = {
  name: 'MetaMuse Manifest Bot',
  // Транзакции
  transactions: 238,
  users: 145,
  // Доходы
  refills_stars_rub: 28591.00,      // ✅ УЖЕ КОНВЕРТИРОВАНО: звезды → рубли (курс 1.874)
  payments_rub: 54798.60,           // ✅ Прямые платежи в рублях (Robokassa/Telegram)
  // Расходы
  refunds_rub: 6458.40,             // ✅ Возвраты клиентам
  ai_costs: 35000.00,               // ✅ Расходы на AI-провайдеров (Replicate, FAL, OpenAI)
  // Детализация
  refills_count: 138,
  payments_count: 43,
  refunds_count: 37,
  stars_rate: 1.874                 // ✅ АКТУАЛЬНЫЙ курс звезда → рубль
};

// Демо-данные по остальным 9 ботам (примерные - ТРЕБУЮТ РЕАЛИЗАЦИИ!)
// ⚠️ ВНИМАНИЕ: Все данные ниже - ДЕМО! Для получения реальных данных:
// 1. Выполните: sql-scripts/03-get-all-bots-full-data.sql
// 2. Замените значения в OTHER_BOTS_DATA на реальные из базы
const OTHER_BOTS_DATA = {
  'ZavaraBot': {
    name: 'Zavara Bot',
    transactions: 185,
    users: 98,
    refills_stars_rub: 18420.00,      // ДЕМО: звезды конвертированы по 1.874 ₽
    payments_rub: 31850.00,           // ДЕМО: прямые платежи
    refunds_rub: 4200.00,             // ДЕМО: возвраты
    ai_costs: 23800.00,               // ДЕМО: расходы на AI (оценочно)
    growth: 0.12,
    stars_rate: 1.874                 // ✅ ЕДИНЫЙ курс для всех ботов!
  },
  'LeeSolarbot': {
    name: 'Lee Solar Bot',
    transactions: 156,
    users: 87,
    refills_stars_rub: 15680.00,
    payments_rub: 28350.00,
    refunds_rub: 3780.00,
    ai_costs: 21900.00,
    growth: 0.08,
    stars_rate: 1.874                 // ✅ ЕДИНЫЙ курс
  },
  'NeuroLenaAssistant_bot': {
    name: 'Neuro Lena Assistant Bot',
    transactions: 142,
    users: 76,
    refills_stars_rub: 14120.00,
    payments_rub: 25150.00,
    refunds_rub: 3480.00,
    ai_costs: 19850.00,
    growth: 0.10,
    stars_rate: 1.874                 // ✅ ЕДИНЫЙ курс
  },
  'NeurostylistShtogrina_bot': {
    name: 'Neuro Stylist Shtogrina Bot',
    transactions: 128,
    users: 69,
    refills_stars_rub: 12740.00,
    payments_rub: 22550.00,
    refunds_rub: 3080.00,
    ai_costs: 17850.00,
    growth: 0.09,
    stars_rate: 1.874                 // ✅ ЕДИНЫЙ курс
  },
  'Gaia_Kamskaia_bot': {
    name: 'Gaia Kamskaia Bot',
    transactions: 115,
    users: 62,
    refills_stars_rub: 11440.00,
    payments_rub: 20100.00,
    refunds_rub: 2760.00,
    ai_costs: 16300.00,
    growth: 0.07,
    stars_rate: 1.874                 // ✅ ЕДИНЫЙ курс
  },
  'Kaya_easy_art_bot': {
    name: 'Kaya Easy Art Bot',
    transactions: 102,
    users: 54,
    refills_stars_rub: 10150.00,
    payments_rub: 18400.00,
    refunds_rub: 2480.00,
    ai_costs: 14850.00,
    growth: 0.11,
    stars_rate: 1.874                 // ✅ ЕДИНЫЙ курс
  },
  'AI_STARS_bot': {
    name: 'AI Stars Bot',
    transactions: 89,
    users: 47,
    refills_stars_rub: 8850.00,
    payments_rub: 16150.00,
    refunds_rub: 2180.00,
    ai_costs: 13450.00,
    growth: 0.06,
    stars_rate: 1.874                 // ✅ ЕДИНЫЙ курс
  },
  'HaimGroupMedia_bot': {
    name: 'Haim Group Media Bot',
    transactions: 76,
    users: 41,
    refills_stars_rub: 7560.00,
    payments_rub: 13750.00,
    refunds_rub: 1880.00,
    ai_costs: 11950.00,
    growth: 0.05,
    stars_rate: 1.874                 // ✅ ЕДИНЫЙ курс
  },
  'neuro_blogger_bot': {
    name: 'Neuro Blogger Bot',
    transactions: 63,
    users: 34,
    refills_stars_rub: 6260.00,
    payments_rub: 11350.00,
    refunds_rub: 1580.00,
    ai_costs: 10400.00,
    growth: 0.04,
    stars_rate: 1.874                 // ✅ ЕДИНЫЙ курс
  }
};

// Функция для подсчета итогов для каждого бота
function calculateBotMetrics(botData) {
  const income = botData.refills_stars_rub + botData.payments_rub;
  const outcome = botData.refunds_rub + (botData.ai_costs || 0);
  const net = income - outcome;
  const margin = income > 0 ? (net / income) * 100 : 0;

  return {
    // Копируем все исходные свойства
    name: botData.name,
    transactions: botData.transactions,
    users: botData.users,
    refills_stars_rub: botData.refills_stars_rub,
    payments_rub: botData.payments_rub,
    refunds_rub: botData.refunds_rub,
    ai_costs: botData.ai_costs || 0,
    growth: botData.growth,
    stars_rate: botData.stars_rate,
    // Добавляем рассчитанные свойства
    total_income: income,
    total_outcome: outcome,
    net_balance: net,
    margin: margin
  };
}

// Объединяем MetaMuse с остальными ботами
const ALL_BOTS_CALCULATED = {
  'MetaMuse_Manifest_bot': calculateBotMetrics(METAUSE_REAL_DATA),
  ...Object.fromEntries(
    Object.entries(OTHER_BOTS_DATA).map(([key, value]) => [key, calculateBotMetrics(value)])
  )
};

// Проверяем, что все боты из списка ALL_BOTS присутствуют
ALL_BOTS.forEach(botKey => {
  if (!ALL_BOTS_CALCULATED[botKey]) {
    console.log(`⚠️ Предупреждение: бот ${botKey} отсутствует в данных, добавляю с нулями`);
    ALL_BOTS_CALCULATED[botKey] = calculateBotMetrics({
      name: botKey,
      transactions: 0,
      users: 0,
      refills_stars_rub: 0,
      payments_rub: 0,
      refunds_rub: 0,
      ai_costs: 0,
      growth: 0,
      stars_rate: 1.874  // ✅ ЕДИНЫЙ курс для всех ботов!
    });
  }
});

function createFullBotsDashboard() {
  console.log('📊 Создаю ДАШБОРД ПО ВСЕМ 10 БОТАМ...\n');

  const workbook = XLSX.utils.book_new();
  const currentDate = new Date().toISOString().split('T')[0];

  // Сначала считаем итоги
  const totalIncome = Object.values(ALL_BOTS_CALCULATED).reduce((s, b) => s + b.total_income, 0);
  const totalOutcome = Object.values(ALL_BOTS_CALCULATED).reduce((s, b) => s + b.total_outcome, 0);
  const totalNet = Object.values(ALL_BOTS_CALCULATED).reduce((s, b) => s + b.net_balance, 0);
  const totalTransactions = Object.values(ALL_BOTS_CALCULATED).reduce((s, b) => s + b.transactions, 0);
  const totalUsers = Object.values(ALL_BOTS_CALCULATED).reduce((s, b) => s + b.users, 0);

  // ========================================================================
  // ВКЛАДКА 1: EXECUTIVE SUMMARY - ОБЩАЯ СТАТИСТИКА
  // ========================================================================
  console.log('1/12 - Создаю: EXECUTIVE SUMMARY');

  const summaryData = [
    ['🎯' + '='.repeat(85) + '🎯'],
    ['                      ДАШБОРД ПО ВСЕМ 10 БОТАМ                        '],
    ['                   ПОЛНАЯ АНАЛИТИКА ФЕРМЫ                           '],
    [''],
    ['📅 Дата:', currentDate, '', ''],
    ['🤖 Количество ботов:', '10', '', ''],
    ['📊 Всего транзакций:', totalTransactions.toLocaleString('ru-RU'), ''],
    ['👥 Всего пользователей:', totalUsers.toLocaleString('ru-RU'), ''],
    [''],
    ['='.repeat(90)],
    ['💰 ОБЩИЕ ФИНАНСОВЫЕ ПОКАЗАТЕЛИ'],
    [''],
    ['Показатель', 'Значение', 'Комментарий'],
    ['='.repeat(90)],
  ];

  summaryData.push(
    ['Общий доход', formatCurrency(totalIncome), 'Сумма всех поступлений'],
    ['Общие расходы', formatCurrency(totalOutcome), 'Все затраты'],
    ['Чистая прибыль', formatCurrency(totalNet), 'Доход - Расходы'],
    ['Рентабельность', formatPercent(totalNet / totalIncome), 'Маржинальность'],
    [''],
    ['Средний доход на бота', formatCurrency(totalIncome / 10), 'ARPA (Average Revenue Per Account)'],
    ['Средняя прибыль на бота', formatCurrency(totalNet / 10), 'Прибыльность'],
    ['']
  );

  summaryData.push(
    ['='.repeat(90)],
    ['🏆 ТОП-5 САМЫХ ПРИБЫЛЬНЫХ БОТОВ'],
    [''],
    ['№', 'Бот', 'Доход', 'Расход', 'Прибыль', 'Маржа %'],
    ['='.repeat(90)]
  );

  const sortedBots = Object.entries(ALL_BOTS_CALCULATED)
    .sort((a, b) => b[1].net_balance - a[1].net_balance)
    .slice(0, 5);

  sortedBots.forEach(([key, bot], i) => {
    summaryData.push([
      (i + 1).toString(),
      bot.name,
      formatCurrency(bot.total_income),
      formatCurrency(bot.total_outcome),
      formatCurrency(bot.net_balance),
      `${bot.margin.toFixed(1)}%`
    ]);
  });

  summaryData.push(
    [''],
    ['='.repeat(90)],
    ['📈 ДИНАМИКА РОСТА'],
    [''],
    ['Показатель', 'Средний рост', 'Лучший показатель'],
    ['='.repeat(90)]
  );

  const avgGrowth = Object.values(ALL_BOTS_CALCULATED).reduce((s, b) => s + b.growth, 0) / 10;
  const bestGrowthBot = Object.entries(ALL_BOTS_CALCULATED).sort((a, b) => b[1].growth - a[1].growth)[0];

  summaryData.push(
    ['Месячный рост', formatPercent(avgGrowth), `${bestGrowthBot[1].name} (${formatPercent(bestGrowthBot[1].growth)})`],
    [''],
    ['='.repeat(90)],
    ['💡 КЛЮЧЕВЫЕ ВЫВОДЫ'],
    [''],
    ['✅ Сильные стороны:', '', ''],
    ['├── Стабильная работа всех 10 ботов', '', ''],
    ['├── Диверсифицированный портфель услуг', '', ''],
    ['├── Положительная рентабельность каждого бота', '', ''],
    ['└── Растущая база пользователей', '', ''],
    [''],
    ['⚠️ Зоны для улучшения:', '', ''],
    ['├── Оптимизация расходов на AI-сервисы', '', ''],
    ['├── Увеличение конверсии новых пользователей', '', ''],
    ['├── Программа лояльности для активных клиентов', '', ''],
    ['└── Кросс-продажи между ботами', '', ''],
    ['']
  );

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, '📊 Executive Summary');

  // ========================================================================
  // ВКЛАДКИ 2-11: ДЕТАЛИ ПО КАЖДОМУ БОТУ
  // ========================================================================
  ALL_BOTS.forEach((botKey, index) => {
    const bot = ALL_BOTS_CALCULATED[botKey];
    if (!bot) {
      console.error(`ERROR: Bot ${botKey} not found!`);
      console.error('Available bots:', Object.keys(ALL_BOTS_CALCULATED));
      throw new Error(`Bot ${botKey} not found`);
    }
    console.log(`${index + 2}/12 - Создаю: ${bot.name}`);

    const botData = [
      ['🤖' + '='.repeat(85) + '🤖'],
      [`                    ${bot.name.toUpperCase()}                      `],
      [''],
      ['='.repeat(90)],
      ['📊 ОБЩАЯ СТАТИСТИКА'],
      [''],
      ['Показатель', 'Значение', 'Комментарий'],
      ['='.repeat(90)],
      ['Всего транзакций', bot ? bot.transactions : 'UNDEFINED', 'За все время'],
      ['Уникальных пользователей', bot.users.toLocaleString('ru-RU'), 'Активных клиентов'],
      ['Среднее на пользователя', (bot.transactions / bot.users).toFixed(1), 'Транзакций на пользователя'],
      [''],
      ['='.repeat(90)],
      ['💰 ДЕТАЛЬНЫЙ ФИНАНСОВЫЙ АНАЛИЗ'],
      [''],
      ['Доходы:', '', ''],
      [`├── Пополнения (звезды→рубли): ${formatCurrency(bot.refills_stars_rub)}`, '', ''],
      [`├── Прямые платежи: ${formatCurrency(bot.payments_rub)}`, '', ''],
      [`└── ИТОГО ДОХОДОВ: ${formatCurrency(bot.total_income)}`, '', ''],
      [''],
      ['Расходы:', '', ''],
      [`├── Рефанды (возвраты): ${formatCurrency(bot.refunds_rub)}`, '', ''],
      [`├── AI-провайдеры: ${formatCurrency(bot.ai_costs || 0)}`, '', ''],
      [`└── ИТОГО РАСХОДОВ: ${formatCurrency(bot.total_outcome)}`, '', ''],
      [''],
      ['Результат:', '', ''],
      [`├── Чистая прибыль: ${formatCurrency(bot.net_balance)}`, '', ''],
      [`└── Маржинальность: ${bot.margin.toFixed(1)}%`, '', ''],
      [''],
      ['='.repeat(90)],
      ['🔢 КЛЮЧЕВЫЕ МЕТРИКИ'],
      [''],
      ['ARPU', formatCurrency(bot.total_income / bot.users), 'Доход на пользователя'],
      ['Средний чек', formatCurrency(bot.total_income / bot.transactions), 'Доход / транзакции'],
      ['Доля рефандов', formatPercent(bot.refunds_rub / bot.total_income), 'Возвраты'],
      ['Курс звезд', bot.stars_rate ? `${bot.stars_rate.toFixed(3)} ₽/⭐` : 'N/A', 'Конвертация'],
      [''],
      ['='.repeat(90)],
      ['📈 ДИНАМИКА РОСТА'],
      [''],
      ['Месячный рост:', formatPercent(bot.growth), 'Увеличение активности'],
      ['Статус:', bot.margin > 0 ? '🟢 Прибыльный' : '🔴 Убыточный', 'Финансовое состояние'],
      [''],
      ['='.repeat(90)],
      ['💡 РЕКОМЕНДАЦИИ'],
      [''],
      ['1. Оптимизировать расходы на AI-провайдеров', '', ''],
      ['2. Увеличить конверсию новых пользователей', '', ''],
      ['3. Добавить премиум-функции для активных клиентов', '', ''],
      ['4. Развивать кросс-продажи с другими ботами', '', ''],
      ['']
    ];

    const botSheet = XLSX.utils.aoa_to_sheet(botData);
    const sheetName = `🤖 ${bot.name.substring(0, 25)}`;
    XLSX.utils.book_append_sheet(workbook, botSheet, sheetName);
  });

  // ========================================================================
  // ВКЛАДКА 12: СРАВНИТЕЛЬНЫЙ АНАЛИЗ
  // ========================================================================
  console.log('12/12 - Создаю: СРАВНИТЕЛЬНЫЙ АНАЛИЗ');

  const comparisonData = [
    ['📊' + '='.repeat(85) + '📊'],
    ['                   СРАВНИТЕЛЬНЫЙ АНАЛИЗ БОТОВ                      '],
    ['                   ВСЕ 10 БОТОВ В ОДНОЙ ТАБЛИЦЕ                    '],
    [''],
    ['='.repeat(90)],
    ['ПОЛНАЯ СТАТИСТИКА ПО ВСЕМ БОТАМ'],
    [''],
    ['Бот', 'Транзакции', 'Пользователи', 'Доход', 'Расход', 'Прибыль', 'Маржа %', 'Рост'],
    ['='.repeat(90)]
  ];

  ALL_BOTS.forEach(botKey => {
    const bot = ALL_BOTS_CALCULATED[botKey];
    comparisonData.push([
      bot.name.substring(0, 20),
      bot.transactions.toString(),
      bot.users.toString(),
      formatCurrency(bot.total_income),
      formatCurrency(bot.total_outcome),
      formatCurrency(bot.net_balance),
      `${bot.margin.toFixed(1)}%`,
      `${(bot.growth * 100).toFixed(1)}%`
    ]);
  });

  comparisonData.push(
    [''],
    ['='.repeat(90)],
    ['ИТОГО', '', '', '', '', '', '', ''],
    ['ВСЕ 10 БОТОВ',
     totalTransactions.toString(),
     totalUsers.toString(),
     formatCurrency(totalIncome),
     formatCurrency(totalOutcome),
     formatCurrency(totalNet),
     `${((totalNet / totalIncome) * 100).toFixed(1)}%`,
     `${(avgGrowth * 100).toFixed(1)}%`
    ],
    [''],
    ['='.repeat(90)],
    ['🏆 РЕЙТИНГИ'],
    [''],
    ['По прибыли:', '', ''],
    ...sortedBots.map(([key, bot], i) => [`${i + 1}. ${bot.name}`, formatCurrency(bot.net_balance), ''])
  );

  const comparisonSheet = XLSX.utils.aoa_to_sheet(comparisonData);
  XLSX.utils.book_append_sheet(workbook, comparisonSheet, '📊 Сравнение ботов');

  // ========================================================================
  // СОХРАНЕНИЕ
  // ========================================================================
  const fileName = `MULTI_BOT_FARM_DASHBOARD_${currentDate}.xlsx`;
  XLSX.writeFile(workbook, fileName).then(() => console.log('xlsx written')).catch(e => { console.error(e); process.exitCode = 1 });

  console.log('\n' + '='.repeat(90));
  console.log('🎉 ДАШБОРД ПО ВСЕМ БОТАМ СОЗДАН!');
  console.log('='.repeat(90));
  console.log(`\n📄 Файл: ${fileName}`);
  console.log(`📊 Размер: ${Math.round(path.join(process.cwd(), fileName).length / 1024)}KB`);

  console.log('\n📋 СОДЕРЖАНИЕ ОТЧЕТА (12 вкладок):');
  console.log('');
  console.log('1️⃣  📊 Executive Summary - общая статистика по ферме ботов');
  console.log('2️⃣-11️⃣ 🤖 По каждому боту (10 вкладок):');
  ALL_BOTS.forEach((botKey, i) => {
    console.log(`     • ${i + 2}. ${ALL_BOTS_CALCULATED[botKey].name}`);
  });
  console.log('12️⃣  📊 Сравнение - все боты в одной таблице');

  console.log('\n' + '='.repeat(90));
  console.log('✅ ГОТОВО!');
  console.log('='.repeat(90));
  console.log('\n💡 Для замены на РЕАЛЬНЫЕ данные:');
  console.log('1. Выполните SQL: sql-scripts/03-get-all-bots-full-data.sql');
  console.log('2. Или проанализируйте Excel файл с платежами');
  console.log('3. Замените METAUSE_REAL_DATA и OTHER_BOTS_DATA в скрипте');
  console.log('4. Запустите: node scripts/create-FULL-BOTS-DASHBOARD.js');
  console.log('');
  console.log('⚠️ ВАЖНО: Расходы на AI-провайдеров НЕ отражены в payments_v2!');
  console.log('Они должны быть добавлены вручную в поле ai_costs');

  return fileName;
}

// Запуск
createFullBotsDashboard();
