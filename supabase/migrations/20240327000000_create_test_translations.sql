-- Создаем функцию для добавления тестовых переводов
CREATE OR REPLACE FUNCTION create_test_translations()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Удаляем существующие тестовые записи
  DELETE FROM public.translations 
  WHERE bot_name IN ('ai_koshey_bot', 'clip_maker_neuro_bot');

  -- Добавляем записи для ai_koshey_bot
  INSERT INTO public.translations (bot_name, key, language_code, translation, url, buttons)
  VALUES 
    (
      'ai_koshey_bot',
      'start',
      'ru',
      '🤖 Привет! Я ваш тестовый бот для AI Koshey. Давайте начнем!',
      'https://raw.githubusercontent.com/gHashTag/999-multibots-telegraf/main/assets/start.jpg',
      '[]'::jsonb
    ),
    (
      'ai_koshey_bot',
      'start',
      'en',
      '🤖 Hello! I am your test bot for AI Koshey. Let''s get started!',
      'https://raw.githubusercontent.com/gHashTag/999-multibots-telegraf/main/assets/start.jpg',
      '[]'::jsonb
    );

  -- Добавляем записи для clip_maker_neuro_bot
  INSERT INTO public.translations (bot_name, key, language_code, translation, url, buttons)
  VALUES 
    (
      'clip_maker_neuro_bot',
      'start',
      'ru',
      '🎬 Привет! Я ваш тестовый бот для Clip Maker. Давайте начнем!',
      'https://raw.githubusercontent.com/gHashTag/999-multibots-telegraf/main/assets/start.jpg',
      '[]'::jsonb
    ),
    (
      'clip_maker_neuro_bot',
      'start',
      'en',
      '🎬 Hello! I am your test bot for Clip Maker. Let''s get started!',
      'https://raw.githubusercontent.com/gHashTag/999-multibots-telegraf/main/assets/start.jpg',
      '[]'::jsonb
    );

  -- Добавляем дополнительные переводы для меню и других ключей
  INSERT INTO public.translations (bot_name, key, language_code, translation, url, buttons)
  VALUES
    -- Меню для ai_koshey_bot
    (
      'ai_koshey_bot',
      'menu',
      'ru',
      '📋 Главное меню',
      '',
      '[{"text": "🎨 Создать", "callback_data": "create"}, {"text": "💰 Баланс", "callback_data": "balance"}, {"text": "ℹ️ Помощь", "callback_data": "help"}]'::jsonb
    ),
    (
      'ai_koshey_bot',
      'menu',
      'en',
      '📋 Main Menu',
      '',
      '[{"text": "🎨 Create", "callback_data": "create"}, {"text": "💰 Balance", "callback_data": "balance"}, {"text": "ℹ️ Help", "callback_data": "help"}]'::jsonb
    ),
    -- Меню для clip_maker_neuro_bot
    (
      'clip_maker_neuro_bot',
      'menu',
      'ru',
      '📋 Главное меню',
      '',
      '[{"text": "🎬 Создать видео", "callback_data": "create_video"}, {"text": "💰 Баланс", "callback_data": "balance"}, {"text": "ℹ️ Помощь", "callback_data": "help"}]'::jsonb
    ),
    (
      'clip_maker_neuro_bot',
      'menu',
      'en',
      '📋 Main Menu',
      '',
      '[{"text": "🎬 Create Video", "callback_data": "create_video"}, {"text": "💰 Balance", "callback_data": "balance"}, {"text": "ℹ️ Help", "callback_data": "help"}]'::jsonb
    );

  RAISE NOTICE 'Тестовые переводы успешно добавлены! 🎉';
END;
$$;

-- Комментарий к функции
COMMENT ON FUNCTION create_test_translations() IS 'Функция для создания тестовых переводов для ботов ai_koshey_bot и clip_maker_neuro_bot';

-- Запускаем функцию для создания тестовых переводов
SELECT create_test_translations(); 