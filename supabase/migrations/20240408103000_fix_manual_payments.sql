-- Исправление ручных пополнений, которые должны быть отмечены как платежи через Robokassa
-- Для пользователя 2086031075 и других с похожими проблемами

-- Обновляем пополнение на 10000 звезд (платеж 689)
UPDATE payments_v2
SET currency = 'RUB',
    payment_method = 'Robokassa'
WHERE payment_id = 689 AND telegram_id = 2086031075;

-- Обновляем пополнение на 2999 звезд (платеж 73)
UPDATE payments_v2
SET currency = 'RUB',
    payment_method = 'Robokassa'
WHERE payment_id = 73 AND telegram_id = 2086031075;

-- Общее правило: помечаем все money_income, соответствующие стандартным пакетам, как Robokassa платежи
UPDATE payments_v2
SET currency = 'RUB',
    payment_method = 'Robokassa'
WHERE type = 'money_income' 
  AND payment_method IS NULL
  AND currency = 'STARS'
  AND (
    (stars = 10000 AND amount = 10000) OR 
    (stars = 2999 AND amount = 2999)
  );

-- Маркируем как рублевые платежи пополнения, которые соответствуют стандартным тарифам
UPDATE payments_v2
SET currency = 'RUB',
    payment_method = 'Robokassa'
WHERE type = 'money_income' 
  AND payment_method IS NULL
  AND currency = 'STARS'
  AND amount > 0 
  AND (
    (stars = 217 AND amount = 500) OR 
    (stars = 434 AND amount = 1000) OR 
    (stars = 869 AND amount = 2000) OR 
    (stars = 2173 AND amount = 5000) OR 
    (stars = 4347 AND amount = 10000) OR
    (stars = 476 AND amount = 1110) OR
    (stars = 1303 AND amount = 2999)
  );

-- Логируем количество измененных записей для проверки
SELECT 'Количество исправленных записей:', count(*)
FROM payments_v2
WHERE payment_method = 'Robokassa' AND currency = 'RUB'; 