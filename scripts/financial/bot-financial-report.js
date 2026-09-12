#!/usr/bin/env node

/**
 * 🤖 BOT FINANCIAL REPORT GENERATOR
 *
 * Generates comprehensive Excel financial reports for individual bots or all bots
 *
 * Features:
 * - Bot-wise income/expense breakdown
 * - Star to ruble conversion using current rates
 * - Service-wise analytics
 * - User analytics
 * - Time-based trends
 * - Upload to accessible location
 *
 * Usage:
 *   node scripts/bot-financial-report.js [bot-name] [--upload] [--period=30]
 *   node scripts/bot-financial-report.js --all
 *   node scripts/bot-financial-report.js neuro_blogger_bot --upload
 */

// xlsx replaced by exceljs-backed shim; requires `bun run build` (dist/)
const XLSX = require('../../dist/utils/excelCompat');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Environment setup
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Current star to ruble conversion rate (based on real market data)
const STAR_TO_RUB_RATE = 1.8; // 1 star ≈ 1.8 rubles

/**
 * Service mapping for display
 */
const SERVICE_MAPPING = {
  neuro_photo: { emoji: '🖼️', name: 'Нейрофото' },
  text_to_video: { emoji: '📹', name: 'Генерация видео' },
  image_to_video: { emoji: '🎬', name: 'Изображение в видео' },
  text_to_speech: { emoji: '🗣️', name: 'Озвучка текста' },
  image_to_prompt: { emoji: '📝', name: 'Анализ изображений' },
  digital_avatar_body: { emoji: '🎭', name: 'Цифровой аватар' },
  payment_operation: { emoji: '💳', name: 'Системная операция' },
  kling_video: { emoji: '📹', name: 'Kling Video' },
  haiper_video: { emoji: '📹', name: 'Haiper Video' },
  minimax_video: { emoji: '📹', name: 'Minimax Video' },
  morphing: { emoji: '🧬', name: 'Морфинг' },
  unknown: { emoji: '❓', name: 'Неизвестно' }
};

function getServiceDisplay(serviceType) {
  const service = SERVICE_MAPPING[serviceType] || SERVICE_MAPPING.unknown;
  return `${service.emoji} ${service.name}`;
}

/**
 * Formats currency values
 */
function formatCurrency(value, currency = 'stars') {
  const formatted = Math.round(value * 100) / 100;
  return currency === 'stars' ? `${formatted} ⭐` : `${formatted} ₽`;
}

/**
 * Fetches financial data for a specific bot
 */
async function getBotFinancialData(botName, daysBack = 30) {
  console.log(`📊 Fetching financial data for bot: ${botName}`);

  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);

  try {
    // Fetch all transactions for the bot
    let allPayments = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: batchPayments, error } = await supabase
        .from('payments_v2')
        .select('*')
        .eq('bot_name', botName)
        .eq('status', 'COMPLETED')
        .gte('payment_date', startDate.toISOString())
        .lte('payment_date', endDate.toISOString())
        .range(from, from + batchSize - 1)
        .order('payment_date', { ascending: false });

      if (error) throw error;

      if (!batchPayments || batchPayments.length === 0) {
        hasMore = false;
      } else {
        allPayments = allPayments.concat(batchPayments);
        from += batchSize;

        if (batchPayments.length < batchSize) {
          hasMore = false;
        }
      }
    }

    // Fetch bot users for analytics
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('telegram_id, username, first_name, last_name, created_at')
      .eq('bot_name', botName);

    if (usersError) {
      console.warn('⚠️ Could not fetch users data:', usersError.message);
    }

    return { payments: allPayments || [], users: users || [] };
  } catch (error) {
    console.error('❌ Error fetching bot data:', error);
    throw error;
  }
}

/**
 * Fetches list of all bots
 */
async function getAllBots() {
  try {
    const { data, error } = await supabase
      .from('payments_v2')
      .select('bot_name')
      .eq('status', 'COMPLETED');

    if (error) throw error;

    const uniqueBots = [...new Set(data.map(p => p.bot_name))].filter(Boolean);
    return uniqueBots;
  } catch (error) {
    console.error('❌ Error fetching bots list:', error);
    throw error;
  }
}

