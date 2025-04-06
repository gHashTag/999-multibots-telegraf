-- Стандартизация типа telegram_id во всех таблицах и функциях

-- 1. Обновляем тип в таблице users (уже BIGINT)
ALTER TABLE users 
ALTER COLUMN telegram_id SET DATA TYPE BIGINT;

-- 2. Обновляем тип в таблице payments_v2
ALTER TABLE payments_v2 
ALTER COLUMN telegram_id SET DATA TYPE BIGINT;

-- 3. Пересоздаем функции с правильными типами
CREATE OR REPLACE FUNCTION get_user_balance(user_telegram_id BIGINT)
RETURNS NUMERIC AS $$
DECLARE
    result NUMERIC;
BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO result
    FROM payments_v2 
    WHERE telegram_id = user_telegram_id
    AND status = 'COMPLETED';
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ensure_user_exists(p_telegram_id BIGINT)
RETURNS void AS $$
BEGIN
    INSERT INTO users (telegram_id)
    VALUES (p_telegram_id)
    ON CONFLICT (telegram_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION add_stars_to_balance(
    p_telegram_id BIGINT,
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
        inv_id
    ) VALUES (
        NOW(),
        p_stars,
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
        format('%s-%s', NOW()::bigint, p_telegram_id)
    )
    RETURNING payment_id INTO v_payment_id;

    -- Получаем новый баланс через get_user_balance для консистентности
    SELECT get_user_balance(p_telegram_id) INTO v_new_balance;

    -- Обновляем баланс пользователя
    UPDATE users 
    SET balance = v_new_balance,
        last_payment_date = NOW()
    WHERE telegram_id = p_telegram_id;

    -- Если пользователя нет, создаем его
    IF NOT FOUND THEN
        RAISE NOTICE '👤 Создание нового пользователя с telegram_id: %', p_telegram_id;
        INSERT INTO users (telegram_id, balance, last_payment_date)
        VALUES (p_telegram_id, v_new_balance, NOW());
    END IF;

    -- Логируем результат операции
    RAISE NOTICE '✅ Звезды успешно начислены. Старый баланс: %, Новый баланс: %', 
        v_old_balance, v_new_balance;

    RETURN jsonb_build_object(
        'payment_id', v_payment_id,
        'old_balance', v_old_balance,
        'new_balance', v_new_balance
    );
END;
$$ LANGUAGE plpgsql;

-- 4. Обновляем все представления
DROP VIEW IF EXISTS payments_analytics CASCADE;
CREATE VIEW payments_analytics AS
SELECT 
  p.*,
  u.first_name,
  u.last_name,
  u.username,
  u.balance,
  u.language_code,
  u.bot_name as user_bot_name
FROM payments_v2 p
LEFT JOIN users u ON p.telegram_id = u.telegram_id; 