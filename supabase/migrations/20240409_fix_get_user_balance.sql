-- Удаляем обе версии функции get_user_balance
DROP FUNCTION IF EXISTS get_user_balance(bigint);
DROP FUNCTION IF EXISTS get_user_balance(text);

-- Создаем одну функцию get_user_balance, которая принимает text
CREATE OR REPLACE FUNCTION get_user_balance(user_telegram_id TEXT)
RETURNS NUMERIC AS $$
DECLARE
    telegram_id_numeric BIGINT;
    result NUMERIC;
BEGIN
    -- Преобразование с защитой от ошибок
    BEGIN
        telegram_id_numeric = user_telegram_id::BIGINT;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Ошибка преобразования telegram_id % в BIGINT: %', user_telegram_id, SQLERRM;
        telegram_id_numeric = NULL;
    END;

    -- Используем payments_v2 вместо payments
    IF telegram_id_numeric IS NULL THEN
        SELECT COALESCE(SUM(amount), 0) INTO result
        FROM payments_v2 
        WHERE telegram_id::TEXT = user_telegram_id
        AND status = 'COMPLETED';
    ELSE
        SELECT COALESCE(SUM(amount), 0) INTO result
        FROM payments_v2 
        WHERE telegram_id = telegram_id_numeric
        AND status = 'COMPLETED';
    END IF;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql; 