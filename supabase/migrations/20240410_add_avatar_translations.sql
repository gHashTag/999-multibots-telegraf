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

-- Добавляем общие переводы для neuro_blogger_bot
INSERT INTO translations (bot_name, key, language_code, translation, category) VALUES
('neuro_blogger_bot', 'chat_with_avatar_start', 'ru', 'Начинаем чат с аватаром. Выберите тему для общения или задайте свой вопрос.', 'SPECIFIC'),
('neuro_blogger_bot', 'chat_with_avatar_start', 'en', 'Starting chat with avatar. Choose a topic or ask your question.', 'SPECIFIC'),
('neuro_blogger_bot', 'avatar_brain_description', 'ru', 'Мозг аватара - это нейросеть, обученная на основе личности и знаний реального человека.', 'SPECIFIC'),
('neuro_blogger_bot', 'avatar_brain_description', 'en', 'Avatar''s brain is a neural network trained on the personality and knowledge of a real person.', 'SPECIFIC'),
('neuro_blogger_bot', 'avatar_voice_description', 'ru', 'Голос аватара создан с помощью технологии клонирования голоса.', 'SPECIFIC'),
('neuro_blogger_bot', 'avatar_voice_description', 'en', 'Avatar''s voice is created using voice cloning technology.', 'SPECIFIC'),
('neuro_blogger_bot', 'avatar_model_description', 'ru', 'Цифровое тело аватара создано с помощью 3D-моделирования.', 'SPECIFIC'),
('neuro_blogger_bot', 'avatar_model_description', 'en', 'Avatar''s digital body is created using 3D modeling.', 'SPECIFIC'),
('neuro_blogger_bot', 'avatar_greeting', 'ru', 'Привет! Я цифровой аватар. Чем могу помочь?', 'SPECIFIC'),
('neuro_blogger_bot', 'avatar_greeting', 'en', 'Hi! I''m a digital avatar. How can I help you?', 'SPECIFIC'),
('neuro_blogger_bot', 'avatar_help', 'ru', 'Я могу общаться на разные темы, отвечать на вопросы и помогать с задачами.', 'SPECIFIC'),
('neuro_blogger_bot', 'avatar_help', 'en', 'I can chat about various topics, answer questions and help with tasks.', 'SPECIFIC');

-- Добавляем специфичные переводы для других ботов
INSERT INTO translations (bot_name, key, language_code, translation, category) VALUES
('clip_maker_neuro_bot', 'avatar_name', 'ru', 'Клип Мейкер', 'SPECIFIC'),
('clip_maker_neuro_bot', 'avatar_name', 'en', 'Clip Maker', 'SPECIFIC'),
('clip_maker_neuro_bot', 'avatar_description', 'ru', 'Я помогаю создавать крутые видеоклипы из ваших фото и текста.', 'SPECIFIC'),
('clip_maker_neuro_bot', 'avatar_description', 'en', 'I help create cool video clips from your photos and text.', 'SPECIFIC'),
('clip_maker_neuro_bot', 'avatar_personality', 'ru', 'Креативный, энергичный, всегда готов помочь с созданием видео.', 'SPECIFIC'),
('clip_maker_neuro_bot', 'avatar_personality', 'en', 'Creative, energetic, always ready to help with video creation.', 'SPECIFIC'),

('photo_neuro_bot', 'avatar_name', 'ru', 'Фото Мастер', 'SPECIFIC'),
('photo_neuro_bot', 'avatar_name', 'en', 'Photo Master', 'SPECIFIC'),
('photo_neuro_bot', 'avatar_description', 'ru', 'Я специализируюсь на создании и обработке фотографий с помощью ИИ.', 'SPECIFIC'),
('photo_neuro_bot', 'avatar_description', 'en', 'I specialize in creating and processing photos using AI.', 'SPECIFIC'),
('photo_neuro_bot', 'avatar_personality', 'ru', 'Внимательный к деталям, творческий, помогаю воплощать ваши идеи в фотографиях.', 'SPECIFIC'),
('photo_neuro_bot', 'avatar_personality', 'en', 'Detail-oriented, creative, helping bring your ideas to life in photos.', 'SPECIFIC'),

('voice_neuro_bot', 'avatar_name', 'ru', 'Голосовой Ассистент', 'SPECIFIC'),
('voice_neuro_bot', 'avatar_name', 'en', 'Voice Assistant', 'SPECIFIC'),
('voice_neuro_bot', 'avatar_description', 'ru', 'Я помогаю создавать качественные голосовые клоны и озвучку.', 'SPECIFIC'),
('voice_neuro_bot', 'avatar_description', 'en', 'I help create high-quality voice clones and voiceovers.', 'SPECIFIC'),
('voice_neuro_bot', 'avatar_personality', 'ru', 'Профессиональный, точный в работе с голосом, всегда готов помочь с озвучкой.', 'SPECIFIC'),
('voice_neuro_bot', 'avatar_personality', 'en', 'Professional, precise in voice work, always ready to help with voiceovers.', 'SPECIFIC'); 