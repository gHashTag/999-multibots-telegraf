import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { createMainMenuKeyboard, MAIN_MENU_BUTTONS } from '@/menu/simpleMenu'
import { checkFullAccess } from '@/handlers/checkFullAccess'
import { getUserData, getAvatarWelcomeMessage } from '@/core/supabase'
import { getBotNameByToken } from '@/core/bot'

/**
 * ✅ ПРОСТАЯ START SCENE
 * Показывает главное меню сразу при старте
 */

const startScene = new Scenes.WizardScene<MyContext>(
  'startScene', // Уникальный ID сцены
  
  // Шаг 1: Показываем меню и завершаем сцену
  async (ctx) => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()
    
    console.log('✅ [startScene] Показываем главное меню:', {
      telegramId,
      username: ctx.from?.username,
      firstName: ctx.from?.first_name
    })

    try {
      // Получаем данные пользователя
      const userData = telegramId ? await getUserData(telegramId) : null
      const username = ctx.from?.username || ''
      const fullName = ctx.from?.first_name || ''

      // Определяем имя для приветствия
      const name = fullName || username || (isRu ? 'друг' : 'friend')
      
      // Получаем информацию о боте
      let botName = 'AI Bot'
      try {
        botName = await getBotNameByToken(process.env.BOT_TOKEN || '')
      } catch (error) {
        console.warn('⚠️ Не удалось получить имя бота:', error)
      }

      // Пытаемся получить уникальное приветствие из таблицы avatars
      let customWelcome: string | null = null
      try {
        customWelcome = await getAvatarWelcomeMessage(botName)
        if (customWelcome) {
          console.log('✅ [startScene] Получено уникальное приветствие из avatars:', {
            botName,
            messageLength: customWelcome.length
          })
        }
      } catch (error) {
        console.warn('⚠️ [startScene] Не удалось получить приветствие из avatars:', error)
      }

      // Создаем приветственное сообщение
      // Если есть уникальное приветствие из avatars - используем его
      // Иначе используем стандартное
      const welcomeText = customWelcome || (isRu
        ? `👋 Привет, ${name}!\n\n🤖 Добро пожаловать в ${botName}!\n\n🎯 Выберите нужную функцию из меню ниже:`
        : `👋 Hello, ${name}!\n\n🤖 Welcome to ${botName}!\n\n🎯 Select the function you need from the menu below:`)

      // Создаем клавиатуру с главным меню
      const keyboard = createMainMenuKeyboard(ctx)

      // Отправляем приветствие с меню
      await ctx.reply(welcomeText, {
        reply_markup: keyboard.reply_markup
      })

      // Логируем статистику
      console.log('✅ [startScene] Меню отправлено успешно')

    } catch (error) {
      console.error('❌ [startScene] Ошибка при показе меню:', error)
      
      // Отправляем простое сообщение об ошибке
      await ctx.reply(
        isRu 
          ? '❌ Произошла ошибка. Попробуйте позже.'
          : '❌ An error occurred. Please try again later.'
      )
    }

    // Завершаем сцену - пользователь теперь может использовать кнопки меню
    return ctx.scene.leave()
  }
)

// ✅ ЭКСПОРТ
export default startScene
