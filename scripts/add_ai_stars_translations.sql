-- Переводы для бота AI_STARS_bot
-- Русский и английский языки

-- ===============================
-- ПРИВЕТСТВЕННОЕ СООБЩЕНИЕ (START)
-- ===============================

-- Русский язык
INSERT INTO translations (key, language_code, bot_name, translation, url, category) 
VALUES 
('start', 'ru', 'AI_STARS_bot', 
 '🌟 Добро пожаловать в AI Stars!

🤖 Ваш персональный ИИ-помощник для создания контента и решения повседневных задач.

✨ Что я умею:
• 💬 Отвечать на вопросы и помогать с задачами
• 🎨 Генерировать изображения по описанию
• 📝 Создавать тексты и контент
• 🔄 Переводить тексты
• 💡 Давать советы и рекомендации

🚀 Используйте кнопки меню или просто напишите мне что-нибудь!', 
 'https://storage.googleapis.com/telegram-bot-assets/ai_stars_welcome.jpg',
 'specific')
ON CONFLICT (key, language_code, bot_name) 
DO UPDATE SET 
    translation = EXCLUDED.translation, 
    url = EXCLUDED.url,
    updated_at = NOW();

-- Английский язык
INSERT INTO translations (key, language_code, bot_name, translation, url, category) 
VALUES 
('start', 'en', 'AI_STARS_bot', 
 '🌟 Welcome to AI Stars!

🤖 Your personal AI assistant for content creation and solving everyday tasks.

✨ What I can do:
• 💬 Answer questions and help with tasks
• 🎨 Generate images from descriptions
• 📝 Create texts and content
• 🔄 Translate texts
• 💡 Give advice and recommendations

🚀 Use the menu buttons or just write me something!', 
 'https://storage.googleapis.com/telegram-bot-assets/ai_stars_welcome.jpg',
 'specific')
ON CONFLICT (key, language_code, bot_name) 
DO UPDATE SET 
    translation = EXCLUDED.translation, 
    url = EXCLUDED.url,
    updated_at = NOW();

-- ===============================
-- МЕНЮ
-- ===============================

-- Русский язык
INSERT INTO translations (key, language_code, bot_name, translation, url, category, buttons) 
VALUES 
('menu', 'ru', 'AI_STARS_bot', 
 '🌟 AI Stars - Главное меню

Выберите нужное действие:', 
 null,
 'specific',
 '[
   {
     "row": 1,
     "text": "🎨 Генерация изображений",
     "callback_data": "generate_image",
     "description": "Создание изображений по текстовому описанию"
   },
   {
     "row": 2,
     "text": "📝 Создание текста",
     "callback_data": "generate_text",
     "description": "Помощь с написанием текстов и статей"
   },
   {
     "row": 3,
     "text": "🔄 Перевод",
     "callback_data": "translate",
     "description": "Перевод текстов на разные языки"
   },
   {
     "row": 4,
     "text": "💰 Баланс",
     "callback_data": "balance",
     "description": "Проверить баланс и статистику"
   },
   {
     "row": 5,
     "text": "⚙️ Настройки",
     "callback_data": "settings",
     "description": "Настройки бота"
   }
 ]')
ON CONFLICT (key, language_code, bot_name) 
DO UPDATE SET 
    translation = EXCLUDED.translation, 
    buttons = EXCLUDED.buttons,
    updated_at = NOW();

-- Английский язык
INSERT INTO translations (key, language_code, bot_name, translation, url, category, buttons) 
VALUES 
('menu', 'en', 'AI_STARS_bot', 
 '🌟 AI Stars - Main Menu

Choose the action you need:', 
 null,
 'specific',
 '[
   {
     "row": 1,
     "text": "🎨 Image Generation",
     "callback_data": "generate_image",
     "description": "Create images from text descriptions"
   },
   {
     "row": 2,
     "text": "📝 Text Creation",
     "callback_data": "generate_text",
     "description": "Help with writing texts and articles"
   },
   {
     "row": 3,
     "text": "🔄 Translation",
     "callback_data": "translate",
     "description": "Translate texts to different languages"
   },
   {
     "row": 4,
     "text": "💰 Balance",
     "callback_data": "balance",
     "description": "Check balance and statistics"
   },
   {
     "row": 5,
     "text": "⚙️ Settings",
     "callback_data": "settings",
     "description": "Bot settings"
   }
 ]')
ON CONFLICT (key, language_code, bot_name) 
DO UPDATE SET 
    translation = EXCLUDED.translation, 
    buttons = EXCLUDED.buttons,
    updated_at = NOW();

-- ===============================
-- ПОМОЩЬ
-- ===============================

-- Русский язык
INSERT INTO translations (key, language_code, bot_name, translation, category) 
VALUES 
('help', 'ru', 'AI_STARS_bot', 
 '🔧 Справка по AI Stars

🌟 Основные возможности:

🎨 **Генерация изображений**
Опишите, что хотите видеть, и я создам изображение

📝 **Создание текстов**
Помогу написать статьи, посты, описания

🔄 **Переводы**
Перевожу тексты на множество языков

💰 **Система баланса**
Используйте звезды для оплаты услуг

⚡ **Быстрые команды:**
/start - Главное меню
/help - Эта справка
/balance - Проверить баланс
/menu - Открыть меню

💬 Просто напишите мне что-нибудь, и я помогу!',
 'common')
ON CONFLICT (key, language_code, bot_name) 
DO UPDATE SET 
    translation = EXCLUDED.translation,
    updated_at = NOW();

