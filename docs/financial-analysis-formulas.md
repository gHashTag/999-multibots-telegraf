# Financial Analysis & Billing Logic for Bot Owners

## Overview
This document defines the financial analysis formulas and billing logic for calculating what each bot owner has earned, spent, and the net amount owed to/by each owner based on the `payments_v2` data structure.

## Data Structure Analysis

### Payments V2 Table Structure
```sql
TABLE payments_v2 (
  id: number,
  telegram_id: number,           -- User who made the transaction
  payment_date: datetime,
  amount: number,               -- Amount in source currency (RUB, USD, etc.)
  description: string,
  metadata: object,
  stars: number,               -- Amount in Telegram Stars
  currency: string,            -- RUB, STARS, XTR, USD
  inv_id: string,
  invoice_url: string,
  status: ENUM('PENDING', 'COMPLETED', 'FAILED'),
  type: ENUM('MONEY_INCOME', 'MONEY_OUTCOME', 'BONUS', 'REFUND', etc.),
  service_type: string,        -- neuro_photo, kling_video, etc.
  model_name: string,          -- Specific model used
  operation_id: string,
  bot_name: string,            -- KEY FIELD for bot ownership
  language: string,
  payment_method: string,      -- Robokassa, Telegram, Manual
  subscription_type: string,   -- NEUROTESTER, NEUROVIDEO, etc.
  is_system_payment: boolean,
  created_at: datetime,
  cost: number,               -- Service cost in stars (for MONEY_OUTCOME)
  category: ENUM('REAL', 'BONUS')
)
```

## Financial Analysis Formulas

### 1. Revenue Calculation (Per Bot)

**Total Revenue = Income from all payment methods**
```sql
SELECT
  bot_name,
  SUM(CASE WHEN type = 'MONEY_INCOME' AND status = 'COMPLETED'
           THEN stars ELSE 0 END) as total_revenue_stars,
  SUM(CASE WHEN type = 'MONEY_INCOME' AND status = 'COMPLETED'
           THEN amount ELSE 0 END) as total_revenue_fiat
FROM payments_v2
WHERE bot_name = :bot_name
GROUP BY bot_name;
```

**Revenue Sources Breakdown:**
- **Telegram Stars**: `currency IN ('XTR', 'STARS')` + `payment_method = 'Telegram'`
- **Robokassa (Rubles)**: `currency = 'RUB'` + `payment_method = 'Robokassa'`
- **Manual Payments**: `payment_method = 'Manual'`
- **Subscriptions**: `subscription_type IS NOT NULL`

### 2. Expense Calculation (Per Bot)

**Total Expenses = Service costs for MONEY_OUTCOME operations**
```sql
SELECT
  bot_name,
  SUM(CASE WHEN type = 'MONEY_OUTCOME' AND status = 'COMPLETED'
           THEN COALESCE(cost, stars) ELSE 0 END) as total_expenses_stars,
  COUNT(CASE WHEN type = 'MONEY_OUTCOME' AND status = 'COMPLETED'
             THEN 1 END) as total_operations
FROM payments_v2
WHERE bot_name = :bot_name
GROUP BY bot_name;
```

**Expense Categories:**
- **AI Photo Generation**: `service_type = 'neuro_photo'` (4⭐ per photo)
- **Video Services**: `service_type IN ('kling_video', 'haiper_video', 'minimax_video')`
- **Voice Generation**: `service_type = 'text_to_speech'`
- **Image Analysis**: `service_type = 'image_to_prompt'`
- **Model Training**: `service_type = 'model_training_other'`
- **Morphing**: `service_type IN ('morphing', 'morphing_seamless')`

### 3. Net Profit Calculation

```sql
WITH bot_financials AS (
  SELECT
    bot_name,
    -- Revenue
    SUM(CASE WHEN type = 'MONEY_INCOME' AND status = 'COMPLETED'
             THEN stars ELSE 0 END) as revenue_stars,
    SUM(CASE WHEN type = 'MONEY_INCOME' AND status = 'COMPLETED'
             THEN amount ELSE 0 END) as revenue_fiat,

    -- Expenses (service costs)
    SUM(CASE WHEN type = 'MONEY_OUTCOME' AND status = 'COMPLETED'
             THEN COALESCE(cost, stars) ELSE 0 END) as expenses_stars,

    -- Transactions count
    COUNT(CASE WHEN type = 'MONEY_INCOME' AND status = 'COMPLETED'
               THEN 1 END) as income_transactions,
    COUNT(CASE WHEN type = 'MONEY_OUTCOME' AND status = 'COMPLETED'
               THEN 1 END) as expense_transactions
  FROM payments_v2
  WHERE status = 'COMPLETED'
  GROUP BY bot_name
)
SELECT
  bot_name,
  revenue_stars,
  expenses_stars,
  (revenue_stars - expenses_stars) as net_profit_stars,
  CASE
    WHEN revenue_stars > 0
    THEN ROUND(((revenue_stars - expenses_stars) / revenue_stars * 100)::NUMERIC, 2)
    ELSE 0
  END as profit_margin_percent,
  income_transactions,
  expense_transactions
FROM bot_financials
ORDER BY net_profit_stars DESC;
```

