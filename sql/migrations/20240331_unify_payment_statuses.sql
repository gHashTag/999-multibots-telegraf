-- Создаем тип для статусов платежей
DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Проверяем и конвертируем существующие статусы
UPDATE payments
SET status = CASE 
    WHEN status = 'completed' THEN 'COMPLETED'
    WHEN status = 'pending' THEN 'PENDING'
    WHEN status = 'failed' THEN 'FAILED'
    ELSE status 
END;

-- Добавляем ограничение на столбец status
ALTER TABLE payments 
    ALTER COLUMN status TYPE payment_status 
    USING status::payment_status;

-- Добавляем NOT NULL ограничение
ALTER TABLE payments 
    ALTER COLUMN status SET NOT NULL;

-- Добавляем комментарий к столбцу
COMMENT ON COLUMN payments.status IS 'Статус платежа: PENDING (в обработке), COMPLETED (завершен), FAILED (ошибка)';

-- Создаем индекс для быстрого поиска по статусу
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

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
            NEW.id,
            OLD.status,
            NEW.status,
            NOW()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создаем таблицу для логирования изменений статуса
CREATE TABLE IF NOT EXISTS payment_status_logs (
    id BIGSERIAL PRIMARY KEY,
    payment_id UUID REFERENCES payments(id),
    old_status payment_status,
    new_status payment_status,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Создаем триггер
DROP TRIGGER IF EXISTS payment_status_change_trigger ON payments;
CREATE TRIGGER payment_status_change_trigger
    AFTER UPDATE OF status ON payments
    FOR EACH ROW
    EXECUTE FUNCTION log_payment_status_change();

-- Добавляем индексы для таблицы логов
CREATE INDEX IF NOT EXISTS idx_payment_status_logs_payment_id ON payment_status_logs(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_status_logs_changed_at ON payment_status_logs(changed_at);

-- Добавляем комментарии к таблице логов
COMMENT ON TABLE payment_status_logs IS 'История изменений статусов платежей';
COMMENT ON COLUMN payment_status_logs.payment_id IS 'ID платежа';
COMMENT ON COLUMN payment_status_logs.old_status IS 'Предыдущий статус';
COMMENT ON COLUMN payment_status_logs.new_status IS 'Новый статус';
COMMENT ON COLUMN payment_status_logs.changed_at IS 'Время изменения статуса'; 