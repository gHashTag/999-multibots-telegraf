-- ================================================================================
-- ПОЛНАЯ ПРОВЕРКА ВСЕХ БОТОВ В SUPABASE
-- Выполните эти запросы в Supabase Dashboard для 100% верификации
-- ================================================================================

-- 1. ПОЛНАЯ СТАТИСТИКА ПО КАЖДОМУ БОТУ
SELECT
  bot_name,
  COUNT(*) as total_transactions,
  COUNT(DISTINCT user_id) as unique_users,

  -- РЕАЛЬНЫЕ ДОХОДЫ (только платежи от пользователей)
  SUM(CASE
    WHEN type = 'MONEY_INCOME'
      AND category = 'REAL'
      AND (payment_method = 'Telegram' OR payment_method = 'Robokassa')
      AND currency = 'XTR'
    THEN amount::numeric
    ELSE 0 END) as real_income_xtr,

  SUM(CASE
    WHEN type = 'MONEY_INCOME'
      AND category = 'REAL'
      AND (payment_method = 'Telegram' OR payment_method = 'Robokassa')
      AND currency = 'STARS'
    THEN amount::numeric
    ELSE 0 END) as real_income_stars,

  SUM(CASE
    WHEN type = 'MONEY_INCOME'
      AND category = 'REAL'
      AND (payment_method = 'Telegram' OR payment_method = 'Robokassa')
      AND currency = 'RUB'
    THEN amount::numeric
    ELSE 0 END) as real_income_rub,

  -- РЕАЛЬНЫЕ РАСХОДЫ (все реальные траты)
  SUM(CASE
    WHEN type = 'MONEY_OUTCOME' AND category = 'REAL' AND currency = 'XTR'
    THEN amount::numeric
    ELSE 0 END) as real_expense_xtr,

  SUM(CASE
    WHEN type = 'MONEY_OUTCOME' AND category = 'REAL' AND currency = 'STARS'
    THEN amount::numeric
    ELSE 0 END) as real_expense_stars,

  SUM(CASE
    WHEN type = 'MONEY_OUTCOME' AND category = 'REAL' AND currency = 'RUB'
    THEN amount::numeric
    ELSE 0 END) as real_expense_rub,

  -- СИСТЕМНЫЕ ГРАНТЫ/БОНУСЫ (фейковые расходы)
  SUM(CASE
    WHEN type = 'MONEY_INCOME'
      AND (
        description ILIKE '%System Grant%'
        OR description ILIKE '%Manual%'
        OR description ILIKE '%Migration%'
        OR description ILIKE '%refund%'
        OR description ILIKE '%Refund%'
        OR description ILIKE '%BONUS%'
        OR payment_method = 'SYSTEM'
        OR category = 'BONUS'
      )
      AND currency = 'XTR'
    THEN amount::numeric
    ELSE 0 END) as fake_expense_xtr,

  SUM(CASE
    WHEN type = 'MONEY_INCOME'
      AND (
        description ILIKE '%System Grant%'
        OR description ILIKE '%Manual%'
        OR description ILIKE '%Migration%'
        OR description ILIKE '%refund%'
        OR description ILIKE '%Refund%'
        OR description ILIKE '%BONUS%'
        OR payment_method = 'SYSTEM'
        OR category = 'BONUS'
      )
      AND currency = 'STARS'
    THEN amount::numeric
    ELSE 0 END) as fake_expense_stars,

  SUM(CASE
    WHEN type = 'MONEY_INCOME'
      AND (
        description ILIKE '%System Grant%'
        OR description ILIKE '%Manual%'
        OR description ILIKE '%Migration%'
        OR description ILIKE '%refund%'
        OR description ILIKE '%Refund%'
        OR description ILIKE '%BONUS%'
        OR payment_method = 'SYSTEM'
        OR category = 'BONUS'
      )
      AND currency = 'RUB'
    THEN amount::numeric
    ELSE 0 END) as fake_expense_rub

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

-- 2. ДЕТАЛЬНАЯ ПРОВЕРКА ЛЕЕСОЛБОТА (критично!)
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

-- 3. ПРОВЕРКА HaimGroupMedia_bot (особенно 100,000 STARS!)
SELECT
  'HaimGroupMedia - крупные транзакции' as analysis,
  bot_name,
  type,
  category,
  payment_method,
  currency,
  amount,
  LEFT(description, 80) as description,
  created_at
FROM payments
WHERE bot_name = 'HaimGroupMedia_bot'
  AND (
    currency = 'STARS'
    OR amount::numeric > 1000
  )
ORDER BY amount DESC
LIMIT 10;

