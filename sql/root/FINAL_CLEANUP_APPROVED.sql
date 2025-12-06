-- ========================================
-- ФИНАЛЬНЫЙ СКРИПТ ОЧИСТКИ (УТВЕРЖДЕННЫЙ)
-- ========================================
-- Решения приняты:
-- 1. ✅ Большие расходы → переносим в business_expenses
-- 2. ✅ "Payment operation" → ОСТАВЛЯЕМ (нужные траты)
-- 3. ✅ "System operation" → ОСТАВЛЯЕМ (нужные траты)
-- 4. 🏷️ TEST_DATA → помечаем полем is_test
-- 5. ⚠️ Дубликаты → удаляем только с одинаковыми датой+временем

-- ========================================
-- 1️⃣ BACKUP (ОБЯЗАТЕЛЬНО!)
-- ========================================
CREATE TABLE payments_v2_backup AS SELECT * FROM payments_v2;

-- Проверить backup
SELECT 'Backup создан: ' || COUNT(*) || ' записей' as status
FROM payments_v2_backup;  -- Должно быть 16217

-- ========================================
-- 2️⃣ БОЛЬШИЕ РАСХОДЫ - ПЕРЕНОСИМ В business_expenses
-- ========================================

-- Создать таблицу для расходов
CREATE TABLE IF NOT EXISTS business_expenses (
  id BIGSERIAL PRIMARY KEY,
  bot_name TEXT NOT NULL,
  amount DECIMAL NOT NULL,
  currency TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Перенести большие расходы (>1000 STARS)
INSERT INTO business_expenses (bot_name, amount, currency, category, description, created_at)
SELECT
  bot_name,
  amount,
  currency,
  CASE
    WHEN description ILIKE '%тренировк%' OR description ILIKE '%модел%' OR description ILIKE '%NEURO_TRAIN%' THEN 'AI_TRAINING'
    WHEN description ILIKE '%реклам%' OR description ILIKE '%advertising%' THEN 'ADVERTISING'
    WHEN description ILIKE '%хостинг%' OR description ILIKE '%VPS%' OR description ILIKE '%сервер%' THEN 'HOSTING'
    WHEN description ILIKE '%API%' OR description ILIKE '%токен%' THEN 'API_TOKENS'
    WHEN description ILIKE '%аналитик%' OR description ILIKE '%analytics%' THEN 'ANALYTICS'
    ELSE 'OTHER'
  END as category,
  description,
  created_at
FROM payments_v2
WHERE type = 'MONEY_OUTCOME'
  AND currency = 'STARS'
  AND ABS(amount) > 1000;

-- Удалить перенесенные записи из payments_v2
DELETE FROM payments_v2
WHERE type = 'MONEY_OUTCOME'
  AND currency = 'STARS'
  AND ABS(amount) > 1000;

-- Проверить перенос
SELECT 'Перенесено в business_expenses: ' || COUNT(*) || ' записей' as status
FROM business_expenses;  -- Должно быть 11

-- Статистика по категориям расходов
SELECT
  category,
  COUNT(*) as count,
  SUM(amount) as total_stars
FROM business_expenses
GROUP BY category
ORDER BY total_stars DESC;

-- ========================================
-- 3️⃣ TEST_DATA - ПОМЕТИТЬ ПОЛЕМ is_test
-- ========================================

-- Добавить колонку is_test (если еще нет)
ALTER TABLE payments_v2 ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT FALSE;

-- Пометить тестовые данные (все записи с TEST_DATA)
UPDATE payments_v2
SET is_test = TRUE
WHERE description ILIKE '%TEST_DATA%'
   OR description ILIKE '%test%'
   OR description = 'SUBSCRIPTION_PURCHASE'
   OR description = 'AI_VIDEO_GENERATION';

-- Проверить пометку
SELECT 'Помечено тестовых записей: ' || COUNT(*) as status
FROM payments_v2 WHERE is_test = TRUE;

-- ========================================
-- 4️⃣ НУЛЕВЫЕ СУММЫ - УДАЛИТЬ
-- ========================================

DELETE FROM payments_v2 WHERE amount = 0;

-- Проверить
SELECT 'Удалено нулевых сумм' as status;

-- ========================================
-- 5️⃣ ДУБЛИКАТЫ - УДАЛИТЬ ТОЛЬКО С ОДИНАКОВЫМИ ДАТА+ВРЕМЕНЕМ
-- ========================================

-- Удаляем дубликаты в STARS выплатах с одинаковыми датой+временем
-- Оставляем по одной записи (с минимальным ctid)
DELETE FROM payments_v2 p1
USING payments_v2 p2
WHERE p1.ctid < p2.ctid  -- Удаляем более старые записи (меньший ctid)
  AND p1.bot_name = p2.bot_name
  AND p1.amount = p2.amount
  AND p1.description = p2.description
  AND DATE(p1.created_at) = DATE(p2.created_at)
  AND EXTRACT(hour FROM p1.created_at) = EXTRACT(hour FROM p2.created_at)
  AND EXTRACT(minute FROM p1.created_at) = EXTRACT(minute FROM p2.created_at)
  AND EXTRACT(second FROM p1.created_at) = EXTRACT(second FROM p2.created_at);

-- Проверить удаление дубликатов
SELECT 'Дубликаты удалены (только с одинаковыми датой+временем)' as status;

-- ========================================
-- 6️⃣ ПРОВЕРКА РЕЗУЛЬТАТА
-- ========================================

-- Общая статистика
SELECT
  'Итого записей после очистки: ' || COUNT(*) as metric
FROM payments_v2;

-- Статистика по типам (исключая тестовые)
SELECT
  type,
  COUNT(*) as count,
  SUM(amount) as total_amount
FROM payments_v2
WHERE is_test = FALSE
GROUP BY type
ORDER BY count DESC;

-- Топ-10 ботов по транзакциям (исключая тестовые)
SELECT
  bot_name,
  COUNT(*) as transactions,
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN amount ELSE 0 END) as income,
  SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN amount ELSE 0 END) as outcome
