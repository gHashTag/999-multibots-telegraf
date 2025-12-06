-- ========================================
-- ФИНАЛЬНЫЙ СКРИПТ ОЧИСТКИ (С УЧЕТОМ TEST_DATA)
-- ========================================

-- ⚠️ ВНИМАНИЕ: Этот скрипт требует ваших решений по спорным категориям!
-- Сначала прочитайте файл ИТОГОВАЯ_ТАБЛИЦА_РЕШЕНИЙ.md

-- 1. BACKUP (ОБЯЗАТЕЛЬНО!)
CREATE TABLE payments_v2_backup AS SELECT * FROM payments_v2;

-- Проверить backup
SELECT COUNT(*) as backup_count FROM payments_v2_backup; -- Должно быть 16217

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

-- Удалить перенесенные записи
DELETE FROM payments_v2
WHERE type = 'MONEY_OUTCOME'
  AND currency = 'STARS'
  AND ABS(amount) > 1000;

-- Проверить
SELECT COUNT(*) as moved_to_expenses FROM business_expenses; -- Должно быть 11

-- ========================================
-- 3️⃣ НУЛЕВЫЕ СУММЫ - УДАЛЯЕМ
-- ========================================

DELETE FROM payments_v2 WHERE amount = 0;

-- Проверить
SELECT COUNT(*) as zero_amounts_deleted FROM payments_v2_backup WHERE amount = 0;

-- ========================================
-- 4️⃣ TEST_DATA - ПОМЕТИТЬ, НЕ УДАЛЯТЬ!
-- ========================================

-- Добавить колонку is_test (если еще нет)
ALTER TABLE payments_v2 ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT FALSE;

-- Пометить тестовые данные
UPDATE payments_v2
SET is_test = TRUE
WHERE description ILIKE '%TEST_DATA%'
   OR description ILIKE '%TEST:%'
   OR description ILIKE '%[TEST]%';

-- Проверить
SELECT COUNT(*) as test_records_marked FROM payments_v2 WHERE is_test = TRUE;

-- ========================================
-- 5️⃣ СИСТЕМНЫЕ ОПЕРАЦИИ - ТРЕБУЕТСЯ РЕШЕНИЕ!
-- ========================================

-- Посмотреть примеры "Payment operation"
SELECT bot_name, amount, currency, created_at, description
FROM payments_v2
WHERE description = 'Payment operation...'
ORDER BY created_at DESC
LIMIT 10;

-- Посмотреть примеры "System operation"
SELECT bot_name, amount, currency, created_at, description
FROM payments_v2
WHERE description = 'System operation...'
ORDER BY created_at DESC
LIMIT 10;

-- ⚠️ РЕШЕНИЕ НУЖНО ОТ ВАС:
-- Вариант 1: Оставить (это регулярные платежи)
-- Вариант 2: Удалить (это системные операции)
-- Вариант 3: Пометить как системные

-- Пример команды для удаления (если нужно):
-- DELETE FROM payments_v2 WHERE description IN ('Payment operation...', 'System operation...');

-- Пример команды для пометки:
-- UPDATE payments_v2 SET is_system = TRUE WHERE description IN ('Payment operation...', 'System operation...');

-- ========================================
-- 6️⃣ ДУБЛИКАТЫ - ТРЕБУЕТСЯ РУЧНОЙ АНАЛИЗ
-- ========================================

-- Найти группы потенциальных дубликатов
SELECT
  bot_name,
  amount,
  description,
  COUNT(*) as records_count,
  COUNT(DISTINCT DATE(created_at)) as unique_dates
FROM payments_v2
WHERE type = 'MONEY_OUTCOME' AND currency = 'STARS'
GROUP BY bot_name, amount, description
HAVING COUNT(*) > 1
ORDER BY records_count DESC
LIMIT 20;

-- ⚠️ ЛОГИКА:
-- Если unique_dates == 1 И records_count > 1
--   → Это дубликаты с одинаковой датой (УДАЛИТЬ лишние)
-- Если unique_dates > 1
--   → Это регулярные операции в разные дни (ОСТАВИТЬ)

-- Пример команды для удаления дубликатов с одинаковой датой:
-- DELETE FROM payments_v2 p1
-- USING payments_v2 p2
-- WHERE p1.ctid < p2.ctid
--   AND p1.bot_name = p2.bot_name
--   AND p1.amount = p2.amount
--   AND p1.description = p2.description
--   AND DATE(p1.created_at) = DATE(p2.created_at);

-- ========================================
-- 7️⃣ ПРОВЕРКА РЕЗУЛЬТАТА
-- ========================================

-- Общая статистика
SELECT
  'Итого записей после очистки:' as metric,
  COUNT(*) as value
FROM payments_v2;

-- Статистика по типам
SELECT
  type,
  COUNT(*) as count,
  SUM(amount) as total_amount
FROM payments_v2
GROUP BY type
ORDER BY count DESC;

-- Статистика по ботам (топ-10)
SELECT
  bot_name,
  COUNT(*) as transactions,
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN amount ELSE 0 END) as income,
  SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN amount ELSE 0 END) as outcome
FROM payments_v2
WHERE is_test = FALSE  -- Исключаем тестовые
GROUP BY bot_name
ORDER BY transactions DESC
LIMIT 10;

-- Статистика расходов по категориям
SELECT
  category,
  COUNT(*) as count,
  SUM(amount) as total_stars
FROM business_expenses
GROUP BY category
ORDER BY total_stars DESC;

-- Тестовые записи
SELECT
  'Тестовых записей помечено:' as metric,
  COUNT(*) as value
FROM payments_v2 WHERE is_test = TRUE;

-- ========================================
-- ИНСТРУКЦИЯ ПО ИСПОЛЬЗОВАНИЮ
-- ========================================

-- 1. Выполните ШАГ 1 (backup)
-- 2. Выполните ШАГ 2 (перенос больших расходов)
-- 3. Выполните ШАГ 3 (удаление нулевых)
-- 4. Выполните ШАГ 4 (пометка TEST_DATA)
-- 5. ВЫПОЛНИТЕ ЗАПРОСЫ В ШАГ 5 для анализа системных операций
-- 6. ПРИМИТЕ РЕШЕНИЕ по системным операциям
-- 7. ВЫПОЛНИТЕ ЗАПРОСЫ В ШАГ 6 для анализа дубликатов
-- 8. ПРИМИТЕ РЕШЕНИЕ по дубликатам
-- 9. Выполните ШАГ 7 (проверка результата)

-- ========================================
-- РЕЗУЛЬТАТ БУДЕТ:
-- ========================================
-- - Перенесено в business_expenses: 11 записей
-- - Удалено нулевых: 6 записей
-- - Помечено тестовых: ~5000 записей
-- - Остается реальных операций: ~11000 записей
