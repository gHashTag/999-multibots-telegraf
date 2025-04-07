# КРИТИЧЕСКИ ВАЖНАЯ ДОКУМЕНТАЦИЯ ПО СИСТЕМЕ ОПЛАТЫ - НЕ ИЗМЕНЯТЬ! 🚫

## Основные SQL функции для работы с балансом

### 1. get_user_balance - ОСНОВНАЯ ФУНКЦИЯ РАСЧЕТА БАЛАНСА! ⚠️

```sql
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

    -- Получаем сумму всех транзакций для пользователя
    -- ВАЖНО: здесь расчет производится ТОЛЬКО на основе записей payment_method != 'system'
    -- Это предотвращает дублирование и неправильный расчет баланса
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
$function$
```

## Правила работы с платежной системой

1. **НИКОГДА** не изменяйте SQL-функцию `get_user_balance` без тщательного тестирования
2. **НИКОГДА** не создавайте дополнительные записи при обработке платежей с `payment_method='system'`
3. **ВСЕГДА** используйте только одну запись о платеже в `payments_v2` на одну транзакцию
4. **ВСЕГДА** проверяйте наличие существующего платежа через `operation_id` или `inv_id`

## Архитектура системы оплаты

1. **Создание платежа**:
   - Основной файл: `/src/inngest-functions/paymentProcessor.ts` 
   - Метод создания записи о платеже: `createSuccessfulPayment`
   - Не использует `updateUserBalance`, который создает дублирующие записи

2. **Обработка платежа**:
   - Баланс рассчитывается динамически из `payments_v2`
   - Используется SQL-функция `get_user_balance` для получения баланса
   - Не хранится постоянное поле баланса в таблице `users`

3. **Проверка баланса**:
   - Через функцию `/src/core/supabase/getUserBalance.ts`
   - Внутри использует SQL-функцию `get_user_balance`

## Типы транзакций

1. **money_income** - пополнение баланса (положительное значение)
2. **money_expense** - списание средств (отрицательное значение)

## Решение проблем

- **Дублирование транзакций**: Проверяйте существующие платежи по `operation_id` или `inv_id`
- **Неправильный расчет баланса**: Проверьте SQL-функцию `get_user_balance`
- **Двойное списание**: Проверьте отсутствие вызовов `updateUserBalance` после создания платежа

## ВАЖНО! 

При любых изменениях в системе оплаты обязательно обновляйте эту документацию и проводите полное тестирование на тестовой базе данных.

Дата последнего обновления: 07.04.2025
