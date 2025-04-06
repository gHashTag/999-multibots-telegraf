-- Создаем функцию для безопасной вставки платежей
CREATE OR REPLACE FUNCTION upsert_payment(
    p_telegram_id BIGINT,
    p_amount NUMERIC,
    p_currency VARCHAR,
    p_type VARCHAR,
    p_description TEXT,
    p_status VARCHAR DEFAULT 'PENDING',
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_inv_id VARCHAR,
    p_stars NUMERIC,
    p_payment_method VARCHAR DEFAULT 'System',
    p_subscription VARCHAR DEFAULT 'none',
    p_bot_name VARCHAR DEFAULT 'unknown',
    p_language VARCHAR DEFAULT 'ru',
    p_email VARCHAR DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_payment_id INTEGER;
    v_exists BOOLEAN;
BEGIN
    -- Проверяем существование платежа с таким inv_id
    SELECT EXISTS (
        SELECT 1 
        FROM payments_v2 
        WHERE inv_id = p_inv_id
    ) INTO v_exists;

    -- Если платеж уже существует, возвращаем информацию об этом
    IF v_exists THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Payment with this inv_id already exists'
        );
    END IF;

    -- Создаем новую запись о платеже
    INSERT INTO payments_v2 (
        telegram_id,
        amount,
        currency,
        type,
        description,
        status,
        metadata,
        inv_id,
        stars,
        payment_method,
        subscription,
        bot_name,
        language,
        email,
        payment_date
    ) VALUES (
        p_telegram_id,
        p_amount,
        p_currency,
        p_type,
        p_description,
        p_status,
        p_metadata,
        p_inv_id,
        p_stars,
        p_payment_method,
        p_subscription,
        p_bot_name,
        p_language,
        p_email,
        NOW()
    )
    RETURNING payment_id INTO v_payment_id;

    -- Возвращаем успешный результат
    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'message', 'Payment created successfully'
    );

EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Payment with this inv_id already exists'
        );
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', SQLERRM
        );
END;
$$ LANGUAGE plpgsql; 