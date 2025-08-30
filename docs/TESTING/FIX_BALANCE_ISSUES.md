# 🔧 Исправление всех проблем с балансом

## 🚨 КРИТИЧЕСКИЕ ПРОБЛЕМЫ:

1. **"Неизвестно" в сервисах** - у многих пользователей
2. **Даты в будущем** (2025 вместо 2024) - проблема в данных

## ✅ РЕШЕНИЕ - ЗАПУСТИТЕ ЭТИ SQL ЗАПРОСЫ В SUPABASE:

### 1. ИСПРАВЛЕНИЕ ДЛЯ ВСЕХ ПОЛЬЗОВАТЕЛЕЙ СРАЗУ

Выполните файл `sql/fix_all_users_services.sql` в Supabase SQL Editor.

Этот скрипт:
- ✅ Исправит ВСЕ неизвестные service_type для ВСЕХ пользователей
- ✅ Обновит индексы для оптимизации
- ✅ Покажет статистику до и после исправления

### 2. ПРОВЕРКА РЕЗУЛЬТАТОВ

```sql
-- Проверка что всё исправлено
SELECT 
    service_type,
    COUNT(DISTINCT telegram_id) as users_count,
    COUNT(*) as transactions_count,
    SUM(ABS(stars)) as total_stars
FROM payments_v2
WHERE type = 'outcome'
GROUP BY service_type
ORDER BY transactions_count DESC;
```

### 3. ИСПРАВЛЕНИЕ ДАТ (если даты показывают 2025 год)

```sql
-- Проверка проблемных дат
SELECT 
    COUNT(*) as future_dates_count,
    MIN(payment_date) as earliest_future,
    MAX(payment_date) as latest_future
FROM payments_v2
WHERE payment_date > NOW();

-- Если есть даты в будущем, исправляем (вычитаем 1 год)
UPDATE payments_v2
SET payment_date = payment_date - INTERVAL '1 year',
    updated_at = NOW()
WHERE payment_date > NOW()
  AND payment_date < NOW() + INTERVAL '2 years';
```

## 📊 ПРАВИЛЬНАЯ ТЕРМИНОЛОГИЯ:

- **type = 'income'** → 📈 Пополнения (MONEY_INCOME)
- **type = 'outcome'** → 📉 Траты (MONEY_OUTCOME)

## 🎯 МАППИНГ СЕРВИСОВ:

| Старый service_type | → | Новый service_type | Название |
|-------------------|---|------------------|----------|
| video_kling_pro, video_haiper и т.д. | → | text_to_video | 📹 Генерация видео |
| model_training, neuro_train_lora_debit | → | digital_avatar_body | 🎭 Цифровой аватар |
| image_generation | → | neuro_photo | 🖼️ Нейрофото |
| image_analysis | → | image_to_prompt | 📝 Анализ изображений |
| start_scene, balance_scene и т.д. | → | payment_operation | 💳 Системная операция |

## 🚀 ПОСЛЕ ИСПРАВЛЕНИЯ:

У всех пользователей в балансе будет:
- ✅ Правильные категории вместо "Неизвестно"
- ✅ Корректные даты
- ✅ Понятные названия сервисов
- ✅ Правильная статистика

## 📞 ПРОВЕРКА:

После выполнения SQL скриптов проверьте баланс любого пользователя - все "Неизвестно" должны исчезнуть!
