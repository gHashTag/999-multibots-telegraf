-- =============================================================================
-- Оптимизированные функции для работы с балансом пользователей
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Функция для получения детализированной статистики по балансу пользователя
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_balance_stats_optimized(
    p_telegram_id BIGINT,
    p_bot_name TEXT DEFAULT NULL,
    p_limit_services INT DEFAULT 10,
    p_limit_transactions INT DEFAULT 5
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_result JSON;
    v_current_balance NUMERIC;
    v_total_real_income NUMERIC;
    v_total_bonus_income NUMERIC;
    v_total_outcome NUMERIC;
    v_total_transactions INT;
    v_rubles_income RECORD;
    v_telegram_stars_income RECORD;
    v_services_stats JSON;
    v_recent_topups JSON;
    v_recent_expenses JSON;
BEGIN
    -- Начинаем транзакцию для консистентного чтения
    SET TRANSACTION ISOLATION LEVEL READ COMMITTED READ ONLY;
    
    -- Получаем основные суммы одним запросом с использованием FILTER
    SELECT 
        COALESCE(SUM(stars) FILTER (WHERE type = 'MONEY_INCOME' AND category = 'REAL'), 0) AS total_real_income,
        COALESCE(SUM(stars) FILTER (WHERE type = 'MONEY_INCOME' AND category = 'BONUS'), 0) AS total_bonus_income,
        COALESCE(SUM(stars) FILTER (WHERE type = 'MONEY_OUTCOME' AND category = 'REAL'), 0) AS total_outcome,
        COUNT(*) AS total_transactions
    INTO 
        v_total_real_income,
        v_total_bonus_income,
        v_total_outcome,
        v_total_transactions
    FROM payments_v2
    WHERE 
        telegram_id = p_telegram_id
        AND status = 'COMPLETED'
        AND (p_bot_name IS NULL OR bot_name = p_bot_name);
    
    -- Рассчитываем текущий баланс
    v_current_balance := v_total_real_income + v_total_bonus_income - v_total_outcome;
    
    -- Получаем разбивку по способам пополнения (рубли)
    SELECT 
        COALESCE(SUM(stars), 0) AS stars,
        COALESCE(SUM(amount), 0) AS amount,
        COUNT(*) AS count
    INTO v_rubles_income
    FROM payments_v2
    WHERE 
        telegram_id = p_telegram_id
        AND status = 'COMPLETED'
        AND type = 'MONEY_INCOME'
        AND category = 'REAL'
        AND currency = 'RUB'
        AND payment_method IN ('Robokassa', 'Manual')
        AND (p_bot_name IS NULL OR bot_name = p_bot_name);
    
    -- Получаем разбивку по способам пополнения (Telegram Stars)
    SELECT 
        COALESCE(SUM(stars), 0) AS stars,
        COUNT(*) AS count
    INTO v_telegram_stars_income
    FROM payments_v2
    WHERE 
        telegram_id = p_telegram_id
        AND status = 'COMPLETED'
        AND type = 'MONEY_INCOME'
        AND category = 'REAL'
        AND currency IN ('XTR', 'STARS')
        AND payment_method = 'Telegram'
        AND (p_bot_name IS NULL OR bot_name = p_bot_name);
    
    -- Получаем статистику по сервисам с агрегацией
    WITH service_stats AS (
        SELECT 
            COALESCE(
                CASE 
                    WHEN service_type = 'text_to_image' AND description LIKE '%DALLE%' THEN 'DALLE'
                    WHEN service_type = 'text_to_image' AND description LIKE '%Midjourney%' THEN 'Midjourney'
                    WHEN service_type = 'text_to_image' AND description LIKE '%Stable Diffusion%' THEN 'Stable Diffusion'
                    WHEN service_type = 'text_to_image' AND description LIKE '%Leonardo%' THEN 'Leonardo'
                    WHEN service_type = 'image_to_video' THEN 'Image to Video'
                    WHEN service_type = 'text_to_video' THEN 'Text to Video'
                    WHEN service_type = 'voice_generation' THEN 'Voice Generation'
                    WHEN service_type = 'model_training' THEN 'Model Training'
                    WHEN service_type = 'lip_sync' THEN 'Lip Sync'
                    ELSE INITCAP(REPLACE(service_type, '_', ' '))
                END,
                'Unknown Service'
            ) AS service_display_name,
            COUNT(*) AS transaction_count,
            SUM(stars) AS total_stars,
            AVG(stars) AS avg_stars,
            MAX(payment_date) AS last_used
        FROM payments_v2
        WHERE 
            telegram_id = p_telegram_id
            AND status = 'COMPLETED'
            AND type = 'MONEY_OUTCOME'
            AND (p_bot_name IS NULL OR bot_name = p_bot_name)
        GROUP BY service_display_name
        ORDER BY total_stars DESC
        LIMIT p_limit_services
    )
    SELECT json_agg(
        json_build_object(
            'service', service_display_name,
            'count', transaction_count,
            'total_stars', ROUND(total_stars::NUMERIC, 2),
            'avg_stars', ROUND(avg_stars::NUMERIC, 2),
            'percentage', CASE 
                WHEN v_total_outcome > 0 
                THEN ROUND((total_stars / v_total_outcome * 100)::NUMERIC, 1)
                ELSE 0
            END,
            'last_used', last_used
        )
    ) INTO v_services_stats
    FROM service_stats;
    
    -- Получаем последние пополнения
    WITH recent_topups AS (
        SELECT 
            payment_date,
            stars,
            amount,
            currency,
            payment_method,
            description
        FROM payments_v2
        WHERE 
            telegram_id = p_telegram_id
            AND status = 'COMPLETED'
            AND type = 'MONEY_INCOME'
            AND category = 'REAL'
            AND (p_bot_name IS NULL OR bot_name = p_bot_name)
        ORDER BY payment_date DESC
        LIMIT p_limit_transactions
    )
    SELECT json_agg(
        json_build_object(
            'date', payment_date,
            'stars', ROUND(stars::NUMERIC, 2),
            'amount', ROUND(COALESCE(amount, 0)::NUMERIC, 2),
            'currency', currency,
            'payment_method', payment_method,
            'description', description
        )
    ) INTO v_recent_topups
    FROM recent_topups;
    
    -- Получаем последние расходы
    WITH recent_expenses AS (
        SELECT 
            payment_date,
            stars,
            service_type,
            description,
            CASE 
                WHEN service_type = 'text_to_image' AND description LIKE '%DALLE%' THEN 'DALLE'
                WHEN service_type = 'text_to_image' AND description LIKE '%Midjourney%' THEN 'Midjourney'
                WHEN service_type = 'text_to_image' AND description LIKE '%Stable Diffusion%' THEN 'Stable Diffusion'
                WHEN service_type = 'text_to_image' AND description LIKE '%Leonardo%' THEN 'Leonardo'
                WHEN service_type = 'image_to_video' THEN 'Image to Video'
                WHEN service_type = 'text_to_video' THEN 'Text to Video'
                WHEN service_type = 'voice_generation' THEN 'Voice Generation'
                WHEN service_type = 'model_training' THEN 'Model Training'
                WHEN service_type = 'lip_sync' THEN 'Lip Sync'
                ELSE INITCAP(REPLACE(service_type, '_', ' '))
            END AS service_display_name
        FROM payments_v2
        WHERE 
            telegram_id = p_telegram_id
            AND status = 'COMPLETED'
            AND type = 'MONEY_OUTCOME'
            AND (p_bot_name IS NULL OR bot_name = p_bot_name)
        ORDER BY payment_date DESC
        LIMIT p_limit_transactions
    )
    SELECT json_agg(
        json_build_object(
            'date', payment_date,
            'stars', ROUND(stars::NUMERIC, 2),
            'service', service_display_name,
            'description', description
        )
    ) INTO v_recent_expenses
    FROM recent_expenses;
    
    -- Формируем итоговый результат
    v_result := json_build_object(
        'current_balance', ROUND(v_current_balance, 2),
        'total_real_income', ROUND(v_total_real_income, 2),
        'total_bonus_income', ROUND(v_total_bonus_income, 2),
        'total_outcome', ROUND(v_total_outcome, 2),
        'total_transactions', v_total_transactions,
        'payment_methods', json_build_object(
            'rubles', json_build_object(
                'stars', ROUND(v_rubles_income.stars::NUMERIC, 2),
                'amount', ROUND(v_rubles_income.amount::NUMERIC, 2),
                'count', v_rubles_income.count
            ),
            'telegram_stars', json_build_object(
                'stars', ROUND(v_telegram_stars_income.stars::NUMERIC, 2),
                'count', v_telegram_stars_income.count
            )
        ),
        'services_breakdown', COALESCE(v_services_stats, '[]'::JSON),
        'recent_topups', COALESCE(v_recent_topups, '[]'::JSON),
        'recent_expenses', COALESCE(v_recent_expenses, '[]'::JSON)
    );
    
    RETURN v_result;
END;
$$;

-- Добавляем комментарий к функции
COMMENT ON FUNCTION get_user_balance_stats_optimized IS 
'Оптимизированная функция для получения полной статистики баланса пользователя. 
Возвращает JSON с текущим балансом, разбивкой по типам пополнений, статистикой по сервисам и последними операциями.';

-- -----------------------------------------------------------------------------
-- 2. Функция для получения статистики по всем пользователям (для админки)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_bot_statistics_summary(
    p_bot_name TEXT,
    p_start_date TIMESTAMP DEFAULT NULL,
    p_end_date TIMESTAMP DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_result JSON;
    v_date_filter TEXT := '';
BEGIN
    -- Формируем фильтр по датам если указаны
    IF p_start_date IS NOT NULL THEN
        v_date_filter := v_date_filter || ' AND payment_date >= ''' || p_start_date || '''';
    END IF;
    
    IF p_end_date IS NOT NULL THEN
        v_date_filter := v_date_filter || ' AND payment_date <= ''' || p_end_date || '''';
    END IF;
    
    -- Используем динамический SQL для применения фильтров
    EXECUTE format('
        WITH stats AS (
            SELECT 
                COUNT(DISTINCT telegram_id) AS unique_users,
                COUNT(*) AS total_transactions,
                SUM(CASE WHEN type = ''MONEY_INCOME'' AND category = ''REAL'' THEN stars ELSE 0 END) AS total_income,
                SUM(CASE WHEN type = ''MONEY_OUTCOME'' THEN stars ELSE 0 END) AS total_outcome,
                SUM(CASE WHEN type = ''MONEY_OUTCOME'' THEN COALESCE(cost, 0) ELSE 0 END) AS total_cost,
                SUM(CASE WHEN type = ''MONEY_INCOME'' AND category = ''BONUS'' THEN stars ELSE 0 END) AS total_bonuses
            FROM payments_v2
            WHERE 
                bot_name = $1
                AND status = ''COMPLETED''
                %s
        ),
        top_users AS (
            SELECT 
                telegram_id,
                COUNT(*) AS transactions,
                SUM(CASE WHEN type = ''MONEY_OUTCOME'' THEN stars ELSE 0 END) AS spent
            FROM payments_v2
            WHERE 
                bot_name = $1
                AND status = ''COMPLETED''
                %s
            GROUP BY telegram_id
            ORDER BY spent DESC
            LIMIT 10
        ),
        service_breakdown AS (
            SELECT 
                service_type,
                COUNT(*) AS count,
                SUM(stars) AS revenue,
                SUM(COALESCE(cost, 0)) AS cost
            FROM payments_v2
            WHERE 
                bot_name = $1
                AND status = ''COMPLETED''
                AND type = ''MONEY_OUTCOME''
                %s
            GROUP BY service_type
            ORDER BY revenue DESC
        )
        SELECT json_build_object(
            ''summary'', (SELECT row_to_json(stats) FROM stats),
            ''top_users'', (SELECT json_agg(row_to_json(top_users)) FROM top_users),
            ''services'', (SELECT json_agg(row_to_json(service_breakdown)) FROM service_breakdown),
            ''period'', json_build_object(
                ''start'', $2,
                ''end'', $3
            )
        )
    ', v_date_filter, v_date_filter, v_date_filter)
    INTO v_result
    USING p_bot_name, p_start_date, p_end_date;
    
    RETURN v_result;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Создание индексов для оптимизации запросов
-- -----------------------------------------------------------------------------

-- Составной индекс для основных запросов баланса
CREATE INDEX IF NOT EXISTS idx_payments_v2_balance_queries 
ON payments_v2(telegram_id, status, type, category, bot_name, payment_date DESC)
WHERE status = 'COMPLETED';

-- Индекс для группировки по сервисам
CREATE INDEX IF NOT EXISTS idx_payments_v2_service_stats 
ON payments_v2(telegram_id, service_type, status, type)
WHERE status = 'COMPLETED' AND type = 'MONEY_OUTCOME';

-- Индекс для фильтрации по способам оплаты
CREATE INDEX IF NOT EXISTS idx_payments_v2_payment_methods 
ON payments_v2(telegram_id, payment_method, currency, status)
WHERE status = 'COMPLETED' AND type = 'MONEY_INCOME';

-- Частичный индекс для быстрого подсчета активных транзакций
CREATE INDEX IF NOT EXISTS idx_payments_v2_completed 
ON payments_v2(bot_name, payment_date DESC)
WHERE status = 'COMPLETED';

-- -----------------------------------------------------------------------------
-- 4. Материализованное представление для дневной статистики
-- -----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_balance_stats AS
SELECT 
    bot_name,
    DATE(payment_date) as date,
    COUNT(DISTINCT telegram_id) as unique_users,
    COUNT(*) as total_transactions,
    SUM(CASE WHEN type = 'MONEY_INCOME' AND category = 'REAL' THEN stars ELSE 0 END) as daily_income,
    SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN stars ELSE 0 END) as daily_outcome,
    SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN COALESCE(cost, 0) ELSE 0 END) as daily_cost,
    SUM(CASE WHEN type = 'MONEY_INCOME' AND category = 'BONUS' THEN stars ELSE 0 END) as daily_bonuses,
    
    -- Разбивка по сервисам
    jsonb_object_agg(
        COALESCE(service_type, 'income'),
        json_build_object(
            'count', COUNT(*) FILTER (WHERE service_type IS NOT NULL OR type = 'MONEY_INCOME'),
            'stars', SUM(stars) FILTER (WHERE service_type IS NOT NULL OR type = 'MONEY_INCOME')
        )
    ) as services_breakdown
    
FROM payments_v2
WHERE status = 'COMPLETED'
GROUP BY bot_name, DATE(payment_date);

-- Индекс для материализованного представления
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_balance_stats_unique 
ON daily_balance_stats(bot_name, date);

CREATE INDEX IF NOT EXISTS idx_daily_balance_stats_date 
ON daily_balance_stats(date DESC);

-- -----------------------------------------------------------------------------
-- 5. Функция для обновления материализованного представления
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_daily_balance_stats()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY daily_balance_stats;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Функция для получения трендов и аналитики
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_balance_trends(
    p_telegram_id BIGINT,
    p_period TEXT DEFAULT 'week', -- 'day', 'week', 'month', 'year'
    p_bot_name TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_result JSON;
    v_interval INTERVAL;
BEGIN
    -- Определяем интервал в зависимости от периода
    CASE p_period
        WHEN 'day' THEN v_interval := INTERVAL '1 day';
        WHEN 'week' THEN v_interval := INTERVAL '7 days';
        WHEN 'month' THEN v_interval := INTERVAL '30 days';
        WHEN 'year' THEN v_interval := INTERVAL '365 days';
        ELSE v_interval := INTERVAL '7 days';
    END CASE;
    
    WITH period_stats AS (
        SELECT 
            DATE_TRUNC(
                CASE 
                    WHEN p_period = 'day' THEN 'hour'
                    WHEN p_period = 'week' THEN 'day'
                    WHEN p_period = 'month' THEN 'day'
                    WHEN p_period = 'year' THEN 'month'
                    ELSE 'day'
                END,
                payment_date
            ) AS period,
            SUM(CASE WHEN type = 'MONEY_INCOME' THEN stars ELSE 0 END) AS income,
            SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN stars ELSE 0 END) AS outcome,
            COUNT(*) AS transactions
        FROM payments_v2
        WHERE 
            telegram_id = p_telegram_id
            AND status = 'COMPLETED'
            AND payment_date >= CURRENT_TIMESTAMP - v_interval
            AND (p_bot_name IS NULL OR bot_name = p_bot_name)
        GROUP BY period
        ORDER BY period
    ),
    service_trends AS (
        SELECT 
            service_type,
            COUNT(*) AS usage_count,
            SUM(stars) AS total_spent,
            array_agg(
                json_build_object(
                    'date', payment_date,
                    'stars', stars
                )
                ORDER BY payment_date DESC
            ) AS history
        FROM payments_v2
        WHERE 
            telegram_id = p_telegram_id
            AND status = 'COMPLETED'
            AND type = 'MONEY_OUTCOME'
            AND payment_date >= CURRENT_TIMESTAMP - v_interval
            AND (p_bot_name IS NULL OR bot_name = p_bot_name)
        GROUP BY service_type
    )
    SELECT json_build_object(
        'period', p_period,
        'timeline', (
            SELECT json_agg(
                json_build_object(
                    'period', period,
                    'income', ROUND(income::NUMERIC, 2),
                    'outcome', ROUND(outcome::NUMERIC, 2),
                    'balance', ROUND((income - outcome)::NUMERIC, 2),
                    'transactions', transactions
                )
                ORDER BY period
            )
            FROM period_stats
        ),
        'service_trends', (
            SELECT json_agg(
                json_build_object(
                    'service', service_type,
                    'usage_count', usage_count,
                    'total_spent', ROUND(total_spent::NUMERIC, 2),
                    'avg_per_use', ROUND((total_spent / usage_count)::NUMERIC, 2)
                )
                ORDER BY total_spent DESC
            )
            FROM service_trends
        ),
        'summary', (
            SELECT json_build_object(
                'total_income', ROUND(SUM(CASE WHEN type = 'MONEY_INCOME' THEN stars ELSE 0 END)::NUMERIC, 2),
                'total_outcome', ROUND(SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN stars ELSE 0 END)::NUMERIC, 2),
                'transaction_count', COUNT(*),
                'avg_transaction', ROUND(AVG(stars)::NUMERIC, 2)
            )
            FROM payments_v2
            WHERE 
                telegram_id = p_telegram_id
                AND status = 'COMPLETED'
                AND payment_date >= CURRENT_TIMESTAMP - v_interval
                AND (p_bot_name IS NULL OR bot_name = p_bot_name)
        )
    ) INTO v_result;
    
    RETURN v_result;
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. Политики безопасности RLS (Row Level Security)
-- -----------------------------------------------------------------------------

-- Включаем RLS для таблицы payments_v2 если еще не включен
ALTER TABLE payments_v2 ENABLE ROW LEVEL SECURITY;

-- Политика для чтения своих данных
CREATE POLICY IF NOT EXISTS "Users can view own payments" 
ON payments_v2 
FOR SELECT 
USING (
    telegram_id::TEXT = current_setting('app.telegram_id', true)
    OR current_setting('app.is_admin', true) = 'true'
);

-- -----------------------------------------------------------------------------
-- 8. Функция для массовой оптимизации старых данных
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION optimize_payment_data()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Обновляем статистику таблицы для оптимизатора запросов
    ANALYZE payments_v2;
    
    -- Обновляем материализованное представление
    REFRESH MATERIALIZED VIEW CONCURRENTLY daily_balance_stats;
    
    -- Очищаем старые неподтвержденные транзакции (старше 30 дней)
    DELETE FROM payments_v2 
    WHERE status = 'PENDING' 
    AND created_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
    
    RAISE NOTICE 'Payment data optimization completed';
END;
$$;

-- -----------------------------------------------------------------------------
-- Настройка прав доступа
-- -----------------------------------------------------------------------------

-- Даем права на выполнение функций authenticated пользователям
GRANT EXECUTE ON FUNCTION get_user_balance_stats_optimized TO authenticated;
GRANT EXECUTE ON FUNCTION get_balance_trends TO authenticated;
GRANT EXECUTE ON FUNCTION get_bot_statistics_summary TO authenticated;

-- Даем права на чтение материализованного представления
GRANT SELECT ON daily_balance_stats TO authenticated;

-- -----------------------------------------------------------------------------
-- Создание триггера для автоматического обновления материализованного представления
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_refresh_daily_stats()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Обновляем материализованное представление асинхронно через pg_cron или вручную
    -- Для production рекомендуется использовать pg_cron для периодического обновления
    PERFORM pg_notify('refresh_daily_stats', 'update_needed');
    RETURN NEW;
END;
$$;

-- Триггер срабатывает при вставке новых записей
CREATE TRIGGER update_daily_stats_on_payment
AFTER INSERT OR UPDATE ON payments_v2
FOR EACH STATEMENT
EXECUTE FUNCTION trigger_refresh_daily_stats();
