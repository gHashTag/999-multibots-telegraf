-- Создание таблицы для отслеживания лимитов генерации супергероев
CREATE TABLE IF NOT EXISTS public.superhero_generations (
    id BIGSERIAL PRIMARY KEY,
    telegram_id TEXT NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    year INTEGER NOT NULL CHECK (year >= 2024),
    generation_count INTEGER NOT NULL DEFAULT 0 CHECK (generation_count >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Уникальность по telegram_id + месяц + год
    UNIQUE(telegram_id, month, year)
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_superhero_generations_telegram_id ON public.superhero_generations(telegram_id);
CREATE INDEX IF NOT EXISTS idx_superhero_generations_month_year ON public.superhero_generations(month, year);
CREATE INDEX IF NOT EXISTS idx_superhero_generations_created_at ON public.superhero_generations(created_at);

-- RLS (Row Level Security) политики
ALTER TABLE public.superhero_generations ENABLE ROW LEVEL SECURITY;

-- Политика: пользователи могут видеть только свои записи
CREATE POLICY IF NOT EXISTS "Users can view their own superhero generations"
ON public.superhero_generations FOR SELECT
USING (auth.uid()::text = telegram_id);

-- Политика: пользователи могут создавать записи только для себя
CREATE POLICY IF NOT EXISTS "Users can insert their own superhero generations"
ON public.superhero_generations FOR INSERT
WITH CHECK (auth.uid()::text = telegram_id);

-- Политика: пользователи могут обновлять только свои записи
CREATE POLICY IF NOT EXISTS "Users can update their own superhero generations"
ON public.superhero_generations FOR UPDATE
USING (auth.uid()::text = telegram_id);

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_superhero_generations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для автоматического обновления updated_at
DROP TRIGGER IF EXISTS update_superhero_generations_updated_at_trigger ON public.superhero_generations;
CREATE TRIGGER update_superhero_generations_updated_at_trigger
    BEFORE UPDATE ON public.superhero_generations
    FOR EACH ROW
    EXECUTE FUNCTION update_superhero_generations_updated_at();

-- Комментарии для документации
COMMENT ON TABLE public.superhero_generations IS 'Таблица для отслеживания лимитов генерации супергероев по месяцам';
COMMENT ON COLUMN public.superhero_generations.telegram_id IS 'ID пользователя в Telegram';
COMMENT ON COLUMN public.superhero_generations.month IS 'Месяц (1-12)';
COMMENT ON COLUMN public.superhero_generations.year IS 'Год';
COMMENT ON COLUMN public.superhero_generations.generation_count IS 'Количество генераций в этом месяце';
COMMENT ON COLUMN public.superhero_generations.created_at IS 'Дата создания записи';
COMMENT ON COLUMN public.superhero_generations.updated_at IS 'Дата последнего обновления';