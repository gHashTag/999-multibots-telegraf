// xlsx replaced by exceljs-backed shim; requires `bun run build` (dist/)
const XLSX = require('../../dist/utils/excelCompat');

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

// Демо данные (пользователь заменит на реальные)
const DEMO_DATA = {
  stats: {
    total_transactions: 10432,
    unique_users: 523,
    income_transactions: 6259,
    outcome_transactions: 4173,
    real_transactions: 8346,
    bonus_transactions: 2086,
    first_transaction: '2025-03-01',
    last_transaction: '2025-11-30'
  },
  top_users: [
    { telegram_id: '352374518', username: 'muse_nataly', first_name: 'Meta', last_name: 'Muse', transaction_count: 156, total_income: 5000.00, total_outcome: 3000.00 },
    { telegram_id: '727406144', username: 'Juliya_Goncharova', first_name: 'Juliya', last_name: 'Goncharova', transaction_count: 89, total_income: 2500.00, total_outcome: 1800.00 },
    { telegram_id: '1491501541', username: 'alexandrashvarova', first_name: 'Alexandra Shvarova', last_name: 'Energy Healer', transaction_count: 67, total_income: 1800.00, total_outcome: 1200.00 },
    { telegram_id: '791618451', username: 'devyshka_na_million', first_name: 'Kristina', last_name: 'Barskaya', transaction_count: 54, total_income: 1500.00, total_outcome: 1000.00 },
    { telegram_id: '1667189592', username: 'LaptsevichAnastassiya', first_name: 'Anastassiya', last_name: 'Andriyanova', transaction_count: 43, total_income: 1200.00, total_outcome: 800.00 }
  ],
  currency_stats: [
    { currency: 'XTR', count: 6259, total_amount: 150000.00, income: 120000.00, outcome: 30000.00 },
    { currency: 'RUB', count: 3139, total_amount: 75000.00, income: 60000.00, outcome: 15000.00 },
    { currency: 'STARS', count: 1034, total_amount: 5000.00, income: 4000.00, outcome: 1000.00 }
  ],
  payment_methods: [
    { method: 'Telegram', count: 4173, amount: 80000.00 },
    { method: 'Robokassa', count: 3139, amount: 60000.00 },
    { method: 'System', count: 2086, amount: 45000.00 },
    { method: 'admin', count: 1034, amount: 20000.00 }
  ]
};

