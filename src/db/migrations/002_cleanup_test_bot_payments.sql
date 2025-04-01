-- Описание: Удаление тестовых платежей у бота ai_koshey_bot
-- Дата: 2024-03-31
-- Автор: Claude

-- Сохраняем ID транзакций для отката
CREATE TABLE IF NOT EXISTS deleted_test_payments (
    id bigint PRIMARY KEY,
    payment_data jsonb,
    deleted_at timestamp with time zone DEFAULT now()
);

-- Сохраняем удаляемые транзакции для возможности отката
INSERT INTO deleted_test_payments (id, payment_data)
SELECT 
    id,
    row_to_json(payments.*)::jsonb
FROM payments 
WHERE bot_name = 'ai_koshey_bot'
    AND payment_method = 'Telegram'
    AND type = 'income';

-- Удаляем тестовые транзакции
DELETE FROM payments 
WHERE bot_name = 'ai_koshey_bot'
    AND payment_method = 'Telegram'
    AND type = 'income';

-- Для отката:
-- INSERT INTO payments 
-- SELECT (payment_data->>'id')::bigint as id,
--        (payment_data->>'created_at')::timestamp with time zone as created_at,
--        (payment_data->>'updated_at')::timestamp with time zone as updated_at,
--        payment_data->>'payment_method' as payment_method,
--        payment_data->>'payment_type' as payment_type,
--        payment_data->>'type' as type,
--        (payment_data->>'amount')::decimal as amount,
--        payment_data->>'currency' as currency,
--        (payment_data->>'stars')::integer as stars,
--        payment_data->>'description' as description,
--        payment_data->>'bot_name' as bot_name,
--        (payment_data->>'telegram_id')::bigint as telegram_id,
--        payment_data->>'metadata' as metadata
-- FROM deleted_test_payments; 