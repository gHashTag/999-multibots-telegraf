-- Пересоздаем функцию add_payment_record с правильным статусом COMPLETED
CREATE OR REPLACE FUNCTION add_payment_record(
    p_telegram_id bigint,
    p_stars integer,
    p_description text,
    p_bot_name text,
    p_language text,
    p_payment_method text,
    p_amount numeric,
    p_currency varchar,
    p_metadata jsonb,
    p_subscription text
) RETURNS integer AS $$
DECLARE
    v_payment_id integer;
    v_payment_type text;
BEGIN
    -- Определяем тип платежа на основе метаданных
    v_payment_type := COALESCE(p_metadata->>'payment_type', 'subscription');

    -- Логируем входные данные
    RAISE NOTICE '🔄 Создание записи о платеже: % звезд для пользователя %', p_stars, p_telegram_id;

    -- Вставляем запись о платеже
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
        p_amount,
        'COMPLETED',  -- Используем правильный статус в верхнем регистре
        p_payment_method,
        p_description,
        p_metadata,
        p_stars,
        p_telegram_id,
        p_currency,
        p_subscription,
        p_bot_name,
        p_language,
        v_payment_type
    )
    RETURNING payment_id INTO v_payment_id;

    -- Логируем успешное создание платежа
    RAISE NOTICE '✅ Платеж создан с ID: %', v_payment_id;

    -- Обновляем баланс пользователя
    UPDATE users 
    SET balance = balance + p_stars,
        last_payment_date = NOW()
    WHERE telegram_id = p_telegram_id;

    -- Если пользователя нет, создаем его
    IF NOT FOUND THEN
        RAISE NOTICE '👤 Создание нового пользователя с telegram_id: %', p_telegram_id;
        INSERT INTO users (telegram_id, balance, last_payment_date)
        VALUES (p_telegram_id, p_stars, NOW());
    END IF;

    -- Логируем обновление баланса
    RAISE NOTICE '💰 Баланс пользователя % обновлен на % звезд', p_telegram_id, p_stars;

    RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql; 