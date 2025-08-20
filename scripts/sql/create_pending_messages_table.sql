-- Создание таблицы pending_messages для очереди уведомлений
CREATE TABLE IF NOT EXISTS pending_messages (
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

-- Создание индексов для оптимизации запросов
CREATE INDEX IF NOT EXISTS idx_pending_messages_sent ON pending_messages(sent);
CREATE INDEX IF NOT EXISTS idx_pending_messages_priority ON pending_messages(priority);
CREATE INDEX IF NOT EXISTS idx_pending_messages_created_at ON pending_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_pending_messages_telegram_id ON pending_messages(telegram_id);
CREATE INDEX IF NOT EXISTS idx_pending_messages_attempts ON pending_messages(attempts);

-- Создание функции для инкремента попыток
CREATE OR REPLACE FUNCTION increment_attempts(message_id UUID)
RETURNS INTEGER AS $$
BEGIN
    UPDATE pending_messages 
    SET attempts = attempts + 1 
    WHERE id = message_id;
    
    RETURN (SELECT attempts FROM pending_messages WHERE id = message_id);
END;
$$ LANGUAGE plpgsql;

-- Создание политики RLS (Row Level Security) если нужно
-- ALTER TABLE pending_messages ENABLE ROW LEVEL SECURITY;

-- Комментарии к таблице и полям
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