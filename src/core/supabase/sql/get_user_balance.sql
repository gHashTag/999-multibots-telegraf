-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_user_balance(text);

-- Создаем новую функцию с явным преобразованием типов
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
        -- Логируем ошибку и устанавливаем NULL для последующего сравнения с текстом
        RAISE NOTICE 'Ошибка преобразования telegram_id % в BIGINT: %', user_telegram_id, SQLERRM;
        telegram_id_numeric = NULL;
    END;

    -- Если преобразование не удалось, используем текстовое сравнение
    IF telegram_id_numeric IS NULL THEN
        SELECT COALESCE(
            SUM(CASE WHEN type = 'income' THEN stars ELSE -stars END),
            0
        ) INTO result
        FROM payments 
        WHERE telegram_id::TEXT = user_telegram_id
        AND status = 'COMPLETED';
    ELSE
        -- Если преобразование удалось, используем числовое сравнение
        SELECT COALESCE(
            SUM(CASE WHEN type = 'income' THEN stars ELSE -stars END),
            0
        ) INTO result
        FROM payments 
        WHERE telegram_id = telegram_id_numeric
        AND status = 'COMPLETED';
    END IF;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql; 