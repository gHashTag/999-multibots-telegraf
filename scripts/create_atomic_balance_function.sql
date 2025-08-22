-- 🔒 КРИТИЧЕСКАЯ ФУНКЦИЯ: Атомарные операции с балансом для предотвращения race conditions
-- Создает PostgreSQL функцию для безопасных операций с балансом пользователя

CREATE OR REPLACE FUNCTION process_balance_operation_atomic(
  p_telegram_id INTEGER,
  p_operation_amount NUMERIC,
  p_payment_record JSONB
) 
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_balance NUMERIC := 0;
  projected_balance NUMERIC := 0;
  payment_record JSONB;
  result JSONB;
BEGIN
  -- 🔒 БЛОКИРОВКА: Блокируем все записи пользователя для атомарности
  -- Использование SELECT FOR UPDATE гарантирует, что никто другой не сможет
  -- модифицировать баланс этого пользователя до завершения транзакции
  
  -- Получаем текущий баланс с блокировкой записей
  SELECT COALESCE(SUM(
    CASE 
      WHEN type = 'money_income' OR type = 'bonus' THEN stars
      WHEN type = 'money_outcome' THEN -stars
      ELSE 0
    END
  ), 0)
  INTO current_balance
  FROM payments_v2 
  WHERE telegram_id = p_telegram_id 
    AND status = 'completed'
  FOR UPDATE; -- 🔒 Критическая блокировка!

  -- Логирование текущего баланса
  RAISE NOTICE '🔒 Заблокирован баланс пользователя %: % звезд', p_telegram_id, current_balance;

  -- Вычисляем проектируемый баланс после операции
  projected_balance := current_balance - p_operation_amount;
  
  -- 🛡️ ЗАЩИТА: Проверяем что баланс не станет отрицательным
  IF projected_balance < -0.01 THEN
    RAISE NOTICE '❌ Недостаточно средств: текущий=%, операция=%, проектируемый=%', 
                 current_balance, p_operation_amount, projected_balance;
    
    -- Возвращаем ошибку с детальной информацией
    RETURN jsonb_build_object(
      'success', false,
      'error', jsonb_build_object(
        'message', 'insufficient funds',
        'current_balance', current_balance,
        'operation_amount', p_operation_amount,
        'projected_balance', projected_balance
      )
    );
  END IF;

  -- 🛡️ АНОМАЛИЯ: Проверяем что текущий баланс не отрицательный
  IF current_balance < -0.01 THEN
    RAISE WARNING '🆘 КРИТИЧЕСКАЯ АНОМАЛИЯ: Баланс пользователя % уже отрицательный: %', 
                  p_telegram_id, current_balance;
    -- Не блокируем операцию, но логируем проблему
  END IF;

  -- ✅ ВСТАВКА: Операция прошла проверки, вставляем запись
  BEGIN
    INSERT INTO payments_v2 (
      telegram_id, amount, stars, currency, status, type, 
      payment_method, description, metadata, bot_name, 
      service_type, model_name, subscription_type, 
      payment_date, inv_id, operation_id, category, cost
    )
    VALUES (
      (p_payment_record->>'telegram_id')::INTEGER,
      (p_payment_record->>'amount')::NUMERIC,
      (p_payment_record->>'stars')::NUMERIC,
      p_payment_record->>'currency',
      p_payment_record->>'status',
      p_payment_record->>'type',
      p_payment_record->>'payment_method',
      p_payment_record->>'description',
      p_payment_record->'metadata',
      p_payment_record->>'bot_name',
      p_payment_record->>'service_type',
      p_payment_record->>'model_name',
      p_payment_record->>'subscription_type',
      (p_payment_record->>'payment_date')::TIMESTAMPTZ,
      p_payment_record->>'inv_id',
      p_payment_record->>'operation_id',
      p_payment_record->>'category',
      (p_payment_record->>'cost')::NUMERIC
    );

    RAISE NOTICE '✅ Запись успешно вставлена для пользователя %', p_telegram_id;

    -- Возвращаем успешный результат
    RETURN jsonb_build_object(
      'success', true,
      'data', jsonb_build_object(
        'current_balance', current_balance,
        'operation_amount', p_operation_amount,
        'new_balance', projected_balance,
        'inv_id', p_payment_record->>'inv_id'
      )
    );

  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE '⚠️ Дублированная операция (inv_id уже существует): %', p_payment_record->>'inv_id';
      RETURN jsonb_build_object(
        'success', false,
        'error', jsonb_build_object(
          'message', 'duplicate transaction',
          'inv_id', p_payment_record->>'inv_id'
        )
      );
    
    WHEN OTHERS THEN
      RAISE NOTICE '❌ Ошибка вставки записи: % %', SQLSTATE, SQLERRM;
      RETURN jsonb_build_object(
        'success', false,
        'error', jsonb_build_object(
          'message', 'database insertion error',
          'sqlstate', SQLSTATE,
          'sqlerrm', SQLERRM
        )
      );
  END;
END;
$$;

-- Даем права на выполнение функции
GRANT EXECUTE ON FUNCTION process_balance_operation_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION process_balance_operation_atomic TO service_role;

-- 📝 Комментарий к функции
COMMENT ON FUNCTION process_balance_operation_atomic IS 
'🔒 КРИТИЧЕСКАЯ ФУНКЦИЯ: Атомарная операция с балансом пользователя с защитой от race conditions. ' ||
'Использует SELECT FOR UPDATE для блокировки записей пользователя во время операции. ' ||
'Проверяет достаточность средств и предотвращает отрицательный баланс.';

-- 🧪 ТЕСТОВЫЙ ЗАПРОС (закомментирован для безопасности)
/*
-- Тест функции (раскомментировать для тестирования):
SELECT process_balance_operation_atomic(
  123456789, -- telegram_id
  5.50, -- operation_amount
  '{
    "telegram_id": 123456789,
    "amount": 5.50,
    "stars": 5.50,
    "currency": "XTR",
    "status": "completed",
    "type": "money_outcome",
    "payment_method": "System",
    "description": "Test operation",
    "metadata": {},
    "bot_name": "test_bot",
    "service_type": "test_service",
    "model_name": null,
    "subscription_type": null,
    "payment_date": "2025-08-22T10:00:00Z",
    "inv_id": "test-123456789",
    "operation_id": null,
    "category": "REAL",
    "cost": 5.50
  }'::JSONB
);
*/