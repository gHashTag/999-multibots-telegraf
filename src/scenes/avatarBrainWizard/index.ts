import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { updateUserSoul } from '../../core/supabase'
import { isRussianFromState } from '../../helpers/centralizedLanguage'
import { handleHelpCancel, createHelpCancelKeyboard, getMainMenuText } from '@/navigation'
import {
  getUserByTelegramId,
  updateUserLevelPlusOne,
} from '../../core/supabase'
import { ModeEnum } from '../../interfaces/modes'
import { logger } from '../../utils/logger'

// Максимальная длина для различных полей
const MAX_LENGTHS = {
  company: 100,
  position: 100,
  skills: 1000,
}

interface WizardSessionData extends Scenes.WizardSessionData {
  company?: string
  position?: string
  skills?: string
}

// Функция для нормализации и валидации ввода
const normalizeInput = (text: string, maxLength: number): string => {
  return text.trim().slice(0, maxLength)
}

// Функция для проверки корректности ввода
const validateInput = (text: string, maxLength: number): boolean => {
  const normalized = text.trim()
  return normalized.length > 0 && normalized.length <= maxLength
}

// Создание сцены для настройки мозга аватара
export const avatarBrainWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.Avatar,
  // Шаг 1: Запрос названия компании
  async ctx => {
    const isRu = isRussianFromState(ctx)
    await ctx.reply(
      isRu
        ? '👋 Введите название вашей компании'
        : '👋 Enter your company name',
      createHelpCancelKeyboard(isRu)
    )
    return ctx.wizard.next()
  },

  // Шаг 2: Обработка названия компании и запрос должности
  async ctx => {
    const isRu = isRussianFromState(ctx)

    // Проверка на текстовое сообщение
    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, отправьте текстовое сообщение'
          : '❌ Please send a text message'
      )
      return
    }

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) return ctx.scene.leave()

    const input = ctx.message.text

    // Проверка длины ввода
    if (!validateInput(input, MAX_LENGTHS.company)) {
      await ctx.reply(
        isRu
          ? `❌ Название компании должно быть короче ${MAX_LENGTHS.company} символов`
          : `❌ Company name must be less than ${MAX_LENGTHS.company} characters`
      )
      return
    }

    // Сохраняем нормализованное название компании
    ;(ctx.wizard.state as WizardSessionData).company = normalizeInput(
      input,
      MAX_LENGTHS.company
    )

    // Запрашиваем должность
    await ctx.reply(
      isRu ? '💼 Укажите вашу должность' : '💼 Enter your position',
      createHelpCancelKeyboard(isRu)
    )
    return ctx.wizard.next()
  },

  // Шаг 3: Обработка должности и запрос навыков
  async ctx => {
    const isRu = isRussianFromState(ctx)

    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, отправьте текстовое сообщение'
          : '❌ Please send a text message'
      )
      return
    }

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) return ctx.scene.leave()

    const input = ctx.message.text

    if (!validateInput(input, MAX_LENGTHS.position)) {
      await ctx.reply(
        isRu
          ? `❌ Название должности должно быть короче ${MAX_LENGTHS.position} символов`
          : `❌ Position name must be less than ${MAX_LENGTHS.position} characters`
      )
      return
    }

    // Сохраняем нормализованную должность
    ;(ctx.wizard.state as WizardSessionData).position = normalizeInput(
      input,
      MAX_LENGTHS.position
    )

    // Запрашиваем навыки
    await ctx.reply(
      isRu
        ? '🛠️ Опишите ваши профессиональные навыки'
        : '🛠️ Describe your professional skills',
      createHelpCancelKeyboard(isRu)
    )
    return ctx.wizard.next()
  },

  // Шаг 4: Финальная обработка и сохранение данных
  async ctx => {
    const isRu = isRussianFromState(ctx)

    // Проверяем наличие текстового сообщения
    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, отправьте текстовое сообщение'
          : '❌ Please send a text message'
      )
      return
    }

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) return ctx.scene.leave()

    const input = ctx.message.text

    // Проверяем длину описания навыков
    if (!validateInput(input, MAX_LENGTHS.skills)) {
      await ctx.reply(
        isRu
          ? `❌ Описание навыков должно быть короче ${MAX_LENGTHS.skills} символов`
          : `❌ Skills description must be less than ${MAX_LENGTHS.skills} characters`
      )
      return
    }

    // Получаем и проверяем все необходимые данные
    const userId = ctx.from?.id
    const { company, position } = ctx.wizard.state as WizardSessionData
    const skills = normalizeInput(input, MAX_LENGTHS.skills)

    if (!userId || !company || !position) {
      logger.error('[avatarBrainWizard] Missing required data', {
        userId,
        company,
        position,
      })
      await ctx.reply(
        isRu
          ? '❌ Не хватает необходимых данных. Пожалуйста, начните сначала.'
          : '❌ Missing required data. Please start over.',
        {
          reply_markup: Markup.keyboard([
            [Markup.button.text(getMainMenuText(isRu))],
          ]).resize(),
        }
      )
      return ctx.scene.leave()
    }

    try {
      // Сохраняем данные
      await updateUserSoul(userId.toString(), company, position, skills)

      // Обновляем уровень пользователя если нужно
      if (ctx.from) {
        const userDetails = await getUserByTelegramId(ctx)
        if (userDetails?.level === 3) {
          await updateUserLevelPlusOne(
            ctx.from.id.toString(),
            userDetails.level
          )
        }
      }

      // Отправляем подтверждающее сообщение
      await ctx.reply(
        isRu
          ? `✨ Мозг аватара успешно создан!\n\n📋 Сводка:\n• Компания: ${company}\n• Должность: ${position}\n• Навыки: ${skills}\n\nПереходим в главное меню.`
          : `✨ Avatar's brain successfully created!\n\n📋 Summary:\n• Company: ${company}\n• Position: ${position}\n• Skills: ${skills}\n\nReturning to main menu.`,
        {
          parse_mode: 'HTML',
          reply_markup: Markup.keyboard([
            [Markup.button.text(getMainMenuText(isRu))],
          ]).resize(),
        }
      )

      // Небольшая пауза для чтения сообщения
      await new Promise(resolve => setTimeout(resolve, 500))

      // Завершаем сцену и переходим в главное меню
      await ctx.scene.leave()
      await ctx.scene.leave()
      const { showMainMenu } = await import('@/navigation')
      await showMainMenu(ctx)
      return
    } catch (error) {
      logger.error('[avatarBrainWizard] Error saving data:', error)

      await ctx.reply(
        isRu
          ? '❌ Ошибка при сохранении данных. Пожалуйста, используйте команду /menu'
          : '❌ Error saving data. Please use /menu command',
        {
          reply_markup: Markup.keyboard([
            [Markup.button.text(getMainMenuText(isRu))],
          ]).resize(),
        }
      )

      return ctx.scene.leave()
    }
  }
)

export default avatarBrainWizard
