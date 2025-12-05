# 🚀 ПРОСТАЯ УСТАНОВКА ОПТИМИЗАЦИИ БАЛАНСА

## ШАГ 1: Открой Supabase Dashboard

1. Зайди в свой Supabase проект: https://app.supabase.com
2. Слева в меню найди **"SQL Editor"** (иконка `</>`)

## ШАГ 2: Создай новый запрос

1. Нажми кнопку **"+ New query"** вверху
2. Появится пустое окно для SQL

## ШАГ 3: Установи основную функцию

1. Открой файл: `sql/balance_functions_part1.sql`
2. Скопируй ВСЁ содержимое (Cmd+A, Cmd+C)
3. Вставь в SQL Editor в Supabase (Cmd+V)
4. Нажми кнопку **"Run"** (зеленая кнопка) или Cmd+Enter

✅ Должно появиться сообщение "Success. No rows returned"

## ШАГ 4: Добавь индексы для скорости

1. Нажми **"+ New query"** для нового запроса
2. Открой файл: `sql/balance_functions_part2_indexes.sql`
3. Скопируй всё и вставь в новый запрос
4. Нажми **"Run"**

✅ Должно появиться "Success"

## ШАГ 5: Протестируй

1. Нажми **"+ New query"** 
2. Вставь этот код (замени 223757230 на свой telegram_id):

```sql
SELECT * FROM get_user_balance_stats_optimized(223757230);
```

3. Нажми **"Run"**

✅ Должны появиться данные в формате JSON

## 🎉 ГОТОВО!

Теперь бот автоматически будет использовать оптимизированные функции!

## ❓ Если что-то не работает:

### Ошибка "function does not exist"
- Убедись, что выполнил ШАГ 3
- Проверь, что функция создалась: 
```sql
SELECT proname FROM pg_proc WHERE proname = 'get_user_balance_stats_optimized';
```

### Ошибка "relation payments_v2 does not exist"
- Проверь, что у тебя есть таблица payments_v2:
```sql
SELECT * FROM payments_v2 LIMIT 1;
```

### Нет данных в ответе
- Проверь, что используешь правильный telegram_id
- Проверь, что есть транзакции:
```sql
SELECT COUNT(*) FROM payments_v2 WHERE telegram_id = 223757230;
```

## 📞 Нужна помощь?

Если что-то не получается - скинь скриншот ошибки, помогу разобраться!
