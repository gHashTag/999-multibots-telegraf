-- =====================================================
-- АВТОМАТИЧЕСКАЯ ОЧИСТКА ФЕЙКОВЫХ ДАННЫХ
-- Сгенерировано скриптом detect_fake_data.py
-- =====================================================

-- ШАГ 1: Помечаем фейковые данные тегом
UPDATE payments_v2
SET description = 'FAKE_DATA: ' || description
WHERE (
  -- Критерий 1: Описание содержит TEST_DATA
  description LIKE '%TEST_DATA%'
  OR
  -- Критерий 2: Фейковые методы оплаты
  payment_method IN ('SYSTEM', 'Manual', 'Tester_Bonus', 'System_Balance_Migration', 'System_Operation', 'Admin', 'admin', 'video-generation-refund', 'image-to-video-refund', 'balance')
  OR
  -- Критерий 3: Тестовые боты
  bot_name IN ('ai_koshey_bot', 'admin_system', 'admin_grant', 'admin_script', 'clip_maker_neuro_bot', 'diagnostic_test', 'test_bot')
);

-- ШАГ 2: Создаем индекс для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_payments_fake_data
ON payments_v2 (description)
WHERE description LIKE 'FAKE_DATA:%';

-- ШАГ 3: Создаем VIEW только с реальными данными
CREATE OR REPLACE VIEW clean_real_data AS
SELECT *
FROM payments_v2
WHERE description NOT LIKE 'FAKE_DATA:%'
  AND payment_method IN ('Telegram', 'Robokassa', 'YooMoney', 'SBP', 'TinkoffPay', 'SberPay', 'Банковская карта', 'RUR Банковская карта')
  AND bot_name NOT IN ('ai_koshey_bot', 'admin_system', 'admin_grant', 'admin_script', 'clip_maker_neuro_bot', 'diagnostic_test', 'test_bot');

-- ШАГ 4: Создаем VIEW с фейковыми данными (для QA)
CREATE OR REPLACE VIEW fake_data_for_qa AS
SELECT *
FROM payments_v2
WHERE description LIKE 'FAKE_DATA:%';

-- ШАГ 5: Статистика очистки
SELECT
  'СТАТИСТИКА ОЧИСТКИ' as section,
  '' as details
UNION ALL
SELECT
  'Реальных транзакций',
  COUNT(*)::text || ' записей'
FROM clean_real_data
UNION ALL
SELECT
  'Фейковых транзакций',
  COUNT(*)::text || ' записей'
FROM fake_data_for_qa
UNION ALL
SELECT
  'Общий баланс (реальные)',
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN amount::numeric ELSE 0 END)::text || '₽'
FROM clean_real_data;

