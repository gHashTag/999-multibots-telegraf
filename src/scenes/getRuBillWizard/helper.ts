import {
  MERCHANT_LOGIN,
  PASSWORD1,
  RESULT_URL2,
  TEST_PASSWORD1,
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
export const useTestMode = false

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
 * @returns Payment URL
 */
export const getInvoiceId = async (
  merchantLogin: string,
  amount: number,
  invId: number,
  description: string,
  password1: string
): Promise<string> => {
  try {
    logger.info('🔄 Generating Robokassa invoice:', {
      description: 'Generating payment URL',
      amount,
      invId,
    })

    const signature = require('crypto')
      .createHash('md5')
      .update(`${merchantLogin}:${amount}:${invId}:${password1}`)
      .digest('hex')

    const baseUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx'
    const params = new URLSearchParams({
      MerchantLogin: merchantLogin,
      OutSum: amount.toString(),
      InvId: invId.toString(),
      Description: description,
      SignatureValue: signature,
      IsTest: process.env.NODE_ENV === 'development' ? '1' : '0',
    })

    const paymentUrl = `${baseUrl}?${params.toString()}`

    logger.info('✅ Robokassa invoice generated:', {
      description: 'Payment URL generated successfully',
      invId,
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
  console.log('🚀 Генерация тестового URL чека:', {
    description: 'Generating test invoice URL',
    amount,
  })

  if (!merchantLogin || !password1) {
    throw new Error('merchantLogin or password1 is not defined')
  }

  const invId = Math.floor(Math.random() * 1000000) + 1

  return getInvoiceId(merchantLogin, amount, invId, description, password1)
}
