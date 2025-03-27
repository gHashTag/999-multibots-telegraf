DROP FUNCTION IF EXISTS get_user_balance(text);

CREATE OR REPLACE FUNCTION get_user_balance(user_telegram_id TEXT)
RETURNS NUMERIC AS $$
SELECT COALESCE(
  SUM(CASE WHEN type = 'income' THEN stars ELSE -stars END),
  0
)
FROM payments
WHERE telegram_id = user_telegram_id::bigint
AND status = 'COMPLETED'
$$ LANGUAGE SQL;