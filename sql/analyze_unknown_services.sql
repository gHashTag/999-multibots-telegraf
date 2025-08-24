-- Анализ неизвестных типов сервисов в базе данных
-- Этот запрос поможет найти все service_type, которые не распознаются системой

-- 1. Найти все уникальные service_type в базе
SELECT DISTINCT 
    service_type,
    COUNT(*) as count,
    SUM(ABS(stars)) as total_stars,
    MIN(payment_date) as first_seen,
    MAX(payment_date) as last_seen
FROM payments_v2
WHERE telegram_id = '144022504' -- Замените на ваш telegram_id
    AND type = 'outcome'
GROUP BY service_type
ORDER BY count DESC;

-- 2. Найти примеры транзакций с неизвестными типами
SELECT 
    payment_date,
    service_type,
    description,
    stars,
    amount,
    currency
FROM payments_v2
WHERE telegram_id = '144022504'
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
ORDER BY payment_date DESC
LIMIT 20;

-- 3. Найти все уникальные комбинации service_type и description для неизвестных сервисов
SELECT 
    service_type,
    description,
    COUNT(*) as count,
    SUM(ABS(stars)) as total_stars
FROM payments_v2
WHERE telegram_id = '144022504'
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
GROUP BY service_type, description
ORDER BY count DESC
LIMIT 30;
