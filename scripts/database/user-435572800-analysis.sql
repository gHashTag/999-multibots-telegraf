-- =====================================================================
-- АНАЛИЗ ПОЛЬЗОВАТЕЛЯ 435572800 В PAYMENTS_V2
-- =====================================================================
-- Выполните этот скрипт в Supabase SQL Editor
-- Он покажет все модели которые использовал пользователь

-- 1. ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ
SELECT
  'ПОЛЬЗОВАТЕЛЬ' as section,
  u.telegram_id,
  u.username,
  u.first_name,
  u.last_name,
  u.created_at as user_created,
  u.level,
  u.model
FROM users u
WHERE u.telegram_id = '435572800';

-- 2. ВСЕ ПЛАТЕЖИ ЗА НЕЙРОФОТО
SELECT
  'ПЛАТЕЖИ ЗА НЕЙРОФОТО' as section,
  p.id,
  p.created_at,
  p.amount,
  p.stars,
  p.service_type,
  p.description,
  p.status,
  p.bot_name,
  p.metadata
FROM payments_v2 p
WHERE p.telegram_id = '435572800'
  AND p.service_type ILIKE '%neuro%'
ORDER BY p.created_at DESC;

-- 3. ФИЛЬТРАЦИЯ ПО METADATA С МОДЕЛЯМИ
SELECT
  'МОДЕЛИ В METADATA' as section,
  p.id,
  p.created_at,
  p.service_type,
  p.metadata,
  CASE
    WHEN p.metadata::text ILIKE '%model%' THEN 'HAS_MODEL'
    ELSE 'NO_MODEL'
  END as has_model
FROM payments_v2 p
WHERE p.telegram_id = '435572800'
  AND p.service_type ILIKE '%neuro%'
  AND (p.metadata::text ILIKE '%model%' OR p.metadata::text ILIKE '%lora%')
ORDER BY p.created_at DESC;

-- 4. ОБУЧЕННЫЕ МОДЕЛИ
SELECT
  'ОБУЧЕННЫЕ МОДЕЛИ' as section,
  mt.id,
  mt.model_name,
  mt.trigger_word,
  mt.model_url,
  mt.status,
  mt.api,
  mt.steps,
  mt.created_at
FROM model_trainings mt
WHERE mt.telegram_id = '435572800'
ORDER BY mt.created_at DESC;

-- 5. ИСТОРИЯ ГЕНЕРАЦИЙ
SELECT
  'ИСТОРИЯ ГЕНЕРАЦИЙ' as section,
  ph.prompt_id,
  ph.created_at,
  ph.prompt,
  ph.model_type,
  ph.media_url,
  ph.status
FROM prompts_history ph
WHERE ph.telegram_id = '435572800'
  AND ph.mode = 'neuro_photo'
ORDER BY ph.created_at DESC
LIMIT 20;

-- 6. СТАТИСТИКА
SELECT
  'СТАТИСТИКА' as section,
  'Всего платежей' as metric,
  COUNT(*)::text as value
FROM payments_v2
WHERE telegram_id = '435572800'

UNION ALL

SELECT
  'СТАТИСТИКА' as section,
  'Платежи за нейрофото' as metric,
  COUNT(*)::text as value
FROM payments_v2
WHERE telegram_id = '435572800'
  AND service_type ILIKE '%neuro%'

UNION ALL

SELECT
  'СТАТИСТИКА' as section,
  'Обученных моделей' as metric,
  COUNT(*)::text as value
FROM model_trainings
WHERE telegram_id = '435572800'

UNION ALL

SELECT
  'СТАТИСТИКА' as section,
  'Успешных моделей' as metric,
  COUNT(*)::text as value
FROM model_trainings
WHERE telegram_id = '435572800'
  AND status = 'SUCCESS'

UNION ALL

SELECT
  'СТАТИСТИКА' as section,
  'Генераций в истории' as metric,
  COUNT(*)::text as value
FROM prompts_history
WHERE telegram_id = '435572800'
  AND mode = 'neuro_photo'

UNION ALL

SELECT
  'СТАТИСТИКА' as section,
  'Потрачено звезд' as metric,
  COALESCE(SUM(stars), 0)::text as value
FROM payments_v2
WHERE telegram_id = '435572800'
  AND status = 'COMPLETED'
  AND type = 'MONEY_OUTCOME';

-- 7. ПОИСК ПРОБЛЕМНЫХ ГЕНЕРАЦИЙ
SELECT
  'ПРОБЛЕМНЫЕ ГЕНЕРАЦИИ' as section,
  ph.prompt_id,
  ph.created_at,
  ph.prompt,
  ph.model_type,
  ph.status,
  ph.media_url
FROM prompts_history ph
WHERE ph.telegram_id = '435572800'
  AND ph.mode = 'neuro_photo'
  AND ph.status != 'success'
ORDER BY ph.created_at DESC
LIMIT 10;

-- 8. СРАВНЕНИЕ ПЛАТЕЖЕЙ И ГЕНЕРАЦИЙ
SELECT
  'ОПЛАТЫ БЕЗ ГЕНЕРАЦИЙ' as section,
  p.id,
  p.created_at as payment_date,
  p.amount,
  p.stars,
  p.service_type
FROM payments_v2 p
LEFT JOIN prompts_history ph ON ph.telegram_id = p.telegram_id
  AND ph.created_at BETWEEN p.created_at - INTERVAL '1 hour' AND p.created_at + INTERVAL '1 hour'
WHERE p.telegram_id = '435572800'
  AND p.service_type ILIKE '%neuro%'
  AND p.status = 'COMPLETED'
  AND ph.prompt_id IS NULL
ORDER BY p.created_at DESC;

-- 9. ИЗВЛЕЧЕНИЕ TRIGGER WORDS ИЗ METADATA
SELECT
  'TRIGGER WORDS ИЗ METADATA' as section,
  p.id,
  p.created_at,
  p.metadata,
  jsonb_pretty(p.metadata) as metadata_pretty
FROM payments_v2 p
WHERE p.telegram_id = '435572800'
  AND p.service_type ILIKE '%neuro%'
  AND p.metadata::text ILIKE '%trigger%'
ORDER BY p.created_at DESC
LIMIT 10;

-- 10. ПОИСК URL МОДЕЛЕЙ
SELECT
  'URL МОДЕЛЕЙ' as section,
  p.id,
  p.created_at,
  p.service_type,
  jsonb_path_exists(
    p.metadata,
    '$.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*' ?| array['http', 'https', '.safetensors', 'model', 'lora', 'trigger']
  ) as has_model_url
FROM payments_v2 p
WHERE p.telegram_id = '435572800'
  AND p.service_type ILIKE '%neuro%'
  AND p.metadata IS NOT NULL
ORDER BY p.created_at DESC
LIMIT 20;
