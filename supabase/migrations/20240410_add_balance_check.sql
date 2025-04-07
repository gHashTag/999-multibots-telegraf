-- Четвертая версия функции add_stars_to_balance с проверкой наличия достаточного баланса
CREATE OR REPLACE FUNCTION public.add_stars_to_balance_with_check(
    p_telegram_id bigint, 
    p_stars numeric, 
    p_description text, 
    p_bot_name text, 
    p_type text DEFAULT 'money_income'::text, 
    p_service_type text DEFAULT 'default'::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_old_balance numeric;
    v_new_balance numeric;
    v_payment_id integer;
    v_user_id integer;
    v_error_message text;
BEGIN
    -- Логируем начало операции
    RAISE NOTICE '🚀 Начало операции со звездами (% звезд) для пользователя %', p_stars, p_telegram_id;

    -- Получаем текущий баланс и ID пользователя
    SELECT balance, id INTO v_old_balance, v_user_id
    FROM users
    WHERE telegram_id = p_telegram_id;

    -- Проверяем, существует ли пользователь
    IF v_user_id IS NULL THEN
        -- Если пользователя нет и это списание, возвращаем ошибку
        IF p_type = 'money_expense' AND p_stars < 0 THEN
            v_error_message := format('Пользователь с telegram_id %s не найден', p_telegram_id);
            RAISE NOTICE '⚠️ %', v_error_message;
            
            RETURN jsonb_build_object(
                'success', false,
                'error', v_error_message,
                'old_balance', NULL,
                'new_balance', NULL
            );
        END IF;
        
        -- Если пользователя нет и это пополнение, создаем его
        RAISE NOTICE '👤 Создание нового пользователя с telegram_id: %', p_telegram_id;
        INSERT INTO users (telegram_id, balance, last_payment_date, bot_name)
        VALUES (p_telegram_id, 0, NOW(), p_bot_name)
        RETURNING id, balance INTO v_user_id, v_old_balance;
    END IF;
    
    -- Проверяем достаточно ли средств при списании
    IF p_type = 'money_expense' AND v_old_balance < ABS(p_stars) THEN
        v_error_message := format('Недостаточно средств. Текущий баланс: %s, требуется: %s', 
                                 v_old_balance, ABS(p_stars));
        RAISE NOTICE '⚠️ %', v_error_message;
        
        -- Создаем запись о неудачной попытке списания
        INSERT INTO payments_v2 (
            payment_date,
            amount,
            status,
            payment_method,
            description,
            metadata,
            stars,
            telegram_id,
            currency,
            subscription,
            bot_name,
            language,
            type
        ) VALUES (
            NOW(),
            p_stars,
            'FAILED',
            'system',
            p_description || ' (Недостаточно средств)',
            jsonb_build_object(
                'type', 'system_deduction_failed',
                'error', 'insufficient_funds',
                'old_balance', v_old_balance,
                'requested_stars', p_stars,
                'service_type', p_service_type,
                'user_id', v_user_id
            ),
            p_stars,
            p_telegram_id,
            'STARS',
            'none',
            p_bot_name,
            'ru',
            p_type::operation_type
        );
        
        RETURN jsonb_build_object(
            'success', false,
            'error', 'insufficient_funds',
            'error_message', v_error_message,
            'old_balance', v_old_balance,
            'requested_amount', p_stars,
            'user_id', v_user_id
        );
    END IF;

    -- Создаем запись об операции в payments_v2
    INSERT INTO payments_v2 (
        payment_date,
        amount,
        status,
        payment_method,
        description,
        metadata,
        stars,
        telegram_id,
        currency,
        subscription,
        bot_name,
        language,
        type
    ) VALUES (
        NOW(),
        p_stars,
        'COMPLETED',
        'system',
        p_description,
        jsonb_build_object(
            'type', CASE WHEN p_stars >= 0 THEN 'system_add' ELSE 'system_deduction' END,
            'old_balance', v_old_balance,
            'stars_change', p_stars,
            'service_type', p_service_type,
            'user_id', v_user_id
        ),
        p_stars,
        p_telegram_id,
        'STARS',
        'none',
        p_bot_name,
        'ru',
        p_type::operation_type
    )
    RETURNING payment_id INTO v_payment_id;

    -- Обновляем баланс пользователя
    UPDATE users 
    SET 
        balance = COALESCE(balance, 0) + p_stars,
        last_payment_date = NOW()
    WHERE telegram_id = p_telegram_id
    RETURNING balance INTO v_new_balance;

    RETURN jsonb_build_object(
        'payment_id', v_payment_id,
        'old_balance', v_old_balance,
        'new_balance', v_new_balance,
        'success', true,
        'user_id', v_user_id
    );
END;
$function$; 