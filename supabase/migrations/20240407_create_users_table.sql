-- Создаем таблицу users для хранения балансов пользователей
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL UNIQUE,
    balance NUMERIC(10, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Создаем индекс для быстрого поиска по telegram_id
CREATE INDEX IF NOT EXISTS users_telegram_id_idx ON users(telegram_id);

-- Создаем функцию для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создаем триггер для автоматического обновления updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Создаем функцию для автоматического создания пользователя, если его нет
CREATE OR REPLACE FUNCTION ensure_user_exists(p_telegram_id BIGINT)
RETURNS void AS $$
BEGIN
    INSERT INTO users (telegram_id)
    VALUES (p_telegram_id)
    ON CONFLICT (telegram_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql; 