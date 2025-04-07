-- Миграция для удаления прямых обращений к колонке balance в таблице users
-- и обновления соответствующих функций для работы с payments_v2

-- 1. Обновляем функцию add_stars_to_balance, чтобы она не обращалась к полю balance таблицы users
CREATE OR REPLACE FUNCTION public.add_stars_to_balance(p_telegram_id bigint, p_stars numeric, p_description text, p_bot_name text, p_type text DEFAULT 'money_income'::text, p_service_type text DEFAULT 'default'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_old_balance numeric;
    v_new_balance numeric;
    v_payment_id integer;
    v_user_id uuid;
BEGIN
    -- Логируем начало операции
    RAISE NOTICE '🚀 Начало начисления % звезд для пользователя %', p_stars, p_telegram_id;

    -- Получаем текущий баланс через get_user_balance
    SELECT get_user_balance(p_telegram_id::text) INTO v_old_balance;

    -- Проверяем существование пользователя
    SELECT id INTO v_user_id
    FROM users
    WHERE telegram_id = p_telegram_id;

    -- Если пользователя нет, создаем его без поля balance
    IF v_user_id IS NULL THEN
        RAISE NOTICE '👤 Создание нового пользователя с telegram_id: %', p_telegram_id;
        INSERT INTO users (telegram_id, last_payment_date, bot_name)
        VALUES (p_telegram_id, NOW(), p_bot_name);
    END IF;

    -- Создаем запись о начислении в payments_v2
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
        p_stars,  -- Сумма равна количеству звезд
        'COMPLETED',
        'system',
        p_description,
        jsonb_build_object(
            'type', 'system_add',
            'old_balance', v_old_balance,
            'added_stars', p_stars,
            'service_type', p_service_type
        ),
        p_stars,
        p_telegram_id,
        'STARS',
        'none',
        p_bot_name,
        'ru',
        p_type::operation_type  -- Приводим к типу operation_type
    )
    RETURNING payment_id INTO v_payment_id;

    -- Получаем новый баланс через get_user_balance
    SELECT get_user_balance(p_telegram_id::text) INTO v_new_balance;

    RETURN jsonb_build_object(
        'payment_id', v_payment_id,
        'old_balance', v_old_balance,
        'new_balance', v_new_balance,
        'success', true
    );
END;
$function$;

-- 2. Удаляем устаревшие версии функции add_stars_to_balance
DROP FUNCTION IF EXISTS public.add_stars_to_balance(bigint, integer, text, text);
DROP FUNCTION IF EXISTS public.add_stars_to_balance(bigint, integer, text, text, text, text);

-- 3. Обновляем триггерную функцию sync_user_balance, чтобы она не обновляла поле balance
DROP FUNCTION IF EXISTS public.sync_user_balance();

-- 4. Обновляем функцию fix_user_balance, чтобы она работала с payments_v2 вместо поля balance
CREATE OR REPLACE FUNCTION public.fix_user_balance(p_telegram_id text, p_bot_name text)
 RETURNS TABLE(old_balance numeric, new_balance numeric, difference numeric)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_old_balance DECIMAL;
    v_new_balance DECIMAL;
BEGIN
    -- Получаем текущий баланс
    SELECT get_user_balance(p_telegram_id) INTO v_old_balance;

    -- Вычисляем актуальный баланс из транзакций
    v_new_balance := calculate_user_balance(p_telegram_id::bigint, p_bot_name);

    -- Создаем корректирующую транзакцию, если есть расхождение
    IF v_old_balance != v_new_balance THEN
        -- Если текущий баланс меньше расчетного, нужно добавить звезды (income)
        -- Если текущий баланс больше расчетного, нужно вычесть звезды (outcome)
        INSERT INTO payments_v2 (
            telegram_id,
            amount,
            stars,
            type,
            status,
            description,
            bot_name,
            metadata,
            payment_method,
            payment_date,
            currency
        ) VALUES (
            p_telegram_id::bigint,
            ABS(v_new_balance - v_old_balance),
            ABS(v_new_balance - v_old_balance),
            CASE WHEN v_old_balance < v_new_balance THEN 'money_income'::operation_type ELSE 'money_expense'::operation_type END,
            'COMPLETED',
            'Корректировка баланса: исправление расхождения между фактическим балансом и расчетным значением',
            p_bot_name,
            jsonb_build_object(
                'correction', true,
                'old_balance', v_old_balance,
                'calculated_balance', v_new_balance,
                'difference', v_old_balance - v_new_balance
            ),
            'System',
            NOW(),
            'STARS'
        );
    END IF;

    -- Возвращаем обновленный баланс
    SELECT get_user_balance(p_telegram_id) INTO v_new_balance;

    -- Возвращаем результат
    RETURN QUERY SELECT 
        v_old_balance,
        v_new_balance,
        (v_old_balance - v_new_balance);
END;
$function$;

-- 5. Обновляем функцию migrate_user_balance, чтобы она не использовала поле balance
DROP FUNCTION IF EXISTS public.migrate_user_balance(bigint);

-- 6. Обновляем функцию migrate_user_balances
DROP FUNCTION IF EXISTS public.migrate_user_balances(); 