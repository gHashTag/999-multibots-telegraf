-- Добавляем переводы для чата с аватаром
INSERT INTO translations (bot_name, key, language_code, value, category)
VALUES 
-- Общие переводы для всех ботов (будут использоваться как дефолтные)
('neuro_blogger_bot', 'chat_with_avatar_start', 'ru', '👋 Добро пожаловать в чат с аватаром! Я готов общаться с вами. Напишите ваше сообщение, и я постараюсь помочь.', 'specific'),
('neuro_blogger_bot', 'chat_with_avatar_start', 'en', '👋 Welcome to chat with avatar! I am ready to chat with you. Write your message, and I will try to help.', 'specific'),

('neuro_blogger_bot', 'avatar', 'ru', '🧠 Мозг аватара - это интеллектуальное ядро, которое формирует личность и профессиональные навыки вашего цифрового двойника.', 'specific'),
('neuro_blogger_bot', 'avatar', 'en', '🧠 Avatar Brain is the intellectual core that shapes the personality and professional skills of your digital twin.', 'specific'),

('neuro_blogger_bot', 'digital_avatar_body', 'ru', '🤖 Создайте цифровое тело для вашего аватара. Это первый шаг к созданию вашего цифрового двойника.', 'specific'),
('neuro_blogger_bot', 'digital_avatar_body', 'en', '🤖 Create a digital body for your avatar. This is the first step towards creating your digital twin.', 'specific'),

('neuro_blogger_bot', 'voice', 'ru', '🎤 Создайте уникальный голос для вашего аватара. Запишите образец своего голоса, и мы создадим его цифровую копию.', 'specific'),
('neuro_blogger_bot', 'voice', 'en', '🎤 Create a unique voice for your avatar. Record a sample of your voice, and we will create its digital copy.', 'specific'),

('neuro_blogger_bot', 'select_model', 'ru', '🤖 Выберите модель искусственного интеллекта для вашего аватара. Каждая модель имеет свои уникальные особенности.', 'specific'),
('neuro_blogger_bot', 'select_model', 'en', '🤖 Choose an artificial intelligence model for your avatar. Each model has its unique features.', 'specific'),

-- Специфичные переводы для разных ботов (если нужны особые версии)
('clip_maker_neuro_bot', 'chat_with_avatar_start', 'ru', '👋 Добро пожаловать в чат с вашим креативным аватаром! Я специализируюсь на создании видео и готов помочь вам с любыми творческими задачами.', 'specific'),
('clip_maker_neuro_bot', 'chat_with_avatar_start', 'en', '👋 Welcome to chat with your creative avatar! I specialize in video creation and am ready to help you with any creative tasks.', 'specific'),

('photo_neuro_bot', 'chat_with_avatar_start', 'ru', '👋 Привет! Я ваш фото-аватар. Готов помочь вам с обработкой изображений и созданием уникальных фотографий.', 'specific'),
('photo_neuro_bot', 'chat_with_avatar_start', 'en', '👋 Hi! I am your photo avatar. Ready to help you with image processing and creating unique photographs.', 'specific'),

('voice_neuro_bot', 'chat_with_avatar_start', 'ru', '👋 Приветствую! Я ваш голосовой аватар. Готов помочь вам с озвучкой и обработкой аудио.', 'specific'),
('voice_neuro_bot', 'chat_with_avatar_start', 'en', '👋 Greetings! I am your voice avatar. Ready to help you with voiceovers and audio processing.', 'specific'); 