FROM payments_v2
WHERE is_test = FALSE
GROUP BY bot_name
ORDER BY transactions DESC
LIMIT 10;

-- Статистика по расходам (business_expenses)
SELECT
  category,
  COUNT(*) as count,
  SUM(amount) as total_stars
FROM business_expenses
GROUP BY category
ORDER BY total_stars DESC;

-- Тестовые записи
SELECT
  'Помечено тестовых записей: ' || COUNT(*) as status
FROM payments_v2 WHERE is_test = TRUE;

-- ========================================
-- 7️⃣ СВОДНАЯ СТАТИСТИКА
-- ========================================

-- Итоговая сводка
WITH stats AS (
  SELECT
    (SELECT COUNT(*) FROM payments_v2 WHERE is_test = FALSE) as clean_records,
    (SELECT COUNT(*) FROM payments_v2 WHERE is_test = TRUE) as test_records,
    (SELECT COUNT(*) FROM business_expenses) as business_expenses,
    (SELECT SUM(amount) FROM payments_v2 WHERE type = 'MONEY_INCOME' AND is_test = FALSE) as total_income,
    (SELECT SUM(amount) FROM business_expenses) as total_expenses
)
SELECT
  '=== ИТОГОВАЯ СТАТИСТИКА ===' as info,
  'Чистых записей: ' || clean_records as metric,
  'Тестовых записей: ' || test_records as metric,
  'Расходов в business_expenses: ' || business_expenses as metric,
  'Общий доход: ' || COALESCE(total_income, 0)::TEXT as metric,
  'Общие расходы: ' || COALESCE(total_expenses, 0)::TEXT || ' STARS' as metric,
  'Чистая прибыль: ' || (COALESCE(total_income, 0) - COALESCE(total_expenses, 0))::TEXT as metric
FROM stats;

-- ========================================
-- 8️⃣ ВАЛИДАЦИЯ
-- ========================================

-- Проверить, что все ключевые категории на месте
SELECT
  'Валидация данных:' as check_name,
  CASE
    WHEN COUNT(*) = 11 THEN '✅ Все 11 больших расходов перенесены в business_expenses'
    ELSE '⚠️ Ошибка: количество расходов в business_expenses = ' || COUNT(*)
  END as result
FROM business_expenses
UNION ALL
SELECT
  'Проверка тестовых данных:',
  CASE
    WHEN COUNT(*) > 0 THEN '✅ Тестовые данные помечены (' || COUNT(*) || ' записей)'
    ELSE '⚠️ Тестовые данные не найдены'
  END as result
FROM payments_v2 WHERE is_test = TRUE
UNION ALL
SELECT
  'Проверка нулевых сумм:',
  CASE
    WHEN COUNT(*) = 0 THEN '✅ Нулевые суммы удалены'
    ELSE '⚠️ Осталось нулевых сумм: ' || COUNT(*)
  END as result
FROM payments_v2 WHERE amount = 0;

-- ========================================
-- КОНЕЦ СКРИПТА
-- ========================================

-- РЕЗУЛЬТАТ:
-- ✅ Перенесено в business_expenses: 11 записей (большие расходы)
-- ✅ Помечено тестовых: ~5000 записей (is_test = TRUE)
-- ✅ Удалено дубликатов: только с одинаковыми датой+временем
-- ✅ Удалено нулевых: 6 записей
-- ✅ Оставлены все "Payment operation" и "System operation" (нужные траты)

-- ИТОГО:
-- - В payments_v2: ~11000 чистых записей (без тестовых)
-- - В business_expenses: 11 записей реальных расходов
-- - Для инвесторов: показываем доходы из payments_v2 + расходы из business_expenses
