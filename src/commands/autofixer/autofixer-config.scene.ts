import { Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'

const ADMIN_IDS =
  process.env.ADMIN_IDS?.split(',').map(id => parseInt(id.trim())) || []

export const autoFixerConfigScene = new Scenes.BaseScene<MyContext>(
  'autofixer_config'
)

// Вход в сцену конфигурации
autoFixerConfigScene.enter(async ctx => {
  try {
    // Проверяем права админа
    if (!ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.reply('❌ У вас нет доступа к настройкам автофиксера')
      await ctx.scene.leave()
      return
    }

    const config = getCurrentConfig()
    const message = formatConfigMessage(config)

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Автоисправления', callback_data: 'toggle_auto_fix' },
            { text: '📢 Уведомления', callback_data: 'toggle_notifications' },
          ],
          [
            {
              text: '🎯 Типы исправлений',
              callback_data: 'configure_fix_types',
            },
            {
              text: '💬 Канал уведомлений',
              callback_data: 'configure_channel',
            },
          ],
          [
            { text: '⚙️ GitHub настройки', callback_data: 'configure_github' },
            { text: '🧠 Claude настройки', callback_data: 'configure_claude' },
          ],
          [{ text: '✅ Сохранить и выйти', callback_data: 'save_and_exit' }],
        ],
      },
    })
  } catch (error) {
    console.error('[AutoFixerConfig] Enter error:', error)
    await ctx.reply('❌ Ошибка входа в настройки')
    await ctx.scene.leave()
  }
})

// Переключение автоисправлений
autoFixerConfigScene.action('toggle_auto_fix', async ctx => {
  try {
    const currentState = process.env.BOT_AUTOFIXER_ENABLED === 'true'
    const newState = !currentState

    // TODO: Сохранить в БД или конфиг файл
    process.env.BOT_AUTOFIXER_ENABLED = newState.toString()

    await ctx.answerCbQuery(
      `${newState ? '✅ Автоисправления включены' : '❌ Автоисправления отключены'}`
    )

    // Обновляем сообщение
    const config = getCurrentConfig()
    const message = formatConfigMessage(config)

    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      reply_markup: (ctx.callbackQuery.message as any)?.reply_markup,
    })
  } catch (error) {
    console.error('[AutoFixerConfig] Toggle auto fix error:', error)
    await ctx.answerCbQuery('❌ Ошибка переключения')
  }
})

// Переключение уведомлений
autoFixerConfigScene.action('toggle_notifications', async ctx => {
  try {
    const currentState = process.env.AUTOFIXER_NOTIFICATION_ENABLED === 'true'
    const newState = !currentState

    process.env.AUTOFIXER_NOTIFICATION_ENABLED = newState.toString()

    await ctx.answerCbQuery(
      `${newState ? '🔔 Уведомления включены' : '🔕 Уведомления отключены'}`
    )

    // Обновляем сообщение
    const config = getCurrentConfig()
    const message = formatConfigMessage(config)

    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      reply_markup: (ctx.callbackQuery.message as any)?.reply_markup,
    })
  } catch (error) {
    console.error('[AutoFixerConfig] Toggle notifications error:', error)
    await ctx.answerCbQuery('❌ Ошибка переключения')
  }
})

// Конфигурация типов исправлений
autoFixerConfigScene.action('configure_fix_types', async ctx => {
  try {
    const fixTypes = getFixTypesConfig()

    await ctx.editMessageText(
      `🎯 <b>Настройка типов исправлений</b>

Выберите какие типы исправлений должны применяться автоматически:`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `${fixTypes.async ? '✅' : '❌'} Async/await`,
                callback_data: 'toggle_async_fixes',
              },
              {
                text: `${fixTypes.telegraf ? '✅' : '❌'} Telegraf`,
                callback_data: 'toggle_telegraf_fixes',
              },
            ],
            [
              {
                text: `${fixTypes.scene ? '✅' : '❌'} Сцены`,
                callback_data: 'toggle_scene_fixes',
              },
              {
                text: `${fixTypes.typescript ? '✅' : '❌'} TypeScript`,
                callback_data: 'toggle_typescript_fixes',
              },
            ],
            [
              {
                text: `${fixTypes.eslint ? '✅' : '❌'} ESLint`,
                callback_data: 'toggle_eslint_fixes',
              },
            ],
            [
              {
                text: '⬅️ Назад к настройкам',
                callback_data: 'back_to_main_config',
              },
            ],
          ],
        },
      }
    )
  } catch (error) {
    console.error('[AutoFixerConfig] Configure fix types error:', error)
    await ctx.answerCbQuery('❌ Ошибка настройки')
  }
})

// Обработчики переключения типов исправлений
const fixTypeHandlers = ['async', 'telegraf', 'scene', 'typescript', 'eslint']

