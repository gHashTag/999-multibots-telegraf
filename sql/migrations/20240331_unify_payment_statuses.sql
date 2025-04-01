-- Создаем бэкап текущих статусов
CREATE TABLE IF NOT EXISTS payments_status_backup AS
SELECT payment_id, status FROM payments;

-- Проверяем, что все статусы валидны
DO $$ 
DECLARE 
    invalid_count INTEGER;
    invalid_statuses TEXT;
BEGIN
    SELECT COUNT(*), STRING_AGG(DISTINCT status, ', ')
    INTO invalid_count, invalid_statuses
    FROM payments 
    WHERE status NOT IN ('PENDING', 'COMPLETED', 'FAILED');

    IF invalid_count > 0 THEN
        RAISE EXCEPTION 'Найдены невалидные статусы: %', invalid_statuses;
    END IF;
END $$;

-- Создаем тип для статусов платежей
DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Меняем тип колонки на ENUM
ALTER TABLE payments 
    ALTER COLUMN status TYPE payment_status 
    USING status::payment_status;

-- Создаем таблицу для логирования изменений статуса
CREATE TABLE IF NOT EXISTS payment_status_logs (
    id BIGSERIAL PRIMARY KEY,
    payment_id INTEGER REFERENCES payments(payment_id),
    old_status payment_status,
    new_status payment_status,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Добавляем триггер для логирования изменений статуса
CREATE OR REPLACE FUNCTION log_payment_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO payment_status_logs (
            payment_id,
            old_status,
            new_status,
            changed_at
        ) VALUES (
            NEW.payment_id,
            OLD.status,
            NEW.status,
            NOW()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создаем триггер
DROP TRIGGER IF EXISTS payment_status_change_trigger ON payments;
CREATE TRIGGER payment_status_change_trigger
    AFTER UPDATE OF status ON payments
    FOR EACH ROW
    EXECUTE FUNCTION log_payment_status_change();

-- Добавляем индексы
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payment_status_logs_payment_id ON payment_status_logs(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_status_logs_changed_at ON payment_status_logs(changed_at);

-- Проверяем, что все данные сконвертировались правильно
DO $$ 
DECLARE 
    original_count INTEGER;
    new_count INTEGER;
    diff INTEGER;
BEGIN
    SELECT COUNT(*) INTO original_count FROM payments_status_backup;
    SELECT COUNT(*) INTO new_count 
    FROM payments p
    JOIN payments_status_backup b ON p.payment_id = b.payment_id 
    WHERE p.status::text = b.status;
    
    diff := original_count - new_count;
    
    IF diff != 0 THEN
        RAISE EXCEPTION 'Ошибка конвертации: % записей не совпадают', diff;
    END IF;
END $$; 