## 4. Star-to-Ruble Conversion Logic

### Current Exchange Rate Calculation
```sql
-- Calculate average star-to-ruble rate from recent transactions
WITH star_ruble_rates AS (
  SELECT
    payment_date,
    stars,
    amount,
    (amount / NULLIF(stars, 0)) as rate_per_star
  FROM payments_v2
  WHERE type = 'MONEY_INCOME'
    AND status = 'COMPLETED'
    AND currency = 'RUB'
    AND stars > 0
    AND amount > 0
    AND payment_date >= CURRENT_DATE - INTERVAL '30 days'
)
SELECT
  AVG(rate_per_star) as avg_ruble_per_star,
  COUNT(*) as sample_size,
  MIN(rate_per_star) as min_rate,
  MAX(rate_per_star) as max_rate
FROM star_ruble_rates;
```

### Standardized Currency Conversion
```sql
-- Convert all amounts to stars for consistent billing
SELECT
  bot_name,
  payment_date,
  type,
  CASE
    WHEN currency = 'RUB' AND stars > 0 THEN stars
    WHEN currency = 'RUB' AND stars = 0 THEN amount / :current_star_rate
    ELSE stars
  END as standardized_stars,
  amount,
  currency
FROM payments_v2;
```

## 5. Bot Owner Billing Formulas

### Revenue Share Model (Platform takes commission)
```sql
-- Assuming platform takes 20% commission from revenue
WITH bot_settlements AS (
  SELECT
    bot_name,
    -- Gross revenue
    SUM(CASE WHEN type = 'MONEY_INCOME' AND status = 'COMPLETED'
             THEN stars ELSE 0 END) as gross_revenue,

    -- Platform commission (20%)
    SUM(CASE WHEN type = 'MONEY_INCOME' AND status = 'COMPLETED'
             THEN stars * 0.20 ELSE 0 END) as platform_commission,

    -- Net revenue after commission
    SUM(CASE WHEN type = 'MONEY_INCOME' AND status = 'COMPLETED'
             THEN stars * 0.80 ELSE 0 END) as net_revenue,

    -- Service costs (bot owner pays)
    SUM(CASE WHEN type = 'MONEY_OUTCOME' AND status = 'COMPLETED'
             THEN COALESCE(cost, stars) ELSE 0 END) as service_costs,

    -- Final settlement
    (SUM(CASE WHEN type = 'MONEY_INCOME' AND status = 'COMPLETED'
              THEN stars * 0.80 ELSE 0 END) -
     SUM(CASE WHEN type = 'MONEY_OUTCOME' AND status = 'COMPLETED'
              THEN COALESCE(cost, stars) ELSE 0 END)) as final_settlement
  FROM payments_v2
  WHERE status = 'COMPLETED'
  GROUP BY bot_name
)
SELECT
  bot_name,
  gross_revenue,
  platform_commission,
  net_revenue,
  service_costs,
  final_settlement,
  CASE
    WHEN final_settlement > 0 THEN 'OWED TO BOT OWNER'
    WHEN final_settlement < 0 THEN 'BOT OWNER OWES PLATFORM'
    ELSE 'BALANCED'
  END as settlement_status
FROM bot_settlements
ORDER BY final_settlement DESC;
```

### Cost-Plus Model (Platform covers costs, takes fixed fee)
```sql
-- Platform covers service costs, takes fixed fee per transaction
WITH cost_plus_settlements AS (
  SELECT
    bot_name,
    -- Total revenue
    SUM(CASE WHEN type = 'MONEY_INCOME' AND status = 'COMPLETED'
             THEN stars ELSE 0 END) as total_revenue,

    -- Service costs (platform pays)
    SUM(CASE WHEN type = 'MONEY_OUTCOME' AND status = 'COMPLETED'
             THEN COALESCE(cost, stars) ELSE 0 END) as platform_costs,

    -- Fixed fee per transaction (e.g., 2 stars per transaction)
    COUNT(CASE WHEN type = 'MONEY_OUTCOME' AND status = 'COMPLETED'
               THEN 1 END) * 2 as platform_fees,

    -- Net amount owed to bot owner
    (SUM(CASE WHEN type = 'MONEY_INCOME' AND status = 'COMPLETED'
              THEN stars ELSE 0 END) -
     COUNT(CASE WHEN type = 'MONEY_OUTCOME' AND status = 'COMPLETED'
                THEN 1 END) * 2) as amount_owed_to_owner
  FROM payments_v2
  WHERE status = 'COMPLETED'
  GROUP BY bot_name
)
SELECT
  bot_name,
  total_revenue,
  platform_costs,
  platform_fees,
  amount_owed_to_owner,
  CASE
    WHEN amount_owed_to_owner > 0 THEN 'PLATFORM OWES BOT OWNER'
    WHEN amount_owed_to_owner < 0 THEN 'BOT OWNER OWES PLATFORM'
    ELSE 'BALANCED'
  END as settlement_status
FROM cost_plus_settlements
ORDER BY amount_owed_to_owner DESC;
```

