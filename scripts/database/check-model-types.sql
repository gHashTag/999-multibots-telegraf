-- =====================================================================
-- ПРОВЕРКА ТИПОВ МОДЕЛЕЙ У ПОЛЬЗОВАТЕЛЕЙ
-- =====================================================================
-- Этот скрипт покажет, какие модели есть у пользователей и их API типы

-- 1. ВСЕ МОДЕЛИ С API ТИПАМИ
SELECT
  'ВСЕ МОДЕЛИ' as section,
  mt.telegram_id,
  mt.model_name,
  mt.api,
  mt.status,
  mt.model_url,
  mt.created_at
FROM model_trainings mt
ORDER BY mt.api, mt.created_at DESC;

-- 2. СТАТИСТИКА ПО API ТИПАМ
SELECT
  'СТАТИСТИКА ПО API' as section,
  mt.api,
  COUNT(*) as model_count,
  COUNT(CASE WHEN mt.status = 'SUCCESS' THEN 1 END) as successful_models
FROM model_trainings mt
GROUP BY mt.api
ORDER BY model_count DESC;

-- 3. ПОЛЬЗОВАТЕЛИ С МОДЕЛЯМИ РАЗНЫХ API
SELECT
  'ПОЛЬЗОВАТЕЛИ С НЕСКОЛЬКИМИ API' as section,
  mt.telegram_id,
  STRING_AGG(DISTINCT mt.api, ', ') as api_types,
  COUNT(*) as total_models
FROM model_trainings mt
WHERE mt.status = 'SUCCESS'
GROUP BY mt.telegram_id
HAVING COUNT(DISTINCT mt.api) > 1
ORDER BY total_models DESC;

-- 4. ПРОВЕРКА ПОЛЬЗОВАТЕЛЯ 435572800 (из логов)
SELECT
  'МОДЕЛИ ПОЛЬЗОВАТЕЛЯ 435572800' as section,
  mt.id,
  mt.model_name,
  mt.api,
  mt.status,
  mt.created_at
FROM model_trainings mt
WHERE mt.telegram_id = '435572800'
ORDER BY mt.created_at DESC;

-- 5. ПОСЛЕДНИЕ ГЕНЕРАЦИИ С MODEL_TYPE
SELECT
  'ПОСЛЕДНИЕ ГЕНЕРАЦИИ' as section,
  ph.telegram_id,
  ph.model_type,
  ph.created_at,
  ph.status,
  LEFT(ph.prompt, 50) as prompt_preview
FROM prompts_history ph
WHERE ph.mode = 'neuro_photo'
ORDER BY ph.created_at DESC
LIMIT 20;
