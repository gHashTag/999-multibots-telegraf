-- ============================================
-- ЧАСТЬ 1: Основная функция для баланса
-- Скопируй и выполни это в SQL Editor Supabase
-- ============================================

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
    -- Получаем основные суммы одним запросом
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
    
    -- Получаем разбивку по рублям
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
    
    -- Получаем разбивку по Telegram Stars
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
    
    -- Получаем статистику по сервисам
    WITH service_stats AS (
        SELECT 
            COALESCE(service_type, 'Unknown') AS service_display_name,
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
        GROUP BY service_type
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
            description
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
            'service', COALESCE(service_type, 'Unknown'),
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
