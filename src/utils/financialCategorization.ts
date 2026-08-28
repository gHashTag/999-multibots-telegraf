/**
 * Financial Categorization Utility
 * Correctly separates REAL revenue from VIRTUAL money
 *
 * CRITICAL FIX: Addresses HaimGroupMedia_bot 21,000⭐ inflation issue
 */

export interface PaymentRecord {
  id: string
  telegram_id: string
  amount: number
  stars: number
  category: 'REAL' | 'BONUS'
  payment_method: string
  type: string
  description: string
  bot_name: string
  is_system_payment?: boolean
  payment_date: string
}

export interface FinancialBreakdown {
  realRevenue: {
    stars: number
    rub: number
    transactionCount: number
    averagePerTransaction: number
  }
  virtualMoney: {
    stars: number
    sources: {
      adminGrants: number
      employeeAccess: number
      bonuses: number
      systemPayments: number
    }
    transactionCount: number
  }
  totalStars: number
  inflationRatio: number // virtualMoney / realRevenue
}

/**
 * Determines if a payment represents REAL revenue
 */
export function isRealRevenue(payment: PaymentRecord): boolean {
  // Primary categorization: Use category field if properly set
  if (payment.category === 'REAL' && payment.amount > 0) {
    return true
  }

  // Fallback categorization: Payment method analysis
  const realPaymentMethods = [
    'Robokassa',
    'Telegram',
    'Internal', // User service usage with actual cost
  ]

  // Must have actual monetary amount and be user-initiated
  return (
    payment.amount > 0 &&
    realPaymentMethods.includes(payment.payment_method) &&
    payment.type !== 'BONUS'
  )
}

/**
 * Determines if a payment represents VIRTUAL money
 */
export function isVirtualMoney(payment: PaymentRecord): boolean {
  // Category-based identification
  if (payment.category === 'BONUS') {
    return true
  }

  // Payment method-based identification
  const virtualPaymentMethods = [
    'Admin',
    'Admin_Grant',
    'Haim_Employee',
    'Employee_Access',
    'Manual',
    'Bonus',
    'System',
  ]

  // Description pattern matching
  const virtualDescriptionPatterns = [
    /admin/i,
    /employee/i,
    /grant/i,
    /bonus/i,
    /manual/i,
    /permanent.*access/i,
  ]

  return (
    virtualPaymentMethods.includes(payment.payment_method) ||
    virtualDescriptionPatterns.some(pattern =>
      pattern.test(payment.description)
    ) ||
    (payment.amount === 0 && payment.stars > 0)
  ) // Stars without actual payment
}

/**
 * Categorizes virtual money by source type
 */
export function categorizeVirtualMoney(
  payment: PaymentRecord
): keyof FinancialBreakdown['virtualMoney']['sources'] {
  const method = payment.payment_method.toLowerCase()
  const desc = payment.description.toLowerCase()

  if (method.includes('admin') || desc.includes('admin')) {
    return 'adminGrants'
  }

  if (method.includes('employee') || desc.includes('employee')) {
    return 'employeeAccess'
  }

  if (method.includes('bonus') || desc.includes('bonus')) {
    return 'bonuses'
  }

  return 'systemPayments'
}

/**
 * Analyzes financial data with proper REAL vs VIRTUAL separation
 */
export function analyzeFinancialData(
  payments: PaymentRecord[]
): FinancialBreakdown {
  const realPayments = payments.filter(isRealRevenue)
  const virtualPayments = payments.filter(isVirtualMoney)

  // Calculate real revenue
  const realRevenue = {
    stars: realPayments.reduce((sum, p) => sum + (p.stars || 0), 0),
    rub: realPayments.reduce((sum, p) => sum + (p.amount || 0), 0),
    transactionCount: realPayments.length,
    averagePerTransaction:
      realPayments.length > 0
        ? realPayments.reduce((sum, p) => sum + (p.stars || 0), 0) /
          realPayments.length
        : 0,
  }

  // Calculate virtual money by source
  const virtualSources = {
    adminGrants: 0,
    employeeAccess: 0,
    bonuses: 0,
    systemPayments: 0,
  }

  virtualPayments.forEach(payment => {
    const sourceType = categorizeVirtualMoney(payment)
    virtualSources[sourceType] += payment.stars || 0
  })

  const virtualMoney = {
    stars: virtualPayments.reduce((sum, p) => sum + (p.stars || 0), 0),
    sources: virtualSources,
    transactionCount: virtualPayments.length,
  }

  const totalStars = realRevenue.stars + virtualMoney.stars
  const inflationRatio =
    realRevenue.stars > 0 ? virtualMoney.stars / realRevenue.stars : 0

  return {
    realRevenue,
    virtualMoney,
    totalStars,
    inflationRatio,
  }
}

/**
 * Generates corrected financial report
 */
export function generateFinancialReport(
  botName: string,
  breakdown: FinancialBreakdown
): string {
  const inflationPercentage = (breakdown.inflationRatio * 100).toFixed(1)

  return `
🔍 CORRECTED FINANCIAL ANALYSIS - ${botName}
============================================

💰 REAL REVENUE (User Payments):
- Total: ${breakdown.realRevenue.stars.toFixed(2)}⭐ (${breakdown.realRevenue.rub.toFixed(2)}₽)
- Transactions: ${breakdown.realRevenue.transactionCount}
- Average per transaction: ${breakdown.realRevenue.averagePerTransaction.toFixed(2)}⭐

🎁 VIRTUAL MONEY (Non-Revenue):
- Total: ${breakdown.virtualMoney.stars.toFixed(2)}⭐
- Admin Grants: ${breakdown.virtualMoney.sources.adminGrants}⭐
- Employee Access: ${breakdown.virtualMoney.sources.employeeAccess}⭐
- Bonuses: ${breakdown.virtualMoney.sources.bonuses}⭐
- System Payments: ${breakdown.virtualMoney.sources.systemPayments}⭐
- Transactions: ${breakdown.virtualMoney.transactionCount}

📊 SUMMARY:
- Total Balance: ${breakdown.totalStars.toFixed(2)}⭐
- Revenue Inflation: ${inflationPercentage}%
- Virtual Money Ratio: ${breakdown.inflationRatio.toFixed(2)}:1

⚠️  IMPACT: Virtual money inflates apparent revenue by ${inflationPercentage}%
`
}

/**
 * SQL query templates for corrected financial reporting
 */
export const FinancialQueries = {
  getRealRevenue: (botName: string) => `
    SELECT
      SUM(stars) as real_stars,
      SUM(amount) as real_rub,
      COUNT(*) as transaction_count
    FROM payments_v2
    WHERE bot_name = '${botName}'
    AND category = 'REAL'
    AND amount > 0;
  `,

  getVirtualMoney: (botName: string) => `
    SELECT
      payment_method,
      SUM(stars) as virtual_stars,
      COUNT(*) as transaction_count
    FROM payments_v2
    WHERE bot_name = '${botName}'
    AND (
      category = 'BONUS'
      OR payment_method IN ('Admin', 'Admin_Grant', 'Haim_Employee', 'Employee_Access')
      OR (amount = 0 AND stars > 0)
    )
    GROUP BY payment_method;
  `,

  getInflationSources: (botName: string) => `
    SELECT
      payment_date,
      stars,
      payment_method,
      description
    FROM payments_v2
    WHERE bot_name = '${botName}'
    AND (
      category = 'BONUS'
      OR payment_method LIKE '%Admin%'
      OR payment_method LIKE '%Employee%'
    )
    ORDER BY stars DESC;
  `,
}
