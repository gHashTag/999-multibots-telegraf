-- ========================================
-- СКРИПТ 2: АНАЛИЗ ПО ВСЕМ БОТАМ
-- ========================================

-- Сначала посмотрим структуру таблицы
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'payments_v2'
ORDER BY ordinal_position;

-- Анализ всех транзакций с возможными индикаторами бота
SELECT
  id,
  telegram_id,
  username,
  first_name,
  last_name,
  payment_date,
  amount,
  currency,
  payment_method,
  type,
  category,
  description,
  -- Попробуем определить бота по описанию или другим полям
  CASE
    WHEN description ILIKE '%neuro%photo%' THEN 'NeuroPhoto_Bot'
    WHEN description ILIKE '%neuro%video%' THEN 'NeuroVideo_Bot'
    WHEN description ILIKE '%lip%sync%' THEN 'LipSync_Bot'
    WHEN description ILIKE '%lora%' THEN 'LoRA_Training_Bot'
    WHEN description ILIKE '%music%' OR description ILIKE '%audio%' THEN 'Music_Bot'
    WHEN description ILIKE '%meta%muse%' THEN 'MetaMuse_Manifest_bot'
    WHEN description ILIKE '%zavara%' THEN 'ZavaraBot'
    WHEN description ILIKE '%lee%solar%' THEN 'LeeSolarbot'
    WHEN description ILIKE '%lena%' THEN 'NeuroLenaAssistant_bot'
    WHEN description ILIKE '%shtogrina%' OR description ILIKE '%stylist%' THEN 'NeurostylistShtogrina_bot'
    WHEN description ILIKE '%gaia%' THEN 'Gaia_Kamskaia_bot'
    WHEN description ILIKE '%kaya%' THEN 'Kaya_easy_art_bot'
    WHEN description ILIKE '%stars%' THEN 'AI_STARS_bot'
    WHEN description ILIKE '%haim%' THEN 'HaimGroupMedia_bot'
    WHEN description ILIKE '%blogger%' THEN 'neuro_blogger_bot'
    ELSE 'Unknown_Bot'
  END as detected_bot,
  CASE
    WHEN payment_method = 'Telegram' AND category = 'REAL' THEN 'Telegram_Payments'
    WHEN payment_method = 'Robokassa' THEN 'Robokassa_Payments'
    ELSE 'Other_Payments'
  END as payment_category
FROM payments_v2
ORDER BY payment_date DESC
LIMIT 5000;

-- Статистика по ботам (группируем по detected_bot)
SELECT
  CASE
    WHEN description ILIKE '%neuro%photo%' THEN 'NeuroPhoto_Bot'
    WHEN description ILIKE '%neuro%video%' THEN 'NeuroVideo_Bot'
    WHEN description ILIKE '%lip%sync%' THEN 'LipSync_Bot'
    WHEN description ILIKE '%lora%' THEN 'LoRA_Training_Bot'
    WHEN description ILIKE '%music%' OR description ILIKE '%audio%' THEN 'Music_Bot'
    WHEN description ILIKE '%meta%muse%' THEN 'MetaMuse_Manifest_bot'
    WHEN description ILIKE '%zavara%' THEN 'ZavaraBot'
    WHEN description ILIKE '%lee%solar%' THEN 'LeeSolarbot'
    WHEN description ILIKE '%lena%' THEN 'NeuroLenaAssistant_bot'
    WHEN description ILIKE '%shtogrina%' OR description ILIKE '%stylist%' THEN 'NeurostylistShtogrina_bot'
    WHEN description ILIKE '%gaia%' THEN 'Gaia_Kamskaia_bot'
    WHEN description ILIKE '%kaya%' THEN 'Kaya_easy_art_bot'
    WHEN description ILIKE '%stars%' THEN 'AI_STARS_bot'
    WHEN description ILIKE '%haim%' THEN 'HaimGroupMedia_bot'
    WHEN description ILIKE '%blogger%' THEN 'neuro_blogger_bot'
    ELSE 'Unknown_Bot'
  END as bot_name,
  COUNT(*) as total_transactions,
  COUNT(DISTINCT telegram_id) as unique_users,
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN CAST(amount AS DECIMAL(15,2)) ELSE 0 END) as total_income,
  SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN CAST(amount AS DECIMAL(15,2)) ELSE 0 END) as total_outcome,
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN CAST(amount AS DECIMAL(15,2)) ELSE -CAST(amount AS DECIMAL(15,2)) END) as net_balance,
  AVG(CASE WHEN type = 'MONEY_INCOME' THEN CAST(amount AS DECIMAL(15,2)) ELSE NULL END) as avg_income
