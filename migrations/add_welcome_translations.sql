-- Добавление переводов приветственных сообщений для всех ботов
-- Используем систему переводов вместо колонки welcome_message в таблице avatars

-- Русский перевод для neuro_blogger_bot
INSERT INTO translations (key, language_code, bot_name, translation, url, buttons, created_at)
VALUES (
  'welcome',
  'ru',
  'neuro_blogger_bot',
  '👋 Привет, {name}!

🤖 Добро пожаловать в {botName}!

✨ Я помогу тебе создавать удивительный контент с помощью ИИ:
📸 Создание уникальных изображений
🎬 Генерация видео с помощью Sora
🎨 Обработка и улучшение фотографий

🎯 Выберите нужную функцию из меню ниже:',
  '',
  NULL,
  NOW()
)
ON CONFLICT (key, language_code, bot_name)
DO UPDATE SET
  translation = EXCLUDED.translation,
  updated_at = NOW();

-- Английский перевод для neuro_blogger_bot
INSERT INTO translations (key, language_code, bot_name, translation, url, buttons, created_at)
VALUES (
  'welcome',
  'en',
  'neuro_blogger_bot',
  '👋 Hello, {name}!

🤖 Welcome to {botName}!

✨ I will help you create amazing content with AI:
📸 Create unique images
🎬 Generate videos with Sora
🎨 Process and enhance photos

🎯 Select the function you need from the menu below:',
  '',
  NULL,
  NOW()
)
ON CONFLICT (key, language_code, bot_name)
DO UPDATE SET
  translation = EXCLUDED.translation,
  updated_at = NOW();

-- Общее приветствие для common (fallback для всех ботов)
INSERT INTO translations (key, language_code, bot_name, translation, url, buttons, created_at)
VALUES (
  'welcome',
  'ru',
  'common',
  '👋 Привет, {name}!

🤖 Добро пожаловать в {botName}!

🎯 Выберите нужную функцию из меню ниже:',
  '',
  NULL,
  NOW()
)
ON CONFLICT (key, language_code, bot_name)
DO UPDATE SET
  translation = EXCLUDED.translation,
  updated_at = NOW();

INSERT INTO translations (key, language_code, bot_name, translation, url, buttons, created_at)
VALUES (
  'welcome',
  'en',
  'common',
  '👋 Hello, {name}!

🤖 Welcome to {botName}!

🎯 Select the function you need from the menu below:',
  '',
  NULL,
  NOW()
)
ON CONFLICT (key, language_code, bot_name)
DO UPDATE SET
  translation = EXCLUDED.translation,
  updated_at = NOW();
