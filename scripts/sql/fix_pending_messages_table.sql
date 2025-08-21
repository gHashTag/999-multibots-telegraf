-- 🔧 ИСПРАВЛЕНИЕ ТАБЛИЦЫ PENDING_MESSAGES
-- Дата: 2025-01-27
-- Проблема: Таблица существует, но без колонки 'sent' и других важных полей

-- ===== ВАРИАНТ 1: БЕЗОПАСНОЕ ИСПРАВЛЕНИЕ (РЕКОМЕНДУЕТСЯ) =====

-- Проверяем существующую структуру таблицы
SELECT 
    'Текущая структура таблицы pending_messages:' as info,
    column_name, 
    data_type, 
    is_nullable, 
    column_default 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'pending_messages'
ORDER BY ordinal_position;

-- Добавляем недостающие колонки (безопасно)
ALTER TABLE pending_messages 
ADD COLUMN IF NOT EXISTS sent BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE pending_messages 
ADD COLUMN IF NOT EXISTS error TEXT NULL;

ALTER TABLE pending_messages 
ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE pending_messages 
ADD COLUMN IF NOT EXISTS last_attempt TIMESTAMP WITH TIME ZONE NULL;

-- Проверяем и добавляем отсутствующие колонки основной структуры
ALTER TABLE pending_messages 
ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'general';

ALTER TABLE pending_messages 
ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium';

-- Добавляем ограничение для priority если его нет
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name = 'pending_messages_priority_check'
        AND table_name = 'pending_messages'
    ) THEN
        ALTER TABLE pending_messages 
        ADD CONSTRAINT pending_messages_priority_check 
        CHECK (priority IN ('high', 'medium', 'low'));
    END IF;
END$$;

-- Создание индексов (безопасно)
CREATE INDEX IF NOT EXISTS idx_pending_messages_sent ON pending_messages(sent);
CREATE INDEX IF NOT EXISTS idx_pending_messages_priority ON pending_messages(priority);
CREATE INDEX IF NOT EXISTS idx_pending_messages_created_at ON pending_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_pending_messages_telegram_id ON pending_messages(telegram_id);
CREATE INDEX IF NOT EXISTS idx_pending_messages_attempts ON pending_messages(attempts);

-- Создание/обновление функции для инкремента попыток
CREATE OR REPLACE FUNCTION increment_attempts(message_id UUID)
RETURNS INTEGER AS $$
BEGIN
    UPDATE pending_messages 
    SET attempts = attempts + 1 
    WHERE id = message_id;
    
    RETURN (SELECT attempts FROM pending_messages WHERE id = message_id);
END;
$$ LANGUAGE plpgsql;

-- Добавляем комментарии к таблице и колонкам
COMMENT ON TABLE pending_messages IS 'Очередь уведомлений для отправки пользователям';
COMMENT ON COLUMN pending_messages.id IS 'Уникальный идентификатор сообщения';
COMMENT ON COLUMN pending_messages.telegram_id IS 'Telegram ID пользователя';
COMMENT ON COLUMN pending_messages.message IS 'Текст сообщения для отправки';
COMMENT ON COLUMN pending_messages.message_type IS 'Тип сообщения (compensation_notification, general, etc.)';
COMMENT ON COLUMN pending_messages.created_at IS 'Время создания записи';
COMMENT ON COLUMN pending_messages.priority IS 'Приоритет отправки (high, medium, low)';
COMMENT ON COLUMN pending_messages.attempts IS 'Количество попыток отправки';
COMMENT ON COLUMN pending_messages.last_attempt IS 'Время последней попытки отправки';
COMMENT ON COLUMN pending_messages.sent IS 'Флаг успешной отправки';
COMMENT ON COLUMN pending_messages.error IS 'Описание ошибки при отправке';

-- Финальная проверка структуры таблицы
SELECT 
    '✅ ИСПРАВЛЕННАЯ структура таблицы pending_messages:' as info,
    column_name, 
    data_type, 
    is_nullable, 
    column_default 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'pending_messages'
ORDER BY ordinal_position;

-- ===== ВАРИАНТ 2: РАДИКАЛЬНОЕ ПЕРЕСОЗДАНИЕ (ТОЛЬКО В КРАЙНЕМ СЛУЧАЕ!) =====
-- РАСКОММЕНТИРУЙ ТОЛЬКО ЕСЛИ ВАРИАНТ 1 НЕ СРАБОТАЛ!

/*
-- ⚠️  ОСТОРОЖНО: Это удалит все существующие данные!
DROP TABLE IF EXISTS pending_messages CASCADE;

-- Создание полной таблицы заново
CREATE TABLE pending_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id TEXT NOT NULL,
    message TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'general',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt TIMESTAMP WITH TIME ZONE NULL,
    sent BOOLEAN NOT NULL DEFAULT false,
    error TEXT NULL
);

-- Создание всех индексов
CREATE INDEX IF NOT EXISTS idx_pending_messages_sent ON pending_messages(sent);
CREATE INDEX IF NOT EXISTS idx_pending_messages_priority ON pending_messages(priority);
CREATE INDEX IF NOT EXISTS idx_pending_messages_created_at ON pending_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_pending_messages_telegram_id ON pending_messages(telegram_id);
CREATE INDEX IF NOT EXISTS idx_pending_messages_attempts ON pending_messages(attempts);

-- Создание функции
CREATE OR REPLACE FUNCTION increment_attempts(message_id UUID)
RETURNS INTEGER AS $$
BEGIN
    UPDATE pending_messages 
    SET attempts = attempts + 1 
    WHERE id = message_id;
    
    RETURN (SELECT attempts FROM pending_messages WHERE id = message_id);
END;
$$ LANGUAGE plpgsql;
*/ 