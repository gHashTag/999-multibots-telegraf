/**
 * 🎯 ГЛОБАЛЬНЫЙ НАВИГАЦИОННЫЙ MIDDLEWARE
 *
 * Перехватывает все текстовые сообщения и callback_query для обработки
 * глобальных кнопок навигации: Главное меню, Профиль, Баланс, Подписка и т.д.
 * Регистрируется ПЕРЕД stage.middleware(), чтобы перехватывать сообщения ДО попадания в сцены.
 */

import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

// Импорт функций навигации из нового модуля
import {
  showMainMenu as navShowMainMenu,
  showCategoryMenu as navShowCategoryMenu,
} from '@/navigation'
import { handleTechSupport } from '@/commands/handleTechSupport'
import { handleCancelButton } from '../services/CancelButtonService'

/**
 * ✅ ГЛОБАЛЬНАЯ НАВИГАЦИЯ - регистрируется ПЕРЕД stage.middleware()
 * Перехватывает все навигационные кнопки ДО того, как они попадут в сцены
 */
export function registerGlobalNavigationMiddleware(
  bot: Telegraf<MyContext>
): void {
  console.log('🔵🔵🔵 registerGlobalNavigationMiddleware CALLED - registering middleware 🔵🔵🔵')

  bot.use(async (ctx, next) => {
    console.log('🟣🟣🟣 GlobalNavMiddleware EXECUTING', {
      updateType: ctx.updateType,
      messageText: ctx.message && 'text' in ctx.message ? ctx.message.text : undefined
    })
    // ========================================
    // 1. ОБРАБОТКА CALLBACK_QUERY (inline кнопки)
    // ========================================
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data

      // ✅ Глобальные callback для навигации
      if (data === 'go_main_menu' || data === 'main_menu') {
        await ctx.answerCbQuery()
        await ctx.scene.leave()
        await navShowMainMenu(ctx)
        return // Останавливаем обработку
      }

      if (data === 'cancel' || data === 'go_back') {
        await ctx.answerCbQuery()
        await ctx.scene.leave()
        await navShowMainMenu(ctx)
        return // Останавливаем обработку
      }

      return next()
    }

    // ========================================
    // 2. ОБРАБОТКА TEXT СООБЩЕНИЙ
    // ========================================
    if (ctx.message && 'text' in ctx.message) {
      const rawText = ctx.message.text || ''
      const text = rawText.trim()

      // 🔍 DEBUG: Логируем ВСЕ текстовые сообщения для отладки
      logger.debug('🔍 [GlobalNav DEBUG] Text message received:', {
        text,
        telegramId: ctx.from?.id,
        hasSession: !!ctx.session,
      })

      // 🏠 РАСШИРЕННЫЙ СПИСОК ВАРИАНТОВ "ГЛАВНОЕ МЕНЮ"
      // Проверяем точное совпадение и нормализованные варианты
      const mainMenuVariants = [
        '🏠 Главное меню',
        '🏠 Main menu',
        'Главное меню',
        'Main menu',
        'главное меню',
        'main menu',
        '/menu',
        'меню',
        'menu'
      ]

      if (mainMenuVariants.includes(text)) {
        logger.info('🔥 [Navigation] Main Menu pressed (global middleware)', {
          telegramId: ctx.from?.id,
          currentScene: ctx.scene?.current?.id,
          text,
        })

        try {
          await ctx.scene.leave()
          await navShowMainMenu(ctx)
          // ✅ КРИТИЧЕСКИ ВАЖНО: Останавливаем дальнейшую обработку
          return
        } catch (error) {
          logger.error('❌ [Navigation] Error in main menu middleware:', {
            error,
            telegramId: ctx.from?.id,
          })
          // При ошибке тоже останавливаем обработку
          return
        }
      }

      // 👥 ОБРАБОТКА КНОПКИ "ПРИГЛАСИТЬ ДРУГА" - глобально, ДО сцен
      const inviteVariants = [
        '👥 Пригласить друга',
        '👥 Invite a friend',
        '👥 Invite Friend',
        'Пригласить друга',
        'Invite a friend'
      ]

      // 🔍 DEBUG: Проверяем совпадение
      const isInviteMatch = inviteVariants.includes(text)
      logger.debug('🔍 [GlobalNav DEBUG] Invite check:', {
        text,
        textLength: text.length,
        inviteVariants0: inviteVariants[0],
        inviteVariants0Length: inviteVariants[0].length,
        isMatch: isInviteMatch,
        charCodes: [...text].map(c => c.charCodeAt(0)),
      })

      if (isInviteMatch) {
        logger.info('👥 [GlobalNav] Invite friend pressed (global middleware)', {
          telegramId: ctx.from?.id,
          currentScene: ctx.scene?.current?.id,
          text,
        })

        try {
          await ctx.scene.leave()
          ctx.session.mode = ModeEnum.Invite
          await ctx.scene.enter(ModeEnum.CheckBalanceScene)
          logger.info('✅ [GlobalNav] Successfully entered Invite flow', {
            telegramId: ctx.from?.id,
          })
          return // Останавливаем дальнейшую обработку
        } catch (error) {
          logger.error('❌ [GlobalNav] Error handling Invite button:', {
            error,
            telegramId: ctx.from?.id,
          })
          await ctx.reply('❌ Произошла ошибка. Попробуйте /start')
          return
        }
      }

      // 💬 ОБРАБОТКА КНОПКИ "ТЕХПОДДЕРЖКА" - глобально
      const supportVariants = [
        '💬 Техподдержка',
        '💬 Tech Support',
        'Техподдержка',
        'Tech Support'
      ]

      if (supportVariants.includes(text)) {
        logger.info('💬 [GlobalNav] Tech Support pressed (global middleware)', {
          telegramId: ctx.from?.id,
          currentScene: ctx.scene?.current?.id,
        })

        try {
          await ctx.scene.leave()
          await handleTechSupport(ctx)
          return
        } catch (error) {
          logger.error('❌ [GlobalNav] Error handling Tech Support:', {
            error,
            telegramId: ctx.from?.id,
          })
          await ctx.reply('❌ Произошла ошибка. Попробуйте /start')
          return
        }
      }

      // 💰 ОБРАБОТКА КНОПОК БАЛАНСА - глобально
      const balanceVariants = [
        '💰 Баланс',
        '💰 Balance',
        '💳 Пополнить баланс',
        '💳 Top Up Balance'
      ]

      if (balanceVariants.includes(text)) {
        logger.info('💰 [GlobalNav] Balance button pressed (global middleware)', {
          telegramId: ctx.from?.id,
          currentScene: ctx.scene?.current?.id,
          text,
        })

        try {
          await ctx.scene.leave()
          // Определяем режим по тексту кнопки
          const mode = text.includes('Пополнить') || text.includes('Top Up')
            ? ModeEnum.TopUpBalance
            : ModeEnum.Balance
          ctx.session.mode = mode
          await ctx.scene.enter(ModeEnum.CheckBalanceScene)
          return
        } catch (error) {
          logger.error('❌ [GlobalNav] Error handling Balance button:', {
            error,
            telegramId: ctx.from?.id,
          })
          await ctx.reply('❌ Произошла ошибка. Попробуйте /start')
          return
        }
      }

      // 💫 ОБРАБОТКА КНОПКИ "ПОДПИСКА" - глобально
      const subscriptionVariants = [
        '💫 Оформить подписку',
        '💫 Subscribe',
        'Оформить подписку',
        'Subscribe'
      ]

      if (subscriptionVariants.includes(text)) {
        logger.info('💫 [GlobalNav] Subscribe pressed (global middleware)', {
          telegramId: ctx.from?.id,
          currentScene: ctx.scene?.current?.id,
        })

        try {
          await ctx.scene.leave()
          ctx.session.mode = ModeEnum.SubscriptionScene
          await ctx.scene.enter(ModeEnum.SubscriptionScene)
          return
        } catch (error) {
          logger.error('❌ [GlobalNav] Error handling Subscribe:', {
            error,
            telegramId: ctx.from?.id,
          })
          await ctx.reply('❌ Произошла ошибка. Попробуйте /start')
          return
        }
      }

      // 🌐 ОБРАБОТКА КНОПКИ "ЯЗЫК" - глобально (ПРОФИЛЬ)
      const languageVariants = [
        '🌐 Язык',          // Русский с эмодзи
        '🌐 Language',       // Английский с эмодзи
        'Язык',             // Русский без эмодзи
        'Language'          // Английский без эмодзи
      ]

      if (languageVariants.includes(text)) {
        logger.info('🌐 [GlobalNav] Language pressed (profile category) ✅', {
          telegramId: ctx.from?.id,
          currentScene: ctx.scene?.current?.id,
          matchedText: text,
        })

        try {
          await ctx.scene.leave()
          await ctx.scene.enter('changeLanguageScene')
          logger.info('✅ [GlobalNav] Successfully entered changeLanguageScene')
          return
        } catch (error) {
          logger.error('❌ [GlobalNav] Error handling Language:', {
            error,
            telegramId: ctx.from?.id,
          })
          await ctx.reply('❌ Произошла ошибка. Попробуйте /start')
          return
        }
      }

      // 🤖 ОБРАБОТКА КНОПКИ "ЯЗЫК АВАТАРА" - глобально (КАТЕГОРИЯ АВАТАРЫ!)
      const avatarLanguageVariants = [
        '🤖 Язык аватара',
        '🤖 Avatar Language'
      ]

      if (avatarLanguageVariants.includes(text)) {
        logger.info('🤖 [GlobalNav] Avatar Language pressed (avatars category) ✅', {
          telegramId: ctx.from?.id,
          currentScene: ctx.scene?.current?.id,
          matchedText: text,
        })

        try {
          await ctx.scene.leave()
          ctx.session.mode = ModeEnum.SelectModel
          await ctx.scene.enter(ModeEnum.CheckBalanceScene)
          logger.info('✅ [GlobalNav] Successfully entered SelectModel flow')
          return
        } catch (error) {
          logger.error('❌ [GlobalNav] Error handling Avatar Language:', {
            error,
            telegramId: ctx.from?.id,
          })
          await ctx.reply('❌ Произошла ошибка. Попробуйте /start')
          return
        }
      }

      // 👤 ОБРАБОТКА КНОПКИ "ПРОФИЛЬ" (КАТЕГОРИЯ) - глобально
      const profileCategoryVariants = [
        '👤 Профиль',
        '👤 Profile',
        'Профиль',
        'Profile'
      ]

      if (profileCategoryVariants.includes(text)) {
        logger.info('👤 [GlobalNav] Profile category pressed (global middleware)', {
          telegramId: ctx.from?.id,
          currentScene: ctx.scene?.current?.id,
        })

        try {
          await ctx.scene.leave()
          await navShowCategoryMenu(ctx, 'profile')
          return
        } catch (error) {
          logger.error('❌ [GlobalNav] Error handling Profile category:', {
            error,
            telegramId: ctx.from?.id,
          })
          await ctx.reply('❌ Произошла ошибка. Попробуйте /start')
          return
        }
      }

      // ◀️ ОБРАБОТКА КНОПКИ "НАЗАД" - глобально
      const backVariants = [
        '◀️ Назад',
        '◀️ Back',
        'Назад',
        'Back'
      ]

      if (backVariants.includes(text)) {
        logger.info('◀️ [GlobalNav] Back pressed (global middleware)', {
          telegramId: ctx.from?.id,
          currentScene: ctx.scene?.current?.id,
        })

        try {
          await ctx.scene.leave()
          await navShowMainMenu(ctx)
          return
        } catch (error) {
          logger.error('❌ [GlobalNav] Error handling Back:', {
            error,
            telegramId: ctx.from?.id,
          })
        }
      }

      // ❌ РАСШИРЕННЫЙ СПИСОК ВАРИАНТОВ "ОТМЕНА"
      const cancelVariants = [
        'Отмена',
        'Cancel',
        '/cancel',
        'отмена',
        'cancel'
      ]

      if (cancelVariants.includes(text)) {
        // Если мы в сцене chat_with_avatar — даём сцене самой обработать отмену
        if (ctx.scene?.current?.id === ModeEnum.ChatWithAvatar) {
          logger.info('🔥 [Navigation] Cancel in chat_with_avatar - delegating to scene')
          return next()
        }

        logger.info('🔥 [Navigation] Cancel pressed (global middleware)', {
          telegramId: ctx.from?.id,
          currentScene: ctx.scene?.current?.id,
        })

        try {
          const handled = await handleCancelButton(ctx as any)
          if (handled) {
            return // Останавливаем дальнейшую обработку
          }
        } catch (error) {
          logger.error('❌ [Navigation] Error in cancel middleware:', {
            error,
            telegramId: ctx.from?.id,
          })
        }
      }
    }

    return next()
  })

  logger.info('✅ [Navigation] Registered enhanced global navigation middleware')
}
