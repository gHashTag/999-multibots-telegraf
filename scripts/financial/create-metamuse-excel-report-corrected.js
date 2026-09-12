// xlsx replaced by exceljs-backed shim; requires `bun run build` (dist/)
const XLSX = require('../../dist/utils/excelCompat');

// Данные из SQL запросов
const summaryData = {
  total_income_stars: 60462.00,
  total_expense_stars: 102819.97,
  total_cost_stars: 32593.96,
  net_profit_stars: -74951.93,
  total_income_rub: 57879.00,
  net_profit_rub: -185866.07,
  payment_status: 'БОТ ДОЛЖЕН ЗАПЛАТИТЬ',
  amount_to_pay_stars: 74951.93
};

const statsData = {
  total_transactions: 4036,
  unique_users: 118,
  first_transaction: '2025-03-01 11:57:05',
  last_transaction: '2025-11-03 09:12:37',
  avg_transaction_stars: 79.74,
  avg_cost_stars: 9.44
};

const servicesData = [
  { service_type: 'neuro_photo', operation_count: 2804, total_revenue_stars: 35668.90, total_cost_stars: 17506.67, profit_stars: 18162.23, margin_percent: 50.92 },
  { service_type: 'digital_avatar_body', operation_count: 53, total_revenue_stars: 20884.04, total_cost_stars: 12989.29, profit_stars: 7894.75, margin_percent: 37.80 },
  { service_type: 'image_to_video', operation_count: 298, total_revenue_stars: 20197.00, total_cost_stars: 1585.00, profit_stars: 18612.00, margin_percent: 92.15 },
  { service_type: 'text_to_video', operation_count: 68, total_revenue_stars: 12003.00, total_cost_stars: 0, profit_stars: 12003.00, margin_percent: 100.00 },
  { service_type: 'other', operation_count: 25, total_revenue_stars: 7123.00, total_cost_stars: 0, profit_stars: 7123.00, margin_percent: 100.00 },
  { service_type: 'image_to_prompt', operation_count: 200, total_revenue_stars: 535.03, total_cost_stars: 120.00, profit_stars: 415.03, margin_percent: 77.57 },
  { service_type: 'text_to_image', operation_count: 68, total_revenue_stars: 393.00, total_cost_stars: 393.00, profit_stars: 0.00, margin_percent: 0.00 },
  { service_type: 'lip_sync', operation_count: 7, total_revenue_stars: 165.00, total_cost_stars: 0, profit_stars: 165.00, margin_percent: 100.00 }
];

const monthlyData = [
  { month: '2025-11', transaction_count: 7, income_stars: 476.00, expense_stars: 142.50, cost_stars: 0, profit_stars: 333.50, rub_income: 0 },
  { month: '2025-10', transaction_count: 222, income_stars: 4098.00, expense_stars: 10370.29, cost_stars: 661.67, profit_stars: -6933.96, rub_income: 4098.00 },
  { month: '2025-09', transaction_count: 233, income_stars: 3799.00, expense_stars: 4528.81, cost_stars: 1773.13, profit_stars: -2502.94, rub_income: 3799.00 },
  { month: '2025-08', transaction_count: 525, income_stars: 11998.00, expense_stars: 11380.67, cost_stars: 5145.53, profit_stars: -4528.20, rub_income: 11998.00 },
  { month: '2025-07', transaction_count: 547, income_stars: 5157.00, expense_stars: 21388.32, cost_stars: 5308.67, profit_stars: -21539.99, rub_income: 5157.00 },
  { month: '2025-06', transaction_count: 722, income_stars: 3853.00, expense_stars: 16669.77, cost_stars: 7043.63, profit_stars: -19860.40, rub_income: 3853.00 },
  { month: '2025-05', transaction_count: 826, income_stars: 4279.00, expense_stars: 29808.19, cost_stars: 9456.33, profit_stars: -34985.52, rub_income: 4279.00 },
  { month: '2025-04', transaction_count: 756, income_stars: 13673.00, expense_stars: 7901.42, cost_stars: 2878.00, profit_stars: 2893.58, rub_income: 13673.00 },
  { month: '2025-03', transaction_count: 198, income_stars: 13129.00, expense_stars: 630.00, cost_stars: 327.00, profit_stars: 12172.00, rub_income: 13129.00 }
];

const STAR_TO_RUB_RATE = 1.8;

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