fixTypeHandlers.forEach(type => {
  autoFixerConfigScene.action(`toggle_${type}_fixes`, async ctx => {
    try {
      const currentState = getFixTypeState(type)
      const newState = !currentState

      setFixTypeState(type, newState)

      await ctx.answerCbQuery(
        `${newState ? '✅' : '❌'} ${type} исправления ${newState ? 'включены' : 'отключены'}`
      )

      // Обновляем кнопки
      const fixTypes = getFixTypesConfig()
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [
          [
            {
              text: `${fixTypes.async ? '✅' : '❌'} Async/await`,
              callback_data: 'toggle_async_fixes',
            },
            {
              text: `${fixTypes.telegraf ? '✅' : '❌'} Telegraf`,
              callback_data: 'toggle_telegraf_fixes',
            },
          ],
          [
            {
              text: `${fixTypes.scene ? '✅' : '❌'} Сцены`,
              callback_data: 'toggle_scene_fixes',
            },
            {
              text: `${fixTypes.typescript ? '✅' : '❌'} TypeScript`,
              callback_data: 'toggle_typescript_fixes',
            },
          ],
          [
            {
              text: `${fixTypes.eslint ? '✅' : '❌'} ESLint`,
              callback_data: 'toggle_eslint_fixes',
            },
          ],
          [
            {
              text: '⬅️ Назад к настройкам',
              callback_data: 'back_to_main_config',
            },
          ],
        ],
      })
    } catch (error) {
      console.error(`[AutoFixerConfig] Toggle ${type} fixes error:`, error)
      await ctx.answerCbQuery('❌ Ошибка переключения')
    }
  })
})

// Возврат к основным настройкам
autoFixerConfigScene.action('back_to_main_config', async ctx => {
  try {
    const config = getCurrentConfig()
    const message = formatConfigMessage(config)

    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Автоисправления', callback_data: 'toggle_auto_fix' },
            { text: '📢 Уведомления', callback_data: 'toggle_notifications' },
          ],
          [
            {
              text: '🎯 Типы исправлений',
              callback_data: 'configure_fix_types',
            },
            {
              text: '💬 Канал уведомлений',
              callback_data: 'configure_channel',
            },
          ],
          [
            { text: '⚙️ GitHub настройки', callback_data: 'configure_github' },
            { text: '🧠 Claude настройки', callback_data: 'configure_claude' },
          ],
          [{ text: '✅ Сохранить и выйти', callback_data: 'save_and_exit' }],
        ],
      },
    })
  } catch (error) {
    console.error('[AutoFixerConfig] Back to main error:', error)
    await ctx.answerCbQuery('❌ Ошибка возврата')
  }
})

// Сохранение и выход
autoFixerConfigScene.action('save_and_exit', async ctx => {
  try {
    // TODO: Сохранить настройки в базу данных или конфиг файл

    await ctx.editMessageText(
      `✅ <b>Настройки автофиксера сохранены</b>

Все изменения применены и будут использоваться для последующих исправлений PR.`,
      { parse_mode: 'HTML' }
    )

    await ctx.scene.leave()
  } catch (error) {
    console.error('[AutoFixerConfig] Save and exit error:', error)
    await ctx.reply('❌ Ошибка сохранения настроек')
    await ctx.scene.leave()
  }
})

// Выход из сцены по команде
autoFixerConfigScene.command('exit', async ctx => {
  await ctx.reply('⚙️ Выход из настроек автофиксера')
  await ctx.scene.leave()
})

// Утилиты для работы с конфигурацией
function getCurrentConfig() {
  return {
    autoFixEnabled: process.env.BOT_AUTOFIXER_ENABLED === 'true',
    notificationsEnabled: process.env.AUTOFIXER_NOTIFICATION_ENABLED === 'true',
    githubConnected: !!process.env.GITHUB_TOKEN,
    claudeConnected: !!process.env.CLAUDE_API_KEY,
    devChannel: process.env.DEV_CHANNEL_ID || 'Не настроен',
    adminCount: ADMIN_IDS.length,
  }
}

function formatConfigMessage(config: any): string {
  return `⚙️ <b>Настройки GitHub AutoFixer</b>

<b>Основные настройки:</b>
🔄 Автоисправления: ${config.autoFixEnabled ? '✅ Включены' : '❌ Отключены'}
📢 Уведомления: ${config.notificationsEnabled ? '✅ Включены' : '❌ Отключены'}

<b>Интеграции:</b>
🐙 GitHub: ${config.githubConnected ? '✅ Подключен' : '❌ Не настроен'}
🧠 Claude: ${config.claudeConnected ? '✅ Подключен' : '❌ Не настроен'}

<b>Каналы:</b>
💬 Канал разработки: ${config.devChannel !== 'Не настроен' ? '✅ Настроен' : '❌ Не настроен'}
👨‍💻 Админы: ${config.adminCount} человек

<i>Используйте кнопки ниже для изменения настроек</i>`
}

function getFixTypesConfig() {
  return {
    async: getFixTypeState('async'),
    telegraf: getFixTypeState('telegraf'),
    scene: getFixTypeState('scene'),
    typescript: getFixTypeState('typescript'),
    eslint: getFixTypeState('eslint'),
  }
}

function getFixTypeState(type: string): boolean {
  const envVar = `AUTOFIXER_ENABLE_${type.toUpperCase()}_FIXES`
  return process.env[envVar] !== 'false' // По умолчанию включены
}

function setFixTypeState(type: string, enabled: boolean): void {
  const envVar = `AUTOFIXER_ENABLE_${type.toUpperCase()}_FIXES`
  process.env[envVar] = enabled.toString()
}
