-- ==========================================
-- INSTAGRAM PARSING DATABASE TABLES
-- ==========================================

-- Таблица для хранения найденных похожих пользователей Instagram
CREATE TABLE IF NOT EXISTS instagram_similar_users (
    id SERIAL PRIMARY KEY,
    instagram_user_id VARCHAR(255) NOT NULL,
    username VARCHAR(255) NOT NULL,
    full_name TEXT,
    followers_count INTEGER DEFAULT 0,
    following_count INTEGER DEFAULT 0,
    media_count INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    is_private BOOLEAN DEFAULT FALSE,
    profile_pic_url TEXT,
    bio TEXT,
    external_url TEXT,
    category VARCHAR(255),
    is_business_account BOOLEAN DEFAULT FALSE,
    similarity_score DECIMAL(5,2),
    project_id INTEGER NOT NULL,
    target_username VARCHAR(255) NOT NULL,
    analysis_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Уникальная связка пользователь + проект
    UNIQUE(instagram_user_id, project_id),
    
    -- Индексы для быстрого поиска
    INDEX idx_instagram_users_project_id (project_id),
    INDEX idx_instagram_users_username (username),
    INDEX idx_instagram_users_target_username (target_username),
    INDEX idx_instagram_users_similarity_score (similarity_score DESC),
    INDEX idx_instagram_users_followers_count (followers_count DESC),
    INDEX idx_instagram_users_created_at (created_at DESC)
);

-- Таблица для хранения рилсов пользователей Instagram
CREATE TABLE IF NOT EXISTS instagram_user_reels (
    id SERIAL PRIMARY KEY,
    reel_id VARCHAR(255) NOT NULL,
    shortcode VARCHAR(255) NOT NULL,
    instagram_user_id VARCHAR(255) NOT NULL,
    caption TEXT,
    media_url TEXT NOT NULL,
    thumbnail_url TEXT,
    video_duration INTEGER,
    view_count BIGINT,
    like_count INTEGER,
    comment_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    hashtags JSONB DEFAULT '[]',
    mentions JSONB DEFAULT '[]',
    project_id INTEGER NOT NULL,
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Уникальная связка рилс + проект
    UNIQUE(reel_id, project_id),
    
    -- Индексы для быстрого поиска
    INDEX idx_instagram_reels_project_id (project_id),
    INDEX idx_instagram_reels_user_id (instagram_user_id),
    INDEX idx_instagram_reels_shortcode (shortcode),
    INDEX idx_instagram_reels_view_count (view_count DESC NULLS LAST),
    INDEX idx_instagram_reels_like_count (like_count DESC NULLS LAST),
    INDEX idx_instagram_reels_created_at (created_at DESC),
    INDEX idx_instagram_reels_scraped_at (scraped_at DESC)
);

-- Таблица для подписок на мониторинг конкурентов
CREATE TABLE IF NOT EXISTS competitor_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_telegram_id VARCHAR(255) NOT NULL,
    bot_name VARCHAR(255) NOT NULL,
    competitor_username VARCHAR(255) NOT NULL,
    max_reels INTEGER NOT NULL DEFAULT 10 CHECK (max_reels >= 1 AND max_reels <= 50),
    min_views INTEGER NOT NULL DEFAULT 1000 CHECK (min_views >= 0),
    max_age_days INTEGER NOT NULL DEFAULT 7 CHECK (max_age_days >= 1 AND max_age_days <= 30),
    delivery_format VARCHAR(50) NOT NULL DEFAULT 'digest' CHECK (delivery_format IN ('digest', 'individual', 'archive')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_delivery TIMESTAMP WITH TIME ZONE,
    
    -- Индексы для быстрого поиска
    INDEX idx_competitor_subscriptions_user_bot (user_telegram_id, bot_name),
    INDEX idx_competitor_subscriptions_competitor (competitor_username),
    INDEX idx_competitor_subscriptions_active (is_active),
    INDEX idx_competitor_subscriptions_last_delivery (last_delivery DESC NULLS LAST),
    INDEX idx_competitor_subscriptions_created_at (created_at DESC)
);

