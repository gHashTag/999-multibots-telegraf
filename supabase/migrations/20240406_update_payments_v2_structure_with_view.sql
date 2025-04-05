-- Обновляем структуру таблицы payments_v2
DROP VIEW IF EXISTS payments_analytics CASCADE;

-- Пересоздаем таблицу payments_v2 с правильной структурой
DROP TABLE IF EXISTS payments_v2 CASCADE;
CREATE TABLE payments_v2 (
  payment_id SERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  amount NUMERIC NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  payment_method VARCHAR(50),
  description TEXT,
  metadata JSONB DEFAULT '{}',
  stars NUMERIC NOT NULL DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'STARS',
  subscription VARCHAR(50) DEFAULT 'none',
  bot_name VARCHAR(100),
  language VARCHAR(10) DEFAULT 'ru',
  inv_id VARCHAR(100) UNIQUE,
  email VARCHAR(255)
);

-- Создаем индексы
CREATE INDEX idx_payments_v2_telegram_id ON payments_v2(telegram_id);
CREATE INDEX idx_payments_v2_status ON payments_v2(status);
CREATE INDEX idx_payments_v2_payment_date ON payments_v2(payment_date);
CREATE INDEX idx_payments_v2_inv_id ON payments_v2(inv_id);

-- Создаем представление payments_analytics
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

-- Обновляем функцию get_user_balance
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

    -- Используем payments_v2
    IF telegram_id_numeric IS NULL THEN
        SELECT COALESCE(SUM(stars), 0) INTO result
        FROM payments_v2 
        WHERE telegram_id::TEXT = user_telegram_id
        AND status = 'COMPLETED';
    ELSE
        SELECT COALESCE(SUM(stars), 0) INTO result
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
        SELECT COALESCE(SUM(stars), 0)
        FROM payments_v2
        WHERE telegram_id = NEW.telegram_id
        AND status = 'COMPLETED'
    )
    WHERE telegram_id = NEW.telegram_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создаем триггер для автоматического обновления баланса
DROP TRIGGER IF EXISTS sync_balance_trigger_v2 ON payments_v2;
CREATE TRIGGER sync_balance_trigger_v2
    AFTER INSERT OR UPDATE ON payments_v2
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