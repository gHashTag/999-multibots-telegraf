-- Обновляем функцию get_user_balance
DROP FUNCTION IF EXISTS get_user_balance(text);
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
        SELECT COALESCE(
            SUM(CASE WHEN type = 'money_income' THEN stars ELSE -stars END),
            0
        ) INTO result
        FROM payments_v2 
        WHERE telegram_id::TEXT = user_telegram_id
        AND status = 'COMPLETED';
    ELSE
        SELECT COALESCE(
            SUM(CASE WHEN type = 'money_income' THEN stars ELSE -stars END),
            0
        ) INTO result
        FROM payments_v2 
        WHERE telegram_id = telegram_id_numeric
        AND status = 'COMPLETED';
    END IF;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Обновляем функцию sync_user_balance
CREATE OR REPLACE FUNCTION sync_user_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- Обновляем баланс в таблице users при изменении payments_v2
    UPDATE users
    SET balance = (
        SELECT COALESCE(SUM(CASE WHEN type = 'money_income' THEN stars ELSE -stars END), 0)
        FROM payments_v2
        WHERE telegram_id = NEW.telegram_id
        AND status = 'COMPLETED'
    )
    WHERE telegram_id = NEW.telegram_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Удаляем старый триггер и создаем новый для payments_v2
DROP TRIGGER IF EXISTS sync_balance_trigger ON payments;
DROP TRIGGER IF EXISTS sync_balance_trigger_v2 ON payments_v2;
CREATE TRIGGER sync_balance_trigger_v2
    AFTER INSERT OR UPDATE OR DELETE ON payments_v2
    FOR EACH ROW
    EXECUTE FUNCTION sync_user_balance();

-- Обновляем функцию add_stars_to_balance
CREATE OR REPLACE FUNCTION add_stars_to_balance(
    p_telegram_id bigint,
    p_stars integer,
    p_description text,
    p_bot_name text
) RETURNS jsonb AS $$
DECLARE
    v_old_balance integer;
    v_new_balance integer;
    v_payment_id integer;
BEGIN
    -- Логируем начало операции
    RAISE NOTICE '🚀 Начало начисления % звезд для пользователя %', p_stars, p_telegram_id;

    -- Получаем текущий баланс
    SELECT balance INTO v_old_balance
    FROM users
    WHERE telegram_id = p_telegram_id;

    -- Создаем запись о начислении в payments_v2
    INSERT INTO payments_v2 (
        payment_date,
        amount,
        status,
        payment_method,
        description,
        metadata,
        stars,
        telegram_id,
        currency,
        subscription,
        bot_name,
        language,
        type
    ) VALUES (
        NOW(),
        p_stars,  -- Сумма равна количеству звезд
        'COMPLETED',
        'system',
        p_description,
        jsonb_build_object(
            'type', 'system_add',
            'old_balance', v_old_balance,
            'added_stars', p_stars
        ),
        p_stars,
        p_telegram_id,
        'STARS',
        'none',
        p_bot_name,
        'ru',
        'money_income'  -- По умолчанию это доход
    )
    RETURNING payment_id INTO v_payment_id;

    -- Обновляем баланс пользователя
    UPDATE users 
    SET balance = COALESCE(balance, 0) + p_stars
    WHERE telegram_id = p_telegram_id
    RETURNING balance INTO v_new_balance;

    -- Если пользователя нет, создаем его
    IF NOT FOUND THEN
        RAISE NOTICE '👤 Создание нового пользователя с telegram_id: %', p_telegram_id;
        INSERT INTO users (telegram_id, balance, last_payment_date)
        VALUES (p_telegram_id, p_stars, NOW());
    END IF;

    RETURN jsonb_build_object(
        'payment_id', v_payment_id,
        'old_balance', v_old_balance,
        'new_balance', v_new_balance
    );
END;
$$ LANGUAGE plpgsql; 