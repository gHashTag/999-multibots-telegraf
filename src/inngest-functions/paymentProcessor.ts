import { inngest } from '@/core/inngest/clients'
import { logger } from '@/utils/logger'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { supabase } from '@/core/supabase'
import { generateInvId } from '@/utils/generateInvId'
import { createBotByName, getBotByName } from '@/core/bot'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { TelegramId } from '@/interfaces/telegram.interface'
import { getUserByTelegramId } from '@/core/supabase/getUserByTelegramId'
import { 
  TransactionType, 
  TRANSACTION_DESCRIPTIONS, 
  DETAILED_TRANSACTION_DESCRIPTIONS,
  TRANSACTION_KEYS,
  SERVICE_KEYS
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
  }
}

// Функция для получения детального описания транзакции
function getDetailedDescription(type: TransactionType, service?: string): string {
  if (!service) {
    return TRANSACTION_DESCRIPTIONS[type]
  }

  const serviceDescriptions = DETAILED_TRANSACTION_DESCRIPTIONS[type]
  return serviceDescriptions[service] || serviceDescriptions.default
}

// Функция для определения сервиса из описания
function getServiceFromDescription(description: string): string {
  const serviceKeys = Object.values(SERVICE_KEYS)
  for (const service of serviceKeys) {
    if (description.toLowerCase().includes(service.toLowerCase())) {
      return service
    }
  }
  return 'default'
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
        description,
        bot_name,
        inv_id,
        metadata = {},
      } = event.data

      // Шаг 1: Проверка на дубликаты
      const operationId = await step.run('check-duplicates', async () => {
        const id = generateInvId(telegram_id, amount)
        const key = `${telegram_id}:${amount}:${type}:${description}`
        const existingPayment = processedPayments.get(key)

        if (existingPayment && Date.now() - existingPayment.time < 5000) {
          throw new Error('Дубликат платежа')
        }

        processedPayments.set(key, { time: Date.now() })
        return id
      })

      // Шаг 2: Получение текущего баланса
      const currentBalance = await step.run('get-balance', async () => {
        const balance = await getUserBalance(telegram_id, amount)
        if (typeof balance !== 'number') {
          throw new Error('Не удалось получить баланс')
        }
        return balance
      })

      // Шаг 3: Расчет нового баланса
      const newBalance = await step.run('calculate-balance', async () => {
        return currentBalance + amount
      })

      // Шаг 4: Создание записи о транзакции
      const service = getServiceFromDescription(description)
      const detailedDescription = getDetailedDescription(type, service)

      await step.run('create-transaction-record', async () => {
        const { error } = await supabase.from('payments_v2').insert({
          telegram_id,
          amount,
          inv_id,
          type,
          description: detailedDescription,
          bot_name,
          metadata,
          operation_id: operationId,
          service_type: service
        })

        if (error) {
          throw new Error(`Ошибка создания записи о транзакции: ${error.message}`)
        }
      })

      // Шаг 5: Отправка деталей транзакции пользователю
      const transactionDetails = await step.run('send-transaction-details', async () => {
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
          currentBalance,
          newBalance,
          description: detailedDescription,
          isRu,
          bot: bot.telegram
        })

        return {
          telegram_id,
          amount,
          type,
          description: detailedDescription,
          operationId,
          oldBalance: currentBalance,
          newBalance,
        }
      })

      return transactionDetails
    } catch (error) {
      logger.error('❌ Ошибка в paymentProcessor:', {
        description: 'Error in payment processor',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      throw error
    }
  }
)
