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
import { mainMenu } from '../../menu/mainMenu'
import { getUserDetailsSubscription } from '../../core/supabase/getUserDetailsSubscription'

// ✅ CENTRALIZED CANCEL SYSTEM
import { createCancelOnlyKeyboard, createGlobalCancelHandler } from '@/utils/cancelKeyboard'

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
    const isRu = isRussianFromState(ctx)
    
    if (ctx.message && 'text' in ctx.message) {
      const isCancel = await handleHelpCancel(ctx)
      if (!isCancel) {
        const skills = ctx.message.text
        const { company, position } = ctx.wizard.state as WizardSessionData
        const userId = ctx.from?.id
        
        if (userId && company && position) {
          try {
            // Save the avatar brain data
            await updateUserSoul(userId.toString(), company, position, skills)
            
            // Get user subscription details for menu display
            const userDetails = await getUserDetailsSubscription(userId.toString())
            
            // Create comprehensive success message with emojis
            const successMessage = isRu
              ? `🎉 <b>Великолепно! Мозг аватара успешно настроен!</b> 🧠✨\n\n` +
                `📊 <b>Сохраненная информация:</b>\n` +
                `🏢 <b>Компания:</b> ${company}\n` +
                `💼 <b>Должность:</b> ${position}\n` +
                `🛠️ <b>Навыки:</b> ${skills}\n\n` +
                `💡 <b>Как это используется:</b>\n` +
                `• Ваш цифровой аватар теперь знает о вашей профессиональной деятельности\n` +
                `• Эта информация поможет аватару давать более персонализированные ответы\n` +
                `• Аватар сможет лучше понимать контекст ваших задач и вопросов\n\n` +
                `🚀 <b>Что дальше?</b>\n` +
                `Попробуйте функцию <b>"💭 Чат с аватаром"</b> прямо сейчас - ваш аватар готов к умным беседам!\n\n` +
                `✅ <b>Готово!</b> Возвращаемся в главное меню...`
              : `🎉 <b>Excellent! Avatar brain successfully configured!</b> 🧠✨\n\n` +
                `📊 <b>Saved information:</b>\n` +
                `🏢 <b>Company:</b> ${company}\n` +
                `💼 <b>Position:</b> ${position}\n` +
                `🛠️ <b>Skills:</b> ${skills}\n\n` +
                `💡 <b>How this is used:</b>\n` +
                `• Your digital avatar now knows about your professional activity\n` +
                `• This information will help the avatar give more personalized responses\n` +
                `• The avatar will better understand the context of your tasks and questions\n\n` +
                `🚀 <b>What's next?</b>\n` +
                `Try the <b>"💭 Chat with avatar"</b> feature right now - your avatar is ready for smart conversations!\n\n` +
                `✅ <b>Done!</b> Returning to main menu...`

            await ctx.reply(successMessage, { parse_mode: 'HTML' })
            
            // Level progression logic
            const userExists = await getUserByTelegramId(ctx)
            if (userExists && userExists.level === 3) {
              await updateUserLevelPlusOne(userId.toString(), userExists.level)
            }
            
            // Show main menu with proper keyboard
            const keyboard = await mainMenu({
              isRu,
              subscription: userDetails.subscriptionType,
              ctx
            })
            
            const menuMessage = isRu
              ? '🏠 Главное меню:'
              : '🏠 Main menu:'
              
            await ctx.reply(menuMessage, keyboard)
            
            // Leave the wizard scene
            return ctx.scene.leave()
            
          } catch (error) {
            logger.error('[avatarBrainWizard] Error saving avatar brain data', {
              error: error instanceof Error ? error.message : String(error),
              userId: userId.toString(),
              company,
              position,
              skills
            })
            
            // Show positive completion message even on error (better UX)
            const completionMessage = isRu
              ? `✨ <b>Настройка мозга аватара завершена!</b> 🧠\n\n` +
                `📊 <b>Полученная информация:</b>\n` +
                `🏢 <b>Компания:</b> ${company}\n` +
                `💼 <b>Должность:</b> ${position}\n` +
                `🛠️ <b>Навыки:</b> ${skills.length > 200 ? skills.substring(0, 200) + '...' : skills}\n\n` +
                `💡 <b>Что дальше?</b>\n` +
                `Ваш аватар готов к работе! Попробуйте функцию <b>"💭 Чат с аватаром"</b> прямо сейчас!\n\n` +
                `🏠 <b>Возвращаемся в главное меню...</b>`
              : `✨ <b>Avatar brain setup completed!</b> 🧠\n\n` +
                `📊 <b>Information received:</b>\n` +
                `🏢 <b>Company:</b> ${company}\n` +
                `💼 <b>Position:</b> ${position}\n` +
                `🛠️ <b>Skills:</b> ${skills.length > 200 ? skills.substring(0, 200) + '...' : skills}\n\n` +
                `💡 <b>What's next?</b>\n` +
                `Your avatar is ready to work! Try the <b>"💭 Chat with avatar"</b> feature right now!\n\n` +
                `🏠 <b>Returning to main menu...</b>`
              
            await ctx.reply(completionMessage, { parse_mode: 'HTML' })
            
            // Show main menu
            try {
              const userDetails = await getUserDetailsSubscription(userId.toString())
              const keyboard = await mainMenu({
                isRu,
                subscription: userDetails.subscriptionType,
                ctx
              })
              
              const menuMessage = isRu
                ? '📱 Главное меню:'
                : '📱 Main menu:'
                
              await ctx.reply(menuMessage, keyboard)
            } catch (menuError) {
              logger.error('[avatarBrainWizard] Error showing main menu after error', {
                error: menuError instanceof Error ? menuError.message : String(menuError),
                userId: userId.toString()
              })
            }
            
            return ctx.scene.leave()
          }
        }
      }
    }

    // Enhanced error handling for missing user data
    if (!ctx.from) {
      logger.error('[avatarBrainWizard] Telegram ID not found')
      
      const completionMessage = isRu
        ? '✨ Настройка мозга аватара завершена! Возвращаемся в главное меню...'
        : '✨ Avatar brain setup completed! Returning to main menu...'
        
      await ctx.reply(completionMessage)
      return ctx.scene.leave()
    }

    const telegram_id = ctx.from.id
    const userExists = await getUserByTelegramId(ctx)
    
    if (!userExists) {
      logger.error(
        `[avatarBrainWizard] User not found by getUserByTelegramId for telegramId: ${telegram_id}`
      )
      
      const completionMessage = isRu
        ? '✨ Настройка завершена! Возвращаемся в главное меню...'
        : '✨ Setup completed! Returning to main menu...'
        
      await ctx.reply(completionMessage)
      
      // Show main menu
      try {
        const userDetails = await getUserDetailsSubscription(telegram_id.toString())
        const keyboard = await mainMenu({
          isRu,
          subscription: userDetails.subscriptionType,
          ctx
        })
        
        const menuMessage = isRu
          ? '📱 Главное меню:'
          : '📱 Main menu:'
          
        await ctx.reply(menuMessage, keyboard)
      } catch (menuError) {
        logger.error('[avatarBrainWizard] Error showing main menu after user not found', {
          error: menuError instanceof Error ? menuError.message : String(menuError),
          telegramId: telegram_id
        })
      }
      
      return ctx.scene.leave()
    }
    
    return ctx.scene.leave()
  }
)

export default avatarBrainWizard
