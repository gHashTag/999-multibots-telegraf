-- Создаем таблицу translations
CREATE TABLE IF NOT EXISTS public.translations (
  id SERIAL PRIMARY KEY,
  bot_name TEXT NOT NULL,
  key TEXT NOT NULL,
  language_code TEXT NOT NULL,
  translation TEXT NOT NULL,
  url TEXT DEFAULT '',
  buttons JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(bot_name, key, language_code)
);

-- Добавляем индексы
CREATE INDEX IF NOT EXISTS translations_bot_name_idx ON public.translations(bot_name);
CREATE INDEX IF NOT EXISTS translations_key_idx ON public.translations(key);
CREATE INDEX IF NOT EXISTS translations_language_code_idx ON public.translations(language_code);

-- Добавляем комментарии
COMMENT ON TABLE public.translations IS 'Таблица для хранения переводов и кнопок для ботов';
COMMENT ON COLUMN public.translations.bot_name IS 'Имя бота';
COMMENT ON COLUMN public.translations.key IS 'Ключ перевода';
COMMENT ON COLUMN public.translations.language_code IS 'Код языка (ru, en)';
COMMENT ON COLUMN public.translations.translation IS 'Текст перевода';
COMMENT ON COLUMN public.translations.url IS 'URL изображения или медиа';
COMMENT ON COLUMN public.translations.buttons IS 'Кнопки в формате JSON';

-- Создаем функцию для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_translations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создаем триггер для автоматического обновления updated_at
CREATE TRIGGER translations_updated_at
  BEFORE UPDATE ON public.translations
  FOR EACH ROW
  EXECUTE FUNCTION update_translations_updated_at(); 