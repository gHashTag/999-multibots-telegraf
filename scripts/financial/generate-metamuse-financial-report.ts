import * as XLSX from '../../src/utils/excelCompat';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yuukfqcsdhkyxegfwlcb.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY не найден в переменных окружения');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface SummaryData {
  totalIncomeStars: number;
  totalExpenseStars: number;
  totalCostStars: number;
  netProfitStars: number;
  totalIncomeRub: number;
  netProfitRub: number;
  paymentStatus: string;
  amountToPayStars: number;
}

interface StatsData {
  totalTransactions: number;
  uniqueUsers: number;
  firstTransaction: string;
  lastTransaction: string;
  avgTransactionStars: number;
  avgCostStars: number;
}

interface ServiceData {
  service_type: string;
  operation_count: number;
  total_revenue_stars: number;
  total_cost_stars: number;
  profit_stars: number;
  margin_percent: number;
  avg_price_stars: number;
  avg_cost_stars: number;
}

interface UserData {
  telegram_id: number;
  transaction_count: number;
  total_spending_stars: number;
  total_cost_stars: number;
  avg_transaction_stars: number;
  first_transaction: string;
  last_transaction: string;
}

interface MonthlyData {
  month: string;
  transaction_count: number;
  income_stars: number;
  expense_stars: number;
  cost_stars: number;
  profit_stars: number;
}

async function getSummaryData(): Promise<SummaryData> {
  const { data, error } = await supabase.rpc('exec_sql', {
    query: `
      WITH totals AS (
        SELECT
          SUM(CASE WHEN type = 'MONEY_INCOME' AND category = 'REAL' THEN stars ELSE 0 END) as total_income_stars,
          SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN stars ELSE 0 END) as total_expense_stars,
          SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN cost ELSE 0 END) as total_cost_stars,
          SUM(CASE WHEN type = 'MONEY_INCOME' AND category = 'REAL' AND currency = 'RUB' THEN amount ELSE 0 END) as total_income_rub
        FROM payments_v2
        WHERE bot_name = 'MetaMuse_Manifest_bot'
          AND status = 'COMPLETED'
      )
      SELECT
        total_income_stars,
        total_expense_stars,
        total_cost_stars,
        (total_income_stars - total_expense_stars - total_cost_stars) as net_profit_stars,
        total_income_rub,
        (total_income_rub - (total_expense_stars + total_cost_stars) * 1.8) as net_profit_rub,
        CASE
          WHEN (total_income_stars - total_expense_stars - total_cost_stars) > 0
          THEN 'БОТ ДОЛЖЕН ПОЛУЧИТЬ'
          ELSE 'БОТ ДОЛЖЕН ЗАПЛАТИТЬ'
        END as payment_status,
        ABS(total_income_stars - total_expense_stars - total_cost_stars) as amount_to_pay_stars
      FROM totals
    `
  });

  if (error) {
    console.error('❌ Ошибка получения сводных данных:', error);
    throw error;
  }

  return data[0] as SummaryData;
}

async function getStatsData(): Promise<StatsData> {
  const { data, error } = await supabase
    .from('payments_v2')
    .select('*')
    .eq('bot_name', 'MetaMuse_Manifest_bot')
    .eq('status', 'COMPLETED');

  if (error) {
    console.error('❌ Ошибка получения статистики:', error);
    throw error;
  }

  const stats = data.reduce((acc, row) => {
    acc.totalTransactions++;
    if (!acc.uniqueUsers.includes(row.telegram_id)) {
      acc.uniqueUsers.push(row.telegram_id);
    }
    if (!acc.firstTransaction || row.payment_date < acc.firstTransaction) {
      acc.firstTransaction = row.payment_date;
    }
    if (!acc.lastTransaction || row.payment_date > acc.lastTransaction) {
      acc.lastTransaction = row.payment_date;
    }
    acc.totalStars += row.stars || 0;
    acc.totalCost += row.cost || 0;
    return acc;
  }, {
    totalTransactions: 0,
    uniqueUsers: [] as number[],
    firstTransaction: '',
    lastTransaction: '',
    totalStars: 0,
    totalCost: 0
  });

  return {
    totalTransactions: stats.totalTransactions,
    uniqueUsers: stats.uniqueUsers.length,
    firstTransaction: stats.firstTransaction,
    lastTransaction: stats.lastTransaction,
    avgTransactionStars: stats.totalStars / stats.totalTransactions,
    avgCostStars: stats.totalCost / stats.totalTransactions
  };
}

