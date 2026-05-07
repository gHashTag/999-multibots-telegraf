-- ========================================================================
-- SQL СКРИПТ ДЛЯ АНАЛИЗА ВСЕХ БОТОВ НА ФЕЙКОВЫЕ ДАННЫЕ
-- Выполните этот запрос в Supabase SQL Editor
-- ========================================================================

-- 1. АНАЛИЗ ПО КАЖДОМУ БОТУ
SELECT
  bot_name,
  COUNT(*) as total_transactions,
  COUNT(CASE WHEN type = 'MONEY_INCOME' THEN 1 END) as income_transactions,
  COUNT(CASE WHEN type = 'MONEY_OUTCOME' THEN 1 END) as outcome_transactions,

  -- Реальные доходы (от пользователей)
  COUNT(CASE
    WHEN type = 'MONEY_INCOME'
      AND category = 'REAL'
      AND (payment_method = 'Telegram' OR payment_method = 'Robokassa')
      AND currency = 'XTR'
    THEN 1 END) as real_income_xtr_count,

  SUM(CASE
    WHEN type = 'MONEY_INCOME'
      AND category = 'REAL'
      AND (payment_method = 'Telegram' OR payment_method = 'Robokassa')
      AND currency = 'XTR'
    THEN amount::numeric
    ELSE 0 END) as real_income_xtr_amount,

  COUNT(CASE
    WHEN type = 'MONEY_INCOME'
      AND category = 'REAL'
      AND (payment_method = 'Telegram' OR payment_method = 'Robokassa')
      AND currency = 'STARS'
    THEN 1 END) as real_income_stars_count,

  SUM(CASE
    WHEN type = 'MONEY_INCOME'
      AND category = 'REAL'
      AND (payment_method = 'Telegram' OR payment_method = 'Robokassa')
      AND currency = 'STARS'
    THEN amount::numeric
    ELSE 0 END) as real_income_stars_amount,

  COUNT(CASE
    WHEN type = 'MONEY_INCOME'
      AND category = 'REAL'
      AND (payment_method = 'Telegram' OR payment_method = 'Robokassa')
      AND currency = 'RUB'
    THEN 1 END) as real_income_rub_count,

  SUM(CASE
    WHEN type = 'MONEY_INCOME'
      AND category = 'REAL'
      AND (payment_method = 'Telegram' OR payment_method = 'Robokassa')
      AND currency = 'RUB'
    THEN amount::numeric
    ELSE 0 END) as real_income_rub_amount,

  -- Реальные расходы
  SUM(CASE
    WHEN type = 'MONEY_OUTCOME' AND category = 'REAL' AND currency = 'XTR'
    THEN amount::numeric
    ELSE 0 END) as real_expense_xtr_amount,

  SUM(CASE
    WHEN type = 'MONEY_OUTCOME' AND category = 'REAL' AND currency = 'STARS'
    THEN amount::numeric
    ELSE 0 END) as real_expense_stars_amount,

  SUM(CASE
    WHEN type = 'MONEY_OUTCOME' AND category = 'REAL' AND currency = 'RUB'
    THEN amount::numeric
    ELSE 0 END) as real_expense_rub_amount,

  -- Подозрительные транзакции
  COUNT(CASE
    WHEN type = 'MONEY_INCOME'
      AND (
        description ILIKE '%System Grant%'
        OR description ILIKE '%Manual%'
        OR description ILIKE '%Migration%'
        OR description ILIKE '%refund%'
        OR payment_method = 'SYSTEM'
        OR category = 'BONUS'
      )
    THEN 1 END) as suspicious_transactions

FROM payments
WHERE bot_name IN (
  'neuro_blogger_bot',
  'MetaMuse_Manifest_bot',
  'Gaia_Kamskaia_bot',
  'AI_STARS_bot',
  'Kaya_easy_art_bot',
  'NeuroLenaAssistant_bot',
  'HaimGroupMedia_bot',
  'LeeSolarbot',
  'NeurostylistShtogrina_bot',
  'ZavaraBot'
)
GROUP BY bot_name
ORDER BY bot_name;

-- 2. ДЕТАЛЬНЫЙ АНАЛИЗ ПОДОЗРИТЕЛЬНЫХ ТРАНЗАКЦИЙ
SELECT
  bot_name,
  payment_method,
  category,
  COUNT(*) as count,
  SUM(amount::numeric) as total_amount,
  string_agg(DISTINCT LEFT(description, 50), ' | ') as examples
FROM payments
WHERE bot_name IN (
  'neuro_blogger_bot',
  'MetaMuse_Manifest_bot',
  'Gaia_Kamskaia_bot',
  'AI_STARS_bot',
  'Kaya_easy_art_bot',
  'NeuroLenaAssistant_bot',
  'HaimGroupMedia_bot',
  'LeeSolarbot',
  'NeurostylistShtogrina_bot',
  'ZavaraBot'
)
  AND type = 'MONEY_INCOME'
  AND (
    description ILIKE '%System Grant%'
    OR description ILIKE '%Manual%'
    OR description ILIKE '%Migration%'
    OR description ILIKE '%refund%'
    OR payment_method = 'SYSTEM'
    OR category = 'BONUS'
  )
GROUP BY bot_name, payment_method, category
ORDER BY bot_name, total_amount DESC;

-- 3. ПРОВЕРКА LeeSolarbot (специально)
SELECT
  'LeeSolarbot - ВСЕ ТРАНЗАКЦИИ' as analysis,
  bot_name,
  type,
  category,
  payment_method,
  currency,
  amount,
  LEFT(description, 80) as description,
  created_at
FROM payments
WHERE bot_name = 'LeeSolarbot'
ORDER BY created_at DESC
LIMIT 20;

-- 4. ИТОГОВАЯ СВОДКА ПО ВСЕМ БОТАМ
SELECT
  'ИТОГОВАЯ СВОДКА' as report,
  COUNT(DISTINCT bot_name) as total_bots,
  COUNT(*) as total_transactions,
  SUM(CASE WHEN type = 'MONEY_INCOME' AND category = 'REAL' AND (payment_method = 'Telegram' OR payment_method = 'Robokassa') THEN amount::numeric ELSE 0 END) as total_real_income,
  SUM(CASE WHEN type = 'MONEY_OUTCOME' AND category = 'REAL' THEN amount::numeric ELSE 0 END) as total_real_expenses
FROM payments
WHERE bot_name IN (
  'neuro_blogger_bot',
  'MetaMuse_Manifest_bot',
  'Gaia_Kamskaia_bot',
  'AI_STARS_bot',
  'Kaya_easy_art_bot',
  'NeuroLenaAssistant_bot',
  'HaimGroupMedia_bot',
  'LeeSolarbot',
  'NeurostylistShtogrina_bot',
  'ZavaraBot'
);

-- ========================================================================
-- ИНСТРУКЦИЯ ПО ИСПОЛЬЗОВАНИЮ:
-- 1. Откройте Supabase Dashboard: https://supabase.com/dashboard
-- 2. Перейдите в SQL Editor
-- 3. Выполните каждый блок запроса отдельно
-- 4. Результаты покажут реальные доходы по каждому боту
-- ========================================================================
