-- Удаляем устаревшие функции для работы с балансом
DROP FUNCTION IF EXISTS public.get_user_balance(p_telegram_id text, p_bot_name text);
DROP FUNCTION IF EXISTS public.update_user_balance(p_new_balance numeric, p_telegram_id text);

-- Добавляем комментарий о миграции
COMMENT ON SCHEMA public IS 'Removed deprecated balance functions in favor of using getUserBalance TypeScript function';

-- Создаем новую функцию для обработки платежей
CREATE OR REPLACE FUNCTION public.process_payment(
    p_telegram_id BIGINT,
    p_amount NUMERIC,
    p_type TEXT,
    p_description TEXT,
    p_bot_name TEXT,
    p_operation_id TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
DECLARE
    v_payment_id INTEGER;
    v_old_balance NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    -- Логируем начало операции
    RAISE NOTICE '🚀 Начало обработки платежа для %', p_telegram_id;

    -- Получаем текущий баланс
    SELECT COALESCE(SUM(amount), 0) INTO v_old_balance
    FROM payments_v2 
    WHERE telegram_id = p_telegram_id
    AND status = 'COMPLETED';

    -- Создаем запись о платеже
    INSERT INTO payments_v2 (
        telegram_id,
        amount,
        type,
        description,
        bot_name,
        status,
        metadata,
        payment_date,
        inv_id
    ) VALUES (
        p_telegram_id,
        p_amount,
        p_type,
        p_description,
        p_bot_name,
        'COMPLETED',
        p_metadata || jsonb_build_object(
            'operation_id', p_operation_id,
            'old_balance', v_old_balance
        ),
        NOW(),
        p_operation_id
    )
    RETURNING payment_id INTO v_payment_id;

    -- Получаем новый баланс
    SELECT COALESCE(SUM(amount), 0) INTO v_new_balance
    FROM payments_v2 
    WHERE telegram_id = p_telegram_id
    AND status = 'COMPLETED';

    -- Логируем результат операции
    RAISE NOTICE '✅ Платеж обработан. Старый баланс: %, Новый баланс: %', 
        v_old_balance, v_new_balance;

    -- Возвращаем результат
    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'old_balance', v_old_balance,
        'new_balance', v_new_balance,
        'amount', p_amount,
        'operation_id', p_operation_id
    );

EXCEPTION WHEN OTHERS THEN
    -- В случае ошибки возвращаем информацию об ошибке
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'error_detail', SQLSTATE
    );
END;
$$ LANGUAGE plpgsql; 