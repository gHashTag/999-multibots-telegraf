-- Скрипт для проверки нейро-моделей пользователя
-- Замените TELEGRAM_ID на ваш реальный Telegram ID

-- 1. Показать все модели пользователя
SELECT
  mt.id,
  mt.model_name,
  mt.trigger_word,
  mt.model_url,
  mt.status,
  mt.api,
  mt.telegram_id,
  mt.steps,
  mt.created_at
FROM model_trainings mt
WHERE mt.telegram_id = 'YOUR_TELEGRAM_ID_HERE'
ORDER BY mt.created_at DESC;

-- 2. Показать последние 10 генераций нейрофото пользователя
SELECT
  ph.prompt_id,
  ph.prompt,
  ph.model_type,
  ph.media_url,
  ph.status,
  ph.telegram_id,
  ph.created_at
FROM prompts_history ph
WHERE ph.telegram_id = 'YOUR_TELEGRAM_ID_HERE'
  AND ph.mode = 'neuro_photo'
ORDER BY ph.created_at DESC
LIMIT 10;

-- 3. Статистика по пользователю
SELECT
  'Всего моделей' as metric,
  COUNT(*) as value
FROM model_trainings
WHERE telegram_id = 'YOUR_TELEGRAM_ID_HERE'

UNION ALL

SELECT
  'Активных моделей' as metric,
  COUNT(*) as value
FROM model_trainings
WHERE telegram_id = 'YOUR_TELEGRAM_ID_HERE'
  AND status = 'SUCCESS'

UNION ALL

SELECT
  'Всего генераций' as metric,
  COUNT(*) as value
FROM prompts_history
WHERE telegram_id = 'YOUR_TELEGRAM_ID_HERE'
  AND mode = 'neuro_photo'

UNION ALL

SELECT
  'Успешных генераций' as metric,
  COUNT(*) as value
FROM prompts_history
WHERE telegram_id = 'YOUR_TELEGRAM_ID_HERE'
  AND mode = 'neuro_photo'
  AND status = 'success';