-- Английский язык
INSERT INTO translations (key, language_code, bot_name, translation, category) 
VALUES 
('help', 'en', 'AI_STARS_bot', 
 '🔧 AI Stars Help

🌟 Main features:

🎨 **Image Generation**
Describe what you want to see and I''ll create an image

📝 **Text Creation**
I''ll help write articles, posts, descriptions

🔄 **Translations**
I translate texts into many languages

💰 **Balance System**
Use stars to pay for services

⚡ **Quick commands:**
/start - Main menu
/help - This help
/balance - Check balance
/menu - Open menu

💬 Just write me something and I''ll help!',
 'common')
ON CONFLICT (key, language_code, bot_name) 
DO UPDATE SET 
    translation = EXCLUDED.translation,
    updated_at = NOW();

-- ===============================
-- ОШИБКИ И СИСТЕМНЫЕ СООБЩЕНИЯ
-- ===============================

-- Русский язык - Ошибка
INSERT INTO translations (key, language_code, bot_name, translation, category) 
VALUES 
('error', 'ru', 'AI_STARS_bot', 
 '❌ Произошла ошибка
 
Попробуйте еще раз или обратитесь в поддержку.',
 'system')
ON CONFLICT (key, language_code, bot_name) 
DO UPDATE SET 
    translation = EXCLUDED.translation,
    updated_at = NOW();

-- Английский язык - Ошибка
INSERT INTO translations (key, language_code, bot_name, translation, category) 
VALUES 
('error', 'en', 'AI_STARS_bot', 
 '❌ An error occurred
 
Please try again or contact support.',
 'system')
ON CONFLICT (key, language_code, bot_name) 
DO UPDATE SET 
    translation = EXCLUDED.translation,
    updated_at = NOW();

-- Русский язык - Успех
INSERT INTO translations (key, language_code, bot_name, translation, category) 
VALUES 
('success', 'ru', 'AI_STARS_bot', 
 '✅ Операция выполнена успешно!',
 'system')
ON CONFLICT (key, language_code, bot_name) 
DO UPDATE SET 
    translation = EXCLUDED.translation,
    updated_at = NOW();

-- Английский язык - Успех
INSERT INTO translations (key, language_code, bot_name, translation, category) 
VALUES 
('success', 'en', 'AI_STARS_bot', 
 '✅ Operation completed successfully!',
 'system')
ON CONFLICT (key, language_code, bot_name) 
DO UPDATE SET 
    translation = EXCLUDED.translation,
    updated_at = NOW();

-- Русский язык - Отмена
INSERT INTO translations (key, language_code, bot_name, translation, category) 
VALUES 
('cancel', 'ru', 'AI_STARS_bot', 
 '❌ Операция отменена
 
Возвращаемся в главное меню.',
 'common')
ON CONFLICT (key, language_code, bot_name) 
DO UPDATE SET 
    translation = EXCLUDED.translation,
    updated_at = NOW();

-- Английский язык - Отмена
INSERT INTO translations (key, language_code, bot_name, translation, category) 
VALUES 
('cancel', 'en', 'AI_STARS_bot', 
 '❌ Operation cancelled
 
Returning to main menu.',
 'common')
ON CONFLICT (key, language_code, bot_name) 
DO UPDATE SET 
    translation = EXCLUDED.translation,
    updated_at = NOW();

-- ===============================
-- ДОПОЛНИТЕЛЬНЫЕ КЛЮЧИ
-- ===============================

-- Баланс - Русский
INSERT INTO translations (key, language_code, bot_name, translation, category) 
VALUES 
('balance_info', 'ru', 'AI_STARS_bot', 
 '💰 Ваш баланс: {balance} ⭐
 
💎 Потрачено сегодня: {spent_today} ⭐
📊 Всего операций: {total_operations}

💳 Пополнить баланс можно через меню.',
 'specific')
ON CONFLICT (key, language_code, bot_name) 
DO UPDATE SET 
    translation = EXCLUDED.translation,
    updated_at = NOW();

-- Баланс - Английский
INSERT INTO translations (key, language_code, bot_name, translation, category) 
VALUES 
('balance_info', 'en', 'AI_STARS_bot', 
 '💰 Your balance: {balance} ⭐
 
💎 Spent today: {spent_today} ⭐
📊 Total operations: {total_operations}

💳 You can top up your balance through the menu.',
 'specific')
ON CONFLICT (key, language_code, bot_name) 
DO UPDATE SET 
    translation = EXCLUDED.translation,
    updated_at = NOW();

-- Недостаточно средств - Русский
INSERT INTO translations (key, language_code, bot_name, translation, category) 
VALUES 
('insufficient_balance', 'ru', 'AI_STARS_bot', 
 '💸 Недостаточно средств на балансе
 
💰 Ваш текущий баланс: {balance} ⭐
💎 Необходимо: {required} ⭐

Пополните баланс для продолжения.',
 'system')
ON CONFLICT (key, language_code, bot_name) 
DO UPDATE SET 
    translation = EXCLUDED.translation,
    updated_at = NOW();

-- Недостаточно средств - Английский
INSERT INTO translations (key, language_code, bot_name, translation, category) 
VALUES 
('insufficient_balance', 'en', 'AI_STARS_bot', 
 '💸 Insufficient balance
 
💰 Your current balance: {balance} ⭐
💎 Required: {required} ⭐

Please top up your balance to continue.',
 'system')
ON CONFLICT (key, language_code, bot_name) 
DO UPDATE SET 
    translation = EXCLUDED.translation,
    updated_at = NOW();

-- Проверка существующих переводов
SELECT 
    key, 
    language_code, 
    bot_name, 
    LEFT(translation, 50) || '...' as translation_preview,
    category
FROM translations 
WHERE bot_name = 'AI_STARS_bot' 
ORDER BY key, language_code; 