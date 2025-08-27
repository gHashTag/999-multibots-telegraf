# 🔧 Исправление "Неизвестных" сервисов в балансе

## 🔍 Проблема
В статистике баланса появляется много записей с типом "❓ Неизвестно". Это происходит из-за того, что в базе данных есть старые записи с устаревшими значениями `service_type`.

## 📊 Причины появления "Неизвестно"

1. **Старые названия видео-сервисов**: `video_kling_pro`, `video_haiper`, `minimax_video` и т.д.
2. **Пустые или NULL значения** в поле `service_type`
3. **Системные операции**: `start_scene`, `balance_scene`, `payment_scene`
4. **Устаревшие названия**: `image_generation`, `model_training`, `neuro_train_lora_debit`

## ✅ Решение

### Шаг 1: Анализ проблемных записей

Выполните в Supabase SQL Editor:

```sql
-- Посмотреть все неизвестные типы для вашего пользователя
SELECT DISTINCT 
    service_type,
    COUNT(*) as count,
    SUM(ABS(stars)) as total_stars
FROM payments_v2
WHERE telegram_id = 'ВАШ_TELEGRAM_ID' -- Замените на ваш ID
    AND type = 'outcome'
    AND (
        service_type IS NULL 
        OR service_type = ''
        OR service_type = 'unknown'
        OR service_type NOT IN (
            'neuro_photo', 
            'image_to_prompt',
            'text_to_video',
            'image_to_video',
            'text_to_speech',
            'voice',
            'voice_to_text',
            'lip_sync',
            'digital_avatar_body',
            'text_to_image',
            'payment_operation'
        )
    )
GROUP BY service_type
ORDER BY count DESC;
```

### Шаг 2: Исправление в базе данных

Выполните файл `sql/fix_unknown_services.sql` в Supabase:

```sql
-- 1. Исправление video_* типов -> text_to_video
UPDATE payments_v2
SET service_type = 'text_to_video'
WHERE type = 'outcome'
    AND service_type IN (
        'video_kling_pro',
        'video_kling_v2', 
        'video_haiper',
        'video_minimax',
        'video_ray',
        'video_standard',
        'video_wan',
        'kling_video',
        'haiper_video',
        'minimax_video',
        'neurovideo'
    );

-- 2. Исправление image generation типов -> neuro_photo
UPDATE payments_v2
SET service_type = 'neuro_photo'
WHERE type = 'outcome'
    AND service_type = 'image_generation';

-- 3. Исправление model training -> digital_avatar_body
UPDATE payments_v2
SET service_type = 'digital_avatar_body'
WHERE type = 'outcome'
    AND service_type IN ('model_training', 'neuro_train_lora_debit');

-- Обновить материализованное представление (если используется)
REFRESH MATERIALIZED VIEW CONCURRENTLY user_balance_aggregate_mv;
```

### Шаг 3: Проверка результата

После выполнения исправлений проверьте:

```sql
-- Проверить, что неизвестных больше нет
SELECT 
    service_type,
    COUNT(*) as count
FROM payments_v2
WHERE type = 'outcome'
    AND (service_type IS NULL OR service_type = '' OR service_type = 'unknown')
GROUP BY service_type;
```

## 🎯 Маппинг сервисов

### Правильные значения service_type:

| Категория | service_type | Описание | Эмодзи |
|-----------|-------------|----------|--------|
| **Изображения** | `neuro_photo` | Нейрофото | 🖼️ |
| | `image_to_prompt` | Анализ изображений | 📝 |
| | `text_to_image` | Генерация изображений | 🎨 |
| **Видео** | `text_to_video` | Генерация видео | 📹 |
| | `image_to_video` | Изображение в видео | 🎬 |
| **Аудио** | `text_to_speech` | Озвучка текста | 🗣️ |
| | `voice` | Голосовой аватар | 🎤 |
| | `voice_to_text` | Распознавание речи | 🎙️ |
| | `lip_sync` | Синхронизация губ | 💋 |
| **Аватары** | `digital_avatar_body` | Цифровой аватар | 🎭 |
| **Системные** | `payment_operation` | Системная операция | 💳 |
| | `other` | Другое | ❓ |

## 📝 Для разработчиков

### Обновление кода (уже сделано)

Файл `src/utils/serviceMapping.ts` обновлён для обработки всех старых типов. Теперь он автоматически маппит:
- Все варианты video_* → text_to_video
- model_training → digital_avatar_body
- Системные сцены → payment_operation

### Предотвращение проблемы в будущем

При создании новых транзакций всегда используйте правильные значения `service_type` из списка выше.

## 🚀 Результат

После выполнения всех шагов:
- ❌ Было: "❓ Неизвестно: 5629⭐ (13.1%)"
- ✅ Стало: Все транзакции правильно категоризированы

## 📞 Поддержка

Если проблема сохраняется:
1. Проверьте логи выполнения SQL запросов
2. Убедитесь, что материализованное представление обновлено
3. Проверьте, что используется последняя версия кода
