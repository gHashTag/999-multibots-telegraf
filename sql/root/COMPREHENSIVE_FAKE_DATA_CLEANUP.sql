-- =================================================================================
-- 🔍 КОМПЛЕКСНАЯ ОЧИСТКА ФЕЙКОВЫХ ДАННЫХ - SUPABASE PAYMENTS_V2
-- =================================================================================
-- Дата создания: 2025-11-30
-- Анализ: 16,182 транзакций из 39 ботов
-- Фейковых: 15,656 (96.7%) | Реальных: 526 (3.3%)
-- =================================================================================

-- ⚠️  ВАЖНО: Этот скрипт НЕ УДАЛЯЕТ данные, а помечает их как FAKE_DATA
-- 💾 Резервная копия создается автоматически

-- =================================================================================
-- ШАГ 1: СОЗДАНИЕ РЕЗЕРВНОЙ КОПИИ (обязательно!)
-- =================================================================================

-- Создаем полную копию таблицы
CREATE TABLE IF NOT EXISTS payments_v2_backup_20251130
AS SELECT * FROM payments_v2;

-- Создаем таблицу с метками фейковых данных
CREATE TABLE IF NOT EXISTS fake_data_markers (
    id SERIAL PRIMARY KEY,
    original_payment_id BIGINT,
    bot_name TEXT,
    fake_reason TEXT,
    fake_category TEXT,
    marked_at TIMESTAMP DEFAULT NOW(),
    marked_by TEXT DEFAULT 'COMPREHENSIVE_FAKE_DATA_CLEANUP.sql'
);

CREATE INDEX IF NOT EXISTS idx_fake_markers_payment_id ON fake_data_markers(original_payment_id);
CREATE INDEX IF NOT EXISTS idx_fake_markers_bot ON fake_data_markers(bot_name);

-- =================================================================================
-- ШАГ 2: АВТОМАТИЧЕСКАЯ МАРКИРОВКА ФЕЙКОВЫХ ДАННЫХ
-- =================================================================================

-- Критерий 1: Описание содержит TEST_DATA или подобные маркеры
WITH fake_test_data AS (
  UPDATE payments_v2 p
  SET description = 'FAKE_DATA: ' || description
  WHERE description ILIKE '%TEST_DATA%'
     OR description ILIKE '%тестовые данные%'
     OR description ILIKE '%test bot%'
     OR description ILIKE '%debug%'
  RETURNING id, bot_name, 'TEST_DATA_IN_DESCRIPTION' as reason, 'TEST_DATA' as category
)
INSERT INTO fake_data_markers (original_payment_id, bot_name, fake_reason, fake_category)
SELECT id, bot_name, reason, category FROM fake_test_data;

-- Критерий 2: Фейковые методы оплаты (из анализа 16,182 записей)
WITH fake_methods AS (
  UPDATE payments_v2 p
  SET description = 'FAKE_DATA: ' || description
  WHERE payment_method IN (
    'SYSTEM', 'Internal', 'balance', 'text_to_image', 'image-to-video',
    'System_Balance_Migration', 'image_to_video', 'unknown_mode', 'flux_kontext',
    'image_to_image', 'video_to_image', 'text_to_video', 'Manual',
    'Tester_Bonus', 'System_Operation', 'Admin', 'admin',
    'video-generation-refund', 'image-to-video-refund', 'bank_card',
    'system_grant', 'system_recovery', 'admin_cli', 'admin_fix',
    'admin_unlimited', 'mcp-server', 'public_test', 'webhook-test-bot'
  )
  RETURNING id, bot_name, 'FAKE_PAYMENT_METHOD' as reason, 'FAKE_PAYMENT' as category
)
INSERT INTO fake_data_markers (original_payment_id, bot_name, fake_reason, fake_category)
SELECT id, bot_name, reason, category FROM fake_methods
WHERE id NOT IN (SELECT original_payment_id FROM fake_data_markers WHERE original_payment_id IS NOT NULL);

