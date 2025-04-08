CREATE OR REPLACE FUNCTION public.get_user_balance(user_telegram_id text, p_bot_name text DEFAULT NULL::text)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_balance numeric := 0;
    v_user_id bigint;
BEGIN
    -- Convert telegram_id to numeric format
    BEGIN
        v_user_id := user_telegram_id::bigint;
    EXCEPTION WHEN OTHERS THEN
        RETURN 0;
    END;

    -- Get the sum of all transactions for the user
    -- IMPORTANT: calculation is based ONLY on payment_method != 'system' records
    -- This prevents duplication and incorrect balance calculation
    SELECT COALESCE(SUM(
        CASE WHEN p.status = 'COMPLETED' THEN 
            CASE 
                WHEN p.type = 'money_income' THEN COALESCE(p.stars, 0)
                WHEN p.type = 'money_expense' THEN -COALESCE(ABS(p.stars), 0)
                ELSE 0
            END
        ELSE 0 END
    ), 0) INTO v_balance
    FROM payments_v2 p
    WHERE p.telegram_id = v_user_id
    AND p.payment_method != 'system'
    AND (p_bot_name IS NULL OR p.bot_name = p_bot_name)
    AND (p.metadata->>'test' IS NULL OR p.metadata->>'test' != 'true');

    RETURN v_balance;
END;
$function$ 