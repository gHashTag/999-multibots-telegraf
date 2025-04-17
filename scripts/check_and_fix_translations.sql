-- Проверка существующих переводов для start
SELECT * FROM translations WHERE key LIKE 'start%';

-- Добавляем поле bot_name, если его нет в таблице
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'translations' AND column_name = 'bot_name') THEN
        ALTER TABLE translations ADD COLUMN bot_name TEXT DEFAULT 'neuro_blogger_bot';
    END IF;
END $$;

-- Обновляем переводы для ключа start -> start_ru и start_en
UPDATE translations 
SET key = 'start_ru' 
WHERE key = 'start' AND language_code = 'ru';

UPDATE translations 
SET key = 'start_en' 
WHERE key = 'start' AND language_code = 'en';

-- Обновляем записи для разных ботов
UPDATE translations
SET bot_name = 'neuro_blogger_bot'
WHERE key IN ('start_ru', 'start_en') AND (bot_name IS NULL OR bot_name = 'neuro_blogger_bot');

UPDATE translations
SET bot_name = 'MetaMuse_Manifest_bot'
WHERE key IN ('start_ru', 'start_en') AND translation LIKE '%Meta Muse%';

-- Проверяем, какие записи у нас получились
SELECT * FROM translations WHERE key LIKE 'start%'; 