/**
 * Processes financial data for analysis
 */
function processFinancialData(payments, users) {
  // Separate income and expenses
  const incomes = payments.filter(p => p.type === 'MONEY_INCOME');
  const expenses = payments.filter(p => p.type === 'MONEY_OUTCOME');

  // Categorize incomes
  const realIncomes = incomes.filter(p => p.category === 'REAL');
  const bonusIncomes = incomes.filter(p => p.category === 'BONUS');
  const robokassaPayments = realIncomes.filter(p =>
    p.currency === 'RUB' && (p.payment_method === 'Robokassa' || p.payment_method === 'Manual')
  );
  const telegramStarsPayments = realIncomes.filter(p =>
    (p.currency === 'XTR' || p.currency === 'STARS') && p.payment_method === 'Telegram'
  );

  // Calculate totals
  const totalIncomeStars = realIncomes.reduce((sum, p) => sum + (p.stars || 0), 0);
  const totalExpenseStars = expenses.reduce((sum, p) => sum + (p.stars || 0), 0);
  const totalCostStars = expenses.reduce((sum, p) => sum + (p.cost || 0), 0);

  const totalIncomeRub = robokassaPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const netProfitStars = totalIncomeStars - totalExpenseStars - totalCostStars;
  const netProfitRub = totalIncomeRub - (totalExpenseStars + totalCostStars) * STAR_TO_RUB_RATE;

  // Service analytics
  const serviceStats = new Map();
  expenses.forEach(payment => {
    const service = payment.service_type || 'unknown';
    const current = serviceStats.get(service) || { count: 0, revenue: 0, cost: 0 };
    current.count += 1;
    current.revenue += payment.stars || 0;
    current.cost += payment.cost || 0;
    serviceStats.set(service, current);
  });

  // User analytics
  const userSpending = new Map();
  expenses.forEach(payment => {
    const userId = payment.telegram_id;
    const current = userSpending.get(userId) || 0;
    userSpending.set(userId, current + (payment.stars || 0));
  });

  const topUsers = Array.from(userSpending.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([userId, spending]) => {
      const user = users.find(u => u.telegram_id.toString() === userId.toString());
      return {
        telegram_id: userId,
        username: user?.username,
        first_name: user?.first_name,
        last_name: user?.last_name,
        total_spending: spending,
        transactions_count: expenses.filter(p => p.telegram_id.toString() === userId.toString()).length
      };
    });

  // Time-based analytics
  const dailyStats = getDailyStats(payments);
  const monthlyStats = getMonthlyStats(payments);

  return {
    summary: {
      totalIncomeStars,
      totalExpenseStars,
      totalCostStars,
      netProfitStars,
      totalIncomeRub,
      netProfitRub,
      totalUsers: users.length,
      totalTransactions: payments.length
    },
    incomes: {
      real: realIncomes,
      bonus: bonusIncomes,
      robokassa: robokassaPayments,
      telegram: telegramStarsPayments
    },
    expenses,
    serviceStats,
    topUsers,
    dailyStats,
    monthlyStats,
    allPayments: payments
  };
}

/**
 * Gets daily statistics
 */
