import { TelegramId } from '@/interfaces/telegram.interface'
import { Telegraf } from 'telegraf'
import { MyContext } from './interfaces'
import { supabase } from './core/supabase'

// Резервный ID для тестирования, если владелец не найден в базе
const FALLBACK_OWNER_ID = '144022504'

export async function setBotCommands(bot: Telegraf<MyContext>) {
  try {
    // Получаем информацию о боте
    const botInfo = await bot.telegram.getMe()
    const botName = botInfo.username

    let ownerTelegramId = FALLBACK_OWNER_ID // По умолчанию используем резервный ID

    try {
      // Пытаемся получить владельца бота из базы данных
      const { data, error } = await supabase
        .from('avatars')
        .select('telegram_id')
        .eq('bot_name', botName)
        .single()

      if (error) {
        console.warn('⚠️ Не удалось найти владельца бота в БД:', {
          description: 'Could not find bot owner in database',
          error: error?.message || 'Unknown error',
          botName,
          fallbackAction: 'Using fallback owner ID for testing',
        })
      } else if (data) {
        // Если данные успешно получены, обновляем ID владельца
        ownerTelegramId = data.telegram_id.toString()
        console.log('✅ Найден владелец бота:', {
          description: 'Found bot owner',
          botName,
          ownerTelegramId,
        })
      }
    } catch (dbError) {
      console.error('❌ Ошибка при запросе к базе данных:', {
        description: 'Database query error',
        error: dbError instanceof Error ? dbError.message : 'Unknown error',
        botName,
        fallbackAction: 'Using fallback owner ID for testing',
      })
    }

    // Сначала удаляем все команды для всех областей видимости
    await bot.telegram.deleteMyCommands()
    await bot.telegram.deleteMyCommands({
      scope: { type: 'all_private_chats' },
    })
    await bot.telegram.deleteMyCommands({ scope: { type: 'all_group_chats' } })
    await bot.telegram.deleteMyCommands({
      scope: { type: 'all_chat_administrators' },
    })

    // Устанавливаем команды только для приватных чатов
    await bot.telegram.setMyCommands(
      [
        {
          command: 'start',
          description: '👤 Start / Начать',
        },
        {
          command: 'menu',
          description: '📟 Menu / Главное меню',
        },
        {
          command: 'tech',
          description: '🛠 Tech Support / Техподдержка',
        },
        {
          command: 'price',
          description: '⭐️ Price / Цена',
        },
        {
          command: 'receipt',
          description: '🧾 Payment Receipt / Платежный чек',
        },
      ],
      {
        scope: {
          type: 'all_private_chats',
        },
      }
    )

    // Устанавливаем команды для владельца бота
    await bot.telegram.setMyCommands(
      [
        {
          command: 'start',
          description: '👤 Start / Начать',
        },
        {
          command: 'menu',
          description: '📟 Menu / Главное меню',
        },
        {
          command: 'tech',
          description: '🛠 Tech Support / Техподдержка',
        },
        {
          command: 'price',
          description: '⭐️ Price / Цена',
        },
        {
          command: 'receipt',
          description: '🧾 Payment Receipt / Платежный чек',
        },
        {
          command: 'stats',
          description: '📊 Statistics / Статистика',
        },
        {
          command: 'broadcast',
          description: '📢 Broadcast / Рассылка сообщений',
        },
      ],
      {
        scope: {
          type: 'chat',
          chat_id: parseInt(ownerTelegramId),
        },
      }
    )

    console.log('✅ Команды бота успешно установлены:', {
      description: 'Bot commands set successfully for private chats',
      botName,
    })
  } catch (error) {
    console.error('❌ Ошибка при установке команд для владельца бота:', {
      description: 'Error setting owner commands',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
