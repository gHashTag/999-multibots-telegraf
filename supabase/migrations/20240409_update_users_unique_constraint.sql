-- Добавляем колонку bot_name, если её нет
ALTER TABLE users ADD COLUMN IF NOT EXISTS bot_name VARCHAR(100);

-- Удаляем зависимые внешние ключи
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_telegram_id_fkey;
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_telegram_id_fkey;
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_telegram_id_fkey;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_telegram_id_fkey;
ALTER TABLE user_passport DROP CONSTRAINT IF EXISTS user_passport_telegram_id_fkey;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_telegram_id_fkey;
ALTER TABLE prompts_history DROP CONSTRAINT IF EXISTS prompts_history_telegram_id_fkey;
ALTER TABLE avatars DROP CONSTRAINT IF EXISTS avatars_telegram_id_fkey;
ALTER TABLE model_trainings DROP CONSTRAINT IF EXISTS model_trainings_telegram_id_fkey;

-- Удаляем старый уникальный ключ
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_telegram_id_key;

-- Создаем новый уникальный ключ по комбинации telegram_id и bot_name
ALTER TABLE users ADD CONSTRAINT users_telegram_id_bot_name_key UNIQUE (telegram_id, bot_name);

-- Создаем новые внешние ключи с учетом bot_name
ALTER TABLE assets ADD CONSTRAINT assets_telegram_id_bot_name_fkey 
    FOREIGN KEY (telegram_id, bot_name) REFERENCES users(telegram_id, bot_name);
ALTER TABLE workspaces ADD CONSTRAINT workspaces_telegram_id_bot_name_fkey 
    FOREIGN KEY (telegram_id, bot_name) REFERENCES users(telegram_id, bot_name);
ALTER TABLE rooms ADD CONSTRAINT rooms_telegram_id_bot_name_fkey 
    FOREIGN KEY (telegram_id, bot_name) REFERENCES users(telegram_id, bot_name);
ALTER TABLE payments ADD CONSTRAINT payments_telegram_id_bot_name_fkey 
    FOREIGN KEY (telegram_id, bot_name) REFERENCES users(telegram_id, bot_name);
ALTER TABLE user_passport ADD CONSTRAINT user_passport_telegram_id_bot_name_fkey 
    FOREIGN KEY (telegram_id, bot_name) REFERENCES users(telegram_id, bot_name);
ALTER TABLE tasks ADD CONSTRAINT tasks_telegram_id_bot_name_fkey 
    FOREIGN KEY (telegram_id, bot_name) REFERENCES users(telegram_id, bot_name);
ALTER TABLE prompts_history ADD CONSTRAINT prompts_history_telegram_id_bot_name_fkey 
    FOREIGN KEY (telegram_id, bot_name) REFERENCES users(telegram_id, bot_name);
ALTER TABLE avatars ADD CONSTRAINT avatars_telegram_id_bot_name_fkey 
    FOREIGN KEY (telegram_id, bot_name) REFERENCES users(telegram_id, bot_name);
ALTER TABLE model_trainings ADD CONSTRAINT model_trainings_telegram_id_bot_name_fkey 
    FOREIGN KEY (telegram_id, bot_name) REFERENCES users(telegram_id, bot_name);

-- Обновляем функцию ensure_user_exists, чтобы она учитывала bot_name
CREATE OR REPLACE FUNCTION ensure_user_exists(p_telegram_id BIGINT, p_bot_name VARCHAR(100))
RETURNS void AS $$
BEGIN
    INSERT INTO users (telegram_id, bot_name)
    VALUES (p_telegram_id, p_bot_name)
    ON CONFLICT (telegram_id, bot_name) DO NOTHING;
END;
$$ LANGUAGE plpgsql; 