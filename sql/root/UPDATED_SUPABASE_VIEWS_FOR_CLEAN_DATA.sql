-- =================================================================================
-- 🔄 ОБНОВЛЕННЫЕ VIEW ДЛЯ SUPABASE - ТОЛЬКО ЧИСТЫЕ ДАННЫЕ
-- =================================================================================
-- Создан: 2025-11-30 на основе анализа 16,182 транзакций
-- Фейковых: 15,656 (96.7%) | Реальных: 526 (3.3%)
-- =================================================================================

-- ВНИМАНИЕ: Эти VIEW исключают ВСЕ фейковые данные
-- Используйте их вместо прямых запросов к payments_v2

-- =================================================================================
-- VIEW 1: ЧИСТЫЕ ДАННЫЕ ПО ВСЕМ БОТАМ
-- =================================================================================

CREATE OR REPLACE VIEW clean_all_payments AS
SELECT
  id,
  bot_name,
  payment_method,
  description,
  amount,
  currency,
  type,
  created_at,
  -- Конвертация в рубли для удобства
  CASE
    WHEN currency = 'RUB' THEN amount::numeric
    WHEN currency = 'XTR' THEN amount::numeric * 1.8
    WHEN currency = 'STARS' THEN amount::numeric * 1.8
    ELSE amount::numeric
  END as amount_rub
FROM payments_v2
WHERE description NOT LIKE 'FAKE_DATA:%'
  AND bot_name NOT IN (
    'ai_koshey_bot', 'admin_system', 'admin_grant', 'admin_script',
    'clip_maker_neuro_bot', 'diagnostic_test', 'test_bot', 'TestNeurocoder_bot',
    'vibecoder999', 'VibeCoder999', 'DAO999', 'unknown_bot',
    'neuroblogger_bot', 'neuroblogger', 'vibecoding', 'AnalyticsBot',
    'neuro-video-bot', 'admin_unlimited', 'system_recovery',
    'admin_fix', 'mcp-server', 'public_test', 'webhook-test-bot'
  )
  AND payment_method IN (
    'Telegram', 'Robokassa', 'YooMoney', 'SBP', 'TinkoffPay', 'SberPay',
    'Банковская карта', 'RUR Банковская карта'
  );

-- =================================================================================
-- VIEW 2: СВОДКА ПО ЧИСТЫМ БОТАМ (только реальные данные)
-- =================================================================================

CREATE OR REPLACE VIEW clean_bots_summary AS
SELECT
  bot_name,
  COUNT(*) as total_transactions,
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN amount_rub ELSE 0 END) as total_income_rub,
  SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN amount_rub ELSE 0 END) as total_expense_rub,
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN amount_rub ELSE 0 END) -
  SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN amount_rub ELSE 0 END) as net_profit_rub,
  -- Статистика по валютам
  COUNT(CASE WHEN currency = 'RUB' THEN 1 END) as rub_transactions,
  COUNT(CASE WHEN currency = 'XTR' THEN 1 END) as xtr_transactions,
  COUNT(CASE WHEN currency = 'STARS' THEN 1 END) as stars_transactions,
  -- Средний чек
  ROUND(AVG(CASE WHEN type = 'MONEY_INCOME' THEN amount_rub END), 2) as avg_income_rub
FROM clean_all_payments
GROUP BY bot_name
ORDER BY total_income_rub DESC;

-- =================================================================================
-- VIEW 3: ТОП ПРОДАЖ (только реальные платежи)
-- =================================================================================

CREATE OR REPLACE VIEW clean_top_payments AS
SELECT
  id,
  bot_name,
  payment_method,
  description,
  amount_rub,
  currency,
  created_at
FROM clean_all_payments
WHERE type = 'MONEY_INCOME'
ORDER BY amount_rub DESC
LIMIT 100;

-- =================================================================================
-- VIEW 4: РЕАЛЬНЫЕ РАСХОДЫ ПО БОТАМ
-- =================================================================================

CREATE OR REPLACE VIEW clean_expenses AS
SELECT
  bot_name,
  COUNT(*) as expense_transactions,
  SUM(amount_rub) as total_expenses_rub,
  AVG(amount_rub) as avg_expense_rub,
  MIN(amount_rub) as min_expense_rub,
  MAX(amount_rub) as max_expense_rub
FROM clean_all_payments
WHERE type = 'MONEY_OUTCOME'
GROUP BY bot_name
ORDER BY total_expenses_rub DESC;

-- =================================================================================
-- VIEW 5: СТАТИСТИКА ЗА ПЕРИОДЫ (по месяцам)
-- =================================================================================

CREATE OR REPLACE VIEW clean_monthly_stats AS
SELECT
  bot_name,
  DATE_TRUNC('month', created_at) as month,
  COUNT(*) as transactions,
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN amount_rub ELSE 0 END) as income_rub,
  SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN amount_rub ELSE 0 END) as expense_rub,
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN amount_rub ELSE 0 END) -
  SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN amount_rub ELSE 0 END) as net_rub
