-- Миграция: Добавление поля gender в таблицу model_trainings
-- Дата: 2025-11-03
-- Описание: Добавление поля для хранения пола модели (male/female)

ALTER TABLE model_trainings
ADD COLUMN gender VARCHAR(10);

-- Создаем индекс для быстрого поиска по полу
CREATE INDEX idx_model_trainings_gender ON model_trainings(gender);

-- Добавляем комментарий к полю
COMMENT ON COLUMN model_trainings.gender IS 'Пол модели: male, female или person (по умолчанию)';

-- Обновляем существующие модели, у которых в имени есть указание на пол
-- Модели с "female" в имени
UPDATE model_trainings
SET gender = 'female'
WHERE LOWER(model_name) LIKE '%female%'
  AND gender IS NULL;

-- Модели с "male" в имени
UPDATE model_trainings
SET gender = 'male'
WHERE LOWER(model_name) LIKE '%male%'
  AND gender IS NULL;

-- Для всех остальных моделей устанавливаем 'person' как значение по умолчанию
-- (это делается через DEFAULT при создании, но для существующих записей - вручную)
UPDATE model_trainings
SET gender = 'person'
WHERE gender IS NULL;
