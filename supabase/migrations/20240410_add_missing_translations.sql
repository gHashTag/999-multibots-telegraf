-- Добавляем базовые переводы для neuro_blogger_bot
INSERT INTO translations (bot_name, key, language_code, translation, category)
VALUES 
-- Общие ключи
('neuro_blogger_bot', 'help', 'ru', '🤔 Нужна помощь? Вот список доступных команд:', 'common'),
('neuro_blogger_bot', 'help', 'en', '🤔 Need help? Here are the available commands:', 'common'),
('neuro_blogger_bot', 'cancel', 'ru', '❌ Операция отменена', 'common'),
('neuro_blogger_bot', 'cancel', 'en', '❌ Operation cancelled', 'common'),
('neuro_blogger_bot', 'error', 'ru', '❌ Произошла ошибка. Пожалуйста, попробуйте позже.', 'common'),
('neuro_blogger_bot', 'error', 'en', '❌ An error occurred. Please try again later.', 'common'),
('neuro_blogger_bot', 'success', 'ru', '✅ Операция успешно завершена', 'common'),
('neuro_blogger_bot', 'success', 'en', '✅ Operation completed successfully', 'common'),

-- Системные ключи
('neuro_blogger_bot', 'maintenance', 'ru', '🛠 Бот находится на техническом обслуживании. Пожалуйста, попробуйте позже.', 'system'),
('neuro_blogger_bot', 'maintenance', 'en', '🛠 Bot is under maintenance. Please try again later.', 'system'),
('neuro_blogger_bot', 'rate_limit', 'ru', '⚠️ Слишком много запросов. Пожалуйста, подождите немного.', 'system'),
('neuro_blogger_bot', 'rate_limit', 'en', '⚠️ Too many requests. Please wait a moment.', 'system'),
('neuro_blogger_bot', 'subscription_required', 'ru', '🔒 Для доступа к этой функции требуется подписка', 'system'),
('neuro_blogger_bot', 'subscription_required', 'en', '🔒 Subscription required to access this feature', 'system'),

-- Ключи для аватаров
('neuro_blogger_bot', 'avatar_brain_description', 'ru', '🧠 Выберите тип мышления для вашего аватара:', 'specific'),
('neuro_blogger_bot', 'avatar_brain_description', 'en', '🧠 Choose the thinking type for your avatar:', 'specific'),
('neuro_blogger_bot', 'avatar_voice_description', 'ru', '🎤 Выберите голос для вашего аватара:', 'specific'),
('neuro_blogger_bot', 'avatar_voice_description', 'en', '🎤 Choose the voice for your avatar:', 'specific'),
('neuro_blogger_bot', 'avatar_model_description', 'ru', '🤖 Выберите модель для вашего аватара:', 'specific'),
('neuro_blogger_bot', 'avatar_model_description', 'en', '🤖 Choose the model for your avatar:', 'specific'),
('neuro_blogger_bot', 'avatar_greeting', 'ru', '👋 Привет! Я ваш цифровой аватар. Чем могу помочь?', 'specific'),
('neuro_blogger_bot', 'avatar_greeting', 'en', '👋 Hi! I am your digital avatar. How can I help you?', 'specific'),
('neuro_blogger_bot', 'avatar_help', 'ru', '❓ Я могу помочь вам с различными задачами. Просто спросите!', 'specific'),
('neuro_blogger_bot', 'avatar_help', 'en', '❓ I can help you with various tasks. Just ask!', 'specific'),
('neuro_blogger_bot', 'chat_with_avatar_start', 'ru', '🗣 Добро пожаловать в чат с аватаром! Я готов помочь вам.', 'specific'),
('neuro_blogger_bot', 'chat_with_avatar_start', 'en', '🗣 Welcome to chat with avatar! I am ready to help you.', 'specific');

-- Копируем базовые переводы для остальных ботов
INSERT INTO translations (bot_name, key, language_code, translation, category)
SELECT 
  bot.name as bot_name,
  t.key,
  t.language_code,
  t.translation,
  t.category
FROM (
  SELECT UNNEST(ARRAY[
    'clip_maker_neuro_bot',
    'ai_koshey_bot',
    'Gaia_Kamskaia_bot',
    'LeeSolarbot',
    'MetaMuse_Manifest_bot',
    'NeuroLenaAssistant_bot',
    'NeurostylistShtogrina_bot',
    'ZavaraBot'
  ]) as name
) bot
CROSS JOIN (
  SELECT key, language_code, translation, category
  FROM translations
  WHERE bot_name = 'neuro_blogger_bot'
    AND category IN ('common', 'system')
) t
ON CONFLICT (bot_name, key, language_code) DO NOTHING; 