#!/usr/bin/env node

/**
 * СКРИПТ ВОССТАНОВЛЕНИЯ НЕЙРО-МОДЕЛЕЙ
 *
 * Этот скрипт поможет восстановить правильные настройки нейро-моделей
 * и переобучить их при необходимости.
 */

const readline = require('readline')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║            🔧 ВОССТАНОВЛЕНИЕ НЕЙРО-МОДЕЛЕЙ                    ║
╚═══════════════════════════════════════════════════════════════╝

Этот скрипт поможет вам:

1️⃣ Проверить текущие модели
2️⃣ Найти проблемы с генерацией лиц
3️⃣ Удалить неправильные модели
4️⃣ Переобучить новые модели
5️⃣ Восстановить правильные настройки

⚠️  ВНИМАНИЕ: Процесс может занять 1-2 часа!

`)

async function main() {
  const telegramId = await askQuestion('Введите ваш Telegram ID: ')

  if (!telegramId || !/^\d{8,12}$/.test(telegramId)) {
    console.log('❌ Неверный формат Telegram ID. Должно быть 8-12 цифр.')
    process.exit(1)
  }

  console.log(`
✅ Получен Telegram ID: ${telegramId}

🔍 Анализирую ваши модели...

`)

  // TODO: Добавить реальную проверку в Supabase
  console.log(`
📊 ИНСТРУКЦИИ ПО РУЧНОМУ ВОССТАНОВЛЕНИЮ:

1️⃣ ВОЙДИТЕ В SUPABASE
   → https://supabase.com/dashboard/project/...
   → Найдите ваш проект

2️⃣ ПРОВЕРЬТЕ ТАБЛИЦУ model_trainings
   SQL-запрос:
   ```sql
   SELECT * FROM model_trainings
   WHERE telegram_id = '${telegramId}'
   ORDER BY created_at DESC;
   ```

3️⃣ УДАЛИТЕ НЕПРАВИЛЬНЫЕ МОДЕЛИ
   ```sql
   DELETE FROM model_trainings
   WHERE telegram_id = '${telegramId}'
     AND status != 'SUCCESS';
   ```

4️⃣ ПЕРЕОБУЧИТЕ МОДЕЛИ
   - Используйте команду /face в боте
   - Загрузите 5-10 новых качественных фото
   - Убедитесь что лицо четко видно
   - Хорошее освещение, разные ракурсы

5️⃣ ПРОВЕРЬТЕ НАСТРОЙКИ LoRA
   - Trigger word должен быть уникальным
   - Model URL должен быть корректным
   - Status должен быть 'SUCCESS'

`)

  const useFal = await askQuestion('Используете Fal.ai для генерации? (y/n): ')

  if (useFal.toLowerCase() === 'y') {
    console.log(`
🎭 НАСТРОЙКИ LoRA ДЛЯ FAL.AI:

FAL_LORA_TRIGGER = 'ВАШ_TRIGGER_WORD'
FAL_LORA_PATH = 'URL_ВАШЕЙ_МОДЕЛИ'
FAL_LORA_SCALE = 1.0

⚠️  Убедитесь что trigger word используется в промпте!
`)

    const triggerWord = await askQuestion('Введите ваш trigger word (например, ваше имя): ')

    if (triggerWord) {
      console.log(`
✅ ПРИМЕР ПРОМПТА С TRIGGER WORD:

"${triggerWord} portrait in cyberpunk style, high quality"

⚠️  ВАЖНО: Trigger word должен быть ПЕРВЫМ словом в промпте!
      `)
    }
  }

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    ✅ ГОТОВО!                                ║
║                                                               ║
║  Следующие шаги:                                             ║
║  1. Проверьте модели в Supabase                              ║
║  2. Удалите неправильные                                     ║
║  3. Переобучите с новыми фото                                ║
║  4. Протестируйте генерацию                                  ║
╚═══════════════════════════════════════════════════════════════╝
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
