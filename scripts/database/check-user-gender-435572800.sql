-- Проверить пол пользователя 435572800 в базе
SELECT
  telegram_id,
  username,
  first_name,
  last_name,
  gender,
  created_at
FROM users
WHERE telegram_id = '435572800';

-- Если gender = female, то это объясняет проблему!
-- Система может автоматически добавлять "female" к промпту
