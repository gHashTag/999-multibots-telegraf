-- Исправление неизвестных service_type на основе описаний
-- ВАЖНО: Сначала выполните analyze_unknown_services.sql для проверки!

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
    AND (
        service_type = 'image_generation'
        OR (description ILIKE '%generating%image%' AND service_type = 'unknown')
    );

-- 3. Исправление model training -> digital_avatar_body
UPDATE payments_v2
SET service_type = 'digital_avatar_body'
WHERE type = 'outcome'
    AND (
        service_type = 'model_training'
        OR service_type = 'neuro_train_lora_debit'
        OR description ILIKE '%model training%'
        OR description ILIKE '%тренировки модели%'
    );

-- 4. Исправление image analysis -> image_to_prompt
UPDATE payments_v2
SET service_type = 'image_to_prompt'
WHERE type = 'outcome'
    AND (
        service_type = 'image_analysis'
        OR description ILIKE '%image to prompt%'
        OR description ILIKE '%анализ изображения%'
    );

-- 5. Исправление системных сцен -> payment_operation
UPDATE payments_v2
SET service_type = 'payment_operation'
WHERE type = 'outcome'
    AND service_type IN (
        'start_scene',
        'main_menu',
        'balance_scene',
        'payment_scene',
        'subscription_scene',
        'top_up_balance',
        'subscribe',
        'system'
    );

-- 6. Исправление пустых service_type на основе description
UPDATE payments_v2
SET service_type = CASE
    WHEN description ILIKE '%video generation%' THEN 'text_to_video'
    WHEN description ILIKE '%generating%image%' THEN 'neuro_photo'
    WHEN description ILIKE '%model training%' THEN 'digital_avatar_body'
    WHEN description ILIKE '%тренировки модели%' THEN 'digital_avatar_body'
    WHEN description ILIKE '%image to prompt%' THEN 'image_to_prompt'
    WHEN description ILIKE '%анализ изображения%' THEN 'image_to_prompt'
    WHEN description ILIKE '%lip sync%' THEN 'lip_sync'
    WHEN description ILIKE '%text to speech%' THEN 'text_to_speech'
    WHEN description ILIKE '%voice%' THEN 'voice'
    WHEN description ILIKE '%promo bonus%' THEN 'payment_operation'
    WHEN description ILIKE '%subscription%' THEN 'payment_operation'
    WHEN description ILIKE '%подписка%' THEN 'payment_operation'
    ELSE 'other'
END
WHERE type = 'outcome'
    AND (service_type IS NULL OR service_type = '' OR service_type = 'unknown')
    AND description IS NOT NULL;

-- 7. Проверка результатов
SELECT 
    service_type,
    COUNT(*) as count,
    SUM(ABS(stars)) as total_stars
FROM payments_v2
WHERE type = 'outcome'
GROUP BY service_type
ORDER BY count DESC;

-- 8. Обновление материализованного представления (если используется)
REFRESH MATERIALIZED VIEW CONCURRENTLY user_balance_aggregate_mv;
