import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { updateUserSoul, updateUserLevelPlusOne } from '../../core/supabase'
import { isRussian } from '@/helpers'
import { createHelpButton } from '@/menu/buttons'
import { getUserByTelegramId } from '../../core/supabase'

interface WizardSessionData extends Scenes.WizardSessionData {
  company?: string
  position?: string
}

export const avatarBrainWizard = new Scenes.WizardScene<MyContext>(
  'avatar_brain',
  async ctx => {
    const isRu = isRussian(ctx)
    await ctx.reply(
      isRu
        ? '👋 Привет, как называется ваша компания?'
        : '👋 Hello, what is your company name?',
      Markup.inlineKeyboard([[createHelpButton()]])
    )
    return ctx.wizard.next()
  },

  async ctx => {
    const isRu = isRussian(ctx)
    if (ctx.message && 'text' in ctx.message) {
      const text = ctx.message.text
      ;(ctx.wizard.state as WizardSessionData).company = text
      await ctx.reply(
        isRu ? '💼 Какая у вас должность?' : '💼 What is your position?',
        Markup.inlineKeyboard([[createHelpButton()]])
      )
      return ctx.wizard.next()
    }
    return ctx.scene.leave()
  },
  async ctx => {
    const isRu = isRussian(ctx)
    if (ctx.message && 'text' in ctx.message) {
      const text = ctx.message.text
      ;(ctx.wizard.state as WizardSessionData).position = text
      await ctx.reply(
        isRu ? '🛠️ Какие у тебя навыки?' : '🛠️ What are your skills?',
        Markup.inlineKeyboard([[createHelpButton()]])
      )
      return ctx.wizard.next()
    }
    return ctx.scene.leave()
  },
  async ctx => {
    if (ctx.message && 'text' in ctx.message) {
      const skills = ctx.message.text
      const isRu = isRussian(ctx)
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

    if (!ctx.from) {
      console.error('❌ Telegram ID не найден')
      return ctx.scene.leave()
    }

    const telegram_id = ctx.from.id

    const userExists = await getUserByTelegramId(ctx)
    if (!userExists.data) {
      throw new Error(`User with ID ${telegram_id} does not exist.`)
    }
    const level = userExists.data.level
    if (level === 3) {
      await updateUserLevelPlusOne(telegram_id.toString(), level)
    }
    return ctx.scene.leave()
  }
)

export default avatarBrainWizard