-- Критерий 3: Тестовые боты (из анализа)
WITH test_bots AS (
  UPDATE payments_v2 p
  SET description = 'FAKE_DATA: ' || description
  WHERE bot_name IN (
    'ai_koshey_bot', 'admin_system', 'admin_grant', 'admin_script',
    'clip_maker_neuro_bot', 'diagnostic_test', 'test_bot', 'TestNeurocoder_bot',
    'vibecoder999', 'VibeCoder999', 'DAO999', 'unknown_bot', 'neuroblogger_bot',
    'neuroblogger', 'vibecoding', 'AnalyticsBot', 'neuro-video-bot',
    'admin_unlimited', 'system_recovery', 'admin_fix', 'mcp-server',
    'public_test', 'webhook-test-bot', 'neuro_coder_bot'
  )
  RETURNING id, bot_name, 'TEST_BOT' as reason, 'TEST_BOT' as category
)
INSERT INTO fake_data_markers (original_payment_id, bot_name, fake_reason, fake_category)
SELECT id, bot_name, reason, category FROM test_bots
WHERE id NOT IN (SELECT original_payment_id FROM fake_data_markers WHERE original_payment_id IS NOT NULL);

-- Критерий 4: Аномально большие суммы (больше 1 млн в любой валюте)
WITH large_amounts AS (
  UPDATE payments_v2 p
  SET description = 'FAKE_DATA: ' || description
  WHERE (currency = 'RUB' AND amount::numeric > 1000000)
     OR (currency = 'XTR' AND amount::numeric > 1000000)
     OR (currency = 'STARS' AND amount::numeric > 1000000)
  RETURNING id, bot_name, 'ANOMALOUSLY_LARGE_AMOUNT' as reason, 'LARGE_AMOUNT' as category
)
INSERT INTO fake_data_markers (original_payment_id, bot_name, fake_reason, fake_category)
SELECT id, bot_name, reason, category FROM large_amounts
WHERE id NOT IN (SELECT original_payment_id FROM fake_data_markers WHERE original_payment_id IS NOT NULL);

-- Критерий 5: Пустые или подозрительные payment_method
WITH empty_methods AS (
  UPDATE payments_v2 p
  SET description = 'FAKE_DATA: ' || description
  WHERE payment_method IS NULL
     OR payment_method = ''
     OR payment_method = ':'
  RETURNING id, bot_name, 'EMPTY_PAYMENT_METHOD' as reason, 'SUSPICIOUS' as category
)
INSERT INTO fake_data_markers (original_payment_id, bot_name, fake_reason, fake_category)
SELECT id, bot_name, reason, category FROM empty_methods
WHERE id NOT IN (SELECT original_payment_id FROM fake_data_markers WHERE original_payment_id IS NOT NULL);

-- =================================================================================
-- ШАГ 3: СОЗДАНИЕ ИНДЕКСОВ ДЛЯ ПРОИЗВОДИТЕЛЬНОСТИ
-- =================================================================================

-- Индекс для быстрого поиска фейковых данных
CREATE INDEX IF NOT EXISTS idx_payments_v2_fake_marker
ON payments_v2 (description)
WHERE description LIKE 'FAKE_DATA:%';

-- Индекс для поиска по боту
CREATE INDEX IF NOT EXISTS idx_payments_v2_bot_name
ON payments_v2 (bot_name);

-- Индекс для поиска по методу оплаты
CREATE INDEX IF NOT EXISTS idx_payments_v2_payment_method
ON payments_v2 (payment_method);

-- =================================================================================
-- ШАГ 4: СОЗДАНИЕ VIEWS ДЛЯ ЧИСТЫХ ДАННЫХ
-- =================================================================================

-- 4.1: ПОЛНОСТЬЮ ЧИСТЫЕ ДАННЫЕ (только реальные транзакции)
CREATE OR REPLACE VIEW v_clean_real_payments AS
SELECT
  id,
  bot_name,
  payment_method,
  description,
  amount,
  currency,
  type,
  created_at
FROM payments_v2
WHERE description NOT LIKE 'FAKE_DATA:%'
  AND payment_method IN ('Telegram', 'Robokassa', 'YooMoney', 'SBP', 'TinkoffPay', 'SberPay')
  AND bot_name NOT IN (
    'ai_koshey_bot', 'admin_system', 'admin_grant', 'admin_script',
    'clip_maker_neuro_bot', 'diagnostic_test', 'test_bot'
  )
  AND (currency != 'RUB' OR amount::numeric <= 1000000)
  AND amount::numeric > 0;

