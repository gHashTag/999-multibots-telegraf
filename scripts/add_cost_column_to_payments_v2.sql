-- Миграция: Добавление поля cost (себестоимость) в таблицу payments_v2
-- Дата: 2024-12-19
-- Описание: Добавляем поле для отслеживания себестоимости каждой транзакции

-- Добавляем колонку cost
ALTER TABLE payments_v2 
ADD COLUMN IF NOT EXISTS cost DECIMAL(10,2) DEFAULT 0;

-- Добавляем комментарий к колонке
COMMENT ON COLUMN payments_v2.cost IS 'Себестоимость транзакции в звездах. Используется для расчета реальной прибыльности сервисов.';

-- Создаем индекс для оптимизации запросов по себестоимости
CREATE INDEX IF NOT EXISTS idx_payments_v2_cost ON payments_v2(cost) WHERE cost > 0;

-- Создаем индекс для комбинированных запросов (bot_name + type + cost)
CREATE INDEX IF NOT EXISTS idx_payments_v2_bot_type_cost ON payments_v2(bot_name, type, cost);

-- Обновляем существующие записи: устанавливаем cost = 0 для всех MONEY_INCOME транзакций
UPDATE payments_v2 
SET cost = 0 
WHERE type = 'MONEY_INCOME' AND cost IS NULL;

-- Для MONEY_OUTCOME транзакций оставляем cost = 0 по умолчанию
-- В будущем эти значения будут заполняться при создании новых транзакций
UPDATE payments_v2 
SET cost = 0 
WHERE type = 'MONEY_OUTCOME' AND cost IS NULL;

-- Добавляем ограничение: cost не может быть отрицательным
ALTER TABLE payments_v2 
ADD CONSTRAINT check_cost_non_negative 
CHECK (cost >= 0);

-- Проверяем результат
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'payments_v2' 
    AND column_name = 'cost';

-- Показываем статистику по добавленному полю
SELECT 
    type,
    COUNT(*) as count,
    AVG(cost) as avg_cost,
    SUM(cost) as total_cost
FROM payments_v2 
GROUP BY type; 