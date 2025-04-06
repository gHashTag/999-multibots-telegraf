-- Проверяем наличие столбца type и, если его нет, добавляем
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'payments_v2' AND column_name = 'type'
    ) THEN
        ALTER TABLE payments_v2 ADD COLUMN type TEXT;
    END IF;
END $$;

-- Проверяем, есть ли столбец stars; если нет, добавляем его
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'payments_v2' AND column_name = 'stars'
    ) THEN
        ALTER TABLE payments_v2 ADD COLUMN stars NUMERIC DEFAULT 0;
    END IF;
END $$;

-- Проверяем, есть ли столбец stars_amount; если нет, добавляем его
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'payments_v2' AND column_name = 'stars_amount'
    ) THEN
        ALTER TABLE payments_v2 ADD COLUMN stars_amount NUMERIC DEFAULT 0;
    END IF;
END $$;

-- Проверяем, есть ли столбец amount; если нет, добавляем его
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'payments_v2' AND column_name = 'amount'
    ) THEN
        ALTER TABLE payments_v2 ADD COLUMN amount NUMERIC DEFAULT 0;
    END IF;
END $$; 