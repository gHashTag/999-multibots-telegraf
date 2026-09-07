/**
 * 🚨 СКРИПТ ДЛЯ ПРИНУДИТЕЛЬНОГО ВЫВОДА ПОЛЬЗОВАТЕЛЯ ИЗ ЗАСТРЯВШЕЙ СЦЕНЫ
 *
 * Использование:
 * bun run scripts/users/force-exit-scene.ts <telegram_id>
 *
 * Пример:
 * bun run scripts/users/force-exit-scene.ts 5732975798
 */

import { getBotTokenByName } from '@/core/getBotTokenByName'
import { getUserByTelegramId } from '@/core/supabase/getUserByTelegramId'
import axios from 'axios'
import { logger } from '@/utils/logger'
import { initInfisical, getSecret } from '@/core/infisical'
import { telegramApiFor } from '@/services/telegramApi'

// Безопасное получение секрета (не падает, если секрет не найден)
function getSecretSafe(secretName: string): string | undefined {
  try {
    return getSecret(secretName)
  } catch (error) {
    console.warn(
      `⚠️ Секрет "${secretName}" не найден в Infisical, пропускаем...`
    )
    return undefined
  }
}

// Инициализация Infisical для загрузки секретов
async function initializeInfisical() {
  console.log('🔐 Инициализация Infisical...')

  try {
    await initInfisical()

    // Загружаем необходимые секреты в process.env (обязательные)
    const supabaseUrl = getSecret('SUPABASE_URL')
    const supabaseServiceKey = getSecret('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseAnonKey = getSecret('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error('Критические секреты Supabase не найдены!')
    }

    process.env.SUPABASE_URL = supabaseUrl
    process.env.SUPABASE_SERVICE_ROLE_KEY = supabaseServiceKey
    process.env.SUPABASE_ANON_KEY = supabaseAnonKey

    // Загружаем токены ботов (опционально - только те, что есть)
    const botTokens = [
      'BOT_TOKEN_1',
      'BOT_TOKEN_2',
      'BOT_TOKEN_3',
      'BOT_TOKEN_4',
      'BOT_TOKEN_5',
      'BOT_TOKEN_6',
      'BOT_TOKEN_7',
      'BOT_TOKEN_8',
      'BOT_TOKEN_9',
      'BOT_TOKEN_TEST_1',
      'BOT_TOKEN_TEST_2',
    ]

    for (const tokenName of botTokens) {
      const token = getSecretSafe(tokenName)
      if (token) {
        process.env[tokenName] = token
      }
    }

    console.log('✅ Infisical инициализирован успешно')
    return true
  } catch (error) {
    console.error('❌ Ошибка инициализации Infisical:', error)
    throw error
  }
}

async function forceExitScene(telegramId: string): Promise<void> {
  try {
    console.log(
      `🔄 Начинаю процесс вывода пользователя ${telegramId} из сцены...`
    )

    // 1. Получаем информацию о пользователе
    const user = await getUserByTelegramId(telegramId)
    if (!user) {
      console.error(
        `❌ Пользователь с ID ${telegramId} не найден в базе данных`
      )
      process.exit(1)
    }

    console.log(`✅ Пользователь найден: ${user.username || 'без username'}`)
    console.log(`📋 Бот: ${user.bot_name || 'не указан'}`)

    // 2. Определяем бота по bot_name или используем дефолтный
    const botName = user.bot_name || 'neuro_blogger_bot'
    const botToken = getBotTokenByName(botName)

    if (!botToken) {
      console.error(`❌ Токен бота для ${botName} не найден`)
      process.exit(1)
    }

    console.log(`🤖 Используем бота: ${botName}`)

    // 3. Отправляем сообщение пользователю с инструкцией
    const message = `🚨 Внимание!

Вы были принудительно выведены из сцены администратором.

Для продолжения работы используйте команду:
/start

Или команду:
/menu

Это вернет вас в главное меню бота.`

    try {
      // Отправляем простое текстовое сообщение без Markdown
      const response = await axios.post(
        `${telegramApiFor(botToken)}/sendMessage`,
        {
          chat_id: parseInt(telegramId),
          text: message,
        }
      )

      if (response.data.ok) {
        console.log(
          `✅ Сообщение успешно отправлено пользователю ${telegramId}`
        )
        console.log(`📨 Message ID: ${response.data.result.message_id}`)
      } else {
        console.error(
          `❌ Ошибка отправки сообщения:`,
          JSON.stringify(response.data, null, 2)
        )
      }
    } catch (error: any) {
      if (error.response?.data) {
        const errorData = error.response.data
        if (errorData.error_code === 403) {
          console.error(
            `❌ Пользователь заблокировал бота или не может получать сообщения`
          )
        } else {
          console.error(
            `❌ Ошибка при отправке сообщения:`,
            JSON.stringify(errorData, null, 2)
          )
        }
      } else {
        console.error(`❌ Ошибка при отправке сообщения:`, error.message)
      }
    }

    logger.info('Force exit scene executed', {
      telegramId,
      botName,
      username: user.username,
    })

    console.log(`\n✅ Процесс завершен!`)
    console.log(`💡 Рекомендации:`)
    console.log(`   1. Пользователь должен получить сообщение с инструкцией`)
    console.log(
      `   2. Если пользователь все еще застрял, попросите его перезапустить Telegram`
    )
    console.log(`   3. Проверьте логи бота для диагностики`)
  } catch (error) {
    console.error(`❌ Критическая ошибка:`, error)
    logger.error('Force exit scene failed', {
      telegramId,
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  }
}

// Запуск скрипта
const telegramId = process.argv[2]

if (!telegramId) {
  console.error('❌ Укажите Telegram ID пользователя')
  console.error(
    'Использование: bun run scripts/users/force-exit-scene.ts <telegram_id>'
  )
  console.error('Пример: bun run scripts/users/force-exit-scene.ts 5732975798')
  process.exit(1)
}

// Инициализируем Infisical и запускаем скрипт
initializeInfisical()
  .then(() => forceExitScene(telegramId))
  .then(() => {
    console.log('\n🎉 Готово!')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n❌ Ошибка выполнения:', error)
    process.exit(1)
  })
