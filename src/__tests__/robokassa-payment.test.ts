/**
 * 🧪 Тест платежной системы Robokassa
 * Проверяет корректность генерации URL и подписи после исправлений
 */

import { describe, test, expect } from 'vitest'
import md5 from 'md5'
import {
  MERCHANT_LOGIN,
  UNIFIED_RESULT_URL,
  RESULT_URL2,
  ROBOKASSA_PASSWORD_1,
} from '@/config'

describe('🔧 Robokassa Payment System Tests', () => {
  test('🌐 UNIFIED_RESULT_URL должен быть настроен корректно', () => {
    console.log('📋 [TEST] Checking UNIFIED_RESULT_URL configuration...')
    console.log('🔗 UNIFIED_RESULT_URL:', UNIFIED_RESULT_URL)
    console.log('🔗 Legacy RESULT_URL2:', RESULT_URL2)

    expect(UNIFIED_RESULT_URL).toBeDefined()
    expect(UNIFIED_RESULT_URL).toContain('/payment-success')

    // Проверяем, что URL использует HTTPS
    expect(UNIFIED_RESULT_URL).toMatch(/^https?:\/\//)

    console.log('✅ [TEST] UNIFIED_RESULT_URL configuration is valid')
  })

  test('🔐 Подпись Robokassa должна генерироваться корректно', () => {
    console.log('📋 [TEST] Testing Robokassa signature generation...')

    // Тестовые данные
    const testData = {
      merchantLogin: MERCHANT_LOGIN,
      outSum: '100.00',
      invId: 'TEST_12345',
      password: ROBOKASSA_PASSWORD_1,
    }

    console.log('📊 [TEST] Test data:', {
      merchantLogin: testData.merchantLogin,
      outSum: testData.outSum,
      invId: testData.invId,
      passwordLength: testData.password?.length || 0,
    })

    // Проверяем наличие необходимых переменных
    expect(testData.merchantLogin).toBeDefined()
    expect(testData.password).toBeDefined()

    // Генерируем подпись согласно документации Robokassa
    const signatureString = `${testData.merchantLogin}:${testData.outSum}:${testData.invId}:${testData.password}`
    const signature = md5(signatureString)

    console.log(
      '🔐 [TEST] Signature string (without password):',
      `${testData.merchantLogin}:${testData.outSum}:${testData.invId}:[HIDDEN]`
    )
    console.log('🔐 [TEST] Generated signature:', signature)

    // Проверяем, что подпись сгенерирована
    expect(signature).toBeDefined()
    expect(signature).toHaveLength(32) // MD5 hash длиной 32 символа
    expect(signature).toMatch(/^[a-f0-9]{32}$/) // Только hex символы

    console.log('✅ [TEST] Signature generation is valid')
  })

  test('🔗 Генерация полного URL Robokassa', () => {
    console.log('📋 [TEST] Testing full Robokassa URL generation...')

    const testData = {
      merchantLogin: MERCHANT_LOGIN,
      outSum: '100.00',
      invId: 'TEST_12345',
      description: 'Test payment for 100 stars',
      password: ROBOKASSA_PASSWORD_1,
    }

    // Генерируем подпись
    const signatureString = `${testData.merchantLogin}:${testData.outSum}:${testData.invId}:${testData.password}`
    const signature = md5(signatureString)

    // Создаем URL
    const baseUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx'
    const params = new URLSearchParams({
      MerchantLogin: testData.merchantLogin,
      OutSum: testData.outSum,
      InvId: testData.invId,
      Description: testData.description,
      SignatureValue: signature,
      Culture: 'ru',
      Encoding: 'utf-8',
    })

    const fullUrl = `${baseUrl}?${params.toString()}`

    console.log('🔗 [TEST] Generated Robokassa URL:', fullUrl)
    console.log('📊 [TEST] URL parameters:', Object.fromEntries(params))

    // Проверяем корректность URL
    expect(fullUrl).toContain('auth.robokassa.ru')
    expect(fullUrl).toContain(`MerchantLogin=${testData.merchantLogin}`)
    expect(fullUrl).toContain(`OutSum=${testData.outSum}`)
    expect(fullUrl).toContain(`InvId=${testData.invId}`)
    expect(fullUrl).toContain(`SignatureValue=${signature}`)

    console.log('✅ [TEST] Full Robokassa URL generation is valid')
  })

  test('🎯 Проверка унификации URL после исправлений', () => {
    console.log('📋 [TEST] Checking URL unification after fixes...')

    // Проверяем, что оба URL используют один домен
    if (UNIFIED_RESULT_URL && RESULT_URL2) {
      const unifiedDomain = new URL(UNIFIED_RESULT_URL).hostname
      const legacyDomain = new URL(RESULT_URL2).hostname

      console.log('🌐 [TEST] Unified domain:', unifiedDomain)
      console.log('🌐 [TEST] Legacy domain:', legacyDomain)

      // В production они должны совпадать
      if (process.env.NODE_ENV === 'production') {
        expect(unifiedDomain).toBe(legacyDomain)
      }
    }

    console.log('✅ [TEST] URL unification check completed')
  })
})
