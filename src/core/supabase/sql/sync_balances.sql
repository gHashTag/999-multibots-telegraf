-- Создаем временную таблицу для хранения актуальных балансов
CREATE TEMP TABLE temp_user_balances AS
SELECT 
    telegram_id,
    COALESCE(SUM(CASE WHEN type = 'income' THEN stars ELSE -stars END), 0) as calculated_balance
FROM payments
WHERE status = 'COMPLETED'
GROUP BY telegram_id;

-- Обновляем балансы в таблице users
UPDATE users u
SET balance = t.calculated_balance
FROM temp_user_balances t
WHERE u.telegram_id = t.telegram_id;

-- Удаляем временную таблицу
DROP TABLE temp_user_balances;

-- Создаем триггер для автоматической синхронизации баланса
CREATE OR REPLACE FUNCTION sync_user_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- Обновляем баланс в таблице users при изменении payments
    UPDATE users
    SET balance = (
        SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN stars ELSE -stars END), 0)
        FROM payments
        WHERE telegram_id = NEW.telegram_id
        AND status = 'COMPLETED'
    )
    WHERE telegram_id = NEW.telegram_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создаем триггер
DROP TRIGGER IF EXISTS sync_balance_trigger ON payments;
CREATE TRIGGER sync_balance_trigger
    AFTER INSERT OR UPDATE OR DELETE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION sync_user_balance(); 