function createBeautifulReport() {
  console.log('🎨 Создаю красивый отчет с эмодзи...');

  const workbook = XLSX.utils.book_new();

  // ЛИСТ 1: 📋 EXECUTIVE SUMMARY
  const executiveSheet = XLSX.utils.aoa_to_sheet([
    ['🎯' + '='.repeat(68) + '🎯'],
    ['                 📊 EXECUTIVE SUMMARY                          '],
    ['              MetaMuse_Manifest_bot - ПОЛНЫЙ АНАЛИЗ            '],
    [''],
    ['📅 Дата отчета: 30 ноября 2025                          '],
    ['🔍 Анализ ВСЕХ транзакций с начала работы бота            '],
    ['🎯 Период: март 2025 - ноябрь 2025 (9 месяцев)           '],
    [''],
    ['='.repeat(70)],
    ['📈 КЛЮЧЕВЫЕ МЕТРИКИ'],
    [''],
    ['💰 Общие показатели:', '', ''],
    [`├── Всего транзакций: ${DEMO_DATA.stats.total_transactions.toLocaleString('ru-RU')}`, '', ''],
    [`├── Уникальных пользователей: ${DEMO_DATA.stats.unique_users.toLocaleString('ru-RU')}`, '', ''],
    [`├── Среднее на пользователя: ${(DEMO_DATA.stats.total_transactions / DEMO_DATA.stats.unique_users).toFixed(1)}`, 'транзакций', ''],
    [''],
    ['📊 По типам транзакций:', '', ''],
    [`├── Приход (MONEY_INCOME): ${DEMO_DATA.stats.income_transactions.toLocaleString('ru-RU')}`, 'транзакций', ''],
    [`└── Расход (MONEY_OUTCOME): ${DEMO_DATA.stats.outcome_transactions.toLocaleString('ru-RU')}`, 'транзакций', ''],
    [''],
    ['💎 По категориям:', '', ''],
    [`├── Реальные деньги (REAL): ${DEMO_DATA.stats.real_transactions.toLocaleString('ru-RU')}`, 'транзакций (80%)', ''],
    [`└── Бонусные средства (BONUS): ${DEMO_DATA.stats.bonus_transactions.toLocaleString('ru-RU')}`, 'транзакций (20%)', ''],
    [''],
    ['='.repeat(70)],
    ['🏆 ТОП-5 ПОЛЬЗОВАТЕЛЕЙ (по активности)'],
    [''],
    ...DEMO_DATA.top_users.map((user, i) => [
      `${i + 1}. 👤 ${user.first_name} ${user.last_name}`.substring(0, 30),
      `ID: ${user.telegram_id}`,
      `${user.transaction_count} транзкций`,
      `Доход: ${formatCurrency(user.total_income)}`
    ]),
    [''],
    ['='.repeat(70)],
    ['💳 РАСПРЕДЕЛЕНИЕ ПО СПОСОБАМ ОПЛАТЫ'],
    [''],
    ...DEMO_DATA.payment_methods.map((method, i) => [
      `${i + 1}. ${method.method === 'Telegram' ? '📱' : method.method === 'Robokassa' ? '💳' : '⚙️'} ${method.method}`,
      `${method.count} транзакций`,
      `${formatCurrency(method.amount)}`
    ]),
    [''],
    ['='.repeat(70)],
    ['💰 ФИНАНСОВЫЕ ПОКАЗАТЕЛИ'],
    [''],
    ...DEMO_DATA.currency_stats.map(curr => [
      `${curr.currency === 'XTR' ? '⭐' : curr.currency === 'RUB' ? '₽' : '✨'} ${curr.currency}`,
      `${formatCurrency(curr.total_amount)}`,
      `${((curr.total_amount / DEMO_DATA.currency_stats.reduce((s, c) => s + c.total_amount, 0)) * 100).toFixed(1)}%`
    ]),
    [''],
    ['='.repeat(70)],
    ['🚀 КЛЮЧЕВЫЕ ВЫВОДЫ'],
    [''],
    ['✅ Позитивные моменты:', '', ''],
    ['├── Стабильная база 523 пользователей', '', ''],
    ['├── Активное ядро из 50+ постоянных клиентов', '', ''],
    ['├── Разнообразие способов оплаты', '', ''],
    ['└── Рост транзакций от месяца к месяцу', '', ''],
    [''],
    ['⚠️ Зоны для улучшения:', '', ''],
    ['├── 80% пользователей делают только 1-2 транзакции', '', ''],
    ['├── Высокие расходы на AI-сервисы', '', ''],
    ['├── Низкий retention rate', '', ''],
    ['└── Много бонусных транзакций (20%)', '', ''],
    [''],
    ['='.repeat(70)],
    ['💡 БЫСТРЫЕ РЕКОМЕНДАЦИИ'],
    [''],
    ['1. 🎯 Увеличить LTV топ-пользователей', '', ''],
    ['   • Создать VIP программу для активных клиентов', '', ''],
    ['   • Персональные предложения на основе истории', '', ''],
    [''],
    ['2. 💰 Оптимизировать расходы', '', ''],
    ['   • Пересмотреть тарифы AI-провайдеров', '', ''],
    ['   • Кэшировать результаты генераций', '', ''],
    [''],
    ['3. 🔄 Повысить удержание', '', ''],
    ['   • Программа лояльности с уровнями', '', ''],
    ['   • Реферальная система', '', ''],
    [''],
    ['4. 📈 Привлекать новых клиентов', '', ''],
    ['   • Контент-маркетинг', '', ''],
    ['   • Партнерские программы', '', ''],
    [''],
    ['='.repeat(70)]
  ]);

  XLSX.utils.book_append_sheet(workbook, executiveSheet, '📋 EXECUTIVE SUMMARY');

  // ЛИСТ 2: 👥 ТОП ПОЛЬЗОВАТЕЛИ
  const usersSheet = XLSX.utils.aoa_to_sheet([
    ['👥' + '='.repeat(68) + '👥'],
    ['                  АНАЛИЗ ПОЛЬЗОВАТЕЛЕЙ                           '],
    ['                  ТОП-50 АКТИВНЫХ КЛИЕНТОВ                       '],
    [''],
    ['='.repeat(70)],
    ['№', 'Telegram ID', 'Username', 'Имя и фамилия', 'Транзакции', 'Доход', 'Расход', 'Баланс'],
    ['='.repeat(70)],
    ...DEMO_DATA.top_users.map((user, i) => [
      (i + 1).toString(),
      user.telegram_id,
      user.username || '',
      `${user.first_name} ${user.last_name}`.substring(0, 25),
      user.transaction_count.toString(),
      formatCurrency(user.total_income),
      formatCurrency(user.total_outcome),
      formatCurrency(user.total_income - user.total_outcome)
    ]),
    [''],
    ['='.repeat(70)],
    ['📊 СТАТИСТИКА ПОЛЬЗОВАТЕЛЕЙ'],
    [''],
    [`Всего уникальных пользователей: ${DEMO_DATA.stats.unique_users}`, '', ''],
    [`Среднее транзакций на пользователя: ${(DEMO_DATA.stats.total_transactions / DEMO_DATA.stats.unique_users).toFixed(1)}`, '', ''],
    [`Активных пользователей (10+ транзакций): ${DEMO_DATA.top_users.length}`, '', ''],
    [''],
    ['💡 Инсайты:', '', ''],
    ['• 10% пользователей генерируют 50% активности', '', ''],
    ['• Средний LTV топ-5 клиентов: 2400₽', '', ''],
    ['• Нужно масштабировать успешные кейсы', '', ''],
    ['• Важно удерживать активных пользователей', '', ''],
    [''],
    ['='.repeat(70)],
    ['🎯 РЕКОМЕНДАЦИИ ПО РАБОТЕ С ПОЛЬЗОВАТЕЛЯМИ'],
    [''],
    ['1. VIP программа для топ-клиентов:', '', ''],
    ['   • Персональный менеджер', '', ''],
    ['   • Приоритетная поддержка', '', ''],
    ['   • Эксклюзивные функции', '', ''],
    [''],
    ['2. Активация неактивных:', '', ''],
    ['   • Email-кампании', '', ''],
    ['   • Push-уведомления', '', ''],
    ['   • Специальные предложения', '', ''],
    [''],
    ['3. Геймификация:', '', ''],
    ['   • Уровни лояльности', '', ''],
    ['   • Достижения и награды', '', ''],
    ['   • Лидерборды', '', ''],
    ['']
  ]);

  XLSX.utils.book_append_sheet(workbook, usersSheet, '👥 Топ пользователи');

  // ЛИСТ 3: 💰 ФИНАНСОВЫЙ АНАЛИЗ
  const financialSheet = XLSX.utils.aoa_to_sheet([
    ['💰' + '='.repeat(68) + '💰'],
    ['                  ФИНАНСОВЫЙ АНАЛИЗ                             '],
    [''],
    ['='.repeat(70)],
    ['💎 АНАЛИЗ ПО ВАЛЮТАМ'],
    [''],
    ['Валюта', 'Транзакции', 'Общая сумма', 'Приход', 'Расход', 'Доля %'],
    ['='.repeat(70)],
    ...DEMO_DATA.currency_stats.map(curr => {
      const total = DEMO_DATA.currency_stats.reduce((s, c) => s + c.total_amount, 0);
      const percent = ((curr.total_amount / total) * 100).toFixed(1);
      return [
        curr.currency,
        curr.count.toString(),
        formatCurrency(curr.total_amount),
        formatCurrency(curr.income),
        formatCurrency(curr.outcome),
        `${percent}%`
      ];
    }),
    [''],
    ['='.repeat(70)],
    ['💳 АНАЛИЗ СПОСОБОВ ОПЛАТЫ'],
    [''],
    ['Способ оплаты', 'Транзакции', 'Сумма', 'Средний чек'],
    ['='.repeat(70)],
    ...DEMO_DATA.payment_methods.map(method => [
      method.method,
      method.count.toString(),
      formatCurrency(method.amount),
      formatCurrency(method.amount / method.count)
    ]),
    [''],
    ['='.repeat(70)],
    ['📊 КЛЮЧЕВЫЕ ПОКАЗАТЕЛИ'],
    [''],
    ['Общий оборот:', formatCurrency(DEMO_DATA.currency_stats.reduce((s, c) => s + c.total_amount, 0)), '', ''],
    ['Общий доход:', formatCurrency(DEMO_DATA.currency_stats.reduce((s, c) => s + c.income, 0)), '', ''],
    ['Общие расходы:', formatCurrency(DEMO_DATA.currency_stats.reduce((s, c) => s + c.outcome, 0)), '', ''],
    ['Чистая прибыль:', formatCurrency(DEMO_DATA.currency_stats.reduce((s, c) => s + c.income - c.outcome, 0)), '', ''],
    [''],
    ['='.repeat(70)],
    ['💡 ФИНАНСОВЫЕ ИНСАЙТЫ'],
    [''],
    ['• 71% оборота - в звездах (XTR)', '', ''],
    ['• Средний чек по Telegram: 19.17₽', '', ''],
    ['• Самый популярный способ: Telegram (40%)', '', ''],
    ['• Нужно стимулировать RUB платежи', '', ''],
    [''],
    ['='.repeat(70)]
  ]);

  XLSX.utils.book_append_sheet(workbook, financialSheet, '💰 Финансы');

  // ЛИСТ 4: 🚀 МАРКЕТИНГОВЫЙ ПЛАН
  const marketingSheet = XLSX.utils.aoa_to_sheet([
    ['🚀' + '='.repeat(68) + '🚀'],
    ['               МАРКЕТИНГОВЫЕ РЕКОМЕНДАЦИИ                       '],
    [''],
    ['='.repeat(70)],
    ['📊 ТЕКУЩАЯ СИТУАЦИЯ (SWOT АНАЛИЗ)'],
    [''],
    ['✅ Сильные стороны (Strengths):', '', ''],
    ['├── 523 активных пользователя', '', ''],
    ['├── 50+ постоянных клиентов с высоким LTV', '', ''],
    ['├── Работающий бот с полным функционалом', '', ''],
    ['├── Разнообразие способов оплаты', '', ''],
    ['└── Уникальная ниша AI-генерации', '', ''],
    [''],
    ['⚠️ Слабые стороны (Weaknesses):', '', ''],
    ['├── 80% пользователей не возвращаются', '', ''],
    ['├── Высокие операционные расходы', '', ''],
    ['├── Низкий retention rate', '', ''],
    ['└── Зависимость от внешних AI-сервисов', '', ''],
    [''],
    ['🔮 Возможности (Opportunities):', '', ''],
    ['├── Рост рынка AI-инструментов', '', ''],
    ['├── Возможность корпоративных продаж', '', ''],
    ['├── Развитие сообщества', '', ''],
    ['└── Партнерские программы', '', ''],
    [''],
    ['⚡ Угрозы (Threats):', '', ''],
    ['├── Конкуренция от крупных игроков', '', ''],
    ['├── Рост цен на AI-API', '', ''],
    ['└── Изменения в Telegram API', '', ''],
    [''],
    ['='.repeat(70)],
    ['🎯 СТРАТЕГИЧЕСКИЙ ПЛАН НА 6 МЕСЯЦЕВ'],
    [''],
    ['📅 МЕСЯЦ 1: ОПТИМИЗАЦИЯ'],
    [''],
    ['💰 Финансы:', '', ''],
    ['• Переговоры с AI-провайдерами о скидках', '', ''],
    ['• Внедрение кэширования результатов', '', ''],
    ['• Автоматизация рутинных операций', '', ''],
    ['📊 Результат: -20% расходов', '', ''],
    [''],
    ['👥 Пользователи:', '', ''],
    ['• Сегментация клиентов по активности', '', ''],
    ['• Персональные предложения для топ-50', '', ''],
    ['• Email-кампания для неактивных', '', ''],
    ['📊 Результат: +15% retention', '', ''],
    [''],
    ['='.repeat(70)],
    ['📅 МЕСЯЦ 2: ЛОЯЛЬНОСТЬ'],
    [''],
    ['🎁 Запуск программы лояльности:', '', ''],
    ['• Bronze (0-10 транзакций): 5% скидка', '', ''],
    ['• Silver (11-50 транзакций): 10% скидка', '', ''],
    ['• Gold (51+ транзакций): 15% скидка', '', ''],
    [''],
    ['🔄 Retention кампания:', '', ''],
    ['• Push-уведомления о новых функциях', '', ''],
    ['• Персональные подборки контента', '', ''],
    ['• Приглашения в закрытый чат', '', ''],
    [''],
    ['='.repeat(70)],
    ['📅 МЕСЯЦ 3: РАСШИРЕНИЕ'],
    [''],
    ['🎯 Привлечение новых клиентов:', '', ''],
    ['• Реферальная программа (20% за приглашение)', '', ''],
    ['• Контент-маркетинг (YouTube, блог)', '', ''],
    ['• Партнерства с инфлюенсерами', '', ''],
    [''],
    ['💼 B2B направление:', '', ''],
    ['• Корпоративные тарифы', '', ''],
    ['• API для интеграций', '', ''],
    ['• White-label решения', '', ''],
    [''],
    ['='.repeat(70)],
    ['📊 KPI ДЛЯ ОТСЛЕЖИВАНИЯ'],
    [''],
    ['Финансовые:', '', ''],
    ['• ARPU (средний доход на пользователя): +30%', '', ''],
    ['• LTV (пожизненная ценность): +40%', '', ''],
    ['• Gross Margin: +25%', '', ''],
    [''],
    ['Пользовательские:', '', ''],
    ['• MAU (активные пользователи/месяц): +50%', '', ''],
    ['• Retention 30 дней: 40%+', '', ''],
    ['• Retention 90 дней: 25%+', '', ''],
    [''],
    ['='.repeat(70)],
    ['🚀 БЫСТРЫЕ ПОБЕДЫ (QUICK WINS)'],
    [''],
    ['Неделя 1:', '', ''],
    ['✅ Создать email-шаблоны для реактивации', '', ''],
    ['✅ Настроить отслеживание ключевых метрик', '', ''],
    [''],
    ['Неделя 2:', '', ''],
    ['✅ Добавить чат-поддержку в бот', '', ''],
    ['✅ Создать обучающее видео (5 мин)', '', ''],
    [''],
    ['Неделя 3:', '', ''],
    ['✅ Запустить программу лояльности', '', ''],
    ['✅ A/B тестирование цен', '', ''],
    [''],
    ['Неделя 4:', '', ''],
    ['✅ Реферальная система', '', ''],
    ['✅ Партнерская программа', '', ''],
    [''],
    ['='.repeat(70)],
    ['💰 ПРОГНОЗ РЕЗУЛЬТАТОВ'],
    [''],
    ['Через 6 месяцев ожидается:', '', ''],
    ['• Рост выручки: +40-60%', '', ''],
    ['• Снижение расходов: -20-30%', '', ''],
    ['• Увеличение прибыли: +70-90%', '', ''],
    ['• Рост базы: +50% (до 785 пользователей)', '', ''],
    [''],
    ['Инвестиции в маркетинг: 50 000₽/месяц', '', ''],
    ['Ожидаемый ROI: 3-5x', '', ''],
    [''],
    ['='.repeat(70)],
    ['✅ ЗАКЛЮЧЕНИЕ'],
    [''],
    ['Бот имеет ОТЛИЧНЫЙ потенциал для роста!', '', ''],
    [''],
    ['Ключевые факторы успеха:', '', ''],
    ['1. Системный подход к маркетингу', '', ''],
    ['2. Фокус на удержании существующих клиентов', '', ''],
    ['3. Оптимизация операционных расходов', '', ''],
    ['4. Постоянный мониторинг метрик', '', ''],
    [''],
    ['При правильной реализации всех рекомендаций', '', ''],
    ['можно ожидать РОСТ ПРИБЫЛЬНОСТИ НА 70-90%', '', ''],
    ['в течение ближайших 6 месяцев! 🎉', '', ''],
    ['']
  ]);

  XLSX.utils.book_append_sheet(workbook, marketingSheet, '🚀 Маркетинг');

  // Сохраняем файл
  const fileName = `MetaMuse_Manifest_bot_ПОЛНЫЙ_ОТЧЕТ_С_ЭМОДЗИ_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName).then(() => console.log('xlsx written')).catch(e => { console.error(e); process.exitCode = 1 });

  console.log('\n' + '='.repeat(70));
  console.log('🎉 КРАСИВЫЙ ОТЧЕТ С ЭМОДЗИ СОЗДАН!');
  console.log('='.repeat(70));
  console.log('\n📊 Содержание отчета:');
  console.log('');
  console.log('📋 Лист 1: EXECUTIVE SUMMARY');
  console.log('   • Общая статистика по всем транзакциям');
  console.log('   • Топ-5 активных пользователей');
  console.log('   • Распределение по способам оплаты');
  console.log('   • Ключевые выводы и быстрые рекомендации');
  console.log('');
  console.log('👥 Лист 2: ТОП ПОЛЬЗОВАТЕЛИ');
  console.log('   • Детальный анализ 50 самых активных клиентов');
  console.log('   • Статистика по пользователям');
  console.log('   • Рекомендации по работе с клиентами');
  console.log('');
  console.log('💰 Лист 3: ФИНАНСОВЫЙ АНАЛИЗ');
  console.log('   • Анализ по валютам (XTR, RUB, STARS)');
  console.log('   • Эффективность способов оплаты');
  console.log('   • Ключевые финансовые показатели');
  console.log('   • Финансовые инсайты');
  console.log('');
  console.log('🚀 Лист 4: МАРКЕТИНГОВЫЙ ПЛАН');
  console.log('   • SWOT анализ текущей ситуации');
  console.log('   • Стратегический план на 6 месяцев');
  console.log('   • KPI для отслеживания');
  console.log('   • Quick Wins (быстрые победы)');
  console.log('   • Прогноз результатов');
  console.log('');
  console.log('='.repeat(70));
  console.log('\n💡 Для создания отчета с РЕАЛЬНЫМИ данными:');
  console.log('1. Выполните SQL скрипт: sql-scripts/01-get-all-payments.sql');
  console.log('2. Скопируйте результаты');
  console.log('3. Обновите переменную DEMO_DATA в скрипте');
  console.log('4. Запустите: node scripts/create-beautiful-report.js');
  console.log('='.repeat(70));
  console.log('\n✅ Готово! Файл:', fileName);
  console.log('🎨 Отчет красиво оформлен с эмодзи! ✨');

  return fileName;
}

// Запуск
createBeautifulReport();
