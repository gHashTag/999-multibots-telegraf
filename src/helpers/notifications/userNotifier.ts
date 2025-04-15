import { logger } from '@/utils/logger'
import { createBotByName } from '@/core/bot'
import { TransactionType } from '@/interfaces/payments.interface'

interface BasePaymentDetails {
  telegram_id: number | string
  bot_name: string
  language_code?: string
  username?: string | null
}

interface SuccessfulPaymentDetails extends BasePaymentDetails {
  amount: number
  stars?: number
  currency?: string
  description: string
  operationId?: string
  currentBalance?: number
  newBalance?: number
  subscription?: string
  type: TransactionType
}

interface FailedPaymentDetails extends BasePaymentDetails {
  error: Error | string
  operationId?: string
  attemptedAmount?: number
  attemptedAction?: string
}

/**
 * Отправляет пользователю уведомление об успешной операции.
 */
export async function notifyUserAboutSuccess(
  details: SuccessfulPaymentDetails
): Promise<void> {
  const {
    telegram_id,
    bot_name,
    language_code = 'ru',
    amount,
    stars,
    description,
    currentBalance,
    newBalance,
    operationId,
    type,
  } = details
  const botData = await createBotByName(bot_name)
  if (!botData?.bot) {
    logger.error(`[notifyUserAboutSuccess] Бот ${bot_name} не найден`)
    return
  }

  const isRu = language_code === 'ru'
  let message = ''
  const starsAmount = stars || amount

  // Логика выбора сообщения на основе описания и типа
  if (
    description.toLowerCase().includes('пополнение') ||
    description.toLowerCase().includes('balance top-up')
  ) {
    message = isRu
      ? `🎉 Поздравляем! Ваш баланс успешно пополнен.\\n\\n⭐️ На ваш баланс начислено ${starsAmount} звезд.\\n\\nПриятного использования! Нажмите на команду /menu, чтобы начать пользоваться ботом.`
      : `🎉 Congratulations! Your balance has been successfully topped up.\\n\\n⭐️ ${starsAmount} stars have been credited to your balance.\\n\\nEnjoy using our service! \\n\\nClick on the /menu command to start using the bot.`
  } else if (
    description.toLowerCase().includes('покупка') ||
    description.toLowerCase().includes('purchase')
  ) {
    message = isRu
      ? `✅ **Спасибо за покупку! ${starsAmount} ⭐️ добавлены на ваш баланс!**\\n\\n${description}\\n\\n✨ Теперь вы можете использовать новые возможности. Для этого перейдите в главное меню, нажав на кнопку ниже:\\n🏠 /menu\\n❓ Если у вас есть вопросы, не стесняйтесь обращаться за помощью /tech\\nМы всегда рады помочь!`
      : `✅ **Thank you for your purchase! ${starsAmount} stars added to your balance!**\\n\\n${description}\\n\\n✨ Now you can use your new features. To do this, go to the main menu by clicking the button below:\\n🏠 /menu\\n❓ If you have any questions, feel free to ask for help /tech\\nWe're always here to assist you!`
  } else if (
    type === TransactionType.MONEY_EXPENSE &&
    currentBalance !== undefined &&
    newBalance !== undefined
  ) {
    const id = operationId || 'N/A'
    message = isRu
      ? `ID: ${id}\\nСумма: ${amount} ⭐️\\nСтарый баланс: ${currentBalance} ⭐️\\nНовый баланс: ${newBalance} ⭐️\\nОписание: ${description}`
      : `ID: ${id}\\nAmount: ${amount} ⭐️\\nOld balance: ${currentBalance} ⭐️\\nNew balance: ${newBalance} ⭐️\\nDescription: ${description}`
  } else {
    message = isRu
      ? `✅ Операция "${description}" успешно выполнена. Начислено ${starsAmount} ⭐️.`
      : `✅ Operation "${description}" completed successfully. ${starsAmount} ⭐️ credited.`
  }

  try {
    await botData.bot.telegram.sendMessage(telegram_id.toString(), message, {
      parse_mode: 'Markdown',
    })
    logger.info('✅ Уведомление об успехе отправлено пользователю', {
      telegram_id,
      description,
    })
  } catch (error) {
    logger.error('❌ Ошибка при отправке уведомления об успехе пользователю', {
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
    })
  }
}

/**
 * Отправляет пользователю уведомление об ошибке операции.
 */
export async function notifyUserAboutFailure(
  details: FailedPaymentDetails
): Promise<void> {
  const {
    telegram_id,
    bot_name,
    language_code = 'ru',
    error,
    attemptedAction,
  } = details
  const botData = await createBotByName(bot_name)
  if (!botData?.bot) {
    logger.error(`[notifyUserAboutFailure] Бот ${bot_name} не найден`)
    return
  }

  const isRu = language_code === 'ru'
  const errorMessage = error instanceof Error ? error.message : String(error)
  const actionText = attemptedAction || (isRu ? 'операции' : 'operation')

  const message = isRu
    ? `❌ К сожалению, произошла ошибка во время ${actionText}:

\`${errorMessage}\`

Пожалуйста, попробуйте еще раз или обратитесь в поддержку /tech.`
    : `❌ Unfortunately, an error occurred during ${actionText}:

\`${errorMessage}\`

Please try again or contact support /tech.`

  try {
    await botData.bot.telegram.sendMessage(telegram_id.toString(), message, {
      parse_mode: 'Markdown',
    })
    logger.info('✅ Уведомление об ошибке отправлено пользователю', {
      telegram_id,
      error: errorMessage,
    })
  } catch (sendError) {
    logger.error('❌ Ошибка при отправке уведомления об ошибке пользователю', {
      error: sendError instanceof Error ? sendError.message : String(sendError),
      telegram_id,
    })
  }
}

/**
 * @deprecated Используйте notifyUserAboutSuccess
 */
export async function sendTransactionNotificationTest(
  params: any
): Promise<{ success: boolean }> {
  logger.warn('sendTransactionNotificationTest is deprecated and not used')
  return { success: true }
}
