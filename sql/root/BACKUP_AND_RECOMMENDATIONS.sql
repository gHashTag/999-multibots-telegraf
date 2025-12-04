-- ========================================
-- BACKUP + РЕКОМЕНДАЦИИ ПО ОЧИСТКЕ
-- ========================================

-- 1. СОЗДАТЬ BACKUP (ОБЯЗАТЕЛЬНО!)
CREATE TABLE payments_v2_backup AS SELECT * FROM payments_v2;
CREATE TABLE business_expenses_backup; -- Создать если таблица уже существует

-- Проверить backup
SELECT COUNT(*) as backup_count FROM payments_v2_backup;
-- Должно быть 16,217 записей

-- ========================================
-- ЧТО ДЕЛАТЬ С КАЖДОЙ КАТЕГОРИЕЙ:
-- ========================================

-- ========================================
-- 1️⃣ БОЛЬШИЕ РАСХОДЫ (9 записей) - НЕ УДАЛЯТЬ!
-- ========================================
-- Это РЕАЛЬНЫЕ траты бизнеса!

-- Даты:
-- 2025-05-16: neuro_blogger_bot - 29,944 STARS + 9,254 STARS (тренировка AI)
-- 2025-08-24: DAO999 - 8,000 + 4,500 + 3,500 STARS (реклама + хостинг)
-- 2025-08-24: VibeCoder999 - 6,000 + 4,500 + 2,800 STARS (хостинг + API)
-- 2025-08-24: AnalyticsBot - 1,200 STARS (аналитика)

-- ДЕЙСТВИЕ: Перенести в отдельную таблицу
CREATE TABLE IF NOT EXISTS business_expenses (
  id BIGSERIAL PRIMARY KEY,
  bot_name TEXT NOT NULL,
  amount DECIMAL NOT NULL,
  currency TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

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

-- Затем удалить из payments_v2 (они уже скопированы в business_expenses)
DELETE FROM payments_v2
WHERE type = 'MONEY_OUTCOME'
  AND currency = 'STARS'
  AND ABS(amount) > 1000;

-- ========================================
-- 2️⃣ ФЕЙКОВЫЕ ДАННЫЕ (TEST_DATA) - УДАЛИТЬ!
-- ========================================
-- Все записи с "TEST_DATA: System/Bonus/Testing" датированы 2025-04-27
-- Это однократно сгенерированные тестовые данные

DELETE FROM payments_v2
WHERE description ILIKE '%TEST_DATA: System/Bonus/Testing%';

-- ========================================
-- 3️⃣ НУЛЕВЫЕ СУММЫ (512 записей) - УДАЛИТЬ!
-- ========================================
-- amount = 0 не несут никакой информации

DELETE FROM payments_v2 WHERE amount = 0;

-- ========================================
-- 4️⃣ ДУБЛИКАТЫ - РАЗОБРАТЬСЯ!
-- ========================================
-- ВНИМАНИЕ: Дубликаты с РАЗНЫМИ датами - это НЕ дубликаты!
-- Это регулярные операции в разные дни/время

-- Например:
-- MetaMuse_Manifest_bot: 7.5 STARS - 659 записей с 2025-05-28 по 2025-08-01
-- Это 659 операций в разные дни, НЕ дубликаты!

-- НО есть дубликаты с ОДИНАКОВЫМИ датой+временем
-- Их можно удалить, оставив по одной записи

-- Для безопасности - пока НЕ УДАЛЯЕМ дубликаты
-- Может понадобиться детальный анализ каждой группы

-- ========================================
-- 5️⃣ СИСТЕМНЫЕ ОПЕРАЦИИ - ПРОВЕРИТЬ!
-- ========================================
-- Смотрим что попало в "системные" с разными датами

SELECT bot_name, description, COUNT(*) as cnt
FROM payments_v2
WHERE description ILIKE '%system%'
   OR description ILIKE '%operation%'
   OR type = 'REFUND'
GROUP BY bot_name, description
ORDER BY cnt DESC
LIMIT 20;

-- Решение: ТОЛЬКО после просмотра результата выше!

-- ========================================
-- ПРОВЕРКА РЕЗУЛЬТАТА
-- ========================================

-- Сколько записей осталось
SELECT 'Очищенные записи:' as info, COUNT(*) as count FROM payments_v2;

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
GROUP BY bot_name
ORDER BY transactions DESC
LIMIT 10;

-- Статистика по business_expenses
SELECT
  category,
  COUNT(*) as count,
  SUM(amount) as total_stars
FROM business_expenses
GROUP BY category
ORDER BY total_stars DESC;

-- ========================================
-- ПЛАН ДЕЙСТВИЙ:
-- ========================================

-- ШАГ 1: ✅ Создан backup (payments_v2_backup)
-- ШАГ 2: ✅ Перенесены большие расходы в business_expenses
-- ШАГ 3: ✅ Удалены TEST_DATA (фейковые)
-- ШАГ 4: ✅ Удалены нулевые суммы
-- ШАГ 5: ⚠️  Дубликаты - требуется ручной анализ
-- ШАГ 6: ⚠️  Системные операции - требуется ручной анализ

-- ========================================
-- РЕКОМЕНДАЦИЯ:
-- ========================================

-- После выполнения команд 1-4
-- запустить запросы в разделе "ПРОВЕРКА РЕЗУЛЬТАТА"
-- и посмотреть на данные перед принятием решений
-- о дубликатах и системных операциях