FROM clean_all_payments
GROUP BY bot_name, DATE_TRUNC('month', created_at)
ORDER BY month DESC, income_rub DESC;

-- =================================================================================
-- VIEW 6: ДЕТАЛИ ФЕЙКОВЫХ ДАННЫХ (для QA команды)
-- =================================================================================

CREATE OR REPLACE VIEW fake_data_details AS
SELECT
  id,
  bot_name,
  payment_method,
  description,
  amount,
  currency,
  type,
  created_at,
  CASE
    WHEN currency = 'RUB' THEN amount::numeric
    WHEN currency = 'XTR' THEN amount::numeric * 1.8
    WHEN currency = 'STARS' THEN amount::numeric * 1.8
    ELSE amount::numeric
  END as amount_rub,
  -- Определяем причину фейка
  CASE
    WHEN bot_name IN ('ai_koshey_bot', 'admin_system', 'admin_grant') THEN 'TEST_BOT'
    WHEN description ILIKE '%TEST_DATA%' THEN 'TEST_DATA_IN_DESC'
    WHEN payment_method IN ('SYSTEM', 'Internal', 'balance') THEN 'FAKE_PAYMENT_METHOD'
    WHEN amount::numeric > 1000000 THEN 'LARGE_AMOUNT_SUSPICIOUS'
    ELSE 'OTHER'
  END as fake_reason
FROM payments_v2
WHERE description LIKE 'FAKE_DATA:%'
  OR bot_name IN (
    'ai_koshey_bot', 'admin_system', 'admin_grant', 'admin_script',
    'clip_maker_neuro_bot', 'diagnostic_test', 'test_bot'
  )
  OR payment_method IN (
    'SYSTEM', 'Internal', 'balance', 'text_to_image', 'image-to-video',
    'System_Balance_Migration', 'image_to_video', 'unknown_mode'
  )
ORDER BY amount_rub DESC;

-- =================================================================================
-- VIEW 7: СРАВНЕНИЕ РЕАЛЬНЫХ И ФЕЙКОВЫХ ДАННЫХ
-- =================================================================================

CREATE OR REPLACE VIEW real_vs_fake_comparison AS
SELECT
  bot_name,
  -- Реальные данные
  SUM(CASE WHEN description NOT LIKE 'FAKE_DATA:%' AND type = 'MONEY_INCOME' THEN amount_rub ELSE 0 END) as real_income_rub,
  SUM(CASE WHEN description NOT LIKE 'FAKE_DATA:%' AND type = 'MONEY_OUTCOME' THEN amount_rub ELSE 0 END) as real_expense_rub,
  COUNT(CASE WHEN description NOT LIKE 'FAKE_DATA:%' THEN 1 END) as real_transactions,
  -- Фейковые данные
  SUM(CASE WHEN description LIKE 'FAKE_DATA:%' AND type = 'MONEY_INCOME' THEN amount_rub ELSE 0 END) as fake_income_rub,
  SUM(CASE WHEN description LIKE 'FAKE_DATA:%' AND type = 'MONEY_OUTCOME' THEN amount_rub ELSE 0 END) as fake_expense_rub,
  COUNT(CASE WHEN description LIKE 'FAKE_DATA:%' THEN 1 END) as fake_transactions,
  -- Проценты
  CASE
    WHEN COUNT(*) > 0 THEN
      ROUND(COUNT(CASE WHEN description LIKE 'FAKE_DATA:%' THEN 1 END) * 100.0 / COUNT(*), 2)
    ELSE 0
  END as fake_percentage
FROM (
  SELECT
    bot_name,
    description,
    type,
    CASE
      WHEN currency = 'RUB' THEN amount::numeric
      WHEN currency = 'XTR' THEN amount::numeric * 1.8
      WHEN currency = 'STARS' THEN amount::numeric * 1.8
      ELSE amount::numeric
    END as amount_rub
  FROM payments_v2
) combined
GROUP BY bot_name
HAVING SUM(CASE WHEN description LIKE 'FAKE_DATA:%' THEN 1 ELSE 0 END) > 0
ORDER BY fake_income_rub DESC;

-- =================================================================================
-- ФУНКЦИЯ: БЫСТРОЕ ПОЛУЧЕНИЕ СТАТИСТИКИ ПО БОТУ
-- =================================================================================

