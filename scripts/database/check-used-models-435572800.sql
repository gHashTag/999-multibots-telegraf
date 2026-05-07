-- Проверить какие модели использовал пользователь 435572800
-- для генерации нейрофото

-- 1. Посмотреть последние платежи за нейрофото с metadata
SELECT
  p.id,
  p.created_at,
  p.service_type,
  p.amount,
  p.stars,
  p.status,
  p.metadata
FROM payments_v2 p
WHERE p.telegram_id = '435572800'
  AND p.service_type ILIKE '%neuro%'
ORDER BY p.created_at DESC
LIMIT 20;

-- 2. Искать упоминания trigger word PLAYOM в metadata
SELECT
  p.id,
  p.created_at,
  p.metadata,
  CASE
    WHEN p.metadata::text ILIKE '%PLAYOM%' THEN 'HAS_PLAYOM'
    ELSE 'NO_PLAYOM'
  END as has_playom
FROM payments_v2 p
WHERE p.telegram_id = '435572800'
  AND p.service_type ILIKE '%neuro%'
ORDER BY p.created_at DESC;

-- 3. Искать model_url в metadata
SELECT
  p.id,
  p.created_at,
  jsonb_pretty(p.metadata) as metadata_pretty
FROM payments_v2 p
WHERE p.telegram_id = '435572800'
  AND p.service_type ILIKE '%neuro%'
  AND (p.metadata::text ILIKE '%model_url%' OR p.metadata::text ILIKE '%trigger%')
ORDER BY p.created_at DESC
LIMIT 10;

-- 4. Сравнить с имеющимися моделями
SELECT
  'ИМЕЮЩИЕСЯ МОДЕЛИ' as source,
  mt.trigger_word,
  mt.model_url,
  mt.created_at
FROM model_trainings mt
WHERE mt.telegram_id = '435572800'
  AND mt.status = 'SUCCESS'

UNION ALL

SELECT
  'ИЗ ПЛАТЕЖЕЙ' as source,
  p.metadata->>'trigger_word' as trigger_word,
  p.metadata->>'model_url' as model_url,
  p.created_at
FROM payments_v2 p
WHERE p.telegram_id = '435572800'
  AND p.service_type ILIKE '%neuro%'
  AND p.metadata IS NOT NULL
ORDER BY created_at DESC;
