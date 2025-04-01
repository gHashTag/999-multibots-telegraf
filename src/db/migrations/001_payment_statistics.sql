-- Создаем тип для категорий платежей
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_category') THEN
        CREATE TYPE payment_category AS ENUM (
            'migration',
            'bonus',
            'rub_purchase',
            'stars_purchase'
        );
    END IF;
END $$;

-- Функция для категоризации платежей
CREATE OR REPLACE FUNCTION public.categorize_payment(
    p_payment_method text,
    p_payment_type text,
    p_metadata jsonb,
    p_currency text
) RETURNS payment_category AS $$
BEGIN
    -- Миграционные платежи
    IF NULLIF(p_payment_method, '') = 'system_migration' OR 
       (p_metadata IS NOT NULL AND (p_metadata->>'migration')::boolean = true) THEN
        RETURN 'migration'::payment_category;
    
    -- Бонусные начисления
    ELSIF NULLIF(p_payment_type, '') = 'bonus' OR 
          NULLIF(p_payment_method, '') = 'Bonus' OR
          (p_metadata IS NOT NULL AND p_metadata->>'campaign' LIKE '%bonus%') THEN
        RETURN 'bonus'::payment_category;
    
    -- Покупки за рубли
    ELSIF (p_metadata IS NOT NULL AND p_metadata->>'currency' = 'RUB') OR 
          NULLIF(p_payment_method, '') = 'Robokassa' OR
          NULLIF(p_payment_method, '') = 'Telegram' OR
          (p_metadata IS NOT NULL AND p_metadata->>'ru_amount' IS NOT NULL AND (p_metadata->>'ru_amount')::decimal > 0) THEN
        RETURN 'rub_purchase'::payment_category;
    
    -- Все остальные транзакции - покупки за звезды
    ELSE
        RETURN 'stars_purchase'::payment_category;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Функция для получения статистики бота
CREATE OR REPLACE FUNCTION public.get_bot_statistics(p_bot_name text)
RETURNS TABLE (
    total_users bigint,
    paying_users bigint,
    total_rub_income decimal,
    stars_from_rub bigint,
    stars_income bigint,
    bonus_stars bigint,
    migration_stars bigint,
    migration_rub decimal,
    stars_spent bigint
) AS $$
BEGIN
    RETURN QUERY
    WITH payment_stats AS (
        SELECT
            CASE
                WHEN payment_method = 'system_migration' OR (metadata->>'migration')::boolean = true THEN 'migration'
                WHEN payment_type = 'bonus' OR payment_method = 'Bonus' OR (metadata->>'campaign' LIKE '%bonus%') THEN 'bonus'
                WHEN (metadata->>'currency' = 'RUB') OR payment_method IN ('Robokassa', 'Telegram') OR 
                     (metadata->>'ru_amount' IS NOT NULL AND (metadata->>'ru_amount')::decimal > 0) THEN 'rub_purchase'
                ELSE 'stars_purchase'
            END::payment_category as category,
            COALESCE(stars, 0)::bigint as stars,
            COALESCE(
                CASE 
                    WHEN metadata->>'ru_amount' IS NOT NULL THEN (metadata->>'ru_amount')::decimal
                    ELSE amount::decimal
                END,
                0
            ) as amount,
            type,
            telegram_id
        FROM payments
        WHERE bot_name = p_bot_name
    ),
    user_stats AS (
        SELECT COUNT(DISTINCT telegram_id)::bigint as total_users
        FROM users
        WHERE bot_name = p_bot_name
    ),
    paying_users_stats AS (
        SELECT COUNT(DISTINCT telegram_id)::bigint as paying_users
        FROM payment_stats
        WHERE type = 'income' 
          AND category IN ('rub_purchase', 'stars_purchase')
          AND telegram_id IS NOT NULL
    ),
    income_stats AS (
        SELECT
            SUM(CASE WHEN category = 'rub_purchase' THEN amount ELSE 0 END)::decimal as total_rub_income,
            SUM(CASE WHEN category = 'rub_purchase' THEN stars ELSE 0 END)::bigint as stars_from_rub,
            SUM(CASE WHEN category = 'stars_purchase' THEN stars ELSE 0 END)::bigint as stars_income,
            SUM(CASE WHEN category = 'bonus' THEN stars ELSE 0 END)::bigint as bonus_stars,
            SUM(CASE WHEN category = 'migration' THEN stars ELSE 0 END)::bigint as migration_stars,
            SUM(CASE WHEN category = 'migration' THEN amount ELSE 0 END)::decimal as migration_rub
        FROM payment_stats
        WHERE type = 'income'
    ),
    outcome_stats AS (
        SELECT COALESCE(SUM(stars), 0)::bigint as stars_spent
        FROM payment_stats
        WHERE type = 'outcome'
    )
    SELECT
        COALESCE(us.total_users, 0)::bigint,
        COALESCE(pus.paying_users, 0)::bigint,
        COALESCE(inc_stats.total_rub_income, 0)::decimal,
        COALESCE(inc_stats.stars_from_rub, 0)::bigint,
        COALESCE(inc_stats.stars_income, 0)::bigint,
        COALESCE(inc_stats.bonus_stars, 0)::bigint,
        COALESCE(inc_stats.migration_stars, 0)::bigint,
        COALESCE(inc_stats.migration_rub, 0)::decimal,
        COALESCE(os.stars_spent, 0)::bigint
    FROM user_stats us
    LEFT JOIN paying_users_stats pus ON true
    LEFT JOIN income_stats inc_stats ON true
    LEFT JOIN outcome_stats os ON true;
END;
$$ LANGUAGE plpgsql; 