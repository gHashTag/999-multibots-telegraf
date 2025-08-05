/**
 * 🧪 Интеграционный тест платежной системы Robokassa
 * Тестирует полный цикл создания платежа как в реальном боте
 */

import { describe, test, expect } from 'vitest'
import { generateRobokassaUrl } from '@/scenes/getRuBillWizard/helper'
import { MERCHANT_LOGIN, ROBOKASSA_PASSWORD_1 } from '@/config'

describe('🔗 Robokassa Integration Tests', () => {
  test('🎯 Полный цикл генерации платежного URL (как в боте)', async () => {
    console.log('📋 [INTEGRATION] Testing full payment cycle...')

    // Симулируем данные как в реальном боте
    const testPaymentData = {
      amountRub: 230, // 100 звезд
      stars: 100,
      userId: 'TEST_USER_123',
      description: 'Test payment for 100 stars',
    }

    console.log('📊 [INTEGRATION] Test payment data:', testPaymentData)

    try {
      // Генерируем URL так же, как в боте (правильный порядок параметров)
      const robokassaUrl = generateRobokassaUrl(
        MERCHANT_LOGIN, // merchantLogin: string
        testPaymentData.amountRub, // outSum: number
        Date.now(), // invId: number (уникальный ID)
        testPaymentData.description, // description: string
        ROBOKASSA_PASSWORD_1 // password1: string
      )

      console.log('🔗 [INTEGRATION] Generated URL:', robokassaUrl)

      // Проверяем основные компоненты URL
      expect(robokassaUrl).toBeDefined()
      expect(robokassaUrl).toContain('auth.robokassa.ru')
      expect(robokassaUrl).toContain('MerchantLogin=neuroblogger')
      expect(robokassaUrl).toContain(`OutSum=${testPaymentData.amountRub}`)
      expect(robokassaUrl).toContain('SignatureValue=')
      // Culture=ru добавляется на фронтенде, не в базовом URL

      // Проверяем, что URL не содержит ошибочные параметры
      expect(robokassaUrl).not.toContain('undefined')
      expect(robokassaUrl).not.toContain('null')

      // Разбираем URL для детального анализа
      const urlObj = new URL(robokassaUrl)
      const params = urlObj.searchParams

      console.log('📊 [INTEGRATION] URL Parameters analysis:')
      console.log('  - MerchantLogin:', params.get('MerchantLogin'))
      console.log('  - OutSum:', params.get('OutSum'))
      console.log('  - InvId:', params.get('InvId'))
      console.log('  - Description:', params.get('Description'))
      console.log('  - SignatureValue:', params.get('SignatureValue'))
      console.log('  - Culture:', params.get('Culture'))

      // Дополнительные проверки параметров
      expect(params.get('MerchantLogin')).toBe('neuroblogger')
      expect(params.get('OutSum')).toBe(testPaymentData.amountRub.toString())
      expect(params.get('InvId')).toMatch(/^\d+$/) // Должен быть числовой ID
      expect(params.get('SignatureValue')).toMatch(/^[A-F0-9]{32}$/) // MD5 в верхнем регистре
      // Culture добавляется на уровне фронтенда

      console.log('✅ [INTEGRATION] Full payment cycle test passed!')
    } catch (error) {
      console.error('❌ [INTEGRATION] Error in payment cycle test:', error)
      throw error
    }
  })

  test('🔄 Тест с разными суммами платежей', () => {
    console.log('📋 [INTEGRATION] Testing different payment amounts...')

    const testCases = [
      { amountRub: 115, stars: 50, description: 'Test 50 stars' },
      { amountRub: 230, stars: 100, description: 'Test 100 stars' },
      { amountRub: 460, stars: 200, description: 'Test 200 stars' },
      { amountRub: 1150, stars: 500, description: 'Test 500 stars' },
    ]

    testCases.forEach((testCase, index) => {
      console.log(`🧪 [INTEGRATION] Test case ${index + 1}:`, testCase)

      const url = generateRobokassaUrl(
        MERCHANT_LOGIN, // merchantLogin: string
        testCase.amountRub, // outSum: number
        Date.now() + index, // invId: number (уникальный)
        testCase.description, // description: string
        ROBOKASSA_PASSWORD_1 // password1: string
      )

      expect(url).toBeDefined()
      expect(url).toContain(`OutSum=${testCase.amountRub}`)
      expect(url).toContain('auth.robokassa.ru')

      console.log(`✅ [INTEGRATION] Test case ${index + 1} passed`)
    })

    console.log('✅ [INTEGRATION] All payment amounts tests passed!')
  })

  test('🛡️ Проверка безопасности подписи', () => {
    console.log('📋 [INTEGRATION] Testing signature security...')

    // Генерируем два одинаковых платежа
    const fixedInvId = 12345
    const url1 = generateRobokassaUrl(
      MERCHANT_LOGIN,
      100,
      fixedInvId,
      'Test payment',
      ROBOKASSA_PASSWORD_1
    )
    const url2 = generateRobokassaUrl(
      MERCHANT_LOGIN,
      100,
      fixedInvId,
      'Test payment',
      ROBOKASSA_PASSWORD_1
    )

    // Подписи должны быть одинаковыми для одинаковых данных
    const signature1 = new URL(url1).searchParams.get('SignatureValue')
    const signature2 = new URL(url2).searchParams.get('SignatureValue')

    expect(signature1).toBe(signature2)
    console.log('🔐 [INTEGRATION] Signature consistency verified')

    // Генерируем платеж с другими данными
    const url3 = generateRobokassaUrl(
      MERCHANT_LOGIN,
      200,
      67890,
      'Test payment',
      ROBOKASSA_PASSWORD_1
    )
    const signature3 = new URL(url3).searchParams.get('SignatureValue')

    // Подпись должна отличаться
    expect(signature1).not.toBe(signature3)
    console.log('🔐 [INTEGRATION] Signature uniqueness verified')

    console.log('✅ [INTEGRATION] Signature security tests passed!')
  })
})
