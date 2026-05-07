-- 🔍 SQL СКРИПТ ДЛЯ ПРОВЕРКИ МОДЕЛЕЙ ПОЛЬЗОВАТЕЛЯ 5439920152 (@theycallmeVesna)
--
-- Использование на production сервере:
-- ssh root@188.137.250.69
-- docker exec 999-multibots node -e "const { supabase } = require('./dist/core/supabase/client'); (async () => { const { data } = await supabase.from('model_trainings').select('*').or('user_id.eq.5439920152,telegram_id.eq.5439920152').order('created_at', { ascending: false }); console.log(JSON.stringify(data, null, 2)); })();"

-- Или прямой SQL запрос в Supabase Dashboard:

-- 1. ВСЕ МОДЕЛИ ПОЛЬЗОВАТЕЛЯ
SELECT
  id,
  user_id,
  telegram_id,
  model_name,
  trigger_word,
  status,
  api,
  gender,
  model_url,
  replicate_training_id,
  created_at,
  updated_at,
  error,
  steps,
  bot_name
FROM model_trainings
WHERE user_id = '5439920152' OR telegram_id = '5439920152'
ORDER BY created_at DESC;

-- 2. СТАТИСТИКА ПО СТАТУСАМ
SELECT
  status,
  COUNT(*) as count
FROM model_trainings
WHERE user_id = '5439920152' OR telegram_id = '5439920152'
GROUP BY status;

-- 3. СТАТИСТИКА ПО API
SELECT
  COALESCE(api, 'не указано') as api,
  COUNT(*) as count
FROM model_trainings
WHERE user_id = '5439920152' OR telegram_id = '5439920152'
GROUP BY api;

-- 4. ТОЛЬКО УСПЕШНЫЕ МОДЕЛИ С URL
SELECT
  id,
  model_name,
  api,
  model_url,
  created_at
FROM model_trainings
WHERE (user_id = '5439920152' OR telegram_id = '5439920152')
  AND status IN ('succeeded', 'SUCCESS', 'completed')
  AND model_url IS NOT NULL
ORDER BY created_at DESC;

-- 5. МОДЕЛИ С ОШИБКАМИ
SELECT
  id,
  model_name,
  status,
  error,
  created_at
FROM model_trainings
WHERE (user_id = '5439920152' OR telegram_id = '5439920152')
  AND (error IS NOT NULL OR status IN ('failed', 'FAILED'))
ORDER BY created_at DESC;

-- 6. ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ
SELECT
  telegram_id,
  username,
  bot_name,
  created_at,
  language_code
FROM users
WHERE telegram_id = '5439920152';

-- 7. ИСТОРИЯ ГЕНЕРАЦИЙ С МОДЕЛЯМИ
SELECT
  id,
  mode,
  model_type,
  status,
  created_at
FROM prompts_history
WHERE telegram_id = '5439920152'
  AND mode = 'neuro_photo'
ORDER BY created_at DESC
LIMIT 10;
