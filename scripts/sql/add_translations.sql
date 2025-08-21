-- Добавление перевода для start_ru
INSERT INTO translations (key, language_code, bot_name, translation, url) 
VALUES 
('start_ru', 'ru', 'neuro_blogger_bot', 'Добро пожаловать в NeuroBlogger! Я помогу вам создавать качественный контент и редактировать тексты.', 'https://storage.googleapis.com/telegram-bot-assets/welcome_neuro_blogger.jpg')
ON CONFLICT (key, language_code, bot_name) 
DO UPDATE SET translation = EXCLUDED.translation, url = EXCLUDED.url;

-- Добавление перевода для start_en
INSERT INTO translations (key, language_code, bot_name, translation, url) 
VALUES 
('start_en', 'en', 'neuro_blogger_bot', 'Welcome to NeuroBlogger! I will help you create quality content and edit texts.', 'https://storage.googleapis.com/telegram-bot-assets/welcome_neuro_blogger.jpg')
ON CONFLICT (key, language_code, bot_name) 
DO UPDATE SET translation = EXCLUDED.translation, url = EXCLUDED.url;

-- Добавление переводов для других ботов
INSERT INTO translations (key, language_code, bot_name, translation, url) 
VALUES 
('start_ru', 'ru', 'MetaMuse_Manifest_bot', 'Добро пожаловать в MetaMuse Manifest! Ваш помощник в создании контента.', 'https://storage.googleapis.com/telegram-bot-assets/welcome_metamuse.jpg'),
('start_en', 'en', 'MetaMuse_Manifest_bot', 'Welcome to MetaMuse Manifest! Your content creation assistant.', 'https://storage.googleapis.com/telegram-bot-assets/welcome_metamuse.jpg');

-- Добавление дефолтного перевода
INSERT INTO translations (key, language_code, bot_name, translation, url) 
VALUES 
('start_ru', 'ru', 'neuro_blogger_bot', 'Добро пожаловать! Используйте кнопки меню для навигации.', 'https://storage.googleapis.com/telegram-bot-assets/default_welcome.jpg')
ON CONFLICT (key, language_code, bot_name) 
DO UPDATE SET translation = EXCLUDED.translation, url = EXCLUDED.url; 