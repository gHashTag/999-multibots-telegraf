-- ========================================
-- СКРИПТ ОЧИСТКИ АНОМАЛЬНЫХ ТРАНЗАКЦИЙ
-- ========================================
-- ВНИМАНИЕ: Этот скрипт изменит базу данных!
-- Обязательно создайте backup перед выполнением!

-- 1. СОЗДАНИЕ BACKUP
-- ВАЖНО: Выполнить вручную перед запуском!
-- CREATE TABLE payments_v2_backup AS SELECT * FROM payments_v2;

-- 2. СОЗДАТЬ ТАБЛИЦУ ДЛЯ БОЛЬШИХ РАСХОДОВ
CREATE TABLE IF NOT EXISTS business_expenses (
  id BIGSERIAL PRIMARY KEY,
  bot_name TEXT NOT NULL,
  amount DECIMAL NOT NULL,
  currency TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. ПЕРЕНЕСТИ БОЛЬШИЕ РАСХОДЫ (>1000 STARS)
INSERT INTO business_expenses (bot_name, amount, currency, category, description, created_at)
SELECT
  bot_name,
  amount,
  currency,
  CASE
    WHEN description ILIKE '%тренировк%' OR description ILIKE '%модел%' THEN 'AI_TRAINING'
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

-- 4. УДАЛИТЬ ПЕРЕНЕСЕННЫЕ ЗАПИСИ
DELETE FROM payments_v2
WHERE type = 'MONEY_OUTCOME'
  AND currency = 'STARS'
  AND ABS(amount) > 1000;

-- 5. УДАЛИТЬ ДУБЛИКАТЫ (оставить по одной записи)
DELETE FROM payments_v2 p1
USING payments_v2 p2
WHERE p1.ctid < p2.ctid  -- Удаляем более старые записи
  AND p1.bot_name = p2.bot_name
  AND p1.amount = p2.amount
  AND p1.description = p2.description;

-- 6. УДАЛИТЬ ФЕЙКОВЫЕ ДАННЫЕ
DELETE FROM payments_v2
WHERE
  -- Бонусы
  (description ILIKE '%bonus%' OR description ILIKE '%бонус%')
  OR
  -- Тесты
  (description ILIKE '%test%' OR description ILIKE '%тест%')
  OR
  -- Системные операции
  (description ILIKE '%system%' OR description ILIKE '%система%' OR description ILIKE '%operation%')
  OR
  -- Конкретные фейковые описания
  description IN ('SUBSCRIPTION_PURCHASE', 'AI_VIDEO_GENERATION')
  OR
  -- REFUND операции
  type = 'REFUND';

-- 7. УДАЛИТЬ НУЛЕВЫЕ СУММЫ
DELETE FROM payments_v2 WHERE amount = 0;

-- 8. ПРОВЕРКА РЕЗУЛЬТАТА
SELECT
  'Очищенные записи в payments_v2:' as info,
  COUNT(*) as count
FROM payments_v2;

SELECT
  'Большие расходы в business_expenses:' as info,
  COUNT(*) as count,
  SUM(amount) as total_amount
FROM business_expenses;

-- 9. СТАТИСТИКА ПО КАТЕГОРИЯМ РАСХОДОВ
SELECT
  category,
  COUNT(*) as transactions,
  SUM(amount) as total_stars
FROM business_expenses
GROUP BY category
ORDER BY total_stars DESC;

-- 10. ТОП-10 БОТОВ ПО ТРАНЗАКЦИЯМ (после очистки)
SELECT
  bot_name,
  COUNT(*) as transactions,
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN amount ELSE 0 END) as total_income,
  SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN amount ELSE 0 END) as total_outcome
FROM payments_v2
GROUP BY bot_name
ORDER BY transactions DESC
LIMIT 10;

-- ========================================
-- КОНЕЦ СКРИПТА
-- ========================================

-- ВНИМАНИЕ:
-- 1. Проверьте результат команды #8
-- 2. Должно остаться ~1,202 записей
-- 3. В business_expenses должно быть 9 записей
-- 4. Если все ок - backup можно удалить
-- 5. Если что-то пошло не так - восстановите из backup
