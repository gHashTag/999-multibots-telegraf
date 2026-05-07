-- ========================================
-- СКРИПТ 1: ПОЛУЧЕНИЕ ВСЕХ ПЛАТЕЖЕЙ
-- ========================================

-- Общая статистика
SELECT
  COUNT(*) as total_transactions,
  COUNT(DISTINCT telegram_id) as unique_users,
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN 1 ELSE 0 END) as income_transactions,
  SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN 1 ELSE 0 END) as outcome_transactions,
  SUM(CASE WHEN category = 'REAL' THEN 1 ELSE 0 END) as real_transactions,
  SUM(CASE WHEN category = 'BONUS' THEN 1 ELSE 0 END) as bonus_transactions,
  MIN(payment_date) as first_transaction,
  MAX(payment_date) as last_transaction
FROM payments_v2;

-- Анализ по валютам
SELECT
  currency,
  COUNT(*) as transaction_count,
  SUM(CAST(amount AS DECIMAL(15,2))) as total_amount,
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN CAST(amount AS DECIMAL(15,2)) ELSE 0 END) as total_income,
  SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN CAST(amount AS DECIMAL(15,2)) ELSE 0 END) as total_outcome,
  AVG(CAST(amount AS DECIMAL(15,2))) as avg_amount
FROM payments_v2
GROUP BY currency
ORDER BY transaction_count DESC;

-- Анализ по категориям
SELECT
  category,
  type,
  COUNT(*) as transaction_count,
  SUM(CAST(amount AS DECIMAL(15,2))) as total_amount
FROM payments_v2
GROUP BY category, type
ORDER BY category, type;

-- Анализ по способам оплаты
SELECT
  payment_method,
  COUNT(*) as transaction_count,
  SUM(CAST(amount AS DECIMAL(15,2))) as total_amount
FROM payments_v2
GROUP BY payment_method
ORDER BY transaction_count DESC
LIMIT 20;

-- Топ пользователей по количеству транзакций
SELECT
  telegram_id,
  username,
  first_name,
  last_name,
  COUNT(*) as transaction_count,
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN CAST(amount AS DECIMAL(15,2)) ELSE 0 END) as total_income,
  SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN CAST(amount AS DECIMAL(15,2)) ELSE 0 END) as total_outcome,
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN CAST(amount AS DECIMAL(15,2)) ELSE -CAST(amount AS DECIMAL(15,2)) END) as net_balance
FROM payments_v2
GROUP BY telegram_id, username, first_name, last_name
ORDER BY transaction_count DESC
LIMIT 50;

-- Анализ по месяцам
SELECT
  DATE_TRUNC('month', payment_date) as month,
  COUNT(*) as transaction_count,
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN CAST(amount AS DECIMAL(15,2)) ELSE 0 END) as total_income,
  SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN CAST(amount AS DECIMAL(15,2)) ELSE 0 END) as total_outcome,
  COUNT(DISTINCT telegram_id) as unique_users
FROM payments_v2
GROUP BY DATE_TRUNC('month', payment_date)
ORDER BY month DESC;

-- Последние 1000 транзакций (для экспорта)
SELECT
  id,
  telegram_id,
  username,
  first_name,
  last_name,
  payment_date,
  amount,
  stars,
  currency,
  payment_method,
  type,
  category,
  description
FROM payments_v2
ORDER BY payment_date DESC
LIMIT 1000;