function createExcelReport() {
  const workbook = XLSX.utils.book_new();

  // ЛИСТ 1: ИТОГОВЫЙ РАСЧЁТ
  const summarySheet = XLSX.utils.aoa_to_sheet([
    ['═══════════════════════════════════════════════════════════════'],
    ['              ФИНАНСОВЫЙ ОТЧЕТ БОТА                           '],
    ['               MetaMuse_Manifest_bot                          '],
    ['                                                          '],
    ['📊 ДВИЖЕНИЕ ДЕНЕЖНЫХ СРЕДСТВ'],
    [''],
    ['💎 ДОХОДЫ ВЛАДЕЛЬЦА (рубли):'],
    ['├── Платежи от клиентов (RUB)', formatCurrency(summaryData.total_income_rub)],
    ['└── ⭐ В ЗВЁЗДАХ (не конвертируются)', formatNumber(summaryData.total_income_stars), '⭐'],
    [''],
    ['📉 РАСХОДЫ БОТА (звёзды):'],
    ['├── Оплата AI-сервисов', formatNumber(summaryData.total_expense_stars), '⭐ =', formatCurrency(summaryData.total_expense_stars * STAR_TO_RUB_RATE)],
    ['└── Себестоимость услуг', formatNumber(summaryData.total_cost_stars), '⭐ =', formatCurrency(summaryData.total_cost_stars * STAR_TO_RUB_RATE)],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['🎯 РАСЧЁТ ВЗАИМОРАСЧЁТОВ'],
    [''],
    ['БОТ ДОЛЖЕН ПОЛУЧИТЬ от владельца:', '0 ⭐', '0 ₽'],
    ['БОТ ДОЛЖЕН ЗАПЛАТИТЬ владельцу:', formatNumber(summaryData.amount_to_pay_stars), '⭐ =', formatCurrency(summaryData.amount_to_pay_stars * STAR_TO_RUB_RATE)],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['✅ ИТОГ: БОТ ДОЛЖЕН ЗАПЛАТИТЬ'],
    [''],
    ['К оплате: 74 951,93 ⭐'],
    ['К оплате: 134 913,47 ₽'],
    [''],
    ['Пояснение:'],
    ['Бот потратил на AI-сервисы больше, чем заработал владелец'],
    ['═══════════════════════════════════════════════════════════════'],
    [''],
    ['📊 ОБЩАЯ СТАТИСТИКА'],
    [''],
    ['Всего транзакций', statsData.total_transactions],
    ['Уникальных пользователей', statsData.unique_users],
    ['Средний чек (звезды)', formatNumber(statsData.avg_transaction_stars)],
    ['Средняя себестоимость (звезды)', formatNumber(statsData.avg_cost_stars)],
    ['Первая транзакция', new Date(statsData.first_transaction).toLocaleDateString('ru-RU')],
    ['Последняя транзакция', new Date(statsData.last_transaction).toLocaleDateString('ru-RU')]
  ]);

  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Итоговый расчёт');

  // ЛИСТ 2: ДЕТАЛЬНЫЕ РАСЧЁТЫ
  const detailedSheet = XLSX.utils.aoa_to_sheet([
    ['═══════════════════════════════════════════════════════════════'],
    ['                 ДЕТАЛЬНЫЕ РАСЧЁТЫ                             '],
    ['═══════════════════════════════════════════════════════════════'],
    [''],
    ['💰 ДОХОДЫ ВЛАДЕЛЬЦА (ПОСТУПИЛИ НА ЕГО СЧЁТ)'],
    [''],
    ['📊 Источники доходов:', '', '', ''],
    ['├── Прямые платежи в рублях', formatCurrency(summaryData.total_income_rub), '', ''],
    ['└── Звёзды (конвертация по курсу 1⭐=1.8₽)', formatNumber(summaryData.total_income_stars * STAR_TO_RUB_RATE), '₽', '(только для справки, на счёт не поступали)'],
    [''],
    ['ИТОГО к получению владельцем:', formatCurrency(summaryData.total_income_rub), '', ''],
    [''],
    ['📉 РАСХОДЫ БОТА (ПОТРАЧЕНЫ НА AI-СЕРВИСЫ)'],
    [''],
    ['📊 Статьи расходов:', '', '', ''],
    ['├── Оплата AI-сервисов звёздами', formatNumber(summaryData.total_expense_stars), '⭐', formatCurrency(summaryData.total_expense_stars * STAR_TO_RUB_RATE)],
    ['└── Себестоимость услуг', formatNumber(summaryData.total_cost_stars), '⭐', formatCurrency(summaryData.total_cost_stars * STAR_TO_RUB_RATE)],
    [''],
    ['ИТОГО должно заплатить владельцу:', formatNumber(summaryData.total_expense_stars + summaryData.total_cost_stars), '⭐', formatCurrency((summaryData.total_expense_stars + summaryData.total_cost_stars) * STAR_TO_RUB_RATE)],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['🔄 ВЗАИМОРАСЧЁТЫ'],
    [''],
    ['Владелец должен боту:', '0 ₽', '', ''],
    ['Бот должен владельцу:', formatCurrency(summaryData.amount_to_pay_stars * STAR_TO_RUB_RATE), '', ''],
    [''],
    ['РАСЧЁТ:', '', '', ''],
    ['Расходы бота:', formatCurrency(summaryData.total_expense_stars * STAR_TO_RUB_RATE), '', ''],
    ['Минус доходы владельца:', '- ' + formatCurrency(summaryData.total_income_rub), '', ''],
    ['= ДОЛГ БОТА:', formatCurrency(summaryData.amount_to_pay_stars * STAR_TO_RUB_RATE), '', '']
  ]);

  XLSX.utils.book_append_sheet(workbook, detailedSheet, 'Детальные расчёты');

  // ЛИСТ 3: ДИНАМИКА ПО МЕСЯЦАМ
  const monthlySheetData = [
    ['Месяц', 'Транзакции', 'Доходы владельца (₽)', 'Расходы бота (⭐)', 'Расходы бота (₽)', 'Долг бота (⭐)', 'Долг бота (₽)']
  ];

  let cumulativeDebtStars = 0;
  let cumulativeDebtRub = 0;

  monthlyData.forEach(month => {
    const expenseRub = (month.expense_stars + month.cost_stars) * STAR_TO_RUB_RATE;
    const monthlyDebt = month.expense_stars + month.cost_stars - (month.rub_income || 0);
    cumulativeDebtStars += monthlyDebt;
    cumulativeDebtRub += monthlyDebt * STAR_TO_RUB_RATE;

    monthlySheetData.push([
      new Date(month.month + '-01').toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' }),
      month.transaction_count,
      formatCurrency(month.rub_income || 0),
      formatNumber(month.expense_stars + month.cost_stars),
      formatCurrency(expenseRub),
      formatNumber(cumulativeDebtStars),
      formatCurrency(cumulativeDebtRub)
    ]);
  });

  const monthlySheet = XLSX.utils.aoa_to_sheet(monthlySheetData);
  XLSX.utils.book_append_sheet(workbook, monthlySheet, 'Динамика по месяцам');

  // ЛИСТ 4: ТОП СЕРВИСОВ
  const serviceSheetData = [
    ['Сервис', 'Операции', 'Доходы владельца (⭐)', 'Себестоимость (⭐)', 'Себестоимость (₽)', 'Маржа %', 'Влияние на долг (⭐)']
  ];

  servicesData.forEach(service => {
    serviceSheetData.push([
      service.service_type || 'Не указан',
      service.operation_count,
      formatNumber(service.total_revenue_stars),
      formatNumber(service.total_cost_stars),
      formatCurrency(service.total_cost_stars * STAR_TO_RUB_RATE),
      formatNumber(service.margin_percent),
      formatNumber(service.total_cost_stars)
    ]);
  });

  const serviceSheet = XLSX.utils.aoa_to_sheet(serviceSheetData);
  XLSX.utils.book_append_sheet(workbook, serviceSheet, 'Топ сервисов');

  return workbook;
}

