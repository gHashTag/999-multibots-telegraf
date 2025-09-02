-- =====================================================
-- ИСПРАВЛЕНИЕ SERVICE_TYPE ДЛЯ ВСЕХ ПОЛЬЗОВАТЕЛЕЙ
-- =====================================================
-- Этот скрипт исправляет неизвестные service_type для ВСЕХ пользователей в базе данных

-- 1. АНАЛИЗ: Найти всех пользователей с проблемными service_type
WITH affected_users AS (
    SELECT DISTINCT telegram_id
    FROM payments_v2
    WHERE type = 'outcome'
    AND (
        service_type IS NULL 
        OR service_type = ''
        OR service_type = 'unknown'
        OR service_type IN (
            'video_kling_pro', 'video_kling_v2', 'video_haiper',
            'video_minimax', 'video_ray', 'video_standard', 'video_wan',
            'kling_video', 'haiper_video', 'minimax_video', 'neurovideo',
            'image_generation', 'model_training', 'neuro_train_lora_debit',
            'image_analysis', 'start_scene', 'main_menu', 'balance_scene',
            'payment_scene', 'subscription_scene', 'system'
        )
    )
)
SELECT COUNT(*) as affected_users_count FROM affected_users;

-- 2. СТАТИСТИКА ДО ИСПРАВЛЕНИЯ
SELECT 
    'BEFORE FIX' as status,
    COUNT(DISTINCT telegram_id) as total_users,
    COUNT(*) as total_records,
    SUM(CASE WHEN service_type IS NULL OR service_type = '' OR service_type = 'unknown' THEN 1 ELSE 0 END) as unknown_count,
    SUM(ABS(stars)) as total_stars
FROM payments_v2
WHERE type = 'outcome';

-- =====================================================
-- МАССОВОЕ ИСПРАВЛЕНИЕ ДЛЯ ВСЕХ ПОЛЬЗОВАТЕЛЕЙ
-- =====================================================

-- 3. Исправление всех video_* типов -> text_to_video
UPDATE payments_v2
SET service_type = 'text_to_video',
    updated_at = NOW()
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
        'neurovideo',
        'video_generation',
        'generate_video',
        'text-to-video',
        'text2video'
    );

-- 4. Исправление image-to-video типов
UPDATE payments_v2
SET service_type = 'image_to_video',
    updated_at = NOW()
WHERE type = 'outcome'
    AND service_type IN (
        'image-to-video',
        'image2video',
        'img2video'
    );

-- 5. Исправление image generation типов -> neuro_photo
UPDATE payments_v2
SET service_type = 'neuro_photo',
    updated_at = NOW()
WHERE type = 'outcome'
    AND (
        service_type IN ('image_generation', 'generate_image')
        OR (description ILIKE '%generating%image%' AND (service_type = 'unknown' OR service_type IS NULL))
    );

-- 6. Исправление text-to-image типов
UPDATE payments_v2
SET service_type = 'text_to_image',
    updated_at = NOW()
WHERE type = 'outcome'
    AND service_type IN (
        'text-to-image',
        'text2image'
    );

-- 7. Исправление model training -> digital_avatar_body
UPDATE payments_v2
SET service_type = 'digital_avatar_body',
    updated_at = NOW()
WHERE type = 'outcome'
    AND (
        service_type IN (
            'model_training',
            'neuro_train_lora_debit',
            'train_model',
            'lora_training',
            'avatar_training',
            'digital_avatar'
        )
        OR description ILIKE '%model training%'
        OR description ILIKE '%тренировки модели%'
        OR description ILIKE '%lora%training%'
    );

-- 8. Исправление image analysis -> image_to_prompt
UPDATE payments_v2
SET service_type = 'image_to_prompt',
    updated_at = NOW()
WHERE type = 'outcome'
    AND (
        service_type IN (
            'image_analysis',
            'image-to-prompt',
            'image2prompt',
            'analyze_image'
        )
        OR description ILIKE '%image to prompt%'
        OR description ILIKE '%анализ изображения%'
    );

-- 9. Исправление аудио сервисов
UPDATE payments_v2
SET service_type = 'text_to_speech',
    updated_at = NOW()
WHERE type = 'outcome'
    AND service_type IN ('text-to-speech', 'text2speech', 'tts');

UPDATE payments_v2
SET service_type = 'voice_to_text',
    updated_at = NOW()
WHERE type = 'outcome'
    AND service_type IN ('voice-to-text', 'voice2text', 'stt');

UPDATE payments_v2
SET service_type = 'lip_sync',
    updated_at = NOW()
WHERE type = 'outcome'
    AND service_type IN ('lip-sync', 'lipsync', 'lip_synchronization');

-- 10. Исправление системных сцен -> payment_operation
UPDATE payments_v2
SET service_type = 'payment_operation',
    updated_at = NOW()
WHERE type = 'outcome'
    AND service_type IN (
        'start_scene',
        'main_menu',
        'balance_scene',
        'payment_scene',
        'subscription_scene',
        'top_up_balance',
        'subscribe',
        'system',
        'promo',
        'bonus',
        'refund'
    );

