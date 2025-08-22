-- Проверка наличия таблицы translations
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_name = 'translations'
) AS "translations_table_exists";

-- Вывод структуры таблицы translations
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'translations';

-- Проверка наличия записей для ключа start_ru
SELECT * FROM translations 
WHERE key = 'start_ru';

-- Пример добавления записи для ключа start_ru, если её нет
-- INSERT INTO translations (key, language_code, bot_name, translation, url)
-- VALUES 
--   ('start_ru', 'ru', 'neuro_blogger_bot', 'Добро пожаловать в NeuroBlogger! Я помогу вам создавать контент с помощью нейросетей.', 'https://example.com/welcome.jpg'),
--   ('start_en', 'en', 'neuro_blogger_bot', 'Welcome to NeuroBlogger! I will help you create content using neural networks.', 'https://example.com/welcome.jpg');

-- Список всех ботов в таблице translations
SELECT DISTINCT bot_name FROM translations;

-- Количество записей для каждого бота
SELECT bot_name, COUNT(*) FROM translations
GROUP BY bot_name
ORDER BY COUNT(*) DESC; 