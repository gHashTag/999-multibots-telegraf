import { TelegramId } from '@/interfaces/telegram.interface'
import { Telegraf } from 'telegraf'
import { MyContext } from './interfaces'
import { supabase } from './core/supabase'
import { buildAgentTaskUrl } from './navigation/helpers/agentTaskButtons'

// Резервный ID для тестирования, если владелец не найден в базе
const FALLBACK_OWNER_ID = '144022504'

export async function setBotCommands(bot: Telegraf<MyContext>) {
  try {
    // Получаем информацию о боте
    const botInfo = await bot.telegram.getMe()
    const botName = botInfo.username

    // Telegram applies its default chat menu button to private chats only.
    // Provision it for every bot instead of relying on manual BotFather state.
    try {
      await bot.telegram.setChatMenuButton({
        menuButton: {
          type: 'web_app',
          text: 'APP',
          web_app: {
            url: buildAgentTaskUrl({
              type: 'open_mini_app',
              destination: 'chat',
            }),
          },
        },
      })
    } catch {
      console.warn('[Navigation] Could not configure the APP menu button', {
        botName,
      })
    }

    let ownerTelegramId = FALLBACK_OWNER_ID // По умолчанию используем резервный ID

    try {
      // Пытаемся получить владельца бота из базы данных
      const { data, error } = await supabase
        .from('avatars')
        .select('telegram_id')
        .eq('bot_name', botName)
        .maybeSingle()

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
    // ✅ УДАЛЕН /menu - теперь /start показывает главное меню напрямую
    const privateCommands = [
      {
        command: 'start',
        description: '📟 Главное меню / Main menu',
      },
      {
        command: 'app',
        description: '🔑 Войти в приложение / Sign in to the app',
      },
      {
        command: 'support',
        description: '🛠 Tech Support / Техподдержка',
      },
      {
        command: 'price',
        description: '⭐️ Price / Цена',
      },
    ]
    // Клубный бот показывает вход в «Золотую Литейную» прямо в меню
    if (botName === 't27ai_bot') {
      privateCommands.splice(1, 0, {
        command: 'club',
        description: '🏛 Золотая Литейная / Golden Foundry',
      })
    }
    await bot.telegram.setMyCommands(privateCommands, {
      scope: {
        type: 'all_private_chats',
      },
    })

    // Устанавливаем команды для владельца бота (опционально - может не сработать если владелец не начал чат)
    // ✅ УДАЛЕН /menu - теперь /start показывает главное меню напрямую
    try {
      await bot.telegram.setMyCommands(
        [
          {
            command: 'start',
            description: '📟 Главное меню / Main menu',
          },
          {
            command: 'app',
            description: '🔑 Войти в приложение / Sign in to the app',
          },
          {
            command: 'support',
            description: '🛠 Tech Support / Техподдержка',
          },
          {
            command: 'price',
            description: '⭐️ Price / Цена',
          },
        ],
        {
          scope: {
            type: 'chat',
            chat_id: parseInt(ownerTelegramId),
          },
        }
      )
      console.log('✅ Команды для владельца бота установлены:', {
        description: 'Owner commands set successfully',
        botName,
        ownerTelegramId,
      })
    } catch (ownerError) {
      // Это нормально - владелец может ещё не начать чат с ботом
      console.log(
        'ℹ️ Команды для владельца не установлены (владелец ещё не начал чат с ботом):',
        {
          description:
            'Owner commands not set - owner has not started chat with bot yet',
          botName,
          ownerTelegramId,
          hint: 'Owner should press /start in bot to enable personalized commands',
        }
      )
    }

    console.log('✅ Команды бота успешно установлены:', {
      description: 'Bot commands set successfully for private chats',
      botName,
    })
  } catch (error) {
    console.error('❌ Критическая ошибка при установке команд бота:', {
      description: 'Critical error setting bot commands',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
