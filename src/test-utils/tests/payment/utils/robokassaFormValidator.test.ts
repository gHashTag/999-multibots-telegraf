import { TestResult } from '../../../types'
import { logger } from '@/utils/logger'
import { MERCHANT_LOGIN, TEST_PASSWORD1 } from '@/config'
import { generateShortInvId } from '@/scenes/getRuBillWizard/helper'
import axios from 'axios'

/**
 * Тест проверяет доступность формы оплаты Robokassa
 */
export async function testRobokassaFormAvailability(): Promise<TestResult> {
  try {
    logger.info('🚀 Начало теста формы Robokassa', {
      description: 'Starting Robokassa form test',
    })

    // Проверяем наличие необходимых параметров
    if (!MERCHANT_LOGIN || !TEST_PASSWORD1) {
      throw new Error('MERCHANT_LOGIN or TEST_PASSWORD1 is not defined')
    }

    // Генерируем тестовые данные
    const amount = 100 // Минимальная сумма для теста
    const userId = '123456789' // Тестовый ID пользователя
    const invId = await generateShortInvId(userId, amount)

    // Формируем подпись для тестового режима
    const signatureString = `${MERCHANT_LOGIN}:${amount}:${invId}:${TEST_PASSWORD1}`
    const signatureValue = require('md5')(signatureString).toUpperCase()

    // Формируем URL для тестовой формы
    const baseUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx'
    const params = new URLSearchParams({
      MerchantLogin: MERCHANT_LOGIN,
      OutSum: amount.toString(),
      InvId: invId.toString(),
      Description: 'Test payment form',
      SignatureValue: signatureValue,
      IsTest: '1',
    })

    const url = `${baseUrl}?${params.toString()}`

    logger.info('🔗 Тестовый URL сформирован:', {
      description: 'Test URL generated',
      url,
    })

    // Проверяем доступность формы
    const response = await axios.get(url)

    if (response.status !== 200) {
      throw new Error(`Form is not accessible. Status: ${response.status}`)
    }

    // Проверяем, что в ответе есть ключевые элементы формы
    const formContent = response.data.toLowerCase()
    const hasPaymentForm =
      formContent.includes('robokassa') ||
      formContent.includes('оплата') ||
      formContent.includes('payment')

    if (!hasPaymentForm) {
      throw new Error('Payment form elements not found in response')
    }

    logger.info('✅ Форма оплаты доступна и содержит необходимые элементы', {
      description: 'Payment form is accessible and contains required elements',
    })

    return {
      success: true,
      message: 'Robokassa payment form is accessible and valid',
      name: 'testRobokassaFormAvailability',
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('❌ Ошибка при проверке формы:', {
      description: 'Form validation error',
      error: errorMessage,
    })

    return {
      success: false,
      message: `Failed to validate Robokassa form: ${errorMessage}`,
      name: 'testRobokassaFormAvailability',
    }
  }
}
