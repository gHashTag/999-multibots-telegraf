-- Скрипт для добавления поля avatar_transform_used в таблицу users
-- Это поле отслеживает использовал ли пользователь функцию avatar transform

-- Добавляем новое поле avatar_transform_used
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS avatar_transform_used BOOLEAN DEFAULT FALSE;

-- Добавляем комментарий к полю для документации
COMMENT ON COLUMN users.avatar_transform_used IS 'Отмечает использовал ли пользователь функцию avatar transform (лидмагнет). Ограничение: один раз для обычных пользователей, без ограничений для админов';

-- Создаем индекс для быстрого поиска пользователей, которые уже использовали функцию
CREATE INDEX IF NOT EXISTS idx_users_avatar_transform_used 
ON users (avatar_transform_used) 
WHERE avatar_transform_used = TRUE; 