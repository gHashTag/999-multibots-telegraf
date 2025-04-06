-- Функция для начисления звёзд пользователю
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

    -- Создаем запись о начислении в payments
    INSERT INTO payments (
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
        0,  -- Бесплатное начисление
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
        'system_add'
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
        
        INSERT INTO users (telegram_id, balance)
        VALUES (p_telegram_id, p_stars)
        RETURNING balance INTO v_new_balance;
    END IF;

    -- Логируем успешное начисление
    RAISE NOTICE '✅ Звезды успешно начислены. Старый баланс: %, Новый баланс: %', v_old_balance, v_new_balance;

    -- Возвращаем результат операции
    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'old_balance', v_old_balance,
        'new_balance', v_new_balance,
        'added_stars', p_stars,
        'telegram_id', p_telegram_id
    );

EXCEPTION WHEN OTHERS THEN
    -- Логируем ошибку
    RAISE NOTICE '❌ Ошибка при начислении звезд: %', SQLERRM;
    
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'telegram_id', p_telegram_id,
        'stars', p_stars
    );
END;
$$ LANGUAGE plpgsql; 