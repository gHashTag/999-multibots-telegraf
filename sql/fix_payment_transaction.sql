-- Скрипт для исправления проблемы с типами данных в таблице payments
-- Проблема: payments.telegram_id хранится как число, но иногда передается как текст
-- Решение: Обновить RPC функцию для корректной работы с обоими типами

-- 1. Удаляем существующую функцию
DROP FUNCTION IF EXISTS get_user_balance(text);

-- 2. Создаем новую функцию с поддержкой обоих типов данных
CREATE OR REPLACE FUNCTION get_user_balance(user_telegram_id TEXT)
RETURNS NUMERIC AS $$
DECLARE
    telegram_id_numeric BIGINT;
    result NUMERIC;
BEGIN
    -- Пытаемся преобразовать telegram_id в BIGINT
    BEGIN
        telegram_id_numeric = user_telegram_id::BIGINT;
    EXCEPTION WHEN OTHERS THEN
        -- Логируем ошибку преобразования
        RAISE NOTICE 'Ошибка преобразования telegram_id % в BIGINT: %', user_telegram_id, SQLERRM;
        telegram_id_numeric = NULL;
    END;

    -- Пробуем получить баланс, используя числовое сравнение
    IF telegram_id_numeric IS NOT NULL THEN
        SELECT COALESCE(
            SUM(CASE WHEN type = 'income' THEN stars ELSE -stars END),
            0
        ) INTO result
        FROM payments 
        WHERE telegram_id = telegram_id_numeric
        AND status = 'COMPLETED';

        -- Если нашли результат, возвращаем его
        IF result IS NOT NULL THEN
            RETURN result;
        END IF;
    END IF;

    -- Если числовое сравнение не сработало или результат NULL, пробуем текстовое сравнение
    SELECT COALESCE(
        SUM(CASE WHEN type = 'income' THEN stars ELSE -stars END),
        0
    ) INTO result
    FROM payments 
    WHERE telegram_id::TEXT = user_telegram_id
    AND status = 'COMPLETED';
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 3. Проверяем платежи для telegram_id = 144022504
-- SELECT * FROM payments WHERE telegram_id = 144022504 ORDER BY created_at DESC LIMIT 10;

-- 4. Проверяем баланс с использованием RPC функции
-- SELECT get_user_balance('144022504'); 