-- ==========================================
-- VIEWS FOR ANALYTICS
-- ==========================================

-- Представление для аналитики по проектам
CREATE OR REPLACE VIEW instagram_project_analytics AS
SELECT 
    p.id as project_id,
    p.name as project_name,
    p.industry,
    COUNT(DISTINCT isu.instagram_user_id) as total_competitors_found,
    COUNT(DISTINCT iur.reel_id) as total_reels_analyzed,
    AVG(isu.followers_count) as avg_competitor_followers,
    MAX(isu.followers_count) as max_competitor_followers,
    AVG(isu.similarity_score) as avg_similarity_score,
    COUNT(DISTINCT isu.target_username) as unique_targets_analyzed,
    MAX(isu.created_at) as last_analysis_date
FROM projects p
LEFT JOIN instagram_similar_users isu ON p.id = isu.project_id
LEFT JOIN instagram_user_reels iur ON p.id = iur.project_id
GROUP BY p.id, p.name, p.industry;

-- Представление для топ конкурентов по проектам
CREATE OR REPLACE VIEW instagram_top_competitors AS
SELECT 
    isu.project_id,
    isu.username,
    isu.full_name,
    isu.followers_count,
    isu.media_count,
    isu.similarity_score,
    isu.is_verified,
    isu.is_business_account,
    COUNT(iur.reel_id) as total_reels,
    AVG(iur.view_count) as avg_reel_views,
    MAX(iur.view_count) as best_reel_views,
    ROW_NUMBER() OVER (PARTITION BY isu.project_id ORDER BY isu.similarity_score DESC, isu.followers_count DESC) as rank_in_project
FROM instagram_similar_users isu
LEFT JOIN instagram_user_reels iur ON isu.instagram_user_id = iur.instagram_user_id 
    AND isu.project_id = iur.project_id
GROUP BY isu.project_id, isu.username, isu.full_name, isu.followers_count, 
         isu.media_count, isu.similarity_score, isu.is_verified, isu.is_business_account;

-- Представление для активных подписок с аналитикой
CREATE OR REPLACE VIEW active_competitor_subscriptions AS
SELECT 
    cs.*,
    COUNT(iur.reel_id) as total_reels_tracked,
    MAX(iur.scraped_at) as last_reel_date,
    COUNT(CASE WHEN iur.created_at >= NOW() - INTERVAL '1 day' * cs.max_age_days THEN 1 END) as recent_reels_count,
    AVG(iur.view_count) as avg_recent_views
FROM competitor_subscriptions cs
LEFT JOIN instagram_user_reels iur ON cs.competitor_username = (
    SELECT username FROM instagram_similar_users WHERE instagram_user_id = iur.instagram_user_id LIMIT 1
)
WHERE cs.is_active = TRUE
GROUP BY cs.id, cs.user_telegram_id, cs.bot_name, cs.competitor_username, 
         cs.max_reels, cs.min_views, cs.max_age_days, cs.delivery_format, 
         cs.is_active, cs.created_at, cs.updated_at, cs.last_delivery;

-- ==========================================
-- FUNCTIONS FOR DATA MANAGEMENT
-- ==========================================

-- Функция для очистки старых данных (старше 90 дней)
CREATE OR REPLACE FUNCTION cleanup_old_instagram_data(retention_days INTEGER DEFAULT 90)
RETURNS TABLE (
    deleted_users INTEGER,
    deleted_reels INTEGER
) AS $$
DECLARE
    deleted_users_count INTEGER := 0;
    deleted_reels_count INTEGER := 0;
