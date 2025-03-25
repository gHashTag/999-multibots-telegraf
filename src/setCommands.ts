import { Telegraf } from 'telegraf'
import { MyContext } from './interfaces'
import { supabase } from './core/supabase'

// Резервный ID для тестирования, если владелец не найден в базе
const FALLBACK_OWNER_ID = '144022504'

export async function setBotCommands(bot: Telegraf<MyContext>) {
  // Общие команды для всех пользователей
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
      // {
      //   command: 'invite',
      //   description: '👥 Invite a friend / Пригласить друга',
      // },
      // {
      //   command: 'price',
      //   description: '⭐️ Price / Цена',
      // },
      // {
      //   command: 'buy',
      //   description: '💵 Top up balance / Пополнить баланс',
      // },
      // {
      //   command: 'balance',
      //   description: '💰 Balance / Баланс',
      // },
      // {
      //   command: 'help',
      //   description: '🤖 Help / Помощь',
      // },
    ],
    { scope: { type: 'all_private_chats' } }
  )

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
        error: dbError?.message || 'Unknown error',
        botName,
        fallbackAction: 'Using fallback owner ID for testing',
      })
    }

    // Устанавливаем специальные команды для владельца бота (настоящего или тестового)
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
        // {
        //   command: 'broadcast',
        //   description: '📢 Broadcast / Рассылка сообщений',
        // },
        // {
        //   command: 'stats',
        //   description: '📊 Statistics / Статистика',
        // },
      ],
      {
        scope: {
          type: 'chat',
          chat_id: parseInt(ownerTelegramId),
        },
      }
    )

    console.log('✅ Команды для владельца бота успешно установлены:', {
      description: 'Owner commands set successfully',
      ownerTelegramId,
      botName,
    })
  } catch (error) {
    console.error('❌ Ошибка при установке команд для владельца бота:', {
      description: 'Error setting owner commands',
      error: error?.message || 'Unknown error',
    })
  }
}
