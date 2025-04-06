import { inngest } from '@/core/inngest/clients'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'
import { generateInvId } from '@/utils/generateInvId'
import { getBotByName } from '@/core/bot'
import { getUserByTelegramId } from '@/core/supabase/getUserByTelegramId'
import { 
  TransactionType, 
  SERVICE_DESCRIPTIONS,
  ModeEnum
} from '@/interfaces/payments.interface'
import { sendTransactionNotification } from '@/helpers/sendTransactionNotification'

// Кэш для отслеживания обработанных платежей
const processedPayments = new Map<string, { time: number }>()

interface PaymentProcessorEvent {
  data: {
    telegram_id: TelegramId
    amount: number
    type: TransactionType
    description: string
    bot_name: string
    metadata?: Record<string, unknown>
    operation_id?: string
  }
}

/**
 * Функция Inngest для обработки платежей
 */
export const paymentProcessor = inngest.createFunction(
  { id: 'payment-processor', name: 'Process Payment' },
  { event: 'payment/process' },
  async ({ event, step }) => {
    try {
      const {
        telegram_id,
        amount,
        type,
        description: providedDescription,
        bot_name,
        metadata = {},
        operation_id: provided_operation_id,
      } = event.data

      // Шаг 1: Проверка на дубликаты
      const operationId = await step.run('check-duplicates', async () => {
        const id = provided_operation_id || generateInvId(telegram_id, amount)
        const key = `${telegram_id}:${amount}:${type}:${providedDescription}`
        const existingPayment = processedPayments.get(key)

        if (existingPayment && Date.now() - existingPayment.time < 5000) {
          throw new Error('Дубликат платежа')
        }

        processedPayments.set(key, { time: Date.now() })
        return id
      })

      // Генерируем описание на основе типа сервиса и операции
      const description = await step.run('generate-description', async () => {
        if (providedDescription && providedDescription.startsWith('Payment for generating')) {
          return providedDescription // Сохраняем детальные описания для генерации изображений
        }

        const serviceType = (metadata.service_type || 'system') as keyof typeof SERVICE_DESCRIPTIONS
        if (type === 'money_expense' && serviceType in SERVICE_DESCRIPTIONS) {
          return SERVICE_DESCRIPTIONS[serviceType].expense(Math.abs(amount))
        } else if (type === 'money_income') {
          return SERVICE_DESCRIPTIONS.neuro_photo.income(Math.abs(amount))
        }
        
        return providedDescription || `⚙️ Системная операция: ${amount} звезд`
      })

      // Шаг 2: Обработка платежа через SQL функцию process_payment
      const paymentResult = await step.run('process-payment', async () => {
        // Конвертируем BigInt в строку для безопасной сериализации
        const safeMetadata = JSON.parse(
          JSON.stringify(metadata, (_, value) =>
            typeof value === 'bigint' ? value.toString() : value
          )
        )

        const { data, error } = await supabase.rpc('process_payment', {
          p_telegram_id: telegram_id.toString(),
          p_amount: amount,
          p_type: type,
          p_description: description,
          p_bot_name: bot_name,
          p_operation_id: operationId,
          p_metadata: safeMetadata,
        })

        if (error) {
          logger.error('❌ Ошибка при обработке платежа:', {
            description: 'Error processing payment',
            error: error.message,
            telegram_id: telegram_id.toString(),
            amount,
            type,
          })
          throw error
        }

        return {
          ...data,
          old_balance: Number(data.old_balance),
          new_balance: Number(data.new_balance),
          amount: Number(data.amount),
        }
      })

      // Шаг 3: Отправка уведомления пользователю
      await step.run('send-notification', async () => {
        logger.info('📝 Отправка деталей транзакции:', {
          description: 'Sending transaction details',
          type,
          telegram_id,
        })

        const { bot } = getBotByName(bot_name)
        if (!bot) {
          throw new Error('Bot not found')
        }

        // Получаем данные пользователя для определения языка
        const userData = await getUserByTelegramId(telegram_id)
        const isRu = userData?.language_code === 'ru'

        await sendTransactionNotification({
          telegram_id,
          operationId,
          amount,
          currentBalance: paymentResult.old_balance,
          newBalance: paymentResult.new_balance,
          description,
          isRu,
          bot: bot.telegram,
        })

        return {
          telegram_id,
          amount,
          type,
          description,
          operationId,
          oldBalance: paymentResult.old_balance,
          newBalance: paymentResult.new_balance,
        }
      })

      return {
        success: true,
        payment_id: paymentResult.payment_id,
        old_balance: paymentResult.old_balance,
        new_balance: paymentResult.new_balance,
        amount: paymentResult.amount,
        operation_id: paymentResult.operation_id,
      }
    } catch (error) {
      logger.error('❌ Ошибка в paymentProcessor:', {
        description: 'Error in payment processor',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      throw error
    }
  }
)
