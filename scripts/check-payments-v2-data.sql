-- =====================================================================
-- СКРИПТ АНАЛИЗА ПЛАТЕЖЕЙ И ГЕНЕРАЦИЙ НЕЙРОФОТО
-- =====================================================================
-- Этот скрипт помогает найти историю генераций нейрофото
-- и понять какие модели использовались пользователем

-- 1. Показать структуру таблицы payments_v2
\d payments_v2

-- 2. Найти пользователя по Telegram ID (замените YOUR_TELEGRAM_ID на ваш ID)
SELECT
  u.telegram_id,
  u.username,
  u.first_name,
  u.created_at as user_created
FROM users u
WHERE u.telegram_id = 'YOUR_TELEGRAM_ID';

-- 3. Показать все операции с балансом пользователя
SELECT
  p.id,
  p.created_at,
  p.amount,
  p.stars,
  p.type,
  p.service_type,
  p.description,
  p.status,
  p.bot_name,
  p.metadata
FROM payments_v2 p
WHERE p.telegram_id = 'YOUR_TELEGRAM_ID'
ORDER BY p.created_at DESC
LIMIT 50;

-- 4. Показать только генерации нейрофото
SELECT
  p.id,
  p.created_at,
  p.amount,
  p.stars,
  p.service_type,
  p.description,
  p.metadata
FROM payments_v2 p
WHERE p.telegram_id = 'YOUR_TELEGRAM_ID'
  AND p.service_type LIKE '%neuro%'
ORDER BY p.created_at DESC;

-- 5. Показать статистику по пользователю
SELECT
  'Всего операций' as metric,
  COUNT(*) as value
FROM payments_v2 p
WHERE p.telegram_id = 'YOUR_TELEGRAM_ID'

UNION ALL

SELECT
  'Успешных генераций' as metric,
  COUNT(*) as value
FROM payments_v2 p
WHERE p.telegram_id = 'YOUR_TELEGRAM_ID'
  AND p.status = 'COMPLETED'
  AND p.service_type LIKE '%neuro%'

UNION ALL

SELECT
  'Потрачено звезд' as metric,
  COALESCE(SUM(p.stars), 0)::text as value
FROM payments_v2 p
WHERE p.telegram_id = 'YOUR_TELEGRAM_ID'
  AND p.status = 'COMPLETED'
  AND p.type = 'MONEY_OUTCOME'

UNION ALL

SELECT
  'Последняя операция' as metric,
  MAX(p.created_at)::text as value
FROM payments_v2 p
WHERE p.telegram_id = 'YOUR_TELEGRAM_ID';

-- 6. Найти модели пользователя в payments_v2 metadata
SELECT
  p.id,
  p.created_at,
  p.service_type,
  p.metadata
FROM payments_v2 p
WHERE p.telegram_id = 'YOUR_TELEGRAM_ID'
  AND p.metadata::text ILIKE '%model%'
ORDER BY p.created_at DESC;

-- 7. Показать последние 10 генераций с подробностями
SELECT
  ph.prompt_id,
  ph.created_at,
  ph.prompt,
  ph.model_type,
  ph.media_url,
  ph.status,
  u.username,
  u.first_name
FROM prompts_history ph
LEFT JOIN users u ON u.telegram_id = ph.telegram_id
WHERE ph.telegram_id = 'YOUR_TELEGRAM_ID'
  AND ph.mode = 'neuro_photo'
ORDER BY ph.created_at DESC
LIMIT 10;

-- 8. Сравнить записи в payments_v2 и prompts_history
-- Найти случаи где есть оплата но нет записи в history
SELECT
  'Payments without prompt history' as issue,
  COUNT(*) as count
FROM payments_v2 p
LEFT JOIN prompts_history ph ON ph.telegram_id = p.telegram_id
  AND ph.created_at BETWEEN p.created_at - INTERVAL '1 hour' AND p.created_at + INTERVAL '1 hour'
WHERE p.telegram_id = 'YOUR_TELEGRAM_ID'
  AND p.service_type LIKE '%neuro%'
  AND p.status = 'COMPLETED'
  AND ph.prompt_id IS NULL;
