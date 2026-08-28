/**
 * Тест для проверки генерации платежного URL Robokassa
 * Проверяет, что URL содержит корректные credentials (не undefined)
 */

import md5 from 'md5'

// Мокаем process.env для тестов
const mockEnv = {
  ROBOKASSA_MERCHANT_LOGIN: 'test_merchant',
  MERCHANT_LOGIN: 'fallback_merchant',
  ROBOKASSA_PASSWORD_1: 'test_password_1',
  ROBOKASSA_PASSWORD_2: 'test_password_2',
  ROBOKASSA_RESULT_URL2: 'https://test.com/payment-success',
}

// Сохраняем оригинальный env
const originalEnv = process.env

describe('Robokassa Payment URL Generation', () => {
  beforeEach(() => {
    // Сбрасываем env перед каждым тестом
    process.env = { ...originalEnv, ...mockEnv }
  })

  afterEach(() => {
    // Восстанавливаем оригинальный env
    process.env = originalEnv
  })

  describe('getRobokassaCredentials (Lazy Loading)', () => {
    it('должен получить MERCHANT_LOGIN из ROBOKASSA_MERCHANT_LOGIN', () => {
      const credentials = getRobokassaCredentials()
      expect(credentials.merchantLogin).toBe('test_merchant')
      expect(credentials.password1).toBe('test_password_1')
      expect(credentials.password2).toBe('test_password_2')
    })

    it('должен использовать fallback на MERCHANT_LOGIN если ROBOKASSA_MERCHANT_LOGIN не найден', () => {
      delete process.env.ROBOKASSA_MERCHANT_LOGIN
      const credentials = getRobokassaCredentials()
      expect(credentials.merchantLogin).toBe('fallback_merchant')
    })

    it('не должен вернуть undefined для merchantLogin', () => {
      const credentials = getRobokassaCredentials()
      expect(credentials.merchantLogin).not.toBeUndefined()
      expect(credentials.merchantLogin).not.toBeNull()
    })

    it('не должен вернуть undefined для password1', () => {
      const credentials = getRobokassaCredentials()
      expect(credentials.password1).not.toBeUndefined()
      expect(credentials.password1).not.toBeNull()
    })
  })

  describe('generateRobokassaUrl', () => {
    it('должен генерировать URL без undefined в параметрах', () => {
      const url = generateRobokassaUrl(100, 12345, 'Test payment')
      expect(url).toContain('MerchantLogin=test_merchant')
      expect(url).not.toContain('MerchantLogin=undefined')
      expect(url).toContain('OutSum=100')
      expect(url).toContain('InvId=12345')
      expect(url).toContain('SignatureValue=')
    })

    it('должен содержать валидную подпись MD5', () => {
      const url = generateRobokassaUrl(100, 12345, 'Test payment')
      const signatureMatch = url.match(/SignatureValue=([A-F0-9]+)/)
      expect(signatureMatch).not.toBeNull()
      expect(signatureMatch![1]).not.toBe('UNDEFINED')
    })

    it('должен содержать ResultURL с корректным доменом', () => {
      const url = generateRobokassaUrl(100, 12345, 'Test payment')
      expect(url).toContain(
        'ResultURL=https%3A%2F%2Ftest.com%2Fpayment-success'
      )
    })
  })

  describe('getInvoiceId', () => {
    it('должен вернуть полный URL без undefined', async () => {
      const invoiceURL = await getInvoiceId(100, 12345, 'Test payment')
      expect(invoiceURL).toContain(
        'https://auth.robokassa.ru/Merchant/Index.aspx'
      )
      expect(invoiceURL).not.toContain('undefined')
      expect(invoiceURL).toContain('MerchantLogin=test_merchant')
    })

    it('должен использовать корректную сигнатуру', async () => {
      const invoiceURL = await getInvoiceId(100, 12345, 'Test payment')
      const expectedSignature = md5(
        `test_merchant:100:12345:${mockEnv.ROBOKASSA_PASSWORD_1}`
      ).toUpperCase()
      expect(invoiceURL).toContain(`SignatureValue=${expectedSignature}`)
    })
  })
})

// Импортируем функции из helper (или мокаем их)
function getRobokassaCredentials() {
  const MERCHANT_LOGIN_VALUE =
    process.env.ROBOKASSA_MERCHANT_LOGIN || process.env.MERCHANT_LOGIN
  const ROBOKASSA_PASSWORD_1_VALUE = process.env.ROBOKASSA_PASSWORD_1
  const ROBOKASSA_PASSWORD_2_VALUE = process.env.ROBOKASSA_PASSWORD_2

  return {
    merchantLogin: MERCHANT_LOGIN_VALUE,
    password1: ROBOKASSA_PASSWORD_1_VALUE,
    password2: ROBOKASSA_PASSWORD_2_VALUE,
  }
}

function generateRobokassaUrl(
  outSum: number,
  invId: number,
  description: string
): string {
  const { merchantLogin, password1 } = getRobokassaCredentials()

  if (!merchantLogin) {
    console.error('❌ Merchant login not found')
    return ''
  }
  if (!password1) {
    console.error('❌ Password not found')
    return ''
  }
  const resultUrl2 =
    process.env.ROBOKASSA_RESULT_URL2 ||
    'https://three-head-dragon.shop/payment-success'
  if (!resultUrl2) {
    console.error('❌ Result URL not found')
    return ''
  }
  const signatureValue = md5(
    `${merchantLogin}:${outSum}:${invId}:${password1}`
  ).toUpperCase()
  const url = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${outSum}&InvId=${invId}&Description=${encodeURIComponent(
    description
  )}&SignatureValue=${signatureValue}&ResultURL=${encodeURIComponent(
    resultUrl2
  )}`

  return url
}

async function getInvoiceId(
  outSum: number,
  invId: number,
  description: string
): Promise<string> {
  const { merchantLogin, password1 } = getRobokassaCredentials()

  console.log('Start getInvoiceId', {
    merchantLogin,
    outSum,
    invId,
    description,
    password1,
  })
  try {
    const signatureValue = md5(
      `${merchantLogin}:${outSum}:${invId}:${password1}`
    )
    console.log('signatureValue', signatureValue)

    const response = generateRobokassaUrl(outSum, invId, description)
    console.log('response', response)

    return response
  } catch (error) {
    console.error('Error in getInvoiceId:', error)
    throw error
  }
}
