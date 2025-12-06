/**
 * 👤 HANDLER: Profile & Settings Buttons
 *
 * Обрабатывает кнопки профиля: Подписка, Язык, Приглашения, Техподдержка
 */

import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'
import { showCategoryMenu } from '@/navigation'
import { handleTechSupport } from '@/commands/handleTechSupport'
import {
  INVITE_VARIANTS,
  SUPPORT_VARIANTS,
  SUBSCRIPTION_VARIANTS,
  LANGUAGE_VARIANTS,
  AVATAR_LANGUAGE_VARIANTS,
  PROFILE_CATEGORY_VARIANTS
} from '../config/categories.config'

/**
 * Проверяет и обрабатывает нажатие кнопок профиля
 * @returns true если обработано, false если не наш текст
 */
export async function handleProfileButtons(
  ctx: MyContext,
  text: string
): Promise<boolean> {
  // 👥 ПРИГЛАСИТЬ ДРУГА
  if (INVITE_VARIANTS.includes(text)) {
    logger.info('👥 [Profile] Invite friend pressed', {
      telegramId: ctx.from?.id,
      currentScene: ctx.scene?.current?.id,
      text,
    })

    try {
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.InviteScene)
      return true
    } catch (error) {
      logger.error('❌ [Profile] Error handling Invite button:', {
        error,
        telegramId: ctx.from?.id,
      })
      await ctx.reply('❌ Произошла ошибка. Попробуйте /start')
      return true
    }
  }

  // 💬 ТЕХПОДДЕРЖКА
  if (SUPPORT_VARIANTS.includes(text)) {
    logger.info('💬 [Profile] Tech Support pressed', {
      telegramId: ctx.from?.id,
      currentScene: ctx.scene?.current?.id,
    })

    try {
      await ctx.scene.leave()
      await handleTechSupport(ctx)
      return true
    } catch (error) {
      logger.error('❌ [Profile] Error handling Tech Support:', {
        error,
        telegramId: ctx.from?.id,
      })
      await ctx.reply('❌ Произошла ошибка. Попробуйте /start')
      return true
    }
  }

  // 💫 ПОДПИСКА
  if (SUBSCRIPTION_VARIANTS.includes(text)) {
    logger.info('💫 [Profile] Subscribe pressed', {
      telegramId: ctx.from?.id,
      currentScene: ctx.scene?.current?.id,
    })

    try {
      await ctx.scene.leave()
      ctx.session.mode = ModeEnum.SubscriptionScene
      await ctx.scene.enter(ModeEnum.SubscriptionScene)
      return true
    } catch (error) {
      logger.error('❌ [Profile] Error handling Subscribe:', {
        error,
        telegramId: ctx.from?.id,
      })
      await ctx.reply('❌ Произошла ошибка. Попробуйте /start')
      return true
    }
  }

  // 🌐 ЯЗЫК
  if (LANGUAGE_VARIANTS.includes(text)) {
    logger.info('🌐 [Profile] Language pressed', {
      telegramId: ctx.from?.id,
      currentScene: ctx.scene?.current?.id,
      matchedText: text,
    })

    try {
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.ChangeLanguageScene)
      return true
    } catch (error) {
      logger.error('❌ [Profile] Error handling Language:', {
        error,
        telegramId: ctx.from?.id,
      })
      await ctx.reply('❌ Произошла ошибка. Попробуйте /start')
      return true
    }
  }

  // 🤖 ЯЗЫК АВАТАРА
  if (AVATAR_LANGUAGE_VARIANTS.includes(text)) {
    logger.info('🤖 [Profile] Avatar Language pressed', {
      telegramId: ctx.from?.id,
      currentScene: ctx.scene?.current?.id,
      matchedText: text,
    })

    try {
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.SelectModel)
      return true
    } catch (error) {
      logger.error('❌ [Profile] Error handling Avatar Language:', {
        error,
        telegramId: ctx.from?.id,
      })
      await ctx.reply('❌ Произошла ошибка. Попробуйте /start')
      return true
    }
  }

  // 👤 ПРОФИЛЬ (КАТЕГОРИЯ)
  if (PROFILE_CATEGORY_VARIANTS.includes(text)) {
    logger.info('👤 [Profile] Profile category pressed', {
      telegramId: ctx.from?.id,
      currentScene: ctx.scene?.current?.id,
    })

    try {
      await ctx.scene.leave()
      await showCategoryMenu(ctx, 'profile')
      return true
    } catch (error) {
      logger.error('❌ [Profile] Error handling Profile category:', {
        error,
        telegramId: ctx.from?.id,
      })
      await ctx.reply('❌ Произошла ошибка. Попробуйте /start')
      return true
    }
  }

  return false
}
