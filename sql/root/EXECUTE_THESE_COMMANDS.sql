-- ========================================
-- ВЫПОЛНИТЕ ЭТИ КОМАНДЫ ПО ПОРЯДКУ
-- ========================================

-- КОМАНДА 1: Создать backup
CREATE TABLE payments_v2_backup AS SELECT * FROM payments_v2;

-- Проверить backup (должно быть 16217 записей)
-- SELECT COUNT(*) FROM payments_v2_backup;

-- ========================================

-- КОМАНДА 2: Создать таблицу business_expenses
CREATE TABLE IF NOT EXISTS business_expenses (
  id BIGSERIAL PRIMARY KEY,
  bot_name TEXT NOT NULL,
  amount DECIMAL NOT NULL,
  currency TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ========================================

-- КОМАНДА 3: Перенести большие расходы (>1000 STARS)
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

-- Проверить перенос (должно быть 11 записей)
-- SELECT COUNT(*) FROM business_expenses;

-- ========================================

-- КОМАНДА 4: Удалить перенесенные записи из payments_v2
DELETE FROM payments_v2
WHERE type = 'MONEY_OUTCOME'
  AND currency = 'STARS'
  AND ABS(amount) > 1000;

-- ========================================

-- КОМАНДА 5: Добавить колонку is_test
ALTER TABLE payments_v2 ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT FALSE;

-- ========================================

-- КОМАНДА 6: Пометить тестовые данные
UPDATE payments_v2
SET is_test = TRUE
WHERE description ILIKE '%TEST_DATA%'
   OR description ILIKE '%test%'
   OR description = 'SUBSCRIPTION_PURCHASE'
   OR description = 'AI_VIDEO_GENERATION';

-- Проверить пометку
-- SELECT COUNT(*) FROM payments_v2 WHERE is_test = TRUE;

-- ========================================

-- КОМАНДА 7: Удалить нулевые суммы
DELETE FROM payments_v2 WHERE amount = 0;

-- ========================================

-- КОМАНДА 8: Удалить дубликаты (только с одинаковыми датой+временем)
DELETE FROM payments_v2 p1
USING payments_v2 p2
WHERE p1.ctid < p2.ctid
  AND p1.bot_name = p2.bot_name
  AND p1.amount = p2.amount
  AND p1.description = p2.description
  AND DATE(p1.created_at) = DATE(p2.created_at)
  AND EXTRACT(hour FROM p1.created_at) = EXTRACT(hour FROM p2.created_at)
  AND EXTRACT(minute FROM p1.created_at) = EXTRACT(minute FROM p2.created_at)
  AND EXTRACT(second FROM p1.created_at) = EXTRACT(second FROM p2.created_at);

-- ========================================

-- КОМАНДА 9: Проверка результата
-- Итого записей после очистки:
-- SELECT COUNT(*) FROM payments_v2;

-- Статистика по типам (без тестовых):
-- SELECT type, COUNT(*) as count, SUM(amount) as total_amount
-- FROM payments_v2 WHERE is_test = FALSE
-- GROUP BY type;

-- Статистика расходов по категориям:
-- SELECT category, COUNT(*) as count, SUM(amount) as total_stars
-- FROM business_expenses
-- GROUP BY category ORDER BY total_stars DESC;

-- ========================================
-- КОНЕЦ
-- ========================================
