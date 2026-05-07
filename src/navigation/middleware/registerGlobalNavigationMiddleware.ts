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

// 🎯 Импорт handlers из нового модуля
import {
  handleMainMenu,
  handlePaymentButtons,
  handleProfileButtons,
  handleCallbackQuery
} from '../handlers'

// 🎯 Импорт для обработки отмены
import { CANCEL_VARIANTS } from '../config/categories.config'
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
    // 🔍 ЛОГИРОВАНИЕ ДЛЯ ОТЛАДКИ НАВИГАЦИИ
    const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : undefined
    const callbackData = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : undefined

    console.log('🟣🟣🟣 GlobalNavMiddleware EXECUTING 🟣🟣🟣')
    console.log('📍 updateType:', ctx.updateType)
    console.log('📝 messageText:', messageText ? `"${messageText}"` : 'N/A')
    console.log('🔘 callbackData:', callbackData ? `"${callbackData}"` : 'N/A')
    console.log('🎭 currentScene:', ctx.scene?.current?.id || 'none')
    console.log('👤 userId:', ctx.from?.id)

    // ========================================
    // 1. ОБРАБОТКА CALLBACK_QUERY (inline кнопки)
    // ========================================
    if (await handleCallbackQuery(ctx)) {
      return // Обработано, останавливаем
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

      // 🏠 ГЛАВНОЕ МЕНЮ / НАЗАД
      if (await handleMainMenu(ctx, text)) {
        return // Обработано
      }

      // 💳 ОПЛАТА (звезды, рубли, пополнить, баланс)
      if (await handlePaymentButtons(ctx, text)) {
        return // Обработано
      }

      // 👤 ПРОФИЛЬ (приглашения, техподдержка, подписка, язык)
      if (await handleProfileButtons(ctx, text)) {
        return // Обработано
      }

      // ❌ ОТМЕНА - варианты из ЕДИНОГО ИСТОЧНИКА (categories.config.ts)
      if (CANCEL_VARIANTS.includes(text)) {
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
