import {
  MERCHANT_LOGIN,
  PASSWORD1,
  RESULT_URL2,
  TEST_PASSWORD1,
  isDev,
} from '@/config'

import md5 from 'md5'
import {
  subscriptionConfigs,
  type LocalSubscription,
} from '@/types/subscription'
import { logger } from '@/utils/logger'

export const merchantLogin = MERCHANT_LOGIN
export const password1 = PASSWORD1
export const testPassword1 = TEST_PASSWORD1
export const resultUrl2 = RESULT_URL2 || ''
export const description = 'Покупка подписки'

// Флаг для использования тестового режима Robokassa
export const useTestMode = isDev

export function subscriptionTitles(
  type: LocalSubscription,
  isRu: boolean
): string {
  const config = subscriptionConfigs[type]
  if (!config) {
    return isRu ? 'Неизвестная подписка' : 'Unknown subscription'
  }
  return isRu ? config.titleRu : config.titleEn
}

/**
 * Generates a short invoice ID based on user ID and stars
 * @param userId User's Telegram ID
 * @param stars Number of stars
 * @returns Short invoice ID
 */
export const generateShortInvId = (userId: number, stars: number): number => {
  const timestamp = Date.now()
  const shortId = parseInt(`${userId}${stars}${timestamp % 1000}`)
  return shortId
}

/**
 * Generates a Robokassa invoice URL
 * @param merchantLogin Merchant login
 * @param amount Payment amount
 * @param invId Invoice ID
 * @param description Payment description
 * @param password1 Merchant password 1
 * @param isTest Whether to use test mode
 * @returns Payment URL
 */
export const getInvoiceId = async (
  merchantLogin: string,
  amount: number,
  invId: number,
  description: string,
  password1: string,
  isTest: boolean = useTestMode
): Promise<string> => {
  try {
    logger.info('🚀 Запуск getInvoiceId', {
      description: 'Starting getInvoiceId',
      merchantLogin,
      outSum: amount,
      invId,
      useTestMode: isTest,
    })

    // Если включен тестовый режим и доступен тестовый пароль, используем его
    const actualPassword = isTest && testPassword1 ? testPassword1 : password1

    logger.info('🔑 Выбран пароль для Robokassa', {
      description: 'Selected password for Robokassa',
      isTestMode: isTest,
      usingTestPassword: isTest && testPassword1 ? true : false,
    })

    // Добавляем дополнительное логирование для удобства отладки
    logger.info('🔍 Формирование URL для Robokassa', {
      description: 'Generating Robokassa URL',
      merchantLogin,
      outSum: amount,
      invId,
      isTestMode: isTest,
      usingTestPassword: isTest && testPassword1 ? true : false,
      mode: isTest ? 'ТЕСТОВЫЙ РЕЖИМ' : 'БОЕВОЙ РЕЖИМ',
    })

    // Формируем строку для подписи с корректными значениями
    const signatureString = `${merchantLogin}:${amount}:${invId}:${actualPassword}`
    logger.info('📝 Строка для подписи:', {
      description: 'Signature string',
      signatureString,
    })

    const signature = md5(signatureString).toUpperCase()

    // !!! КРИТИЧЕСКИ ВАЖНО !!! - В тестовом режиме используем только test.robokassa.ru
    const baseUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx'
    const testUrl = 'https://test.robokassa.ru/Index.aspx'

    // Создаем параметры запроса
    const params = new URLSearchParams({
      MerchantLogin: merchantLogin,
      OutSum: amount.toString(),
      InvId: invId.toString(),
      Description: description,
      SignatureValue: signature,
    })

    // Добавляем параметр IsTest только если включен тестовый режим
    if (isTest) {
      params.append('IsTest', '1')
    }

    // Формируем URL в зависимости от режима
    let paymentUrl = isTest
      ? `${testUrl}?${params.toString()}`
      : `${baseUrl}?${params.toString()}`

    // ПРИНУДИТЕЛЬНО ПРОВЕРЯЕМ И ЗАМЕНЯЕМ ДОМЕН В ТЕСТОВОМ РЕЖИМЕ
    if (isTest && paymentUrl.includes('auth.robokassa.ru')) {
      logger.error('⚠️ ОШИБКА: Неправильный домен в тестовом режиме', {
        description: 'Incorrect domain in test mode',
        paymentUrl,
        isTestMode: isTest,
      })

      // Жестко заменяем URL на тестовый домен
      paymentUrl = paymentUrl.replace(
        'https://auth.robokassa.ru/Merchant/Index.aspx',
        'https://test.robokassa.ru/Index.aspx'
      )

      logger.info('🔧 URL принудительно исправлен:', {
        description: 'URL forcibly corrected',
        correctUrl: paymentUrl,
      })
    }

    logger.info('✅ URL сформирован для Robokassa:', {
      message: 'URL generated for Robokassa',
      testMode: isTest,
      paymentUrl,
      domain: isTest ? 'test.robokassa.ru' : 'auth.robokassa.ru',
    })

    return paymentUrl
  } catch (error) {
    logger.error('❌ Error generating Robokassa invoice:', {
      description: 'Error generating payment URL',
      error: error instanceof Error ? error.message : 'Unknown error',
      invId,
    })
    throw error
  }
}

/**
 * Тестовая функция для проверки генерации URL чека
 */
export const testGenerateInvoiceUrl = async (
  amount: number
): Promise<string> => {
  logger.info('🚀 Генерация тестового URL чека:', {
    description: 'Generating test invoice URL',
    amount,
    isTestMode: true,
  })

  if (!merchantLogin || !password1) {
    throw new Error('merchantLogin or password1 is not defined')
  }

  const invId = Math.floor(Math.random() * 1000000) + 1

  logger.info('🔢 Сгенерирован тестовый ID инвойса:', {
    description: 'Generated test invoice ID',
    invId,
    isTestMode: true,
  })

  // Для тестовой функции всегда используем параметр isTest=true
  return getInvoiceId(
    merchantLogin,
    amount,
    invId,
    description,
    password1,
    true
  )
}
