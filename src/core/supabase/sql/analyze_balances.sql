-- Анализ структуры таблицы payments
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'payments'
ORDER BY ordinal_position;

-- Анализ структуры таблицы users
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'users'
ORDER BY ordinal_position;

-- Анализ последних 10 записей в payments
SELECT 
    telegram_id,
    amount,
    stars,
    type,
    status,
    description,
    created_at,
    payment_method,
    bot_name
FROM payments
ORDER BY created_at DESC
LIMIT 10;

-- Анализ пользователей с ненулевым балансом
SELECT 
    u.telegram_id,
    u.balance as user_balance,
    COALESCE(SUM(CASE WHEN p.type = 'income' THEN p.stars ELSE -p.stars END), 0) as calculated_balance,
    COUNT(p.id) as payments_count
FROM users u
LEFT JOIN payments p ON u.telegram_id = p.telegram_id AND p.status = 'COMPLETED'
WHERE u.balance > 0
GROUP BY u.telegram_id, u.balance
HAVING u.balance != COALESCE(SUM(CASE WHEN p.type = 'income' THEN p.stars ELSE -p.stars END), 0)
ORDER BY u.telegram_id;

-- Анализ расхождений в балансах
WITH user_balances AS (
    SELECT 
        telegram_id,
        balance as user_balance
    FROM users
),
payment_balances AS (
    SELECT 
        telegram_id,
        COALESCE(SUM(CASE WHEN type = 'income' THEN stars ELSE -stars END), 0) as payment_balance
    FROM payments
    WHERE status = 'COMPLETED'
    GROUP BY telegram_id
)
SELECT 
    u.telegram_id,
    u.user_balance,
    p.payment_balance,
    CASE 
        WHEN u.user_balance != p.payment_balance THEN 'РАСХОЖДЕНИЕ'
        ELSE 'СОВПАДАЕТ'
    END as status
FROM user_balances u
LEFT JOIN payment_balances p ON u.telegram_id = p.telegram_id
WHERE u.user_balance > 0
ORDER BY u.telegram_id; 