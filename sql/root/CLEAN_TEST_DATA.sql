-- =====================================================
-- ОЧИСТКА И ПЕРЕИМЕНОВАНИЕ ФЕЙКОВЫХ ДАННЫХ
-- Для удобства группы тестирования
-- =====================================================

-- ШАГ 1: Обновляем описания всех фейковых операций на единое название
UPDATE payments_v2 
SET description = 'TEST_DATA: System/Bonus/Testing'
WHERE 
  type = 'MONEY_INCOME' 
  AND (
    description ILIKE '%System Grant%' 
    OR description ILIKE '%BONUS%'
    OR description ILIKE '%Manual%'
    OR description ILIKE '%Миграция%'
    OR description ILIKE '%Migration%'
    OR description ILIKE '%Refund%'
    OR description ILIKE '%Refund%'
    OR payment_method = 'SYSTEM'
    OR category = 'BONUS'
  );

-- ШАГ 2: Добавляем тег для быстрой фильтрации
UPDATE payments_v2 
SET description = CONCAT(description, ' | TAG:TEST_DATA')
WHERE description LIKE 'TEST_DATA:%';

-- ШАГ 3: Создаем индекс для быстрого поиска тестовых данных
CREATE INDEX IF NOT EXISTS idx_payments_test_data 
ON payments_v2 (description) 
WHERE description LIKE '%TEST_DATA%';

-- ШАГ 4: Добавляем комментарии для групы тестирования
COMMENT ON COLUMN payments_v2.description IS 'TEST_DATA: Все фейковые операции для QA группы';

-- ШАГ 5: Создаем VIEW для удобного просмотра тестовых данных
CREATE OR REPLACE VIEW test_data_summary AS
SELECT 
  bot_name,
  COUNT(*) as test_transactions,
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN amount::numeric ELSE 0 END) as test_income,
  SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN amount::numeric ELSE 0 END) as test_expense,
  currency,
  category
FROM payments_v2
WHERE description LIKE '%TEST_DATA%'
GROUP BY bot_name, currency, category
ORDER BY bot_name, currency;

-- ШАГ 6: Создаем VIEW для реальных данных
CREATE OR REPLACE VIEW real_data_summary AS
SELECT 
  bot_name,
  COUNT(*) as real_transactions,
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN amount::numeric ELSE 0 END) as real_income,
  SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN amount::numeric ELSE 0 END) as real_expense,
  currency,
  category
FROM payments_v2
WHERE description NOT LIKE '%TEST_DATA%'
  AND (payment_method = 'Telegram' OR payment_method = 'Robokassa' OR payment_method = 'YooMoney')
GROUP BY bot_name, currency, category
ORDER BY bot_name, currency;

-- ШАГ 7: Создаем статистику
SELECT 
  'СТАТИСТИКА ОЧИСТКИ' as section,
  '' as details
UNION ALL
SELECT 
  'Тестовых операций',
  COUNT(*)::text || ' записей'
FROM payments_v2
WHERE description LIKE '%TEST_DATA%'
UNION ALL
SELECT 
  'Реальных операций',
  COUNT(*)::text || ' записей'
FROM payments_v2
WHERE description NOT LIKE '%TEST_DATA%'
  AND (payment_method = 'Telegram' OR payment_method = 'Robokassa' OR payment_method = 'YooMoney')
UNION ALL
SELECT 
  'Всего операций',
  COUNT(*)::text || ' записей'
FROM payments_v2;

-- РЕЗУЛЬТАТ:
-- 1. Все фейковые данные переименованы в "TEST_DATA"
-- 2. Добавлен тег | TAG:TEST_DATA для фильтрации
-- 3. Создан индекс для быстрого поиска
-- 4. Созданы VIEW для удобного просмотра
-- 5. Группа тестирования может легко фильтровать данные