FROM payments_v2
GROUP BY
  CASE
    WHEN description ILIKE '%neuro%photo%' THEN 'NeuroPhoto_Bot'
    WHEN description ILIKE '%neuro%video%' THEN 'NeuroVideo_Bot'
    WHEN description ILIKE '%lip%sync%' THEN 'LipSync_Bot'
    WHEN description ILIKE '%lora%' THEN 'LoRA_Training_Bot'
    WHEN description ILIKE '%music%' OR description ILIKE '%audio%' THEN 'Music_Bot'
    WHEN description ILIKE '%meta%muse%' THEN 'MetaMuse_Manifest_bot'
    WHEN description ILIKE '%zavara%' THEN 'ZavaraBot'
    WHEN description ILIKE '%lee%solar%' THEN 'LeeSolarbot'
    WHEN description ILIKE '%lena%' THEN 'NeuroLenaAssistant_bot'
    WHEN description ILIKE '%shtogrina%' OR description ILIKE '%stylist%' THEN 'NeurostylistShtogrina_bot'
    WHEN description ILIKE '%gaia%' THEN 'Gaia_Kamskaia_bot'
    WHEN description ILIKE '%kaya%' THEN 'Kaya_easy_art_bot'
    WHEN description ILIKE '%stars%' THEN 'AI_STARS_bot'
    WHEN description ILIKE '%haim%' THEN 'HaimGroupMedia_bot'
    WHEN description ILIKE '%blogger%' THEN 'neuro_blogger_bot'
    ELSE 'Unknown_Bot'
  END
ORDER BY total_transactions DESC;

-- Топ пользователи по каждому боту (если удастся определить)
WITH bot_users AS (
  SELECT
    telegram_id,
    username,
    first_name,
    last_name,
    CASE
      WHEN description ILIKE '%neuro%photo%' THEN 'NeuroPhoto_Bot'
      WHEN description ILIKE '%neuro%video%' THEN 'NeuroVideo_Bot'
      WHEN description ILIKE '%lip%sync%' THEN 'LipSync_Bot'
      WHEN description ILIKE '%lora%' THEN 'LoRA_Training_Bot'
      WHEN description ILIKE '%music%' OR description ILIKE '%audio%' THEN 'Music_Bot'
      WHEN description ILIKE '%meta%muse%' THEN 'MetaMuse_Manifest_bot'
      WHEN description ILIKE '%zavara%' THEN 'ZavaraBot'
      WHEN description ILIKE '%lee%solar%' THEN 'LeeSolarbot'
      WHEN description ILIKE '%lena%' THEN 'NeuroLenaAssistant_bot'
      WHEN description ILIKE '%shtogrina%' OR description ILIKE '%stylist%' THEN 'NeurostylistShtogrina_bot'
      WHEN description ILIKE '%gaia%' THEN 'Gaia_Kamskaia_bot'
      WHEN description ILIKE '%kaya%' THEN 'Kaya_easy_art_bot'
      WHEN description ILIKE '%stars%' THEN 'AI_STARS_bot'
      WHEN description ILIKE '%haim%' THEN 'HaimGroupMedia_bot'
      WHEN description ILIKE '%blogger%' THEN 'neuro_blogger_bot'
      ELSE 'Unknown_Bot'
    END as bot_name,
    COUNT(*) as transaction_count,
    SUM(CASE WHEN type = 'MONEY_INCOME' THEN CAST(amount AS DECIMAL(15,2)) ELSE 0 END) as total_income,
    SUM(CASE WHEN type = 'MONEY_OUTCOME' THEN CAST(amount AS DECIMAL(15,2)) ELSE 0 END) as total_outcome
  FROM payments_v2
  GROUP BY telegram_id, username, first_name, last_name,
    CASE
      WHEN description ILIKE '%neuro%photo%' THEN 'NeuroPhoto_Bot'
      WHEN description ILIKE '%neuro%video%' THEN 'NeuroVideo_Bot'
      WHEN description ILIKE '%lip%sync%' THEN 'LipSync_Bot'
      WHEN description ILIKE '%lora%' THEN 'LoRA_Training_Bot'
      WHEN description ILIKE '%music%' OR description ILIKE '%audio%' THEN 'Music_Bot'
      WHEN description ILIKE '%meta%muse%' THEN 'MetaMuse_Manifest_bot'
      WHEN description ILIKE '%zavara%' THEN 'ZavaraBot'
      WHEN description ILIKE '%lee%solar%' THEN 'LeeSolarbot'
      WHEN description ILIKE '%lena%' THEN 'NeuroLenaAssistant_bot'
      WHEN description ILIKE '%shtogrina%' OR description ILIKE '%stylist%' THEN 'NeurostylistShtogrina_bot'
      WHEN description ILIKE '%gaia%' THEN 'Gaia_Kamskaia_bot'
      WHEN description ILIKE '%kaya%' THEN 'Kaya_easy_art_bot'
      WHEN description ILIKE '%stars%' THEN 'AI_STARS_bot'
      WHEN description ILIKE '%haim%' THEN 'HaimGroupMedia_bot'
      WHEN description ILIKE '%blogger%' THEN 'neuro_blogger_bot'
      ELSE 'Unknown_Bot'
    END
)
SELECT * FROM bot_users
WHERE bot_name != 'Unknown_Bot'
ORDER BY bot_name, transaction_count DESC
LIMIT 200;
