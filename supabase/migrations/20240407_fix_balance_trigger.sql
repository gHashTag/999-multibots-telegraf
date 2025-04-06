-- Удаляем старый триггер
DROP TRIGGER IF EXISTS sync_balance_trigger_v2 ON payments_v2;

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

    -- Рассчитываем новый баланс из таблицы payments_v2
    -- Используем amount для расчета баланса
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
    
    -- Возвращаем NEW для INSERT и UPDATE, OLD для DELETE
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создаем новый триггер для всех операций (INSERT, UPDATE, DELETE)
CREATE TRIGGER sync_balance_trigger_v2
    AFTER INSERT OR UPDATE OR DELETE ON payments_v2
    FOR EACH ROW
    EXECUTE FUNCTION sync_user_balance(); 