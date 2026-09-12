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

const usersData = [
  { telegram_id: 352374518, transaction_count: 1656, total_spending_stars: 59280.79, avg_transaction_stars: 35.80 },
  { telegram_id: 447979523, transaction_count: 330, total_spending_stars: 6021.05, avg_transaction_stars: 18.25 },
  { telegram_id: 184157003, transaction_count: 106, total_spending_stars: 3610.44, avg_transaction_stars: 34.06 },
  { telegram_id: 389109666, transaction_count: 134, total_spending_stars: 3062.84, avg_transaction_stars: 22.86 },
  { telegram_id: 1491501541, transaction_count: 132, total_spending_stars: 2621.17, avg_transaction_stars: 19.86 }
];

const monthlyData = [
  { month: '2025-11', transaction_count: 7, income_stars: 476.00, expense_stars: 142.50, cost_stars: 0, profit_stars: 333.50 },
  { month: '2025-10', transaction_count: 222, income_stars: 4098.00, expense_stars: 10370.29, cost_stars: 661.67, profit_stars: -6933.96 },
  { month: '2025-09', transaction_count: 233, income_stars: 3799.00, expense_stars: 4528.81, cost_stars: 1773.13, profit_stars: -2502.94 },
  { month: '2025-08', transaction_count: 525, income_stars: 11998.00, expense_stars: 11380.67, cost_stars: 5145.53, profit_stars: -4528.20 },
  { month: '2025-07', transaction_count: 547, income_stars: 5157.00, expense_stars: 21388.32, cost_stars: 5308.67, profit_stars: -21539.99 },
  { month: '2025-06', transaction_count: 722, income_stars: 3853.00, expense_stars: 16669.77, cost_stars: 7043.63, profit_stars: -19860.40 },
  { month: '2025-05', transaction_count: 826, income_stars: 4279.00, expense_stars: 29808.19, cost_stars: 9456.33, profit_stars: -34985.52 },
  { month: '2025-04', transaction_count: 756, income_stars: 13673.00, expense_stars: 7901.42, cost_stars: 2878.00, profit_stars: 2893.58 },
  { month: '2025-03', transaction_count: 198, income_stars: 13129.00, expense_stars: 630.00, cost_stars: 327.00, profit_stars: 12172.00 }
];

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

  // ЛИСТ 1: СВОДКА
  const summarySheet = XLSX.utils.aoa_to_sheet([
    ['═══════════════════════════════════════════════════════════════'],
    ['                  ФИНАНСОВЫЙ ОТЧЕТ                           '],
    ['              MetaMuse_Manifest_bot                         '],
    ['                                                          '],
    ['📊 ОСНОВНЫЕ ПОКАЗАТЕЛИ'],
    [''],
    ['Общий доход (звезды)', formatNumber(summaryData.total_income_stars)],
    ['Общие расходы (звезды)', formatNumber(summaryData.total_expense_stars)],
    ['Себестоимость (звезды)', formatNumber(summaryData.total_cost_stars)],
    ['Чистая прибыль (звезды)', formatNumber(summaryData.net_profit_stars)],
    [''],
    ['Общий доход (рубли)', formatCurrency(summaryData.total_income_rub)],
    ['Чистая прибыль (рубли)', formatCurrency(summaryData.net_profit_rub)],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['🎯 ИТОГОВОЕ ЗАКЛЮЧЕНИЕ'],
    [''],
    ['Статус:', summaryData.payment_status],
    ['К оплате:', formatNumber(summaryData.amount_to_pay_stars), 'звезд'],
    ['К оплате:', formatCurrency(summaryData.amount_to_pay_stars * 1.8), 'по курсу 1⭐ = 1.8₽'],
    ['═══════════════════════════════════════════════════════════════'],
    [''],
    ['📈 ОБЩАЯ СТАТИСТИКА'],
    [''],
    ['Всего транзакций', statsData.total_transactions],
    ['Уникальных пользователей', statsData.unique_users],
    ['Средний чек (звезды)', formatNumber(statsData.avg_transaction_stars)],
    ['Средняя себестоимость (звезды)', formatNumber(statsData.avg_cost_stars)],
    ['Первая транзакция', new Date(statsData.first_transaction).toLocaleDateString('ru-RU')],
    ['Последняя транзакция', new Date(statsData.last_transaction).toLocaleDateString('ru-RU')]
  ]);

  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Сводка');

  // ЛИСТ 2: ДИНАМИКА ПО МЕСЯЦАМ
  const monthlySheetData = [
    ['Месяц', 'Транзакции', 'Доходы (⭐)', 'Расходы (⭐)', 'Себестоимость (⭐)', 'Прибыль (⭐)', 'Рентабельность %']
  ];

  monthlyData.forEach(month => {
    const profitability = month.income_stars > 0
      ? ((month.income_stars - month.expense_stars - month.cost_stars) / month.income_stars) * 100
      : 0;
    monthlySheetData.push([
      new Date(month.month + '-01').toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' }),
      month.transaction_count,
      formatNumber(month.income_stars),
      formatNumber(month.expense_stars),
      formatNumber(month.cost_stars),
      formatNumber(month.profit_stars),
      formatNumber(profitability)
    ]);
  });

  const monthlySheet = XLSX.utils.aoa_to_sheet(monthlySheetData);
  XLSX.utils.book_append_sheet(workbook, monthlySheet, 'Динамика по месяцам');

  // ЛИСТ 3: ТОП СЕРВИСОВ
  const serviceSheetData = [
    ['Сервис', 'Операции', 'Доходы (⭐)', 'Себестоимость (⭐)', 'Прибыль (⭐)', 'Маржа %']
  ];

  servicesData.forEach(service => {
    serviceSheetData.push([
      service.service_type || 'Не указан',
      service.operation_count,
      formatNumber(service.total_revenue_stars),
      formatNumber(service.total_cost_stars),
      formatNumber(service.profit_stars),
      formatNumber(service.margin_percent)
    ]);
  });

  const serviceSheet = XLSX.utils.aoa_to_sheet(serviceSheetData);
  XLSX.utils.book_append_sheet(workbook, serviceSheet, 'Топ сервисов');

  // ЛИСТ 4: ТОП ПОЛЬЗОВАТЕЛЕЙ
  const userSheetData = [
    ['Telegram ID', 'Транзакции', 'Всего потрачено (⭐)', 'Средн. чек (⭐)']
  ];

  usersData.forEach(user => {
    userSheetData.push([
      user.telegram_id,
      user.transaction_count,
      formatNumber(user.total_spending_stars),
      formatNumber(user.avg_transaction_stars)
    ]);
  });

  const userSheet = XLSX.utils.aoa_to_sheet(userSheetData);
  XLSX.utils.book_append_sheet(workbook, userSheet, 'Топ пользователей');

  return workbook;
}