-- 4. ПРОВЕРКА neuro_blogger_bot (системные гранты!)
SELECT
  'neuro_blogger - системные гранты' as analysis,
  payment_method,
  category,
  COUNT(*) as count,
  SUM(amount::numeric) as total_amount,
  string_agg(DISTINCT LEFT(description, 50), ' | ') as examples
FROM payments
WHERE bot_name = 'neuro_blogger_bot'
  AND type = 'MONEY_INCOME'
  AND (
    description ILIKE '%System Grant%'
    OR description ILIKE '%Manual%'
    OR description ILIKE '%BONUS%'
    OR payment_method = 'SYSTEM'
    OR category = 'BONUS'
  )
GROUP BY payment_method, category
ORDER BY total_amount DESC;

-- 5. ИТОГОВАЯ СВОДКА ПО ВСЕМ БОТАМ
SELECT
  'ИТОГОВАЯ СВОДКА' as report,
  COUNT(DISTINCT bot_name) as total_bots,
  COUNT(*) as total_transactions,
  COUNT(DISTINCT user_id) as total_users,

  -- РЕАЛЬНЫЕ ДОХОДЫ
  SUM(CASE
    WHEN type = 'MONEY_INCOME'
      AND category = 'REAL'
      AND (payment_method = 'Telegram' OR payment_method = 'Robokassa')
      AND currency = 'XTR'
    THEN amount::numeric
    ELSE 0 END) as total_real_income_xtr,

  SUM(CASE
    WHEN type = 'MONEY_INCOME'
      AND category = 'REAL'
      AND (payment_method = 'Telegram' OR payment_method = 'Robokassa')
      AND currency = 'STARS'
    THEN amount::numeric
    ELSE 0 END) as total_real_income_stars,

  SUM(CASE
    WHEN type = 'MONEY_INCOME'
      AND category = 'REAL'
      AND (payment_method = 'Telegram' OR payment_method = 'Robokassa')
      AND currency = 'RUB'
    THEN amount::numeric
    ELSE 0 END) as total_real_income_rub,

  -- РЕАЛЬНЫЕ РАСХОДЫ
  SUM(CASE
    WHEN type = 'MONEY_OUTCOME' AND category = 'REAL' AND currency = 'XTR'
    THEN amount::numeric
    ELSE 0 END) as total_real_expense_xtr,

  SUM(CASE
    WHEN type = 'MONEY_OUTCOME' AND category = 'REAL' AND currency = 'STARS'
    THEN amount::numeric
    ELSE 0 END) as total_real_expense_stars,

  SUM(CASE
    WHEN type = 'MONEY_OUTCOME' AND category = 'REAL' AND currency = 'RUB'
    THEN amount::numeric
    ELSE 0 END) as total_real_expense_rub,

  -- ФЕЙКОВЫЕ РАСХОДЫ
  SUM(CASE
    WHEN type = 'MONEY_INCOME'
      AND (
        description ILIKE '%System Grant%'
        OR description ILIKE '%Manual%'
        OR description ILIKE '%Migration%'
        OR description ILIKE '%refund%'
        OR description ILIKE '%Refund%'
        OR description ILIKE '%BONUS%'
        OR payment_method = 'SYSTEM'
        OR category = 'BONUS'
      )
      AND currency = 'XTR'
    THEN amount::numeric
    ELSE 0 END) as total_fake_expense_xtr,

  SUM(CASE
    WHEN type = 'MONEY_INCOME'
      AND (
        description ILIKE '%System Grant%'
        OR description ILIKE '%Manual%'
        OR description ILIKE '%Migration%'
        OR description ILIKE '%refund%'
        OR description ILIKE '%Refund%'
        OR description ILIKE '%BONUS%'
        OR payment_method = 'SYSTEM'
        OR category = 'BONUS'
      )
      AND currency = 'STARS'
    THEN amount::numeric
    ELSE 0 END) as total_fake_expense_stars,

  SUM(CASE
    WHEN type = 'MONEY_INCOME'
      AND (
        description ILIKE '%System Grant%'
        OR description ILIKE '%Manual%'
        OR description ILIKE '%Migration%'
        OR description ILIKE '%refund%'
        OR description ILIKE '%Refund%'
        OR description ILIKE '%BONUS%'
        OR payment_method = 'SYSTEM'
        OR category = 'BONUS'
      )
      AND currency = 'RUB'
    THEN amount::numeric
    ELSE 0 END) as total_fake_expense_rub

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

-- ================================================================================
-- ИНСТРУКЦИЯ ПО ИСПОЛЬЗОВАНИЮ:
-- 1. Откройте: https://supabase.com/dashboard/project/fbgmxbvzwgxfkagxkmqc
-- 2. Перейдите в SQL Editor
-- 3. Выполните каждый блок запроса отдельно
-- 4. Сверьте результаты с Excel файлом
-- ================================================================================