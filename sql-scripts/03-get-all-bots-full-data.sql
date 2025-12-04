-- =====================================================================
-- ПОЛНАЯ ВЫГРУЗКА ВСЕХ БОТОВ
-- =====================================================================

-- 1. ОБЩАЯ СТАТИСТИКА ПО ВСЕМ БОТАМ
SELECT
  bot_name,
  COUNT(*) as total_transactions,
  COUNT(DISTINCT telegram_id) as unique_users,
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN CAST(amount AS DECIMAL(15,2)) ELSE 0 END) as total_income,
  SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN CAST(amount AS DECIMAL(15,2)) ELSE 0 END) as total_outcome,
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN CAST(amount AS DECIMAL(15,2)) ELSE -CAST(amount AS DECIMAL(15,2)) END) as net_balance,
  AVG(CASE WHEN type = 'MONEY_INCOME' THEN CAST(amount AS DECIMAL(15,2)) ELSE NULL END) as avg_income,
  MIN(payment_date) as first_transaction,
  MAX(payment_date) as last_transaction
FROM payments_v2
WHERE bot_name IS NOT NULL
GROUP BY bot_name
ORDER BY total_transactions DESC;

-- 2. ВСЕ ТРАНЗАКЦИИ С БОТАМИ (полная выгрузка)
SELECT
  id,
  bot_name,
  telegram_id,
  username,
  first_name,
  last_name,
  payment_date,
  amount,
  currency,
  payment_method,
  type,
  category,
  description
FROM payments_v2
WHERE bot_name IS NOT NULL
ORDER BY bot_name, payment_date DESC
LIMIT 10000;

-- 3. ДЕТАЛИ ПО КАЖДОМУ БОТУ
SELECT
  bot_name,
  'TOTAL' as detail_type,
  COUNT(*) as metric_value
FROM payments_v2
WHERE bot_name IS NOT NULL
GROUP BY bot_name

UNION ALL

SELECT
  bot_name,
  'USERS' as detail_type,
  COUNT(DISTINCT telegram_id) as metric_value
FROM payments_v2
WHERE bot_name IS NOT NULL
GROUP BY bot_name

UNION ALL

SELECT
  bot_name,
  'INCOME_TRANSACTIONS' as detail_type,
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN 1 ELSE 0 END) as metric_value
FROM payments_v2
WHERE bot_name IS NOT NULL
GROUP BY bot_name

UNION ALL

SELECT
  bot_name,
  'OUTCOME_TRANSACTIONS' as detail_type,
  SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN 1 ELSE 0 END) as metric_value
FROM payments_v2
WHERE bot_name IS NOT NULL
GROUP BY bot_name

UNION ALL

SELECT
  bot_name,
  'REAL_TRANSACTIONS' as detail_type,
  SUM(CASE WHEN category = 'REAL' THEN 1 ELSE 0 END) as metric_value
FROM payments_v2
WHERE bot_name IS NOT NULL
GROUP BY bot_name

UNION ALL

SELECT
  bot_name,
  'BONUS_TRANSACTIONS' as detail_type,
  SUM(CASE WHEN category = 'BONUS' THEN 1 ELSE 0 END) as metric_value
FROM payments_v2
WHERE bot_name IS NOT NULL
GROUP BY bot_name;

-- 4. ТОП ПОЛЬЗОВАТЕЛИ ПО КАЖДОМУ БОТУ
SELECT
  bot_name,
  telegram_id,
  username,
  first_name,
  last_name,
  COUNT(*) as transaction_count,
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN CAST(amount AS DECIMAL(15,2)) ELSE 0 END) as total_income,
  SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN CAST(amount AS DECIMAL(15,2)) ELSE 0 END) as total_outcome,
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN CAST(amount AS DECIMAL(15,2)) ELSE -CAST(amount AS DECIMAL(15,2)) END) as net_balance
FROM payments_v2
WHERE bot_name IS NOT NULL
GROUP BY bot_name, telegram_id, username, first_name, last_name
ORDER BY bot_name, transaction_count DESC;

-- 5. АНАЛИЗ ПО ВАЛЮТАМ ДЛЯ КАЖДОГО БОТА
SELECT
  bot_name,
  currency,
  COUNT(*) as transaction_count,
  SUM(CAST(amount AS DECIMAL(15,2))) as total_amount,
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN CAST(amount AS DECIMAL(15,2)) ELSE 0 END) as total_income,
  SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN CAST(amount AS DECIMAL(15,2)) ELSE 0 END) as total_outcome,
  AVG(CAST(amount AS DECIMAL(15,2))) as avg_amount
FROM payments_v2
WHERE bot_name IS NOT NULL
GROUP BY bot_name, currency
ORDER BY bot_name, transaction_count DESC;

-- 6. СПОСОБЫ ОПЛАТЫ ПО БОТАМ
SELECT
  bot_name,
  payment_method,
  COUNT(*) as transaction_count,
  SUM(CAST(amount AS DECIMAL(15,2))) as total_amount
FROM payments_v2
WHERE bot_name IS NOT NULL
GROUP BY bot_name, payment_method
ORDER BY bot_name, transaction_count DESC;

-- 7. ДИНАМИКА ПО МЕСЯЦАМ ДЛЯ КАЖДОГО БОТА
SELECT
  bot_name,
  DATE_TRUNC('month', payment_date) as month,
  COUNT(*) as transaction_count,
  COUNT(DISTINCT telegram_id) as unique_users,
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN CAST(amount AS DECIMAL(15,2)) ELSE 0 END) as total_income,
  SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN CAST(amount AS DECIMAL(15,2)) ELSE 0 END) as total_outcome
FROM payments_v2
WHERE bot_name IS NOT NULL
GROUP BY bot_name, DATE_TRUNC('month', payment_date)
ORDER BY bot_name, month DESC;
