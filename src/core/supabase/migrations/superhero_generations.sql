-- 🦸‍♂️ МИГРАЦИЯ: Система лимитов генерации супергероев
-- Создаёт таблицу для отслеживания месячных лимитов генерации

-- Создание таблицы для отслеживания генераций супергероев
CREATE TABLE IF NOT EXISTS superhero_generations (
    id SERIAL PRIMARY KEY,
    telegram_id TEXT NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    year INTEGER NOT NULL CHECK (year >= 2024),
    generation_count INTEGER NOT NULL DEFAULT 0 CHECK (generation_count >= 0),
    last_generation_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Уникальный индекс: один пользователь, один месяц, один год
    UNIQUE(telegram_id, month, year)
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_superhero_generations_telegram_id
    ON superhero_generations(telegram_id);

CREATE INDEX IF NOT EXISTS idx_superhero_generations_month_year
    ON superhero_generations(month, year);

CREATE INDEX IF NOT EXISTS idx_superhero_generations_lookup
    ON superhero_generations(telegram_id, month, year);

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_superhero_generations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для автоматического обновления updated_at
DROP TRIGGER IF EXISTS trigger_superhero_generations_updated_at ON superhero_generations;
CREATE TRIGGER trigger_superhero_generations_updated_at
    BEFORE UPDATE ON superhero_generations
    FOR EACH ROW
    EXECUTE FUNCTION update_superhero_generations_updated_at();

-- RPC функция для атомарного инкремента счётчика генераций
CREATE OR REPLACE FUNCTION increment_superhero_generation_count(
    user_telegram_id TEXT,
    target_month INTEGER,
    target_year INTEGER
)
RETURNS INTEGER AS $$
DECLARE
    new_count INTEGER;
BEGIN
    -- Попытка обновления существующей записи
    UPDATE superhero_generations
    SET
        generation_count = generation_count + 1,
        last_generation_date = NOW(),
        updated_at = NOW()
    WHERE
        telegram_id = user_telegram_id
        AND month = target_month
        AND year = target_year
    RETURNING generation_count INTO new_count;

    -- Если запись не найдена, создаём новую
    IF NOT FOUND THEN
        INSERT INTO superhero_generations (
            telegram_id,
            month,
            year,
            generation_count,
            last_generation_date
        ) VALUES (
            user_telegram_id,
            target_month,
            target_year,
            1,
            NOW()
        )
        RETURNING generation_count INTO new_count;
    END IF;

    RETURN new_count;
END;
$$ LANGUAGE plpgsql;

-- Функция для получения статистики генераций пользователя
CREATE OR REPLACE FUNCTION get_user_generation_stats(user_telegram_id TEXT)
RETURNS TABLE (
    total_generations BIGINT,
    current_month_generations INTEGER,
    months_active INTEGER,
    first_generation_date TIMESTAMPTZ,
    last_generation_date TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(generation_count), 0) as total_generations,
        COALESCE(
            (SELECT generation_count
             FROM superhero_generations
             WHERE telegram_id = user_telegram_id
               AND month = EXTRACT(MONTH FROM NOW())::INTEGER
               AND year = EXTRACT(YEAR FROM NOW())::INTEGER
            ), 0
        ) as current_month_generations,
        COUNT(DISTINCT (year || '-' || LPAD(month::TEXT, 2, '0')))::INTEGER as months_active,
        MIN(created_at) as first_generation_date,
        MAX(last_generation_date) as last_generation_date
    FROM superhero_generations
    WHERE telegram_id = user_telegram_id;
END;
$$ LANGUAGE plpgsql;

-- Функция для очистки старых данных (старше 2 лет)
CREATE OR REPLACE FUNCTION cleanup_old_generation_data()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
    cutoff_date DATE;
BEGIN
    -- Удаляем записи старше 2 лет
    cutoff_date := DATE_TRUNC('month', NOW() - INTERVAL '2 years')::DATE;

    DELETE FROM superhero_generations
    WHERE DATE_TRUNC('month', MAKE_DATE(year, month, 1)) < cutoff_date;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Комментарии для документации
COMMENT ON TABLE superhero_generations IS '🦸‍♂️ Отслеживание месячных лимитов генерации супергероев';
COMMENT ON COLUMN superhero_generations.telegram_id IS 'Telegram ID пользователя';
COMMENT ON COLUMN superhero_generations.month IS 'Месяц (1-12)';
COMMENT ON COLUMN superhero_generations.year IS 'Год';
COMMENT ON COLUMN superhero_generations.generation_count IS 'Количество генераций в месяце';
COMMENT ON COLUMN superhero_generations.last_generation_date IS 'Дата последней генерации';

COMMENT ON FUNCTION increment_superhero_generation_count IS 'Атомарно увеличивает счётчик генераций';
COMMENT ON FUNCTION get_user_generation_stats IS 'Получает статистику генераций пользователя';
COMMENT ON FUNCTION cleanup_old_generation_data IS 'Очищает старые данные (>2 лет)';

-- Успешное завершение миграции
-- SELECT 'Superhero generations migration completed successfully' as status;