import { Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { updateUserSoul } from '../../core/supabase'
import { isRussianFromState } from '../../helpers/centralizedLanguage'
import { handleHelpCancel } from '../../handlers/handleHelpCancel'
import { createHelpCancelKeyboard } from '../../menu'
import {
  getUserByTelegramId,
  updateUserLevelPlusOne,
} from '../../core/supabase'
import { ModeEnum } from '../../interfaces/modes'
import { logger } from '../../utils/logger'

interface WizardSessionData extends Scenes.WizardSessionData {
  company?: string
  position?: string
}

export const avatarBrainWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.Avatar,
  async ctx => {
    const isRu = isRussianFromState(ctx)
    await ctx.reply(
      isRu
        ? '👋 Привет, как называется ваша компания?'
        : '👋 Hello, what is your company name?',
      createHelpCancelKeyboard(isRu)
    )
    return ctx.wizard.next()
  },

  async ctx => {
    const isRu = isRussianFromState(ctx)
    if (ctx.message && 'text' in ctx.message) {
      const isCancel = await handleHelpCancel(ctx)
      if (!isCancel) {
        ;(ctx.wizard.state as WizardSessionData).company = ctx.message.text
        await ctx.reply(
          isRu ? '💼 Какая у вас должность?' : '💼 What is your position?',
          createHelpCancelKeyboard(isRu)
        )
        return ctx.wizard.next()
      }
    }
    return ctx.scene.leave()
  },
  async ctx => {
    const isRu = isRussianFromState(ctx)
    if (ctx.message && 'text' in ctx.message) {
      const isCancel = await handleHelpCancel(ctx)
      if (!isCancel) {
        ;(ctx.wizard.state as WizardSessionData).position = ctx.message.text
        await ctx.reply(
          isRu ? '🛠️ Какие у тебя навыки?' : '🛠️ What are your skills?',
          createHelpCancelKeyboard(isRu)
        )
        return ctx.wizard.next()
      }
    }
    return ctx.scene.leave()
  },
  async ctx => {
    if (ctx.message && 'text' in ctx.message) {
      const isCancel = await handleHelpCancel(ctx)
      if (!isCancel) {
        const isRu = isRussianFromState(ctx)
        const skills = ctx.message.text
        const { company, position } = ctx.wizard.state as WizardSessionData
        const userId = ctx.from?.id
        if (userId && company && position) {
          await updateUserSoul(userId.toString(), company, position, skills)
          await ctx.reply(
            isRu
              ? `✅ Аватар успешно получил информацию: \n\n <b>Компания:</b> \n ${company} \n\n <b>Должность:</b> \n ${position} \n\n <b>Навыки:</b> \n ${skills}`
              : `✅ Avatar has successfully received the information: \n\n <b>Company:</b> \n ${company} \n\n <b>Position:</b> \n ${position} \n\n <b>Skills:</b> \n ${skills}`,
            {
              parse_mode: 'HTML',
            }
          )
        }
      }
    }

    if (!ctx.from) {
      console.error('❌ Telegram ID не найден')
      return ctx.scene.leave()
    }

    const telegram_id = ctx.from.id

    const userExists = await getUserByTelegramId(ctx)
    if (!userExists) {
      logger.error(
        `[avatarBrainWizard] User not found by getUserByTelegramId for telegramId: ${telegram_id}`
      )
      await ctx.reply(
        isRussianFromState(ctx)
          ? 'Не удалось найти ваши данные. Попробуйте позже.'
          : 'Could not find your data. Please try again later.'
      )
      return ctx.scene.leave()
    }
    const level = userExists.level
    if (level === 3) {
      await updateUserLevelPlusOne(telegram_id.toString(), level)
    }
    return ctx.scene.leave()
  }
)

export default avatarBrainWizard