-- 4.2: ТОЛЬКО ФЕЙКОВЫЕ ДАННЫЕ (для QA и анализа)
CREATE OR REPLACE VIEW v_fake_payments AS
SELECT
  id,
  bot_name,
  payment_method,
  description,
  amount,
  currency,
  type,
  created_at,
  fm.fake_reason,
  fm.fake_category
FROM payments_v2
LEFT JOIN fake_data_markers fm ON payments_v2.id = fm.original_payment_id
WHERE description LIKE 'FAKE_DATA:%';

-- 4.3: СМЕШАННЫЕ ДАННЫЕ (реальные + фейковые в одном боте)
CREATE OR REPLACE VIEW v_mixed_bot_payments AS
SELECT
  bot_name,
  COUNT(*) as total_transactions,
  COUNT(CASE WHEN description LIKE 'FAKE_DATA:%' THEN 1 END) as fake_count,
  COUNT(CASE WHEN description NOT LIKE 'FAKE_DATA:%' THEN 1 END) as real_count,
  ROUND(
    COUNT(CASE WHEN description LIKE 'FAKE_DATA:%' THEN 1 END) * 100.0 / COUNT(*),
    2
  ) as fake_percentage
FROM payments_v2
GROUP BY bot_name
HAVING COUNT(CASE WHEN description LIKE 'FAKE_DATA:%' THEN 1 END) > 0
   AND COUNT(CASE WHEN description NOT LIKE 'FAKE_DATA:%' THEN 1 END) > 0
ORDER BY fake_percentage DESC;

-- 4.4: СВОДКА ПО ВСЕМ БОТАМ
CREATE OR REPLACE VIEW v_bots_summary AS
SELECT
  bot_name,
  COUNT(*) as total_transactions,
  COUNT(CASE WHEN description LIKE 'FAKE_DATA:%' THEN 1 END) as fake_transactions,
  COUNT(CASE WHEN description NOT LIKE 'FAKE_DATA:%' THEN 1 END) as real_transactions,
  ROUND(
    COUNT(CASE WHEN description LIKE 'FAKE_DATA:%' THEN 1 END) * 100.0 / COUNT(*),
    2
  ) as fake_percentage,
  SUM(CASE WHEN type = 'MONEY_INCOME' AND description NOT LIKE 'FAKE_DATA:%' THEN amount::numeric * 1.8 ELSE 0 END) as real_income_rub,
  SUM(CASE WHEN type = 'MONEY_INCOME' AND description LIKE 'FAKE_DATA:%' THEN amount::numeric * 1.8 ELSE 0 END) as fake_income_rub,
  SUM(CASE WHEN type = 'MONEY_OUTCOME' AND description NOT LIKE 'FAKE_DATA:%' THEN amount::numeric * 1.8 ELSE 0 END) as real_expense_rub,
  SUM(CASE WHEN type = 'MONEY_OUTCOME' AND description LIKE 'FAKE_DATA:%' THEN amount::numeric * 1.8 ELSE 0 END) as fake_expense_rub
FROM payments_v2
GROUP BY bot_name
ORDER BY fake_percentage DESC;

-- =================================================================================
-- ШАГ 5: СТАТИСТИКА ОЧИСТКИ
-- =================================================================================

-- Общая статистика
SELECT
  '📊 ОБЩАЯ СТАТИСТИКА ОЧИСТКИ' as report_section,
  '' as details
UNION ALL
SELECT
  'Всего транзакций в базе',
  COUNT(*)::text
FROM payments_v2
UNION ALL
SELECT
  'Реальных транзакций',
  COUNT(*)::text || ' (' || ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM payments_v2), 2) || '%)'
FROM payments_v2
WHERE description NOT LIKE 'FAKE_DATA:%'
UNION ALL
SELECT
  'Фейковых транзакций',
  COUNT(*)::text || ' (' || ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM payments_v2), 2) || '%)'
FROM payments_v2
WHERE description LIKE 'FAKE_DATA:%'
UNION ALL
SELECT
  'Реальные доходы (все валюты → рубли)',
  COALESCE(SUM(CASE WHEN type = 'MONEY_INCOME' AND description NOT LIKE 'FAKE_DATA:%' THEN amount::numeric * 1.8 ELSE 0 END)::text, '0') || '₽'
