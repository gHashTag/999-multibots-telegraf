/**
 * 🔬 Тест для проверки работы Robokassa с оригинальным RESULT_URL2
 * Сравниваем старую и новую версии генерации URL
 */

import { describe, test, expect } from 'vitest'
import md5 from 'md5'
import {
  MERCHANT_LOGIN,
  UNIFIED_RESULT_URL,
  ROBOKASSA_PASSWORD_1,
} from '@/config'

// Симулируем старую версию с прямым RESULT_URL2
const DIRECT_RESULT_URL2 =
  'https://ai-server-u14194.vm.elestio.app/payment-success'

function generateRobokassaUrlOLD(
  merchantLogin: string,
  outSum: number,
  invId: number,
  description: string,
  password1: string,
  resultUrl2: string
): string {
  // СТАРАЯ ВЕРСИЯ: прямое использование RESULT_URL2
  const signatureValue = md5(
    `${merchantLogin}:${outSum}:${invId}:${encodeURIComponent(
      resultUrl2
    )}:${password1}`
  ).toUpperCase()

  const url = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${outSum}&InvId=${invId}&Description=${encodeURIComponent(
    description
  )}&SignatureValue=${signatureValue}&ResultUrl2=${encodeURIComponent(
    resultUrl2
  )}`

  return url
}

function generateRobokassaUrlNEW(
  merchantLogin: string,
  outSum: number,
  invId: number,
  description: string,
  password1: string,
  resultUrl2: string
): string {
  // НОВАЯ ВЕРСИЯ: использование UNIFIED_RESULT_URL
  const signatureValue = md5(
    `${merchantLogin}:${outSum}:${invId}:${encodeURIComponent(
      resultUrl2
    )}:${password1}`
  ).toUpperCase()

  const url = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${outSum}&InvId=${invId}&Description=${encodeURIComponent(
    description
  )}&SignatureValue=${signatureValue}&ResultUrl2=${encodeURIComponent(
    resultUrl2
  )}`

  return url
}

describe('🔬 Robokassa Rollback Analysis', () => {
  test('🔍 Сравнение старой и новой версии генерации URL', () => {
    console.log('📋 [ROLLBACK] Анализ изменений в Robokassa...')

    const testData = {
      merchantLogin: MERCHANT_LOGIN || 'neuroblogger',
      outSum: 1110,
      invId: 123456,
      description: 'Оплата подписки NEUROPHOTO',
      password1: ROBOKASSA_PASSWORD_1 || 'test',
    }

    // Генерируем URL старым способом (прямой RESULT_URL2)
    const urlOLD = generateRobokassaUrlOLD(
      testData.merchantLogin,
      testData.outSum,
      testData.invId,
      testData.description,
      testData.password1,
      DIRECT_RESULT_URL2
    )

    // Генерируем URL новым способом (UNIFIED_RESULT_URL)
    const urlNEW = generateRobokassaUrlNEW(
      testData.merchantLogin,
      testData.outSum,
      testData.invId,
      testData.description,
      testData.password1,
      UNIFIED_RESULT_URL
    )

    console.log('🔗 [ROLLBACK] OLD URL (прямой RESULT_URL2):', urlOLD)
    console.log('🔗 [ROLLBACK] NEW URL (UNIFIED_RESULT_URL):', urlNEW)
    console.log('🔗 [ROLLBACK] DIRECT_RESULT_URL2:', DIRECT_RESULT_URL2)
    console.log('🔗 [ROLLBACK] UNIFIED_RESULT_URL:', UNIFIED_RESULT_URL)

    // Извлекаем подписи для сравнения
    const oldSignature = new URL(urlOLD).searchParams.get('SignatureValue')
    const newSignature = new URL(urlNEW).searchParams.get('SignatureValue')

    console.log('🔐 [ROLLBACK] OLD Signature:', oldSignature)
    console.log('🔐 [ROLLBACK] NEW Signature:', newSignature)

    // Проверяем, что URL формируются корректно
    expect(urlOLD).toContain('auth.robokassa.ru')
    expect(urlNEW).toContain('auth.robokassa.ru')

    // Проверяем, одинаковые ли подписи (должны быть одинаковые, если URL одинаковые)
    if (DIRECT_RESULT_URL2 === UNIFIED_RESULT_URL) {
      expect(oldSignature).toBe(newSignature)
      console.log(
        '✅ [ROLLBACK] Подписи идентичны - изменения не влияют на генерацию URL'
      )
    } else {
      console.log(
        '⚠️ [ROLLBACK] URL различаются - это может быть причиной проблемы!'
      )
      console.log('❓ [ROLLBACK] Разница в URL:', {
        old: DIRECT_RESULT_URL2,
        new: UNIFIED_RESULT_URL,
      })
    }
  })

  test('🧪 Тест подписи с точными параметрами из логов пользователя', () => {
    console.log(
      '📋 [ROLLBACK] Тестируем с реальными параметрами из URL пользователя...'
    )

    // Параметры из реального URL пользователя:
    // https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=neuroblogger&OutSum=1110&InvId=265968&Description=Оплата%20подписки%20NEUROPHOTO&SignatureValue=D8914A940F616C68B341D72309913EDC&ResultUrl2=https%3A%2F%2Fai-server-u14194.vm.elestio.app%2Fpayment-success

    const realParams = {
      merchantLogin: 'neuroblogger',
      outSum: 1110,
      invId: 265968,
      description: 'Оплата подписки NEUROPHOTO',
      expectedSignature: 'D8914A940F616C68B341D72309913EDC',
      resultUrl2: 'https://ai-server-u14194.vm.elestio.app/payment-success',
    }

    // Генерируем подпись с нашими текущими настройками
    const calculatedSignature = md5(
      `${realParams.merchantLogin}:${realParams.outSum}:${realParams.invId}:${encodeURIComponent(
        realParams.resultUrl2
      )}:${ROBOKASSA_PASSWORD_1}`
    ).toUpperCase()

    console.log(
      '🔐 [ROLLBACK] Ожидаемая подпись из URL:',
      realParams.expectedSignature
    )
    console.log('🔐 [ROLLBACK] Рассчитанная подпись:', calculatedSignature)
    console.log('🔐 [ROLLBACK] Password1 available:', !!ROBOKASSA_PASSWORD_1)

    if (calculatedSignature === realParams.expectedSignature) {
      console.log('✅ [ROLLBACK] Подписи совпадают - проблема НЕ в коде!')
    } else {
      console.log(
        '❌ [ROLLBACK] Подписи НЕ совпадают - проблема в конфигурации или коде!'
      )

      // Дополнительная диагностика
      const signatureString = `${realParams.merchantLogin}:${realParams.outSum}:${realParams.invId}:${encodeURIComponent(
        realParams.resultUrl2
      )}:${ROBOKASSA_PASSWORD_1}`

      console.log('🔍 [ROLLBACK] Строка для подписи:', signatureString)
    }
  })
})
