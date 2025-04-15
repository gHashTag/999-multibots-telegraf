import { MyContext, Subscription } from '@/interfaces'
import { supabase as defaultSupabaseClient } from '.'
import { isRussian } from '@/helpers/language'
import { checkFullAccess as checkFullAccessHandler } from '@/handlers/checkFullAccess'
import { isDev as isDevConfig } from '@/config'
import { logger as defaultLogger } from '@/utils/logger'
import { SupabaseClient } from '@supabase/supabase-js'
import { Logger } from 'winston'

// Определяем тип функции checkFullAccess
type CheckFullAccessFn = (subscription: Subscription) => boolean

export const checkPaymentStatus = async (
  ctx: MyContext,
  subscription: Subscription,
  dependencies: {
    supabase?: SupabaseClient
    logger?: Logger
    isDevelopment?: boolean
    checkFullAccess?: CheckFullAccessFn
  } = {}
): Promise<boolean> => {
  const supabase = dependencies.supabase || defaultSupabaseClient
  const logger = dependencies.logger || defaultLogger
  const isDevelopment = dependencies.isDevelopment ?? isDevConfig
  const checkFullAccess = dependencies.checkFullAccess || checkFullAccessHandler

  if (!ctx || !ctx.from || !ctx.from.id) {
    logger.error('Ошибка: ctx или ctx.from или ctx.from.id не определены')
    return false
  }

  if (subscription === 'neurotester') {
    logger.info(
      'Пользователь с подпиской "нейротестер", пропускаем проверку оплаты'
    )
    return true
  }

  try {
    const { data: paymentData, error } = await supabase
      .from('payments_v2')
      .select('payment_date')
      .eq('telegram_id', ctx.from.id.toString())
      .order('payment_date', { ascending: false })
      .limit(1)
      .single()
    logger.debug('paymentData', paymentData)

    if (error || !paymentData) {
      logger.error('Ошибка при получении данных о последней оплате:', error)
      return false
    }

    const lastPaymentDate = new Date(paymentData.payment_date)
    const currentDate = new Date()
    const differenceInDays =
      (currentDate.getTime() - lastPaymentDate.getTime()) / (1000 * 3600 * 24)
    logger.debug('differenceInDays', { differenceInDays })

    if (differenceInDays > 30) {
      const isFullAccess = checkFullAccess(subscription)
      if (isFullAccess) {
        const isRu = isRussian(ctx)
        if (!isDevelopment) {
          //@ts-ignore
          if (subscription !== 'neurotester') {
            await ctx.reply(
              isRu
                ? '🤑 Ваша подписка истекла. Пожалуйста, обновите подписку, чтобы продолжить использование сервиса.'
                : '🤑Your subscription has expired. Please update your subscription to continue using the service.'
            )
          }
        }
        return false
      }
    }

    return true
  } catch (error) {
    logger.error('Ошибка при проверке статуса оплаты:', error)
    return false
  }
}
