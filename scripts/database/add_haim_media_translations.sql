-- =================================================================
-- Скрипт для копирования всех переводов от neuro_blogger_bot
-- для нового бота HaimGroupMedia_bot
-- =================================================================

DO $$
DECLARE
    v_source_bot_name TEXT := 'neuro_blogger_bot';
    v_target_bot_name TEXT := 'HaimGroupMedia_bot';
    v_copied_count INT := 0;
BEGIN
    RAISE NOTICE 'Начало копирования переводов с % на %', v_source_bot_name, v_target_bot_name;

    -- Вставляем переводы, которых еще нет у целевого бота
    INSERT INTO translations (key, language_code, bot_name, translation, url, buttons, category)
    SELECT 
        t.key, 
        t.language_code, 
        v_target_bot_name, -- Имя нового бота
        t.translation, 
        t.url, 
        t.buttons, 
        t.category
    FROM 
        translations t
    WHERE 
        t.bot_name = v_source_bot_name
    ON CONFLICT (key, language_code, bot_name) DO NOTHING; -- Не обновляем, если уже существует

    -- Получаем количество скопированных записей
    GET DIAGNOSTICS v_copied_count = ROW_COUNT;
    RAISE NOTICE 'Скопировано % новых записей переводов.', v_copied_count;

    RAISE NOTICE 'Завершение операции.';
END $$; 