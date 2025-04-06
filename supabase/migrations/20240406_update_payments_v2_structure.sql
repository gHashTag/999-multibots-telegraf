-- Обновляем структуру таблицы payments_v2
DROP VIEW IF EXISTS payments_analytics CASCADE;

-- Пересоздаем таблицу payments_v2 с правильной структурой
DROP TABLE IF EXISTS payments_v2 CASCADE;
CREATE TABLE payments_v2 (
  payment_id SERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  amount NUMERIC NOT NULL DEFAULT 0, -- Используется для расчета баланса (может быть отрицательным)
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  payment_method VARCHAR(50),
  description TEXT,
  metadata JSONB DEFAULT '{}',
  stars NUMERIC NOT NULL DEFAULT 0, -- Всегда положительное количество звезд
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
DROP FUNCTION IF EXISTS get_user_balance(TEXT);
CREATE OR REPLACE FUNCTION get_user_balance(user_telegram_id BIGINT)
RETURNS NUMERIC AS $$
DECLARE
    result NUMERIC;
BEGIN
    -- Используем amount для расчета баланса
    SELECT COALESCE(SUM(amount), 0) INTO result
    FROM payments_v2 
    WHERE telegram_id = user_telegram_id
    AND status = 'COMPLETED';
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Обновляем функцию sync_user_balance
CREATE OR REPLACE FUNCTION sync_user_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_telegram_id BIGINT;
    v_new_balance NUMERIC;
BEGIN
    -- Определяем telegram_id в зависимости от операции
    IF TG_OP = 'DELETE' THEN
        v_telegram_id := OLD.telegram_id;
    ELSE
        v_telegram_id := NEW.telegram_id;
    END IF;

    -- Создаем пользователя, если его нет
    INSERT INTO users (telegram_id, balance)
    VALUES (v_telegram_id, 0)
    ON CONFLICT (telegram_id) DO NOTHING;

    -- Рассчитываем новый баланс на основе amount
    WITH balance_calc AS (
        SELECT COALESCE(SUM(amount), 0) as total_balance
        FROM payments_v2
        WHERE telegram_id = v_telegram_id
          AND status = 'COMPLETED'
    )
    UPDATE users
    SET balance = balance_calc.total_balance,
        updated_at = NOW()
    FROM balance_calc
    WHERE users.telegram_id = v_telegram_id
    RETURNING balance INTO v_new_balance;

    -- Логируем обновление баланса
    RAISE NOTICE '💰 Баланс пользователя % обновлен (новый баланс: %)', 
        v_telegram_id, v_new_balance;
    
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

    -- Получаем текущий баланс через get_user_balance для консистентности
    SELECT get_user_balance(p_telegram_id) INTO v_old_balance;

    -- Создаем запись о начислении в payments_v2
    INSERT INTO payments_v2 (
        payment_date,
        amount, -- Для пополнения amount положительный
        status,
        payment_method,
        description,
        metadata,
        stars, -- stars всегда положительное количество
        telegram_id,
        currency,
        subscription,
        bot_name,
        language,
        inv_id
    ) VALUES (
        NOW(),
        p_stars, -- Используем p_stars как положительный amount для пополнения
        'COMPLETED',
        'system',
        p_description,
        jsonb_build_object(
            'type', 'system_add',
            'old_balance', v_old_balance,
            'added_stars', p_stars
        ),
        p_stars, -- Сохраняем оригинальное количество звезд
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