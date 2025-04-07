-- Исправление функции get_user_balance для учета всех транзакций, включая системные
-- Обеспечение единого метода расчета баланса во всей системе
CREATE OR REPLACE FUNCTION public.get_user_balance(user_telegram_id text)
RETURNS numeric
LANGUAGE plpgsql
AS $function$
DECLARE
    v_balance numeric := 0;
    v_user_id bigint;
BEGIN
    -- Преобразуем telegram_id в числовой формат
    BEGIN
        v_user_id := user_telegram_id::bigint;
    EXCEPTION WHEN OTHERS THEN
        RETURN 0;
    END;

    -- Используем тот же алгоритм, что и в get_user_balance_stats
    -- Важное отличие от предыдущей версии:
    -- 1. Убран фильтр p.payment_method != 'system'
    -- 2. Добавлен учет транзакций типа 'system'
    -- 3. Изменено вычисление для money_expense (убран ABS)
    SELECT COALESCE(SUM(
        CASE WHEN p.status = 'COMPLETED' THEN 
            CASE 
                WHEN p.type = 'money_income' OR p.type = 'system' THEN COALESCE(p.stars, 0)
                WHEN p.type = 'money_expense' THEN -COALESCE(p.stars, 0)
                ELSE 0
            END
        ELSE 0 END
    ), 0) INTO v_balance
    FROM payments_v2 p
    WHERE p.telegram_id = v_user_id;

    RETURN v_balance;
END;
$function$;

-- Добавим комментарий к функции
COMMENT ON FUNCTION public.get_user_balance IS 'Рассчитывает общий баланс пользователя на основе всех транзакций в payments_v2, включая системные транзакции. Алгоритм идентичен используемому в get_user_balance_stats.';

-- Тестирование корректности обновления
DO $$
DECLARE
    v_test_id text := '144022504';
    v_balance_func numeric;
    v_balance_stats numeric;
BEGIN
    -- Получаем балансы из обеих функций
    SELECT get_user_balance(v_test_id) INTO v_balance_func;
    SELECT (get_user_balance_stats(v_test_id)->>'stars')::numeric INTO v_balance_stats;
    
    -- Проверяем совпадение результатов
    IF v_balance_func != v_balance_stats THEN
        RAISE EXCEPTION 'Балансы не совпадают: get_user_balance = %, get_user_balance_stats->stars = %', 
                        v_balance_func, v_balance_stats;
    ELSE
        RAISE NOTICE 'Тестирование успешно: оба метода возвращают одинаковый баланс = %', v_balance_func;
    END IF;
END;
$$;

-- Обновление всех мест, где может быть закэширован старый расчет
-- Это поможет избежать несоответствий после изменения функции
BEGIN;
    -- Любые дополнительные действия для обновления данных после изменения функции
    -- Например, обновление кэшированных данных, если они есть
COMMIT; 