## 6. Revenue/Expense Categorization Rules

### Income Categories
1. **Primary Revenue** - Direct user payments
   - `type = 'MONEY_INCOME'`
   - `category = 'REAL'`
   - `status = 'COMPLETED'`

2. **Bonus Credits** - Promotional/referral bonuses
   - `type = 'MONEY_INCOME'`
   - `category = 'BONUS'`

3. **Subscription Revenue** - Recurring subscriptions
   - `subscription_type IS NOT NULL`
   - `type = 'MONEY_INCOME'`

### Expense Categories
1. **AI Service Costs** - Direct service consumption
   - `type = 'MONEY_OUTCOME'`
   - `service_type IS NOT NULL`
   - `cost > 0`

2. **Refunds** - Customer refunds
   - `type = 'REFUND'`

3. **System Payments** - Internal adjustments
   - `is_system_payment = true`

## 7. Monthly Settlement Report Template

```sql
-- Generate monthly settlement report for all bot owners
WITH monthly_summary AS (
  SELECT
    bot_name,
    DATE_TRUNC('month', payment_date) as month,

    -- Revenue metrics
    COUNT(CASE WHEN type = 'MONEY_INCOME' AND status = 'COMPLETED'
               THEN 1 END) as revenue_transactions,
    SUM(CASE WHEN type = 'MONEY_INCOME' AND status = 'COMPLETED'
             THEN stars ELSE 0 END) as gross_revenue,
    SUM(CASE WHEN type = 'MONEY_INCOME' AND status = 'COMPLETED'
             THEN amount ELSE 0 END) as gross_revenue_fiat,

    -- Expense metrics
    COUNT(CASE WHEN type = 'MONEY_OUTCOME' AND status = 'COMPLETED'
               THEN 1 END) as expense_transactions,
    SUM(CASE WHEN type = 'MONEY_OUTCOME' AND status = 'COMPLETED'
             THEN COALESCE(cost, stars) ELSE 0 END) as total_costs,

    -- User activity
    COUNT(DISTINCT telegram_id) as unique_users,

    -- Service breakdown
    jsonb_object_agg(
      COALESCE(service_type, 'revenue'),
      json_build_object(
        'count', COUNT(*) FILTER (WHERE service_type IS NOT NULL OR type = 'MONEY_INCOME'),
        'stars', SUM(stars) FILTER (WHERE service_type IS NOT NULL OR type = 'MONEY_INCOME')
      )
    ) as service_breakdown

  FROM payments_v2
  WHERE status = 'COMPLETED'
    AND payment_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
    AND payment_date < DATE_TRUNC('month', CURRENT_DATE)
  GROUP BY bot_name, DATE_TRUNC('month', payment_date)
)
SELECT
  bot_name,
  month,
  revenue_transactions,
  expense_transactions,
  unique_users,
  gross_revenue,
  total_costs,
  (gross_revenue - total_costs) as net_profit,
  CASE
    WHEN gross_revenue > 0
    THEN ROUND(((gross_revenue - total_costs) / gross_revenue * 100)::NUMERIC, 2)
    ELSE 0
  END as profit_margin,
  service_breakdown
FROM monthly_summary
ORDER BY bot_name, month;
```

## 8. Implementation Notes

### Key Considerations:
1. **Cost Calculation**: Use the `cost` field when available, fall back to `stars` for older records
2. **Currency Normalization**: Convert all amounts to stars for consistent calculations
3. **Status Filtering**: Only include `COMPLETED` transactions in financial calculations
4. **Time Periods**: Support daily, weekly, monthly, and yearly aggregations
5. **Service Attribution**: Use `service_type` and `model_name` for detailed cost tracking

### Data Quality Checks:
1. Verify `bot_name` is not null for all transactions
2. Ensure `cost` field is properly calculated for all `MONEY_OUTCOME` transactions
3. Validate star-to-ruble conversion rates are reasonable
4. Check for orphaned transactions without proper categorization

### Performance Optimizations:
1. Use existing indexes on `(telegram_id, status, type, category, bot_name, payment_date)`
2. Implement materialized views for monthly aggregations
3. Use `FILTER` clauses instead of `CASE WHEN` for better performance
4. Consider partitioning by `payment_date` for large datasets