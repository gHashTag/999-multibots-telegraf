-- Create tables
CREATE TABLE IF NOT EXISTS public.users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payments_v2 (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    stars NUMERIC DEFAULT 0,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'COMPLETED',
    description TEXT,
    payment_method TEXT DEFAULT 'system',
    operation_id TEXT,
    inv_id TEXT,
    bot_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    service_type TEXT
);

-- Create balance function
CREATE OR REPLACE FUNCTION public.get_user_balance(user_telegram_id text)
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
    -- IMPORTANT: here the calculation is made ONLY based on the payment_method records != 'system'
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
    AND p.payment_method != 'system';

    RETURN v_balance;
END;
$function$;

-- Insert test user
INSERT INTO public.users (telegram_id, username, first_name, last_name)
VALUES (12345678, 'test_user', 'Test', 'User')
ON CONFLICT (telegram_id) DO NOTHING;

-- Insert test payment
INSERT INTO public.payments_v2 (telegram_id, stars, type, description, bot_name, service_type)
VALUES (12345678, 100, 'money_income', 'Initial balance for testing', 'test_bot', 'TopUpBalance')
ON CONFLICT DO NOTHING;

-- Add permissions
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments_v2 ENABLE ROW LEVEL SECURITY;

-- Create test role
CREATE ROLE anon;
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon; 