function getDailyStats(payments) {
  const dailyMap = new Map();

  payments.forEach(payment => {
    const date = new Date(payment.payment_date).toISOString().split('T')[0];
    const current = dailyMap.get(date) || {
      date,
      income: 0,
      expense: 0,
      cost: 0,
      profit: 0,
      transactions: 0
    };

    current.transactions += 1;

    if (payment.type === 'MONEY_INCOME' && payment.category === 'REAL') {
      current.income += payment.stars || 0;
    } else if (payment.type === 'MONEY_OUTCOME') {
      current.expense += payment.stars || 0;
      current.cost += payment.cost || 0;
    }

    current.profit = current.income - current.expense - current.cost;
    dailyMap.set(date, current);
  });

  return Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Gets monthly statistics
 */
function getMonthlyStats(payments) {
  const monthlyMap = new Map();

  payments.forEach(payment => {
    const date = new Date(payment.payment_date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    const current = monthlyMap.get(monthKey) || {
      period: monthKey,
      income: 0,
      expense: 0,
      cost: 0,
      profit: 0,
      transactions: 0,
      activeUsers: new Set()
    };

    current.transactions += 1;
    current.activeUsers.add(payment.telegram_id);

    if (payment.type === 'MONEY_INCOME' && payment.category === 'REAL') {
      current.income += payment.stars || 0;
    } else if (payment.type === 'MONEY_OUTCOME') {
      current.expense += payment.stars || 0;
      current.cost += payment.cost || 0;
    }

    current.profit = current.income - current.expense - current.cost;
    monthlyMap.set(monthKey, current);
  });

  return Array.from(monthlyMap.values())
    .map(stat => ({
      ...stat,
      activeUsers: stat.activeUsers.size
    }))
    .sort((a, b) => b.period.localeCompare(a.period));
}

/**
 * Creates Excel workbook with multiple sheets
 */
function createExcelReport(botName, data) {
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Summary Overview
  const summarySheet = createSummarySheet(botName, data);
  XLSX.utils.book_append_sheet(workbook, summarySheet, '📊 Сводка');

  // Sheet 2: Financial Details
  const financialSheet = createFinancialSheet(data);
  XLSX.utils.book_append_sheet(workbook, financialSheet, '💰 Финансы');

  // Sheet 3: Service Analytics
  const servicesSheet = createServicesSheet(data);
  XLSX.utils.book_append_sheet(workbook, servicesSheet, '🛠️ Сервисы');

  // Sheet 4: User Analytics
  const usersSheet = createUsersSheet(data);
  XLSX.utils.book_append_sheet(workbook, usersSheet, '👥 Пользователи');

  // Sheet 5: Time Analytics
  const timeSheet = createTimeSheet(data);
  XLSX.utils.book_append_sheet(workbook, timeSheet, '📅 Динамика');

  // Sheet 6: All Transactions
  const transactionsSheet = createTransactionsSheet(data);
  XLSX.utils.book_append_sheet(workbook, transactionsSheet, '📋 Транзакции');

  return workbook;
}

/**
 * Creates summary sheet
 */
function createSummarySheet(botName, data) {
  const { summary, incomes, serviceStats } = data;

  const summaryData = [
    ['🤖 ФИНАНСОВЫЙ ОТЧЕТ БОТА', '', '', ''],
    ['', '', '', ''],
    ['🤖 Название бота:', botName, '', ''],
    ['📅 Дата отчета:', new Date().toLocaleDateString('ru-RU'), '', ''],
    ['⭐ Курс звезд:', `1 ⭐ = ${STAR_TO_RUB_RATE} ₽`, '', ''],
    ['', '', '', ''],

    ['💰 ФИНАНСОВЫЕ ПОКАЗАТЕЛИ', '', '', ''],
    ['', '', '', ''],
    ['📈 Общий доход:', formatCurrency(summary.totalIncomeStars), formatCurrency(summary.totalIncomeRub, 'rub'), ''],
    ['📉 Общий расход:', formatCurrency(summary.totalExpenseStars), formatCurrency(summary.totalExpenseStars * STAR_TO_RUB_RATE, 'rub'), ''],
    ['🏭 Себестоимость:', formatCurrency(summary.totalCostStars), formatCurrency(summary.totalCostStars * STAR_TO_RUB_RATE, 'rub'), ''],
    ['💎 Чистая прибыль:', formatCurrency(summary.netProfitStars), formatCurrency(summary.netProfitRub, 'rub'), ''],
    ['', '', '', ''],

    ['📊 СТАТИСТИКА', '', '', ''],
    ['', '', '', ''],
    ['👥 Всего пользователей:', summary.totalUsers.toString(), '', ''],
    ['🔢 Всего транзакций:', summary.totalTransactions.toString(), '', ''],
    ['💳 Robokassa платежи:', incomes.robokassa.length.toString(), '', ''],
    ['⭐ Telegram Stars платежи:', incomes.telegram.length.toString(), '', ''],
    ['🎁 Бонусные операции:', incomes.bonus.length.toString(), '', ''],
    ['', '', '', ''],

    ['🏆 ТОП-5 СЕРВИСОВ ПО ДОХОДУ', '', '', ''],
    ['', '', '', ''],
    ...Array.from(serviceStats.entries())
      .sort(([, a], [, b]) => b.revenue - a.revenue)
      .slice(0, 5)
      .map(([service, stats], index) => [
        `${index + 1}. ${getServiceDisplay(service)}:`,
        formatCurrency(stats.revenue),
        `(${stats.count} операций)`,
        ''
      ])
  ];

  return XLSX.utils.aoa_to_sheet(summaryData);
}

/**
 * Creates financial details sheet
 */
function createFinancialSheet(data) {
  const { monthlyStats, incomes } = data;

  const headers = [
    '📅 Период',
    '📈 Доходы (⭐)',
    '📈 Доходы (₽)',
    '📉 Расходы (⭐)',
    '📉 Расходы (₽)',
    '🏭 Себестоимость (⭐)',
    '🏭 Себестоимость (₽)',
    '💎 Прибыль (⭐)',
    '💎 Прибыль (₽)',
    '🔢 Транзакций',
    '👥 Активных пользователей'
  ];

  const financialData = [
    ['💰 ФИНАНСОВАЯ АНАЛИТИКА ПО МЕСЯЦАМ', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', ''],
    headers,
    ['', '', '', '', '', '', '', '', '', '', ''],
    ...monthlyStats.map(stat => [
      stat.period,
      Math.round(stat.income * 100) / 100,
      Math.round(stat.income * STAR_TO_RUB_RATE * 100) / 100,
      Math.round(stat.expense * 100) / 100,
      Math.round(stat.expense * STAR_TO_RUB_RATE * 100) / 100,
      Math.round(stat.cost * 100) / 100,
      Math.round(stat.cost * STAR_TO_RUB_RATE * 100) / 100,
      Math.round(stat.profit * 100) / 100,
      Math.round(stat.profit * STAR_TO_RUB_RATE * 100) / 100,
      stat.transactions,
      stat.activeUsers
    ]),
    ['', '', '', '', '', '', '', '', '', '', ''],

    ['💳 ДЕТАЛИЗАЦИЯ ПО СПОСОБАМ ОПЛАТЫ', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', ''],
    ['Способ оплаты', 'Количество', 'Сумма (⭐)', 'Сумма (₽)', 'Средний чек (⭐)', 'Средний чек (₽)', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', ''],
    [
      '💳 Robokassa',
      incomes.robokassa.length,
      incomes.robokassa.reduce((sum, p) => sum + (p.stars || 0), 0),
      incomes.robokassa.reduce((sum, p) => sum + (p.amount || 0), 0),
      incomes.robokassa.length > 0 ? Math.round((incomes.robokassa.reduce((sum, p) => sum + (p.stars || 0), 0) / incomes.robokassa.length) * 100) / 100 : 0,
      incomes.robokassa.length > 0 ? Math.round((incomes.robokassa.reduce((sum, p) => sum + (p.amount || 0), 0) / incomes.robokassa.length) * 100) / 100 : 0,
      '', '', '', '', ''
    ],
    [
      '⭐ Telegram Stars',
      incomes.telegram.length,
      incomes.telegram.reduce((sum, p) => sum + (p.stars || 0), 0),
      Math.round(incomes.telegram.reduce((sum, p) => sum + (p.stars || 0), 0) * STAR_TO_RUB_RATE * 100) / 100,
      incomes.telegram.length > 0 ? Math.round((incomes.telegram.reduce((sum, p) => sum + (p.stars || 0), 0) / incomes.telegram.length) * 100) / 100 : 0,
      incomes.telegram.length > 0 ? Math.round((incomes.telegram.reduce((sum, p) => sum + (p.stars || 0), 0) * STAR_TO_RUB_RATE / incomes.telegram.length) * 100) / 100 : 0,
      '', '', '', '', ''
    ]
  ];

  return XLSX.utils.aoa_to_sheet(financialData);
}

/**
 * Creates services analytics sheet
 */
function createServicesSheet(data) {
  const { serviceStats } = data;
  const totalRevenue = Array.from(serviceStats.values()).reduce((sum, s) => sum + s.revenue, 0);

  const headers = [
    '🛠️ Сервис',
    '🔢 Операций',
    '💰 Выручка (⭐)',
    '💰 Выручка (₽)',
    '🏭 Себестоимость (⭐)',
    '🏭 Себестоимость (₽)',
    '💎 Прибыль (⭐)',
    '💎 Прибыль (₽)',
    '📊 Маржа (%)',
    '📈 % от оборота'
  ];

  const servicesData = [
    ['🛠️ АНАЛИТИКА ПО СЕРВИСАМ', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', ''],
    headers,
    ['', '', '', '', '', '', '', '', '', ''],
    ...Array.from(serviceStats.entries())
      .sort(([, a], [, b]) => b.revenue - a.revenue)
      .map(([service, stats]) => {
        const profit = stats.revenue - stats.cost;
        const profitRub = profit * STAR_TO_RUB_RATE;
        const margin = stats.revenue > 0 ? (profit / stats.revenue) * 100 : 0;
        const revenueShare = totalRevenue > 0 ? (stats.revenue / totalRevenue) * 100 : 0;

        return [
          getServiceDisplay(service),
          stats.count,
          Math.round(stats.revenue * 100) / 100,
          Math.round(stats.revenue * STAR_TO_RUB_RATE * 100) / 100,
          Math.round(stats.cost * 100) / 100,
          Math.round(stats.cost * STAR_TO_RUB_RATE * 100) / 100,
          Math.round(profit * 100) / 100,
          Math.round(profitRub * 100) / 100,
          Math.round(margin * 100) / 100,
          Math.round(revenueShare * 100) / 100
        ];
      })
  ];

  return XLSX.utils.aoa_to_sheet(servicesData);
}

/**
 * Creates users analytics sheet
 */
function createUsersSheet(data) {
  const { topUsers } = data;
  const totalSpending = topUsers.reduce((sum, u) => sum + u.total_spending, 0);

  const headers = [
    '👤 ID пользователя',
    '📱 Username',
    '👤 Имя',
    '💰 Потрачено (⭐)',
    '💰 Потрачено (₽)',
    '🔢 Транзакций',
    '💵 Средний чек (⭐)',
    '💵 Средний чек (₽)',
    '📊 % от оборота'
  ];

  const usersData = [
    ['👥 АНАЛИТИКА ПО ПОЛЬЗОВАТЕЛЯМ', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['📊 ТОП-20 ПОЛЬЗОВАТЕЛЕЙ ПО ТРАТАМ', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    headers,
    ['', '', '', '', '', '', '', '', ''],
    ...topUsers.map(user => {
      const avgCheck = user.transactions_count > 0 ? user.total_spending / user.transactions_count : 0;
      const avgCheckRub = avgCheck * STAR_TO_RUB_RATE;
      const spendingShare = totalSpending > 0 ? (user.total_spending / totalSpending) * 100 : 0;

      return [
        user.telegram_id,
        user.username ? `@${user.username}` : 'Не указан',
        `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Не указано',
        Math.round(user.total_spending * 100) / 100,
        Math.round(user.total_spending * STAR_TO_RUB_RATE * 100) / 100,
        user.transactions_count,
        Math.round(avgCheck * 100) / 100,
        Math.round(avgCheckRub * 100) / 100,
        Math.round(spendingShare * 100) / 100
      ];
    })
  ];

  return XLSX.utils.aoa_to_sheet(usersData);
}

/**
 * Creates time analytics sheet
 */
function createTimeSheet(data) {
  const { dailyStats, monthlyStats } = data;

  const monthlyHeaders = [
    '📅 Месяц',
    '💰 Доходы (⭐)',
    '💰 Доходы (₽)',
    '📉 Расходы (⭐)',
    '📉 Расходы (₽)',
    '💎 Прибыль (⭐)',
    '💎 Прибыль (₽)',
    '🔢 Транзакций',
    '👥 Активных пользователей'
  ];

  const dailyHeaders = [
    '📅 Дата',
    '💰 Доходы (⭐)',
    '💰 Доходы (₽)',
    '📉 Расходы (⭐)',
    '📉 Расходы (₽)',
    '💎 Прибыль (⭐)',
    '💎 Прибыль (₽)',
    '🔢 Транзакций'
  ];

  const timeData = [
    ['📅 ВРЕМЕННАЯ АНАЛИТИКА', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['📊 СТАТИСТИКА ПО МЕСЯЦАМ', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    monthlyHeaders,
    ['', '', '', '', '', '', '', '', ''],
    ...monthlyStats.map(stat => [
      stat.period,
      Math.round(stat.income * 100) / 100,
      Math.round(stat.income * STAR_TO_RUB_RATE * 100) / 100,
      Math.round(stat.expense * 100) / 100,
      Math.round(stat.expense * STAR_TO_RUB_RATE * 100) / 100,
      Math.round(stat.profit * 100) / 100,
      Math.round(stat.profit * STAR_TO_RUB_RATE * 100) / 100,
      stat.transactions,
      stat.activeUsers || 0
    ]),
    ['', '', '', '', '', '', '', '', ''],
    ['📊 СТАТИСТИКА ПО ДНЯМ (ПОСЛЕДНИЕ 30 ДНЕЙ)', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    dailyHeaders,
    ['', '', '', '', '', '', '', '', ''],
    ...dailyStats.slice(0, 30).map(stat => [
      stat.date,
      Math.round(stat.income * 100) / 100,
      Math.round(stat.income * STAR_TO_RUB_RATE * 100) / 100,
      Math.round(stat.expense * 100) / 100,
      Math.round(stat.expense * STAR_TO_RUB_RATE * 100) / 100,
      Math.round(stat.profit * 100) / 100,
      Math.round(stat.profit * STAR_TO_RUB_RATE * 100) / 100,
      stat.transactions
    ])
  ];

  return XLSX.utils.aoa_to_sheet(timeData);
}

/**
 * Creates transactions details sheet
 */
function createTransactionsSheet(data) {
  const { allPayments } = data;

  const headers = [
    '📅 Дата',
    '📊 Тип',
    '💰 Сумма (⭐)',
    '💰 Сумма (₽)',
    '💳 Способ оплаты',
    '🛠️ Сервис',
    '👤 Пользователь',
    '📝 Описание',
    '🏷️ Категория',
    '🏭 Себестоимость (⭐)',
    '🏭 Себестоимость (₽)'
  ];

  const transactionsData = [
    ['📋 ВСЕ ТРАНЗАКЦИИ', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', ''],
    headers,
    ['', '', '', '', '', '', '', '', '', '', ''],
    ...allPayments.map(payment => [
      new Date(payment.payment_date).toLocaleDateString('ru-RU'),
      payment.type === 'MONEY_INCOME' ? '📈 Доход' : '📉 Расход',
      Math.round((payment.stars || 0) * 100) / 100,
      payment.currency === 'RUB'
        ? Math.round((payment.amount || 0) * 100) / 100
        : Math.round((payment.stars || 0) * STAR_TO_RUB_RATE * 100) / 100,
      getPaymentMethodDisplay(payment),
      payment.service_type ? getServiceDisplay(payment.service_type) : '',
      payment.telegram_id,
      payment.description || '',
      payment.category === 'REAL' ? '💎 Реальные' :
        payment.category === 'BONUS' ? '🎁 Бонусы' : '❓ Неизвестно',
      Math.round((payment.cost || 0) * 100) / 100,
      Math.round((payment.cost || 0) * STAR_TO_RUB_RATE * 100) / 100
    ])
  ];

  return XLSX.utils.aoa_to_sheet(transactionsData);
}

/**
 * Gets payment method display name
 */
function getPaymentMethodDisplay(payment) {
  if (payment.currency === 'RUB' &&
      (payment.payment_method === 'Robokassa' || payment.payment_method === 'Manual')) {
    return '💳 Robokassa';
  } else if ((payment.currency === 'XTR' || payment.currency === 'STARS') &&
             payment.payment_method === 'Telegram') {
    return '⭐ Telegram Stars';
  } else if (payment.payment_method === 'System') {
    return '🤖 Система';
  } else if (payment.payment_method === 'Bonus') {
    return '🎁 Бонус';
  } else if (payment.payment_method === 'Manual') {
    return '✋ Ручное';
  }
  return payment.payment_method || '❓ Неизвестно';
}

/**
 * Saves Excel file
 */
function saveExcelFile(workbook, filename) {
  const outputDir = path.join(__dirname, '..', 'reports');

  // Create reports directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filePath = path.join(outputDir, filename);
  XLSX.writeFile(workbook, filePath).then(() => console.log('xlsx written')).catch(e => { console.error(e); process.exitCode = 1 });

  return filePath;
}

/**
 * Uploads file to accessible location (placeholder for future implementation)
 */
async function uploadFile(filePath) {
  // TODO: Implement upload to cloud storage or accessible web location
  console.log('📤 Upload functionality not yet implemented');
  console.log(`📁 File saved locally at: ${filePath}`);
  return filePath;
}

/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);
  const botName = args.find(arg => !arg.startsWith('--'));
  const shouldUpload = args.includes('--upload');
  const shouldProcessAll = args.includes('--all');
  const periodMatch = args.find(arg => arg.startsWith('--period='));
  const period = periodMatch ? parseInt(periodMatch.split('=')[1]) : 30;

  console.log('🚀 Starting Bot Financial Report Generator');
  console.log(`📅 Period: ${period} days`);
  console.log(`⭐ Star to Ruble rate: 1 ⭐ = ${STAR_TO_RUB_RATE} ₽`);

  try {
    if (shouldProcessAll) {
      console.log('📊 Processing all bots...');
      const bots = await getAllBots();
      console.log(`Found ${bots.length} bots: ${bots.join(', ')}`);

      for (const bot of bots) {
        console.log(`\n📈 Processing bot: ${bot}`);
        const { payments, users } = await getBotFinancialData(bot, period);
        const data = processFinancialData(payments, users);
        const workbook = createExcelReport(bot, data);

        const filename = `bot_financial_report_${bot}_${new Date().toISOString().split('T')[0]}.xlsx`;
        const filePath = saveExcelFile(workbook, filename);

        console.log(`✅ Report generated: ${filePath}`);

        if (shouldUpload) {
          await uploadFile(filePath);
        }
      }
    } else if (botName) {
      console.log(`📈 Processing bot: ${botName}`);
      const { payments, users } = await getBotFinancialData(botName, period);

      if (payments.length === 0) {
        console.log('⚠️ No payment data found for this bot');
        return;
      }

      const data = processFinancialData(payments, users);
      const workbook = createExcelReport(botName, data);

      const filename = `bot_financial_report_${botName}_${new Date().toISOString().split('T')[0]}.xlsx`;
      const filePath = saveExcelFile(workbook, filename);

      console.log(`✅ Report generated: ${filePath}`);
      console.log(`📊 Summary: ${formatCurrency(data.summary.totalIncomeStars)} income, ${formatCurrency(data.summary.netProfitStars)} profit`);

      if (shouldUpload) {
        await uploadFile(filePath);
      }
    } else {
      console.log('❌ Please specify a bot name or use --all flag');
      console.log('Usage examples:');
      console.log('  node scripts/bot-financial-report.js neuro_blogger_bot');
      console.log('  node scripts/bot-financial-report.js --all');
      console.log('  node scripts/bot-financial-report.js neuro_blogger_bot --upload --period=60');
      process.exit(1);
    }

    console.log('\n🎉 Report generation completed successfully!');
  } catch (error) {
    console.error('❌ Error generating report:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = {
  getBotFinancialData,
  processFinancialData,
  createExcelReport,
  saveExcelFile
};