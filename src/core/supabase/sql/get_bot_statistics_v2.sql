CREATE OR REPLACE FUNCTION get_bot_statistics_v2(p_bot_name TEXT)
RETURNS TABLE (
    total_users INTEGER,
    paying_users INTEGER,
    total_rub_income DECIMAL,
    stars_from_rub DECIMAL,
    stars_income DECIMAL,
    stars_spent DECIMAL,
    bonus_stars DECIMAL,
    migration_stars DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    WITH user_stats AS (
        -- Считаем общее количество пользователей
        SELECT COUNT(DISTINCT u.telegram_id) as total_users,
               COUNT(DISTINCT CASE WHEN get_user_balance(u.telegram_id::text) > 0 THEN u.telegram_id END) as paying_users
        FROM users u
        WHERE u.bot_name = p_bot_name
    ),
    payment_stats AS (
        -- Статистика по платежам
        SELECT 
            COALESCE(SUM(CASE 
                WHEN payment_method = 'rub' AND status = 'COMPLETED' AND type = 'money_income' 
                THEN amount 
                ELSE 0 
            END), 0) as total_rub_income,
            
            COALESCE(SUM(CASE 
                WHEN payment_method = 'rub' AND status = 'COMPLETED' AND type = 'money_income' 
                THEN stars 
                ELSE 0 
            END), 0) as stars_from_rub,
            
            COALESCE(SUM(CASE 
                WHEN status = 'COMPLETED' AND type = 'money_income' AND payment_method != 'rub'
                THEN amount 
                ELSE 0 
            END), 0) as stars_income,
            
            COALESCE(SUM(CASE 
                WHEN status = 'COMPLETED' AND type = 'money_expense'
                THEN ABS(amount)
                ELSE 0 
            END), 0) as stars_spent,
            
            COALESCE(SUM(CASE 
                WHEN status = 'COMPLETED' AND description ILIKE '%bonus%'
                THEN amount 
                ELSE 0 
            END), 0) as bonus_stars,
            
            COALESCE(SUM(CASE 
                WHEN status = 'COMPLETED' AND description ILIKE '%migration%'
                THEN amount 
                ELSE 0 
            END), 0) as migration_stars
        FROM payments_v2
        WHERE bot_name = p_bot_name
    )
    SELECT 
        us.total_users,
        us.paying_users,
        ps.total_rub_income,
        ps.stars_from_rub,
        ps.stars_income,
        ps.stars_spent,
        ps.bonus_stars,
        ps.migration_stars
    FROM user_stats us
    CROSS JOIN payment_stats ps;
END;
$$ LANGUAGE plpgsql; 