-- 11. Исправление пустых и NULL service_type на основе description
UPDATE payments_v2
SET service_type = CASE
    -- Видео генерация
    WHEN description ILIKE '%video generation%' THEN 'text_to_video'
    WHEN description ILIKE '%генерац%видео%' THEN 'text_to_video'
    WHEN description ILIKE '%video%kling%' THEN 'text_to_video'
    WHEN description ILIKE '%video%haiper%' THEN 'text_to_video'
    WHEN description ILIKE '%video%minimax%' THEN 'text_to_video'
    
    -- Изображения
    WHEN description ILIKE '%generating%image%' THEN 'neuro_photo'
    WHEN description ILIKE '%генерац%изображен%' THEN 'neuro_photo'
    WHEN description ILIKE '%нейрофото%' THEN 'neuro_photo'
    WHEN description ILIKE '%neuro%photo%' THEN 'neuro_photo'
    
    -- Аватары
    WHEN description ILIKE '%model training%' THEN 'digital_avatar_body'
    WHEN description ILIKE '%тренировк%модел%' THEN 'digital_avatar_body'
    WHEN description ILIKE '%lora%training%' THEN 'digital_avatar_body'
    WHEN description ILIKE '%digital%avatar%' THEN 'digital_avatar_body'
    
    -- Анализ изображений
    WHEN description ILIKE '%image to prompt%' THEN 'image_to_prompt'
    WHEN description ILIKE '%анализ изображения%' THEN 'image_to_prompt'
    
    -- Аудио
    WHEN description ILIKE '%lip sync%' THEN 'lip_sync'
    WHEN description ILIKE '%text to speech%' THEN 'text_to_speech'
    WHEN description ILIKE '%voice%' THEN 'voice'
    
    -- Системные операции
    WHEN description ILIKE '%promo bonus%' THEN 'payment_operation'
    WHEN description ILIKE '%subscription%' THEN 'payment_operation'
    WHEN description ILIKE '%подписка%' THEN 'payment_operation'
    WHEN description ILIKE '%payment%' THEN 'payment_operation'
    
    ELSE 'other'
END,
    updated_at = NOW()
WHERE type = 'outcome'
    AND (service_type IS NULL OR service_type = '' OR service_type = 'unknown')
    AND description IS NOT NULL;

-- 12. Финальная очистка: оставшиеся unknown -> other
UPDATE payments_v2
SET service_type = 'other',
    updated_at = NOW()
WHERE type = 'outcome'
    AND (service_type IS NULL OR service_type = '' OR service_type = 'unknown');

-- =====================================================
-- ПРОВЕРКА РЕЗУЛЬТАТОВ
-- =====================================================

-- 13. СТАТИСТИКА ПОСЛЕ ИСПРАВЛЕНИЯ
SELECT 
    'AFTER FIX' as status,
    COUNT(DISTINCT telegram_id) as total_users,
    COUNT(*) as total_records,
    SUM(CASE WHEN service_type IS NULL OR service_type = '' OR service_type = 'unknown' THEN 1 ELSE 0 END) as unknown_count,
    SUM(ABS(stars)) as total_stars
FROM payments_v2
WHERE type = 'outcome';

-- 14. Детальная статистика по сервисам после исправления
SELECT 
    service_type,
    COUNT(DISTINCT telegram_id) as users_count,
    COUNT(*) as transactions_count,
    SUM(ABS(stars)) as total_stars,
    ROUND(AVG(ABS(stars)), 2) as avg_stars
FROM payments_v2
WHERE type = 'outcome'
GROUP BY service_type
ORDER BY transactions_count DESC;

-- 15. Топ-10 пользователей с наибольшим количеством транзакций
SELECT 
    telegram_id,
    COUNT(*) as total_transactions,
    COUNT(DISTINCT service_type) as unique_services,
    SUM(ABS(stars)) as total_spent
FROM payments_v2
WHERE type = 'outcome'
GROUP BY telegram_id
ORDER BY total_transactions DESC
LIMIT 10;

-- 16. ОБНОВЛЕНИЕ МАТЕРИАЛИЗОВАННОГО ПРЕДСТАВЛЕНИЯ
-- Если используется материализованное представление, обновляем его
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM pg_matviews 
        WHERE matviewname = 'user_balance_aggregate_mv'
    ) THEN
        EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY user_balance_aggregate_mv';
        RAISE NOTICE 'Материализованное представление обновлено';
    END IF;
END $$;

-- =====================================================
-- СОЗДАНИЕ ИНДЕКСОВ ДЛЯ ОПТИМИЗАЦИИ (если не существуют)
-- =====================================================

-- Индекс для быстрого поиска по service_type
CREATE INDEX IF NOT EXISTS idx_payments_v2_service_type 
ON payments_v2(service_type) 
WHERE type = 'outcome';

-- Индекс для поиска неизвестных типов
CREATE INDEX IF NOT EXISTS idx_payments_v2_unknown_services 
ON payments_v2(telegram_id, service_type) 
WHERE type = 'outcome' 
AND (service_type IS NULL OR service_type = '' OR service_type = 'unknown' OR service_type = 'other');

-- =====================================================
-- ИТОГОВЫЙ ОТЧЕТ
-- =====================================================

-- Финальная проверка: есть ли еще неизвестные сервисы?
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ ВСЕ СЕРВИСЫ ИСПРАВЛЕНЫ!'
        ELSE '⚠️ Остались неисправленные записи: ' || COUNT(*)::text
    END as result
FROM payments_v2
WHERE type = 'outcome'
    AND (service_type IS NULL OR service_type = '' OR service_type = 'unknown');

-- Сводка по пользователям
SELECT 
    '📊 ИТОГОВАЯ СТАТИСТИКА' as report,
    COUNT(DISTINCT telegram_id) as total_users_with_transactions,
    COUNT(*) as total_outcome_transactions,
    COUNT(DISTINCT service_type) as unique_service_types
FROM payments_v2
WHERE type = 'outcome';