const workbook = createExcelReport();
const fileName = `/tmp/MetaMuse_Manifest_bot_Финансовый_отчет_${new Date().toISOString().split('T')[0]}.xlsx`;
XLSX.writeFile(workbook, fileName).then(() => console.log('xlsx written')).catch(e => { console.error(e); process.exitCode = 1 });

console.log('\n' + '='.repeat(70));
console.log('🎯 ИТОГОВОЕ ЗАКЛЮЧЕНИЕ');
console.log('='.repeat(70));
console.log(`Статус: ${summaryData.payment_status}`);
console.log(`К оплате: ${formatNumber(summaryData.amount_to_pay_stars)} звезд (${formatCurrency(summaryData.amount_to_pay_stars * 1.8)})`);
console.log('='.repeat(70));
console.log('\n📊 СОДЕРЖИМОЕ ОТЧЕТА:');
console.log('1. Сводка - основные показатели и итоговое заключение');
console.log('2. Динамика по месяцам - помесячная статистика');
console.log('3. Топ сервисов - рентабельность по услугам');
console.log('4. Топ пользователей - статистика по пользователям');
console.log('\n✅ Excel-отчет создан:', fileName);
console.log('\n📈 КЛЮЧЕВЫЕ ВЫВОДЫ:');
console.log(`• Общий доход: ${formatNumber(summaryData.total_income_stars)} звезд`);
console.log(`• Общие расходы: ${formatNumber(summaryData.total_expense_stars)} звезд`);
console.log(`• Себестоимость: ${formatNumber(summaryData.total_cost_stars)} звезд`);
console.log(`• Чистый убыток: ${formatNumber(Math.abs(summaryData.net_profit_stars))} звезд`);
console.log(`• Бот работает в убыток и должен заплатить: ${formatCurrency(summaryData.amount_to_pay_stars * 1.8)}`);