CREATE OR REPLACE FUNCTION get_bot_clean_stats(p_bot_name TEXT)
RETURNS TABLE(
  bot_name TEXT,
  total_transactions BIGINT,
  real_income_rub NUMERIC,
  real_expense_rub NUMERIC,
  net_profit_rub NUMERIC,
  fake_percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.bot_name,
    COUNT(*) as total_transactions,
    SUM(CASE WHEN c.type = 'MONEY_INCOME' THEN c.amount_rub ELSE 0 END) as real_income_rub,
    SUM(CASE WHEN c.type = 'MONEY_OUTCOME' THEN c.amount_rub ELSE 0 END) as real_expense_rub,
    SUM(CASE WHEN c.type = 'MONEY_INCOME' THEN c.amount_rub ELSE 0 END) -
    SUM(CASE WHEN c.type = 'MONEY_OUTCOME' THEN c.amount_rub ELSE 0 END) as net_profit_rub,
    CASE
      WHEN (SELECT COUNT(*) FROM payments_v2 WHERE bot_name = p_bot_name) > 0 THEN
        ROUND(
          (SELECT COUNT(*) FROM payments_v2 WHERE bot_name = p_bot_name AND description LIKE 'FAKE_DATA:%') * 100.0 /
          (SELECT COUNT(*) FROM payments_v2 WHERE bot_name = p_bot_name),
          2
        )
      ELSE 0
    END as fake_percentage
  FROM clean_all_payments c
  WHERE c.bot_name = p_bot_name
  GROUP BY c.bot_name;
END;
$$ LANGUAGE plpgsql;

-- =================================================================================
-- ГОТОВЫЕ ЗАПРОСЫ ДЛЯ ИСПОЛЬЗОВАНИЯ
-- =================================================================================

-- Пример 1: Посмотреть статистику по всем чистым ботам
-- SELECT * FROM clean_bots_summary;

-- Пример 2: Посмотреть топ платежи
-- SELECT * FROM clean_top_payments WHERE bot_name = 'neuro_blogger_bot';

-- Пример 3: Получить статистику по конкретному боту
-- SELECT * FROM get_bot_clean_stats('MetaMuse_Manifest_bot');

-- Пример 4: Посмотреть фейковые данные
-- SELECT * FROM fake_data_details LIMIT 50;

-- Пример 5: Сравнение реальных и фейковых
-- SELECT * FROM real_vs_fake_comparison WHERE fake_percentage > 50;

-- Пример 6: Месячная статистика
-- SELECT * FROM clean_monthly_stats WHERE bot_name = 'neuro_blogger_bot' ORDER BY month DESC LIMIT 12;

-- =================================================================================
-- ИНДЕКСЫ ДЛЯ ПРОИЗВОДИТЕЛЬНОСТИ
-- =================================================================================

CREATE INDEX IF NOT EXISTS idx_clean_payments_bot_name ON clean_all_payments(bot_name);
CREATE INDEX IF NOT EXISTS idx_clean_payments_type ON clean_all_payments(type);
CREATE INDEX IF NOT EXISTS idx_clean_payments_created_at ON clean_all_payments(created_at);
CREATE INDEX IF NOT EXISTS idx_clean_payments_amount_rub ON clean_all_payments(amount_rub);

-- =================================================================================
-- КОММЕНТАРИИ К ОБЪЕКТАМ
-- =================================================================================

COMMENT ON VIEW clean_all_payments IS 'ВСЕ ЧИСТЫЕ ПЛАТЕЖИ - без фейка, без тестовых ботов';
COMMENT ON VIEW clean_bots_summary IS 'СВОДКА ПО ЧИСТЫМ БОТАМ - статистика доходов/расходов в рублях';
COMMENT ON VIEW clean_top_payments IS 'ТОП-100 РЕАЛЬНЫХ ПЛАТЕЖЕЙ - отсортировано по сумме';
COMMENT ON VIEW clean_expenses IS 'РЕАЛЬНЫЕ РАСХОДЫ ПО БОТАМ - только MONEY_OUTCOME';
COMMENT ON VIEW clean_monthly_stats IS 'МЕСЯЧНАЯ СТАТИСТИКА - динамика по месяцам';
COMMENT ON VIEW fake_data_details IS 'ФЕЙКОВЫЕ ДАННЫЕ С ПРИЧИНАМИ - для QA команды';
COMMENT ON VIEW real_vs_fake_comparison IS 'СРАВНЕНИЕ РЕАЛЬНЫХ И ФЕЙКОВЫХ ДАННЫХ - по каждому боту';
COMMENT ON FUNCTION get_bot_clean_stats(TEXT) IS 'Функция получения чистой статистики по боту';

-- =================================================================================
-- ФИНАЛЬНОЕ СООБЩЕНИЕ
-- =================================================================================

SELECT
  '✅ UPDATED VIEWS СОЗДАНЫ УСПЕШНО!' as status,
  '7 новых VIEW + 1 функция для работы с чистыми данными' as details
UNION ALL
SELECT
  '📊 Теперь используйте эти VIEW вместо payments_v2:',
  'clean_all_payments, clean_bots_summary, clean_top_payments'
UNION ALL
SELECT
  '🔍 Для QA используйте:',
  'fake_data_details, real_vs_fake_comparison'
UNION ALL
SELECT
  '⚡ Для аналитики:',
  'clean_monthly_stats, clean_expenses'
UNION ALL
SELECT
  '🎯 Пример запроса:',
  'SELECT * FROM clean_bots_summary WHERE net_profit_rub > 0;';

-- =================================================================================
-- КОНЕЦ ФАЙЛА
-- =================================================================================
