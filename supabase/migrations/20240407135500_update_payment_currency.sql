-- Сбрасываем валюту к исходному состоянию перед коррекцией
UPDATE payments_v2
SET currency = 'STARS'
WHERE type = 'money_income';

-- Устанавливаем RUB только для платежей через Robokassa
UPDATE payments_v2
SET currency = 'RUB'
WHERE payment_method = 'Robokassa' AND amount > 0;

-- Также помечаем как RUB платежи, где amount > 0 и соотношение amount/stars соответствует 
-- стандартным пакетам пополнения (например, 500 руб = 217 звёзд)
UPDATE payments_v2
SET currency = 'RUB',
    payment_method = 'Robokassa' -- Обозначаем явно метод платежа для ясности
WHERE type = 'money_income' 
  AND amount > 0 
  AND (
    (stars = 217 AND amount = 500) OR 
    (stars = 434 AND amount = 1000) OR 
    (stars = 869 AND amount = 2000) OR 
    (stars = 2173 AND amount = 5000) OR 
    (stars = 4347 AND amount = 10000) OR
    (stars = 476 AND amount = 1110)
  );

-- Исправляем некорректные записи: для платежей с amount = 0 валюта должна быть STARS
UPDATE payments_v2
SET currency = 'STARS',
    payment_method = CASE 
                       WHEN payment_method = 'Robokassa' THEN 'system' 
                       ELSE payment_method 
                     END
WHERE amount = 0 OR amount = '0' OR amount = '0.00' OR amount IS NULL;

-- Исправляем другие странные случаи, если такие есть
UPDATE payments_v2
SET currency = 'STARS'
WHERE (currency IS NULL OR currency = '') AND type = 'money_income'; 