const workbook = createExcelReport();
const fileName = `/tmp/MetaMuse_Manifest_bot_ФИНАЛЬНЫЙ_ОТЧЕТ_${new Date().toISOString().split('T')[0]}.xlsx`;
XLSX.writeFile(workbook, fileName).then(() => console.log('xlsx written')).catch(e => { console.error(e); process.exitCode = 1 });

console.log('\n' + '='.repeat(70));
console.log('🎯 ФИНАЛЬНОЕ ЗАКЛЮЧЕНИЕ');
console.log('='.repeat(70));
console.log('\n💎 ДОХОДЫ ВЛАДЕЛЬЦА (поступили на его счёт):');
console.log('├── Платежи в рублях: 57 879,00 ₽');
console.log('└── Звёзды: 60 462,00 ⭐ (на счёт бота, не владельца)');
console.log('\n📉 РАСХОДЫ БОТА (потрачены на AI-сервисы):');
console.log('├── Оплата услуг: 102 819,97 ⭐ = 185 076 ₽');
console.log('└── Себестоимость: 32 593,96 ⭐ = 58 669 ₽');
console.log('\n🔄 ВЗАИМОРАСЧЁТЫ:');
console.log('БОТ ДОЛЖЕН ВЛАДЕЛЬЦУ: 74 951,93 ⭐ = 134 913,47 ₽');
console.log('='.repeat(70));
console.log('\n✅ ИТОГ: БОТ ДОЛЖЕН ЗАПЛАТИТЬ ВЛАДЕЛЬЦУ 134 913,47 ₽');
console.log('\n📊 Excel-отчет создан:', fileName);