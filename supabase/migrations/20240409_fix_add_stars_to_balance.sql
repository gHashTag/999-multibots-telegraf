-- Сначала удаляем существующую функцию
DROP FUNCTION IF EXISTS add_stars_to_balance(bigint, integer, text, text, text, text);

-- Затем пересоздаем функцию с правильными параметрами
CREATE OR REPLACE FUNCTION add_stars_to_balance(
    p_telegram_id bigint,
    p_stars integer,
    p_description text,
    p_bot_name text,
    p_type text,
    p_service_type text
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
        p_stars,  -- Сумма операции
        'COMPLETED',
        'system',
        p_description,
        jsonb_build_object(
            'type', 'system_add',
            'old_balance', v_old_balance,
            'added_stars', p_stars,
            'service_type', p_service_type
        ),
        p_stars,  -- Количество звезд (равно amount)
        p_telegram_id,
        'STARS',
        'none',
        p_bot_name,
        'ru',
        p_type
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