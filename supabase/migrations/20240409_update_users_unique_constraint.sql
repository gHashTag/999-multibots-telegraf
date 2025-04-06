-- Добавляем колонку bot_name, если её нет
ALTER TABLE users ADD COLUMN IF NOT EXISTS bot_name VARCHAR(100);

-- Удаляем старый уникальный ключ
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_telegram_id_key;

-- Создаем новый уникальный ключ по комбинации telegram_id и bot_name
ALTER TABLE users ADD CONSTRAINT users_telegram_id_bot_name_key UNIQUE (telegram_id, bot_name);

-- Обновляем функцию ensure_user_exists, чтобы она учитывала bot_name
CREATE OR REPLACE FUNCTION ensure_user_exists(p_telegram_id BIGINT, p_bot_name VARCHAR(100))
RETURNS void AS $$
BEGIN
    INSERT INTO users (telegram_id, bot_name)
    VALUES (p_telegram_id, p_bot_name)
    ON CONFLICT (telegram_id, bot_name) DO NOTHING;
END;
$$ LANGUAGE plpgsql; 