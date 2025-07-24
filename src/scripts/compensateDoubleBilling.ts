import { supabase } from '../core/supabase'
import { updateUserBalance } from '../core/supabase/updateUserBalance'
import { PaymentType } from '../interfaces'
import { logger } from '../utils/logger'

interface DuplicateTransaction {
  telegram_id: string
  amount: number
  description: string
  created_at: string
  duplicate_count: number
}

interface CompensationReport {
  telegram_id: string
  refund_amount: number
  bonus_stars: number
  original_transactions: number
  success: boolean
  error?: string
}

/**
 * Анализирует дублирующие транзакции в таблице payments_v2
 */
async function analyzeDuplicateTransactions(): Promise<DuplicateTransaction[]> {
  logger.info('🔍 Анализ дублирующих транзакций за последние 2 недели...')

  try {
    // Находим дублирующие транзакции за последние 2 недели
    const { data: duplicates, error } = await supabase
      .from('payments_v2')
      .select('telegram_id, amount, description, created_at')
      .lt('amount', 0) // Только списания
      .gte(
        'created_at',
        new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      ) // За последние 2 недели
      .or('description.ilike.%video%,description.ilike.%generation%') // Только видео транзакции
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('❌ Ошибка при анализе дублирующих транзакций:', error)
      return []
    }

    if (!duplicates || duplicates.length === 0) {
      logger.info('✅ Дублирующие транзакции не найдены')
      return []
    }

    // Группируем по пользователю, сумме и описанию, считаем дубликаты
    const grouped = duplicates.reduce(
      (acc: Record<string, DuplicateTransaction>, transaction: any) => {
        const key = `${transaction.telegram_id}_${transaction.amount}_${transaction.description}`

        if (!acc[key]) {
          acc[key] = {
            telegram_id: transaction.telegram_id,
            amount: transaction.amount,
            description: transaction.description,
            created_at: transaction.created_at,
            duplicate_count: 1,
          }
        } else {
          acc[key].duplicate_count++
        }

        return acc
      },
      {}
    )

    // Возвращаем только те, где есть дубликаты
    const duplicateTransactions = Object.values(grouped).filter(
      (transaction: DuplicateTransaction) => transaction.duplicate_count > 1
    )

    logger.info(
      `📊 Найдено ${duplicateTransactions.length} групп дублирующих транзакций`
    )
    return duplicateTransactions
  } catch (error) {
    logger.error('❌ Ошибка при анализе дублирующих транзакций:', error)
    return []
  }
}

/**
 * Возвращает средства пострадавшим пользователям
 */
async function compensateUsers(
  duplicateTransactions: DuplicateTransaction[]
): Promise<CompensationReport[]> {
  logger.info('💰 Начинаем компенсацию пострадавших пользователей...')

  const reports: CompensationReport[] = []

  for (const transaction of duplicateTransactions) {
    try {
      // Рассчитываем сумму компенсации
      // Если было списано N раз, возвращаем (N-1) * сумму
      const refundAmount =
        Math.abs(transaction.amount) * (transaction.duplicate_count - 1)
      const bonusStars = 500 // Бонусные звезды за неудобства

      logger.info(
        `💳 Компенсация для пользователя ${transaction.telegram_id}:`,
        {
          original_amount: transaction.amount,
          duplicate_count: transaction.duplicate_count,
          refund_amount: refundAmount,
          bonus_stars: bonusStars,
        }
      )

      // Возвращаем средства
      const refundSuccess = await updateUserBalance(
        transaction.telegram_id,
        refundAmount,
        PaymentType.MONEY_INCOME,
        `Компенсация за двойное списание: ${transaction.description}`,
        { source: 'compensation_double_billing' }
      )

      if (!refundSuccess) {
        logger.error(
          `❌ Не удалось вернуть средства пользователю ${transaction.telegram_id}`
        )
        reports.push({
          telegram_id: transaction.telegram_id,
          refund_amount: refundAmount,
          bonus_stars: bonusStars,
          original_transactions: transaction.duplicate_count,
          success: false,
          error: 'Ошибка при возврате средств',
        })
        continue
      }

      // Начисляем бонусные звезды
      const bonusSuccess = await updateUserBalance(
        transaction.telegram_id,
        bonusStars,
        PaymentType.MONEY_INCOME,
        `Бонусная компенсация за неудобства: ${bonusStars} звезд`,
        { source: 'bonus_compensation' }
      )

      if (!bonusSuccess) {
        logger.error(
          `❌ Не удалось начислить бонусные звезды пользователю ${transaction.telegram_id}`
        )
      }

      reports.push({
        telegram_id: transaction.telegram_id,
        refund_amount: refundAmount,
        bonus_stars: bonusStars,
        original_transactions: transaction.duplicate_count,
        success: refundSuccess && bonusSuccess,
        error: bonusSuccess
          ? undefined
          : 'Ошибка при начислении бонусных звезд',
      })

      logger.info(
        `✅ Компенсация для пользователя ${transaction.telegram_id} завершена успешно`
      )
    } catch (error) {
      logger.error(
        `❌ Ошибка при компенсации пользователя ${transaction.telegram_id}:`,
        error
      )
      reports.push({
        telegram_id: transaction.telegram_id,
        refund_amount: 0,
        bonus_stars: 0,
        original_transactions: transaction.duplicate_count,
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      })
    }
  }

  return reports
}