BEGIN
    -- Удаляем старые рилсы
    WITH deleted_reels AS (
        DELETE FROM instagram_user_reels 
        WHERE scraped_at < NOW() - INTERVAL '1 day' * retention_days
        RETURNING 1
    )
    SELECT COUNT(*) INTO deleted_reels_count FROM deleted_reels;
    
    -- Удаляем пользователей без рилсов и старше retention_days
    WITH deleted_users AS (
        DELETE FROM instagram_similar_users isu
        WHERE isu.created_at < NOW() - INTERVAL '1 day' * retention_days
        AND NOT EXISTS (
            SELECT 1 FROM instagram_user_reels iur 
            WHERE iur.instagram_user_id = isu.instagram_user_id 
            AND iur.project_id = isu.project_id
        )
        RETURNING 1
    )
    SELECT COUNT(*) INTO deleted_users_count FROM deleted_users;
    
    RETURN QUERY SELECT deleted_users_count, deleted_reels_count;
END;
$$ LANGUAGE plpgsql;

-- Функция для получения статистики по подпискам пользователя
CREATE OR REPLACE FUNCTION get_user_subscription_stats(user_tg_id VARCHAR, bot VARCHAR)
RETURNS TABLE (
    total_subscriptions INTEGER,
    active_subscriptions INTEGER,
    inactive_subscriptions INTEGER,
    total_competitors_tracked INTEGER,
    avg_reels_per_competitor NUMERIC,
    last_delivery_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_subscriptions,
        COUNT(CASE WHEN is_active THEN 1 END)::INTEGER as active_subscriptions,
        COUNT(CASE WHEN NOT is_active THEN 1 END)::INTEGER as inactive_subscriptions,
        COUNT(DISTINCT competitor_username)::INTEGER as total_competitors_tracked,
        AVG(max_reels)::NUMERIC as avg_reels_per_competitor,
        MAX(last_delivery) as last_delivery_date
    FROM competitor_subscriptions
    WHERE user_telegram_id = user_tg_id AND bot_name = bot;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- ==========================================

-- Триггер для автоматического обновления updated_at в competitor_subscriptions
CREATE OR REPLACE FUNCTION update_competitor_subscription_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_competitor_subscription_timestamp
    BEFORE UPDATE ON competitor_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_competitor_subscription_timestamp();

-- Триггер для автоматического обновления updated_at в instagram_similar_users
CREATE OR REPLACE FUNCTION update_instagram_user_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_instagram_user_timestamp
    BEFORE UPDATE ON instagram_similar_users
    FOR EACH ROW
    EXECUTE FUNCTION update_instagram_user_timestamp();

-- ==========================================
-- INITIAL DATA AND CONSTRAINTS
-- ==========================================

-- Добавляем ограничения на количество активных подписок на пользователя
-- (это лучше контролировать в приложении, но можно добавить и на уровне БД)

-- Комментарии для документации
COMMENT ON TABLE instagram_similar_users IS 'Найденные похожие пользователи Instagram для каждого проекта';
COMMENT ON TABLE instagram_user_reels IS 'Рилсы пользователей Instagram с метаданными и аналитикой';
COMMENT ON TABLE competitor_subscriptions IS 'Подписки пользователей на автоматический мониторинг конкурентов';

COMMENT ON COLUMN instagram_similar_users.similarity_score IS 'Оценка схожести с целевым пользователем (0-100)';
COMMENT ON COLUMN instagram_similar_users.analysis_metadata IS 'Дополнительные данные анализа в формате JSON';
COMMENT ON COLUMN competitor_subscriptions.max_reels IS 'Максимальное количество рилсов для мониторинга (1-50)';
COMMENT ON COLUMN competitor_subscriptions.min_views IS 'Минимальное количество просмотров для включения в отчёт';
COMMENT ON COLUMN competitor_subscriptions.max_age_days IS 'Максимальный возраст рилсов в днях (1-30)';
COMMENT ON COLUMN competitor_subscriptions.delivery_format IS 'Формат доставки: digest, individual, archive';