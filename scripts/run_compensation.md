# 🔄 Инструкция по запуску компенсации за двойное списание средств

## 📋 Подготовка к запуску

### 1. Создание таблицы pending_messages
Сначала необходимо создать таблицу для очереди уведомлений:

```bash
# Выполните SQL скрипт для создания таблицы
psql -h db.yuukfqcsdhkyxegfwlcb.supabase.co -U postgres -f scripts/create_pending_messages_table.sql
```

### 2. Проверка подключения к базе данных
Убедитесь, что скрипт может подключиться к Supabase:

```bash
# Проверьте переменные окружения
echo "SUPABASE_URL: $SUPABASE_URL"
echo "SUPABASE_ANON_KEY: $SUPABASE_ANON_KEY"
```

## 🚀 Запуск компенсации

### Шаг 1: Запуск скрипта анализа и компенсации
```bash
# Запуск скрипта компенсации
bun run src/scripts/compensateDoubleBilling.ts

# Или используя Node.js
node -r ts-node/register src/scripts/compensateDoubleBilling.ts
```

### Шаг 2: Мониторинг процесса
Скрипт будет выводить подробную информацию о процессе:

```
🚀 Запуск скрипта компенсации за двойное списание средств
🔍 Анализ дублирующих транзакций за последние 2 недели...
📊 Найдено X групп дублирующих транзакций
💰 Начинаем компенсацию пострадавших пользователей...
💳 Компенсация для пользователя XXXXXXXX:
  - original_amount: -XX
  - duplicate_count: 2
  - refund_amount: XX
  - bonus_stars: 500
✅ Компенсация для пользователя XXXXXXXX завершена успешно
📨 Отправка уведомлений пострадавшим пользователям...
✅ Уведомление для пользователя XXXXXXXX добавлено в очередь
```

### Шаг 3: Проверка результатов
```bash
# Проверьте лог выполнения
tail -f node-app.log

# Проверьте таблицу pending_messages
psql -h db.yuukfqcsdhkyxegfwlcb.supabase.co -U postgres -c "SELECT * FROM pending_messages WHERE message_type = 'compensation_notification';"
```

## 📊 Ожидаемые результаты

### Итоговый отчет
После выполнения скрипт выведет итоговый отчет:

```
📊 Итоговый отчет компенсации:
✅ Успешно компенсировано: X пользователей
❌ Неудачные компенсации: X пользователей
💰 Общая сумма возврата: XXXX звезд
🎁 Общая сумма бонусов: XXXX звезд
📈 Итого зачислено: XXXX звезд
```

### Что происходит с пострадавшими пользователями:
1. **Возврат средств**: Возвращается сумма, которая была списана дважды
2. **Бонусные звезды**: Каждый пострадавший получает 500 бонусных звезд
3. **Уведомление**: Отправляется персональное сообщение о компенсации
4. **Запись в БД**: Все операции логируются в таблице `payments_v2`

## 🔄 Автоматическая отправка уведомлений

После запуска компенсации уведомления будут автоматически отправляться через бот:

- **Интервал обработки**: каждую минуту
- **Приоритет**: high (высокий)
- **Повторные попытки**: до 3 раз при неудаче
- **Автоочистка**: старые сообщения удаляются через 7 дней

## 🛠️ Диагностика проблем

### Если скрипт не находит дублирующие транзакции:
```bash
# Проверьте вручную наличие дубликатов
psql -h db.yuukfqcsdhkyxegfwlcb.supabase.co -U postgres -c "
SELECT 
  telegram_id,
  amount,
  description,
  created_at,
  COUNT(*) as count
FROM payments_v2 
WHERE created_at >= NOW() - INTERVAL '14 days'
  AND amount < 0
  AND description LIKE '%video%'
GROUP BY telegram_id, amount, description, created_at
HAVING COUNT(*) > 1
ORDER BY created_at DESC;
"
```

### Если компенсация не проходит:
1. Проверьте баланс системы
2. Убедитесь, что функция `updateUserBalance` работает корректно
3. Проверьте логи на наличие ошибок Supabase

### Если уведомления не отправляются:
1. Убедитесь, что бот запущен
2. Проверьте таблицу `pending_messages` на наличие сообщений
3. Проверьте логи бота на ошибки отправки

## ⚠️ Важные замечания

1. **Безопасность**: Скрипт проверяет данные перед обработкой
2. **Идемпотентность**: Повторный запуск не создаст дубликаты компенсации
3. **Логирование**: Все операции детально логируются
4. **Откат**: В случае критических ошибок можно отменить транзакции по логам

## 🔍 Проверка после выполнения

```bash
# Проверка успешности компенсации
psql -h db.yuukfqcsdhkyxegfwlcb.supabase.co -U postgres -c "
SELECT 
  COUNT(*) as compensations_count,
  SUM(amount) as total_refunded
FROM payments_v2 
WHERE description LIKE '%Компенсация за двойное списание%'
  AND created_at >= NOW() - INTERVAL '1 day';
"

# Проверка бонусных начислений
psql -h db.yuukfqcsdhkyxegfwlcb.supabase.co -U postgres -c "
SELECT 
  COUNT(*) as bonus_count,
  SUM(amount) as total_bonus
FROM payments_v2 
WHERE description LIKE '%Бонусная компенсация за неудобства%'
  AND created_at >= NOW() - INTERVAL '1 day';
"
``` 