async function getServiceData(): Promise<ServiceData[]> {
  const { data, error } = await supabase
    .from('payments_v2')
    .select('service_type, stars, cost')
    .eq('bot_name', 'MetaMuse_Manifest_bot')
    .eq('status', 'COMPLETED')
    .eq('type', 'MONEY_OUTCOME');

  if (error) {
    console.error('❌ Ошибка получения данных по сервисам:', error);
    throw error;
  }

  const serviceMap = new Map<string, {
    count: number;
    revenue: number;
    cost: number;
  }>();

  data.forEach(row => {
    const service = row.service_type || 'unknown';
    const existing = serviceMap.get(service) || { count: 0, revenue: 0, cost: 0 };
    serviceMap.set(service, {
      count: existing.count + 1,
      revenue: existing.revenue + (row.stars || 0),
      cost: existing.cost + (row.cost || 0)
    });
  });

  return Array.from(serviceMap.entries()).map(([service_type, stats]) => ({
    service_type,
    operation_count: stats.count,
    total_revenue_stars: stats.revenue,
    total_cost_stars: stats.cost,
    profit_stars: stats.revenue - stats.cost,
    margin_percent: stats.revenue > 0 ? ((stats.revenue - stats.cost) / stats.revenue) * 100 : 0,
    avg_price_stars: stats.revenue / stats.count,
    avg_cost_stars: stats.cost / stats.count
  })).sort((a, b) => b.total_revenue_stars - a.total_revenue_stars);
}

async function getUserData(): Promise<UserData[]> {
  const { data, error } = await supabase
    .from('payments_v2')
    .select('telegram_id, stars, cost, payment_date')
    .eq('bot_name', 'MetaMuse_Manifest_bot')
    .eq('status', 'COMPLETED')
    .eq('type', 'MONEY_OUTCOME');

  if (error) {
    console.error('❌ Ошибка получения данных по пользователям:', error);
    throw error;
  }

  const userMap = new Map<number, {
    count: number;
    spending: number;
    cost: number;
    firstTransaction: string;
    lastTransaction: string;
  }>();

  data.forEach(row => {
    const userId = row.telegram_id;
    const existing = userMap.get(userId) || {
      count: 0,
      spending: 0,
      cost: 0,
      firstTransaction: row.payment_date,
      lastTransaction: row.payment_date
    };

    existing.count++;
    existing.spending += row.stars || 0;
    existing.cost += row.cost || 0;

    if (row.payment_date < existing.firstTransaction) {
      existing.firstTransaction = row.payment_date;
    }
    if (row.payment_date > existing.lastTransaction) {
      existing.lastTransaction = row.payment_date;
    }

    userMap.set(userId, existing);
  });

  return Array.from(userMap.entries()).map(([telegram_id, stats]) => ({
    telegram_id,
    transaction_count: stats.count,
    total_spending_stars: stats.spending,
    total_cost_stars: stats.cost,
    avg_transaction_stars: stats.spending / stats.count,
    first_transaction: stats.firstTransaction,
    last_transaction: stats.lastTransaction
  })).sort((a, b) => b.total_spending_stars - a.total_spending_stars).slice(0, 50);
}

async function getMonthlyData(): Promise<MonthlyData[]> {
  const { data, error } = await supabase
    .from('payments_v2')
    .select('payment_date, type, stars, cost, category')
    .eq('bot_name', 'MetaMuse_Manifest_bot')
    .eq('status', 'COMPLETED');

  if (error) {
    console.error('❌ Ошибка получения месячных данных:', error);
    throw error;
  }

  const monthMap = new Map<string, {
    count: number;
    income: number;
    expense: number;
    cost: number;
  }>();

  data.forEach(row => {
    const month = new Date(row.payment_date).toISOString().substring(0, 7);
    const existing = monthMap.get(month) || { count: 0, income: 0, expense: 0, cost: 0 };
    existing.count++;

    if (row.type === 'MONEY_INCOME' && row.category === 'REAL') {
      existing.income += row.stars || 0;
    } else if (row.type === 'MONEY_OUTCOME') {
      existing.expense += row.stars || 0;
      existing.cost += row.cost || 0;
    }

    monthMap.set(month, existing);
  });

  return Array.from(monthMap.entries()).map(([month, stats]) => ({
    month,
    transaction_count: stats.count,
    income_stars: stats.income,
    expense_stars: stats.expense,
    cost_stars: stats.cost,
    profit_stars: stats.income - stats.expense - stats.cost
  })).sort((a, b) => b.month.localeCompare(a.month));
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}

function formatCurrency(num: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}

