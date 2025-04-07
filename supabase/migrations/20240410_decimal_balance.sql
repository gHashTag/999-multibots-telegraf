-- Миграция для поддержки дробных значений в платежах и балансе
-- Дата: 2024-04-10

-- Сначала удаляем представление, которое зависит от столбца balance
DROP VIEW IF EXISTS payments_analytics;

-- Изменяем тип столбца balance в таблице users на NUMERIC
ALTER TABLE users ALTER COLUMN balance TYPE NUMERIC USING balance::numeric;

-- Изменяем типы столбцов в таблице payments_v2
ALTER TABLE payments_v2 ALTER COLUMN amount TYPE NUMERIC USING amount::numeric;
ALTER TABLE payments_v2 ALTER COLUMN stars TYPE NUMERIC USING stars::numeric;

-- Создаем новую версию функции add_stars_to_balance, которая работает с дробными числами
CREATE OR REPLACE FUNCTION add_stars_to_balance(
    p_telegram_id BIGINT,
    p_stars NUMERIC,
    p_description TEXT,
    p_bot_name TEXT,
    p_type TEXT DEFAULT 'money_income',
    p_service_type TEXT DEFAULT 'default'
) RETURNS JSONB AS $$
DECLARE
    v_old_balance numeric;
    v_new_balance numeric;
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
            'added_stars', p_stars,
            'service_type', p_service_type
        ),
        p_stars,
        p_telegram_id,
        'STARS',
        'none',
        p_bot_name,
        'ru',
        p_type::operation_type  -- Приводим к типу operation_type
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
        
        -- Получаем установленный баланс
        SELECT balance INTO v_new_balance
        FROM users
        WHERE telegram_id = p_telegram_id;
    END IF;

    RETURN jsonb_build_object(
        'payment_id', v_payment_id,
        'old_balance', v_old_balance,
        'new_balance', v_new_balance,
        'success', true
    );
END;
$$ LANGUAGE plpgsql;

-- Опционально: создаем новое представление для аналитики
CREATE VIEW payments_analytics AS 
SELECT 
    p.payment_id,
    p.telegram_id,
    p.payment_date,
    p.amount,
    p.description,
    p.metadata,
    p.stars,
    p.currency,
    p.subscription,
    p.inv_id,
    p.email,
    p.invoice_url,
    p.status,
    p.type,
    p.service_type,
    p.operation_id,
    p.bot_name,
    p.language,
    p.payment_method,
    u.first_name,
    u.last_name,
    u.username,
    u.balance,
    u.language_code,
    u.bot_name AS user_bot_name
FROM payments_v2 p
LEFT JOIN users u ON p.telegram_id = u.telegram_id;

-- Логируем успешное выполнение миграции
DO $$
BEGIN
    RAISE NOTICE '✅ Миграция на поддержку дробных значений успешно выполнена';
END $$; 