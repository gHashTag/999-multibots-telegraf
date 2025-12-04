-- ================================================================================
-- ПОЛУЧИТЬ ВСЕ ДАННЫЕ ИЗ ТАБЛИЦЫ PMSV2 - КОРРЕКТНЫЙ АНАЛИЗ
-- Выполните этот запрос в Supabase Dashboard
-- ================================================================================

-- 1. ПРОВЕРИМ СТРУКТУРУ ТАБЛИЦЫ
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'PMSV2'
ORDER BY ordinal_position;

-- 2. ПОЛУЧИМ ВСЕ ТРАНЗАКЦИИ ПО ВСЕМ БОТАМ
SELECT
  bot_name,
  type,
  category,
  payment_method,
  currency,
  amount::numeric,
  LEFT(description, 100) as description,
  user_id,
  created_at
FROM PMSV2
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
ORDER BY bot_name, created_at DESC;

-- 3. АГРЕГИРОВАННЫЕ ДАННЫЕ ПО КАЖДОМУ БОТУ
SELECT
  bot_name,
  COUNT(*) as total_transactions,

  -- Реальные доходы (ТОЛЬКО Telegram/Robokassa + category=REAL)
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

  -- СИСТЕМНЫЕ доходы (System Grant, Manual, BONUS)
  SUM(CASE
    WHEN type = 'MONEY_INCOME'
      AND (
        description ILIKE '%System Grant%'
        OR description ILIKE '%Manual%'
        OR description ILIKE '%BONUS%'
        OR payment_method = 'SYSTEM'
        OR category = 'BONUS'
      )
      AND currency = 'XTR'
    THEN amount::numeric
    ELSE 0 END) as system_income_xtr,

  SUM(CASE
    WHEN type = 'MONEY_INCOME'
      AND (
        description ILIKE '%System Grant%'
        OR description ILIKE '%Manual%'
        OR description ILIKE '%BONUS%'
        OR payment_method = 'SYSTEM'
        OR category = 'BONUS'
      )
      AND currency = 'STARS'
    THEN amount::numeric
    ELSE 0 END) as system_income_stars,

  SUM(CASE
    WHEN type = 'MONEY_INCOME'
      AND (
        description ILIKE '%System Grant%'
        OR description ILIKE '%Manual%'
        OR description ILIKE '%BONUS%'
        OR payment_method = 'SYSTEM'
        OR category = 'BONUS'
      )
      AND currency = 'RUB'
    THEN amount::numeric
    ELSE 0 END) as system_income_rub,

  -- Расходы (ВСЕ реальные)
  SUM(CASE
    WHEN type = 'MONEY_OUTCOME' AND currency = 'XTR'
    THEN amount::numeric
    ELSE 0 END) as expense_xtr,

  SUM(CASE
    WHEN type = 'MONEY_OUTCOME' AND currency = 'STARS'
    THEN amount::numeric
    ELSE 0 END) as expense_stars,

  SUM(CASE
    WHEN type = 'MONEY_OUTCOME' AND currency = 'RUB'
    THEN amount::numeric
    ELSE 0 END) as expense_rub

FROM PMSV2
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

-- 4. ПРОВЕРКА HaimGroupMedia_bot (100,000 STARS)
SELECT
  bot_name,
  type,
  category,
  payment_method,
  currency,
  amount::numeric,
  LEFT(description, 100) as description,
  created_at
FROM PMSV2
WHERE bot_name = 'HaimGroupMedia_bot'
  AND currency = 'STARS'
ORDER BY created_at DESC;

-- 5. ПРОВЕРКА LeeSolarbot
SELECT
  bot_name,
  type,
  category,
  payment_method,
  currency,
  amount::numeric,
  LEFT(description, 100) as description,
  created_at
FROM PMSV2
WHERE bot_name = 'LeeSolarbot'
ORDER BY created_at DESC
LIMIT 20;

-- 6. ИТОГОВАЯ СВОДКА
SELECT
  'ИТОГО' as report,
  COUNT(DISTINCT bot_name) as total_bots,
  COUNT(*) as total_transactions,

  -- Реальные доходы
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

  -- Системные доходы
  SUM(CASE
    WHEN type = 'MONEY_INCOME'
      AND (
        description ILIKE '%System Grant%'
        OR description ILIKE '%Manual%'
        OR description ILIKE '%BONUS%'
        OR payment_method = 'SYSTEM'
        OR category = 'BONUS'
      )
      AND currency = 'XTR'
    THEN amount::numeric
    ELSE 0 END) as total_system_income_xtr,

  SUM(CASE
    WHEN type = 'MONEY_INCOME'
      AND (
        description ILIKE '%System Grant%'
        OR description ILIKE '%Manual%'
        OR description ILIKE '%BONUS%'
        OR payment_method = 'SYSTEM'
        OR category = 'BONUS'
      )
      AND currency = 'STARS'
    THEN amount::numeric
    ELSE 0 END) as total_system_income_stars,

  SUM(CASE
    WHEN type = 'MONEY_INCOME'
      AND (
        description ILIKE '%System Grant%'
        OR description ILIKE '%Manual%'
        OR description ILIKE '%BONUS%'
        OR payment_method = 'SYSTEM'
        OR category = 'BONUS'
      )
      AND currency = 'RUB'
    THEN amount::numeric
    ELSE 0 END) as total_system_income_rub,

  -- Расходы
  SUM(CASE
    WHEN type = 'MONEY_OUTCOME' AND currency = 'XTR'
    THEN amount::numeric
    ELSE 0 END) as total_expense_xtr,

  SUM(CASE
    WHEN type = 'MONEY_OUTCOME' AND currency = 'STARS'
    THEN amount::numeric
    ELSE 0 END) as total_expense_stars,

  SUM(CASE
    WHEN type = 'MONEY_OUTCOME' AND currency = 'RUB'
    THEN amount::numeric
    ELSE 0 END) as total_expense_rub

FROM PMSV2
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
-- ИНСТРУКЦИЯ:
-- 1. Откройте: https://supabase.com/dashboard/project/fbgmxbvzwgxfkagxkmqc
-- 2. Перейдите в SQL Editor
-- 3. Выполните запросы ПО ОДНОМУ (начиная с проверки структуры таблицы)
-- 4. Скопируйте результаты
-- 5. Отправьте мне - я создам корректный Excel
-- ================================================================================