-- Добавление владельца для AI_STARS_bot
-- Этот запрос необходимо выполнить, чтобы бот мог запуститься

-- Замените '484954118' на реальный Telegram ID владельца бота
INSERT INTO avatars (
    telegram_id,
    bot_name,
    avatar_url,
    "group",
    created_at,
    updated_at
) VALUES (
    '484954118', -- Замените на реальный Telegram ID владельца
    'AI_STARS_bot',
    'https://via.placeholder.com/150/4A90E2/FFFFFF?text=AI', -- Временный аватар
    'ai_stars', -- Группа для бота
    NOW(),
    NOW()
) ON CONFLICT (telegram_id, bot_name) DO NOTHING;

-- Проверяем, что запись добавлена
SELECT 
    telegram_id,
    bot_name,
    created_at
FROM avatars 
WHERE bot_name = 'AI_STARS_bot';

-- Также можно добавить группу для бота (опционально)
-- Замените на реальный group_id если нужно
-- INSERT INTO bot_groups (bot_name, group_id, created_at)
-- VALUES ('AI_STARS_bot', '-1001234567890', NOW())
-- ON CONFLICT (bot_name) DO NOTHING; 