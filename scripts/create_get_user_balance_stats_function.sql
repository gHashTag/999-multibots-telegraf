-- Создание SQL функции get_user_balance_stats для статистики пользователя
-- Эта функция возвращает детальную статистику баланса пользователя

CREATE OR REPLACE FUNCTION get_user_balance_stats(user_telegram_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    result JSON;
    user_info RECORD;
    balance_info RECORD;
    stats_info RECORD;
BEGIN
    -- Получаем основную информацию о пользователе
    SELECT 
        u.first_name,
        u.last_name,
        u.username,
        u.telegram_id
    INTO user_info
    FROM users u 
    WHERE u.telegram_id = user_telegram_id
    LIMIT 1;
    
    -- Получаем текущий баланс
    SELECT COALESCE(get_user_balance(user_telegram_id), 0) as balance
    INTO balance_info;
    
    -- Получаем статистику платежей
    SELECT 
        COALESCE(SUM(CASE WHEN type = 'MONEY_INCOME' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN amount ELSE 0 END), 0) as total_spent,
        COUNT(CASE WHEN type = 'MONEY_INCOME' THEN 1 END) as income_count,
        COUNT(CASE WHEN type = 'MONEY_OUTCOME' THEN 1 END) as spent_count,
        MIN(created_at) as first_payment,
        MAX(created_at) as last_payment
    INTO stats_info
    FROM payments_v2 
    WHERE telegram_id = user_telegram_id;
    
    -- Формируем JSON результат
    result := json_build_object(
        'user_telegram_id', user_telegram_id,
        'user_first_name', COALESCE(user_info.first_name, ''),
        'user_last_name', COALESCE(user_info.last_name, ''),
        'user_username', COALESCE(user_info.username, ''),
        'balance_xtr', COALESCE(balance_info.balance, 0),
        'total_income', COALESCE(stats_info.total_income, 0),
        'total_spent', COALESCE(stats_info.total_spent, 0),
        'income_count', COALESCE(stats_info.income_count, 0),
        'spent_count', COALESCE(stats_info.spent_count, 0),
        'first_payment_date', stats_info.first_payment,
        'last_payment_date', stats_info.last_payment
    );
    
    RETURN result;
END;
$$;

-- Даем права на выполнение функции
GRANT EXECUTE ON FUNCTION get_user_balance_stats(TEXT) TO anon, authenticated;

-- Комментарий к функции
COMMENT ON FUNCTION get_user_balance_stats(TEXT) IS 
'Возвращает детальную статистику баланса и платежей пользователя по telegram_id';