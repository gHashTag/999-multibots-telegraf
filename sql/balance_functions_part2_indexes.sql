-- ============================================
-- ЧАСТЬ 2: Индексы для ускорения запросов
-- Выполни это ПОСЛЕ первой части
-- ============================================

-- Индекс для основных запросов баланса
CREATE INDEX IF NOT EXISTS idx_payments_v2_balance_main 
ON payments_v2(telegram_id, status, type)
WHERE status = 'COMPLETED';

-- Индекс для группировки по сервисам
CREATE INDEX IF NOT EXISTS idx_payments_v2_services 
ON payments_v2(telegram_id, service_type)
WHERE status = 'COMPLETED' AND type = 'MONEY_OUTCOME';

-- Индекс для фильтрации по способам оплаты
CREATE INDEX IF NOT EXISTS idx_payments_v2_payment_methods 
ON payments_v2(telegram_id, payment_method, currency)
WHERE status = 'COMPLETED' AND type = 'MONEY_INCOME';

-- Индекс для сортировки по дате
CREATE INDEX IF NOT EXISTS idx_payments_v2_date 
ON payments_v2(payment_date DESC)
WHERE status = 'COMPLETED';