async function generateReport() {
  console.log('🚀 Генерация финансового отчета по MetaMuse_Manifest_bot...\n');

  try {
    const [summary, stats, services, users, monthly] = await Promise.all([
      getSummaryData(),
      getStatsData(),
      getServiceData(),
      getUserData(),
      getMonthlyData()
    ]);

    console.log('✅ Данные собраны. Создание Excel-файла...\n');

    const workbook = XLSX.utils.book_new();

    // ЛИСТ 1: СВОДКА
    const summarySheet = XLSX.utils.aoa_to_sheet([
      ['═══════════════════════════════════════════════════════════════'],
      ['                  ФИНАНСОВЫЙ ОТЧЕТ                           '],
      ['              MetaMuse_Manifest_bot                         '],
      ['                                                          '],
      ['📊 ОСНОВНЫЕ ПОКАЗАТЕЛИ'],
      [''],
      ['Общий доход (звезды)', formatNumber(summary.totalIncomeStars)],
      ['Общие расходы (звезды)', formatNumber(summary.totalExpenseStars)],
      ['Себестоимость (звезды)', formatNumber(summary.totalCostStars)],
      ['Чистая прибыль (звезды)', formatNumber(summary.netProfitStars)],
      [''],
      ['Общий доход (рубли)', formatCurrency(summary.totalIncomeRub)],
      ['Чистая прибыль (рубли)', formatCurrency(summary.netProfitRub)],
      [''],
      ['═══════════════════════════════════════════════════════════════'],
      ['🎯 ИТОГОВОЕ ЗАКЛЮЧЕНИЕ'],
      [''],
      ['Статус:', summary.paymentStatus],
      ['К оплате:', formatNumber(summary.amountToPayStars), 'звезд'],
      ['К оплате:', formatCurrency(summary.amountToPayStars * 1.8), 'по курсу 1⭐ = 1.8₽'],
      ['═══════════════════════════════════════════════════════════════'],
      [''],
      ['📈 ОБЩАЯ СТАТИСТИКА'],
      [''],
      ['Всего транзакций', stats.totalTransactions],
      ['Уникальных пользователей', stats.uniqueUsers],
      ['Средний чек (звезды)', formatNumber(stats.avgTransactionStars)],
      ['Средняя себестоимость (звезды)', formatNumber(stats.avgCostStars)],
      ['Первая транзакция', new Date(stats.firstTransaction).toLocaleDateString('ru-RU')],
      ['Последняя транзакция', new Date(stats.lastTransaction).toLocaleDateString('ru-RU')]
    ]);

    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Сводка');

    // ЛИСТ 2: ДИНАМИКА ПО МЕСЯЦАМ
    const monthlySheetData = [
      ['Месяц', 'Транзакции', 'Доходы (⭐)', 'Расходы (⭐)', 'Себестоимость (⭐)', 'Прибыль (⭐)', 'Рентабельность %']
    ];

    monthly.forEach(month => {
      const profitability = month.income_stars > 0
        ? ((month.income_stars - month.expense_stars - month.cost_stars) / month.income_stars) * 100
        : 0;
      monthlySheetData.push([
        new Date(month.month).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' }),
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
      ['Сервис', 'Операции', 'Доходы (⭐)', 'Себестоимость (⭐)', 'Прибыль (⭐)', 'Маржа %', 'Средн. цена (⭐)', 'Средн. себест. (⭐)']
    ];

    services.forEach(service => {
      serviceSheetData.push([
        service.service_type || 'Не указан',
        service.operation_count,
        formatNumber(service.total_revenue_stars),
        formatNumber(service.total_cost_stars),
        formatNumber(service.profit_stars),
        formatNumber(service.margin_percent),
        formatNumber(service.avg_price_stars),
        formatNumber(service.avg_cost_stars)
      ]);
    });

    const serviceSheet = XLSX.utils.aoa_to_sheet(serviceSheetData);
    XLSX.utils.book_append_sheet(workbook, serviceSheet, 'Топ сервисов');

    // ЛИСТ 4: ТОП ПОЛЬЗОВАТЕЛЕЙ
    const userSheetData = [
      ['Telegram ID', 'Транзакции', 'Всего потрачено (⭐)', 'Себестоимость (⭐)', 'Средн. чек (⭐)', 'Первый платеж', 'Последний платеж']
    ];

    users.forEach(user => {
      userSheetData.push([
        user.telegram_id,
        user.transaction_count,
        formatNumber(user.total_spending_stars),
        formatNumber(user.total_cost_stars),
        formatNumber(user.avg_transaction_stars),
        new Date(user.first_transaction).toLocaleDateString('ru-RU'),
        new Date(user.last_transaction).toLocaleDateString('ru-RU')
      ]);
    });

    const userSheet = XLSX.utils.aoa_to_sheet(userSheetData);
    XLSX.utils.book_append_sheet(workbook, userSheet, 'Топ пользователей');

    // СОХРАНЕНИЕ ФАЙЛА
    const fileName = `/tmp/MetaMuse_Manifest_bot_Финансовый_отчет_${new Date().toISOString().split('T')[0]}.xlsx`;
    await XLSX.writeFile(workbook, fileName);

    console.log('✅ Excel-отчет создан:', fileName);
    console.log('\n' + '='.repeat(70));
    console.log('🎯 ИТОГОВОЕ ЗАКЛЮЧЕНИЕ');
    console.log('='.repeat(70));
    console.log(`Статус: ${summary.paymentStatus}`);
    console.log(`К оплате: ${formatNumber(summary.amountToPayStars)} звезд (${formatCurrency(summary.amountToPayStars * 1.8)})`);
    console.log('='.repeat(70));
    console.log('\n📊 СОДЕРЖИМОЕ ОТЧЕТА:');
    console.log('1. Сводка - основные показатели и итоговое заключение');
    console.log('2. Динамика по месяцам - помесячная статистика');
    console.log('3. Топ сервисов - рентабельность по услугам');
    console.log('4. Топ пользователей - статистика по пользователям');
    console.log('\n✅ Отчет готов к просмотру!');

  } catch (error) {
    console.error('❌ Ошибка генерации отчета:', error);
    process.exit(1);
  }
}

generateReport();