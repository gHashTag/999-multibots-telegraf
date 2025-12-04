-- ===============================================
-- Добавление аватаров для новых ботов
-- ===============================================

-- 1. Аватар для HaimGroupMedia_bot (ID: 7669741878)
INSERT INTO avatars (
    telegram_id,
    bot_name,
    avatar_url,
    "group",
    created_at,
    updated_at
) VALUES (
    '7669741878',
    'HaimGroupMedia_bot',
    'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/landingpage/avatars/HaimGroupMedia_bot/coco-age.jpeg',
    'ai_stars',
    NOW(),
    NOW()
) ON CONFLICT (telegram_id, bot_name) DO NOTHING;

-- 2. Аватар для OM_AI_Digital_studio_bot (нужно указать telegram_id и avatar_url)
-- ЗАМЕНИТЕ НА РЕАЛЬНЫЕ ДАННЫЕ!
INSERT INTO avatars (
    telegram_id,
    bot_name,
    avatar_url,
    "group",
    created_at,
    updated_at
) VALUES (
    'TBA', -- Заменить на Telegram ID владельца бота
    'OM_AI_Digital_studio_bot',
    'TBA', -- Заменить на URL аватара
    'ai_stars',
    NOW(),
    NOW()
) ON CONFLICT (telegram_id, bot_name) DO NOTHING;

-- ===============================================
-- Проверочные запросы
-- ===============================================

-- Проверить аватары
SELECT * FROM avatars WHERE bot_name IN ('HaimGroupMedia_bot', 'OM_AI_Digital_studio_bot');

-- Показать всех ботов и их аватары
SELECT bot_name, COUNT(*) as avatar_count
FROM avatars
GROUP BY bot_name
ORDER BY bot_name;
