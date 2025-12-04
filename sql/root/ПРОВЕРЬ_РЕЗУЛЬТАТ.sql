-- ========================================
-- ПРОВЕРКА РЕЗУЛЬТАТОВ ОЧИСТКИ
-- ========================================
-- Выполните эти запросы в Supabase Dashboard (SQL Editor)
-- и сообщите результаты

-- 1️⃣ ПРОВЕРКА BACKUP
-- Должно быть: 16217 записей
SELECT 'Backup создан:' as check, COUNT(*) as count
FROM payments_v2_backup;

-- 2️⃣ ИТОГО ЗАПИСЕЙ ПОСЛЕ ОЧИСТКИ
-- Ожидается: ~11,000 записей
SELECT 'Итого записей после очистки:' as check, COUNT(*) as count
FROM payments_v2;

-- 3️⃣ ТЕСТОВЫЕ ДАННЫЕ
-- Ожидается: ~5,000 записей помечено как тестовые
SELECT 'Тестовых данных помечено:' as check, COUNT(*) as count
FROM payments_v2 WHERE is_test = TRUE;

-- 4️⃣ СТАТИСТИКА ПО ТИПАМ (БЕЗ ТЕСТОВЫХ)
-- Должно показать: MONEY_INCOME, MONEY_OUTCOME, REFUND и др.
SELECT
  type,
  COUNT(*) as count,
  ROUND(SUM(amount)::numeric, 2) as total_amount
FROM payments_v2
WHERE is_test = FALSE
GROUP BY type
ORDER BY count DESC;

-- 5️⃣ BUSINESS_EXPENSES - РАСХОДЫ ПО КАТЕГОРИЯМ
-- Должно быть: 11 записей
SELECT
  category,
  COUNT(*) as count,
  ROUND(SUM(amount)::numeric, 2) as total_stars
FROM business_expenses
GROUP BY category
ORDER BY total_stars DESC;

-- 6️⃣ ПРОВЕРКА БОЛЬШИХ РАСХОДОВ
-- Должно быть: 0 (все перенесены в business_expenses)
SELECT
  'Больших расходов (>1000 STARS) в payments_v2:' as check,
  COUNT(*) as count
FROM payments_v2
WHERE type = 'MONEY_OUTCOME'
  AND currency = 'STARS'
  AND ABS(amount) > 1000;

-- 7️⃣ ПРОВЕРКА НУЛЕВЫХ СУММ
-- Должно быть: 0 (все удалены)
SELECT
  'Нулевых сумм:' as check,
  COUNT(*) as count
FROM payments_v2 WHERE amount = 0;

-- 8️⃣ ДЕТАЛИ BUSINESS_EXPENSES
-- Покажет все 11 перенесенных записей
SELECT
  bot_name,
  amount,
  currency,
  category,
  description,
  created_at::date as date
FROM business_expenses
ORDER BY amount DESC;

-- 9️⃣ ТОП БОТОВ ПО ТРАНЗАКЦИЯМ (БЕЗ ТЕСТОВЫХ)
SELECT
  bot_name,
  COUNT(*) as transactions,
  ROUND(SUM(CASE WHEN type = 'MONEY_INCOME' THEN amount ELSE 0 END)::numeric, 2) as income,
  ROUND(SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN amount ELSE 0 END)::numeric, 2) as outcome
FROM payments_v2
WHERE is_test = FALSE
GROUP BY bot_name
ORDER BY transactions DESC
LIMIT 10;

-- 🔟 ФИНАНСОВАЯ СВОДКА
WITH stats AS (
  SELECT
    (SELECT COUNT(*) FROM payments_v2 WHERE is_test = FALSE) as clean_records,
    (SELECT COUNT(*) FROM payments_v2 WHERE is_test = TRUE) as test_records,
    (SELECT COUNT(*) FROM business_expenses) as business_expenses,
    (SELECT ROUND(SUM(amount)::numeric, 2) FROM payments_v2 WHERE type = 'MONEY_INCOME' AND is_test = FALSE) as total_income,
    (SELECT SUM(amount) FROM business_expenses) as total_expenses
)
SELECT
  '=== ФИНАНСОВАЯ СВОДКА ===' as metric,
  'Чистых записей: ' || clean_records as value
FROM stats
UNION ALL
SELECT 'metric', 'Тестовых записей: ' || test_records FROM stats
UNION ALL
SELECT 'metric', 'Расходов в business_expenses: ' || business_expenses FROM stats
UNION ALL
SELECT 'metric', 'Общий доход: ' || COALESCE(total_income, 0)::text FROM stats
UNION ALL
SELECT 'metric', 'Общие расходы: ' || COALESCE(total_expenses, 0)::text || ' STARS' FROM stats
UNION ALL
SELECT 'metric', 'Чистая прибыль: ' || (COALESCE(total_income, 0) - COALESCE(total_expenses, 0))::text FROM stats;

-- ========================================
-- ОЖИДАЕМЫЕ РЕЗУЛЬТАТЫ:
-- ========================================
-- 1. Backup: 16,217 записей ✅
-- 2. После очистки: ~11,000 записей
-- 3. Тестовых помечено: ~5,000 записей
-- 4. В business_expenses: 11 записей
-- 5. Больших расходов в payments_v2: 0
-- 6. Нулевых сумм: 0
-- 7. Общий доход: ~230М
-- 8. Расходы: 72,698 STARS