/**
 * Отправляет уведомления пострадавшим пользователям
 */
async function sendNotifications(reports: CompensationReport[]): Promise<void> {
  logger.info('📨 Отправка уведомлений пострадавшим пользователям...')

  for (const report of reports) {
    if (!report.success) {
      logger.warn(
        `⚠️ Пропускаем уведомление для ${report.telegram_id} - компенсация не удалась`
      )
      continue
    }

    try {
      // Получаем информацию о пользователе
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('telegram_id, first_name, last_name, language_code')
        .eq('telegram_id', report.telegram_id)
        .single()

      if (userError || !user) {
        logger.error(`❌ Не найден пользователь ${report.telegram_id}`)
        continue
      }

      // Формируем сообщение на соответствующем языке
      const isRussian = user.language_code === 'ru'
      const message = isRussian
        ? `🎉 Добро пожаловать обратно!\n\n` +
          `❗️ Мы обнаружили техническую ошибку в нашей системе, из-за которой с вашего баланса дважды списывались средства за генерацию видео.\n\n` +
          `💰 Мы вернули вам ${report.refund_amount} звезд на баланс\n` +
          `🎁 В качестве извинений за неудобства начислили бонусом ${report.bonus_stars} звезд\n\n` +
          `Всего на ваш баланс зачислено: ${report.refund_amount + report.bonus_stars} звезд\n\n` +
          `Спасибо за понимание! 🙏`
        : `🎉 Welcome back!\n\n` +
          `❗️ We discovered a technical error in our system that caused double billing for video generation.\n\n` +
          `💰 We've refunded ${report.refund_amount} stars to your balance\n` +
          `🎁 As an apology for the inconvenience, we've added a bonus of ${report.bonus_stars} stars\n\n` +
          `Total credited to your balance: ${report.refund_amount + report.bonus_stars} stars\n\n` +
          `Thank you for your understanding! 🙏`

      // Сохраняем сообщение в таблицу для отправки через бота
      // (Поскольку у нас нет прямого доступа к Telegram API в скрипте)
      const { error: messageError } = await supabase
        .from('pending_messages')
        .insert({
          telegram_id: report.telegram_id,
          message: message,
          message_type: 'compensation_notification',
          created_at: new Date().toISOString(),
          priority: 'high',
        })

      if (messageError) {
        logger.error(
          `❌ Ошибка при сохранении сообщения для ${report.telegram_id}:`,
          messageError
        )
      } else {
        logger.info(
          `✅ Уведомление для пользователя ${report.telegram_id} добавлено в очередь`
        )
      }
    } catch (error) {
      logger.error(
        `❌ Ошибка при отправке уведомления пользователю ${report.telegram_id}:`,
        error
      )
    }
  }
}

/**
 * Главная функция компенсации
 */
async function main() {
  logger.info('🚀 Запуск скрипта компенсации за двойное списание средств')

  try {
    // 1. Анализируем дублирующие транзакции
    const duplicateTransactions = await analyzeDuplicateTransactions()

    if (duplicateTransactions.length === 0) {
      logger.info(
        '✅ Дублирующие транзакции не найдены. Компенсация не требуется.'
      )
      return
    }

    // 2. Компенсируем пострадавших пользователей
    const compensationReports = await compensateUsers(duplicateTransactions)

    // 3. Отправляем уведомления
    await sendNotifications(compensationReports)

    // 4. Выводим итоговый отчет
    const successfulCompensations = compensationReports.filter(r => r.success)
    const failedCompensations = compensationReports.filter(r => !r.success)

    logger.info('📊 Итоговый отчет компенсации:')
    logger.info(
      `✅ Успешно компенсировано: ${successfulCompensations.length} пользователей`
    )
    logger.info(
      `❌ Неудачные компенсации: ${failedCompensations.length} пользователей`
    )

    const totalRefunded = successfulCompensations.reduce(
      (sum, r) => sum + r.refund_amount,
      0
    )
    const totalBonus = successfulCompensations.reduce(
      (sum, r) => sum + r.bonus_stars,
      0
    )

    logger.info(`💰 Общая сумма возврата: ${totalRefunded} звезд`)
    logger.info(`🎁 Общая сумма бонусов: ${totalBonus} звезд`)
    logger.info(`📈 Итого зачислено: ${totalRefunded + totalBonus} звезд`)

    if (failedCompensations.length > 0) {
      logger.warn('⚠️ Неудачные компенсации:')
      failedCompensations.forEach(report => {
        logger.warn(`- ${report.telegram_id}: ${report.error}`)
      })
    }
  } catch (error) {
    logger.error('❌ Критическая ошибка при выполнении компенсации:', error)
  }
}

// Запускаем скрипт если он вызывается напрямую
if (require.main === module) {
  main()
    .then(() => {
      logger.info('✅ Скрипт компенсации завершен')
      process.exit(0)
    })
    .catch(error => {
      logger.error('❌ Скрипт компенсации завершился с ошибкой:', error)
      process.exit(1)
    })
}

export { main as compensateDoubleBilling }