FROM payments_v2
UNION ALL
SELECT
  'Фейковые доходы (все валюты → рубли)',
  COALESCE(SUM(CASE WHEN type = 'MONEY_INCOME' AND description LIKE 'FAKE_DATA:%' THEN amount::numeric * 1.8 ELSE 0 END)::text, '0') || '₽'
FROM payments_v2;

-- =================================================================================
-- ШАГ 6: ОТЧЕТ ПО ТОП-10 БОТАМ С ФЕЙКОМ
-- =================================================================================

SELECT
  '🔴 ТОП-10 БОТОВ ПО ФЕЙКОВЫМ ДАННЫМ' as report_section,
  '' as details
UNION ALL
SELECT
  bot_name,
  fake_transactions::text || ' фейк (' || fake_percentage::text || '%)| Реал: ' || real_transactions::text || ' | Доход реал: ' || ROUND(real_income_rub)::text || '₽ | Доход фейк: ' || ROUND(fake_income_rub)::text || '₽'
FROM v_bots_summary
WHERE fake_transactions > 0
ORDER BY fake_income_rub DESC
LIMIT 10;

-- =================================================================================
-- ШАГ 7: ПРОВЕРКА ЦЕЛОСТНОСТИ
-- =================================================================================

-- Проверяем, что все фейковые данные помечены
SELECT
  '🔍 ПРОВЕРКА ЦЕЛОСТНОСТИ' as check_name,
  '' as status
UNION ALL
SELECT
  'Записей с FAKE_DATA в описании',
  COUNT(*)::text
FROM payments_v2
WHERE description LIKE 'FAKE_DATA:%'
UNION ALL
SELECT
  'Записей в таблице markers',
  COUNT(*)::text
FROM fake_data_markers
UNION ALL
SELECT
  'Разность (должно быть 0)',
  (SELECT COUNT(*) FROM payments_v2 WHERE description LIKE 'FAKE_DATA:%')::text ||
  ' - ' ||
  (SELECT COUNT(*) FROM fake_data_markers)::text ||
  ' = ' ||
  (SELECT COUNT(*) FROM payments_v2 WHERE description LIKE 'FAKE_DATA:%' -
   COUNT(*) FROM fake_data_markers)::text
FROM fake_data_markers;

-- =================================================================================
-- ШАГ 8: ГОТОВЫЕ ЗАПРОСЫ ДЛЯ QA
-- =================================================================================

-- Посмотреть только чистые данные
-- SELECT * FROM v_clean_real_payments;

-- Посмотреть фейковые данные с причинами
-- SELECT * FROM v_fake_payments;

-- Посмотреть ботов с смешанными данными
-- SELECT * FROM v_mixed_bot_payments;

-- Посмотреть сводку по всем ботам
-- SELECT * FROM v_bots_summary;

-- =================================================================================
-- ЗАВЕРШЕНИЕ
-- =================================================================================

-- Создаем представление для удобного доступа к чистым данным
CREATE OR REPLACE VIEW payments_clean AS
SELECT * FROM v_clean_real_payments;

COMMENT ON VIEW payments_clean IS 'Чистые данные без фейка - для основной работы';
COMMENT ON VIEW v_fake_payments IS 'Фейковые данные с причинами - для QA';
COMMENT ON TABLE fake_data_markers IS 'Таблица с метками фейковых данных';

-- Выводим финальное сообщение
SELECT
  '✅ КОМПЛЕКСНАЯ ОЧИСТКА ЗАВЕРШЕНА!' as status,
  'Создано: backup table, markers table, 5 views, статистика' as details
UNION ALL
SELECT
  '📋 Созданные объекты:',
  'payments_v2_backup_20251130, fake_data_markers, v_* views'
UNION ALL
SELECT
  '🔍 Для проверки:',
  'SELECT * FROM v_bots_summary;'
UNION ALL
SELECT
  '💾 Данные НЕ удалены, только помечены!',
  'Резервная копия создана: payments_v2_backup_20251130';

-- =================================================================================
-- КОНЕЦ СКРИПТА
-- =================================================================================
