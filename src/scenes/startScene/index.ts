import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
// createMainMenuKeyboard and MAIN_MENU_BUTTONS moved to NavigationService
import { checkFullAccess } from '@/handlers/checkFullAccess'
import { getUserData, getTranslation } from '@/core/supabase'
import { getBotNameByToken } from '@/core/bot'
// ✅ НОВЫЙ: Используем единый сервис навигации
import { showMainMenu } from '@/navigation'

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
        const result = getBotNameByToken(process.env.BOT_TOKEN || '')
        botName = result.bot_name
      } catch (error) {
        console.warn('⚠️ Не удалось получить имя бота:', error)
      }

      // Получаем приветственное сообщение из системы переводов
      let welcomeText = ''
      try {
        const translation = await getTranslation({
          key: 'welcome',
          ctx,
          bot_name: botName
        })

        // Заменяем {name} и {botName} в переводе
        welcomeText = translation.translation
          .replace(/{name}/g, name)
          .replace(/{botName}/g, botName)

        if (welcomeText) {
          console.log('✅ [startScene] Получено приветствие из translations:', {
            botName,
            messageLength: welcomeText.length,
            language: isRu ? 'ru' : 'en'
          })
        }
      } catch (error) {
        console.warn('⚠️ [startScene] Не удалось получить приветствие из translations, используем fallback:', error)
      }

      // Fallback на стандартное приветствие, если не нашли в translations
      if (!welcomeText) {
        welcomeText = isRu
          ? `👋 Привет, ${name}!\n\n🤖 Добро пожаловать в ${botName}!\n\n🎯 Выберите нужную функцию из меню ниже:`
          : `👋 Hello, ${name}!\n\n🤖 Welcome to ${botName}!\n\n🎯 Select the function you need from the menu below:`
      }

      // ✅ НОВЫЙ: Используем единый сервис навигации для показа меню
      // Отправляем приветствие
      await ctx.reply(welcomeText)

      // Показываем главное меню через NavigationService
      await showMainMenu(ctx)

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
