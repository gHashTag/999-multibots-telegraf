#!/usr/bin/env node

/**
 * СКРИПТ ПОИСКА ПОЛЬЗОВАТЕЛЕЙ С ПРОБЛЕМНЫМИ ГЕНЕРАЦИЯМИ НЕЙРОФОТО
 *
 * Этот скрипт ищет пользователей у которых:
 * 1. Недавно были генерации нейрофото
 * 2. Оплата прошла успешно
 * 3. Модели могли пропасть или работать неправильно
 */

const readline = require('readline')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║       🔍 ПОИСК ПОЛЬЗОВАТЕЛЕЙ С ПРОБЛЕМНЫМИ ГЕНЕРАЦИЯМИ       ║
╚═══════════════════════════════════════════════════════════════╝

Этот скрипт поможет:

1️⃣ Найти пользователей с недавними генерациями нейрофото
2️⃣ Проверить статус платежей
3️⃣ Выявить потенциальные проблемы с моделями
4️⃣ Определить у кого могли пропасть модели

`)

async function main() {
  const telegramId = await askQuestion('Введите ваш Telegram ID (или нажмите Enter для поиска всех): ')

  if (telegramId && !/^\d{8,12}$/.test(telegramId)) {
    console.log('❌ Неверный формат Telegram ID. Должно быть 8-12 цифр.')
    process.exit(1)
  }

  console.log(`

🔍 Анализирую данные...

`)

  console.log(`
📊 ИНСТРУКЦИИ ПО АНАЛИЗУ ДАННЫХ:

1️⃣ ВОЙДИТЕ В SUPABASE
   → https://supabase.com/dashboard/project/...
   → SQL Editor

2️⃣ ВЫПОЛНИТЕ ЗАПРОСЫ ДЛЯ ПОИСКА ПРОБЛЕМ:

   -- Найти пользователей с недавними генерациями
   SELECT DISTINCT
     ph.telegram_id,
     u.username,
     u.first_name,
     ph.created_at,
     ph.prompt,
     ph.status
   FROM prompts_history ph
   LEFT JOIN users u ON u.telegram_id = ph.telegram_id
   WHERE ph.mode = 'neuro_photo'
     AND ph.created_at >= NOW() - INTERVAL '7 days'
   ORDER BY ph.created_at DESC
   LIMIT 50;

   -- Проверить платежи за нейрофото
   SELECT
     p.telegram_id,
     u.username,
     p.created_at,
     p.amount,
     p.stars,
     p.status,
     p.service_type
   FROM payments_v2 p
   LEFT JOIN users u ON u.telegram_id = p.telegram_id
   WHERE p.service_type LIKE '%neuro%'
     AND p.created_at >= NOW() - INTERVAL '7 days'
   ORDER BY p.created_at DESC
   LIMIT 50;

   -- Найти пользователей с неудачными генерациями
   SELECT
     ph.telegram_id,
     u.username,
     COUNT(*) as failed_count,
     MAX(ph.created_at) as last_failure
   FROM prompts_history ph
   LEFT JOIN users u ON u.telegram_id = ph.telegram_id
   WHERE ph.mode = 'neuro_photo'
     AND ph.status != 'success'
     AND ph.created_at >= NOW() - INTERVAL '7 days'
   GROUP BY ph.telegram_id, u.username
   HAVING COUNT(*) > 0
   ORDER BY failed_count DESC;

3️⃣ НАЙТИ МОДЕЛИ ПОЛЬЗОВАТЕЛЯ:
   -- Модели пользователя ${telegramId || 'ID'}
   SELECT
     mt.id,
     mt.model_name,
     mt.trigger_word,
     mt.status,
     mt.api,
     mt.model_url,
     mt.created_at
   FROM model_trainings mt
   WHERE mt.telegram_id = '${telegramId || 'ID'}'
   ORDER BY mt.created_at DESC;

4️⃣ ПРОВЕРИТЬ СВЯЗЬ МЕЖДУ ОПЛАТОЙ И ИСТОРИЕЙ:
   -- Найти оплаты без генераций
   SELECT
     p.telegram_id,
     p.id as payment_id,
     p.created_at as payment_date,
     p.amount,
     p.stars
   FROM payments_v2 p
   LEFT JOIN prompts_history ph ON ph.telegram_id = p.telegram_id
     AND ph.created_at BETWEEN p.created_at - INTERVAL '1 hour' AND p.created_at + INTERVAL '1 hour'
   WHERE p.service_type LIKE '%neuro%'
     AND p.status = 'COMPLETED'
     AND ph.prompt_id IS NULL
   ORDER BY p.created_at DESC
   LIMIT 20;

`)

  if (!telegramId) {
    console.log(`
💡 ПОИСК ВСЕХ АКТИВНЫХ ПОЛЬЗОВАТЕЛЕЙ:

   -- Найти всех пользователей с генерациями за последние 7 дней
   SELECT
     ph.telegram_id,
     u.username,
     u.first_name,
     COUNT(*) as generation_count,
     MAX(ph.created_at) as last_generation,
     MIN(ph.created_at) as first_generation
   FROM prompts_history ph
   LEFT JOIN users u ON u.telegram_id = ph.telegram_id
   WHERE ph.mode = 'neuro_photo'
     AND ph.created_at >= NOW() - INTERVAL '7 days'
   GROUP BY ph.telegram_id, u.username
   ORDER BY generation_count DESC
   LIMIT 50;

`)
  }

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    ✅ АНАЛИЗ ЗАВЕРШЕН                          ║
║                                                               ║
║  Следующие шаги:                                             ║
║  1. Выполните SQL запросы в Supabase                         ║
║  2. Найдите себя в результатах                                ║
║  3. Проверьте статус своих моделей                           ║
║  4. Если модели пропали - переобучите их                      ║
╚═══════════════════════════════════════════════════════════════╝

🎯 ВОЗМОЖНЫЕ ПРИЧИНЫ ПРОБЛЕМ:

1️⃣ Модели удалены из базы данных
   → Решение: Переобучить новые модели

2️⃣ Неправильный trigger word в промпте
   → Решение: Проверить и исправить trigger words

3️⃣ LoRA модель неправильно настроена
   → Решение: Проверить FAL_LORA_* переменные

4️⃣ Ошибки в процессе обучения
   → Решение: Переобучить с новыми фотографиями

5️⃣ Проблемы с качеством исходных фото
   → Решение: Использовать 5-10 качественных фото
`)

  rl.close()
}

function askQuestion(question) {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer.trim())
    })
  })
}

main().catch(error => {
  console.error('💥 Ошибка:', error)
  process.exit(1)
})
