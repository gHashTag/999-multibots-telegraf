import { PaymentTester } from './PaymentTester'
import { createTestUser } from '@/test-utils/helpers/createTestUser'
import { MyContext } from '@/interfaces'
import { createMockContext } from '@/test-utils/helpers/createMockContext'
import { TEST_PAYMENT_CONFIG } from './test-config'
import { getInvoiceId } from '@/scenes/paymentScene'
import { supabase } from '@/core/supabase'
import axios from 'axios'
import { JSDOM } from 'jsdom'

describe('Payment Form Tests', () => {
  let tester: PaymentTester
  let ctx: MyContext
  let testUserId: string
  let testUserName: string

  beforeAll(async () => {
    tester = new PaymentTester()
    ctx = await createMockContext()
    const testUser = await createTestUser()
    testUserId = testUser.telegram_id
    testUserName = 'test_user'
  })

  afterAll(async () => {
    // Очистка тестовых данных
    await supabase
      .from('payments_v2')
      .delete()
      .eq('telegram_id', testUserId)
  })

  describe('Payment Form Creation', () => {
    it('should create valid payment form URL', async () => {
      const amount = TEST_PAYMENT_CONFIG.amounts.small
      const invId = Date.now()
      const description = 'Test payment'

      const invoiceUrl = await getInvoiceId(
        process.env.MERCHANT_LOGIN || '',
        amount,
        invId,
        description,
        process.env.MERCHANT_PASSWORD1 || ''
      )

      expect(invoiceUrl).toBeTruthy()
      expect(invoiceUrl).toContain('https://auth.robokassa.ru/Merchant/Index.aspx')
      expect(invoiceUrl).toContain('MerchantLogin=')
      expect(invoiceUrl).toContain('OutSum=')
      expect(invoiceUrl).toContain('Description=')
    })

    it('should create payment form with correct amount and description', async () => {
      const amount = TEST_PAYMENT_CONFIG.amounts.small
      const invId = Date.now()
      const description = 'Test payment description'

      const invoiceUrl = await getInvoiceId(
        process.env.MERCHANT_LOGIN || '',
        amount,
        invId,
        description,
        process.env.MERCHANT_PASSWORD1 || ''
      )

      // Проверяем, что URL содержит правильные параметры
      const url = new URL(invoiceUrl)
      expect(url.searchParams.get('OutSum')).toBe(amount.toString())
      expect(url.searchParams.get('Description')).toBe(description)
      expect(url.searchParams.get('InvId')).toBe(invId.toString())
    })

    it('should create payment record in database when form is created', async () => {
      const amount = TEST_PAYMENT_CONFIG.amounts.small
      const invId = Date.now()
      const description = 'Test payment'

      const invoiceUrl = await getInvoiceId(
        process.env.MERCHANT_LOGIN || '',
        amount,
        invId,
        description,
        process.env.MERCHANT_PASSWORD1 || ''
      )

      // Проверяем создание записи в БД
      const paymentCreated = await tester.checkPaymentCreation(
        testUserId,
        amount,
        amount * TEST_PAYMENT_CONFIG.starConversion.rate,
        'PENDING'
      )
      expect(paymentCreated).toBeTruthy()
    })
  })

  describe('Payment Form Accessibility', () => {
    it('should return accessible payment form URL', async () => {
      const amount = TEST_PAYMENT_CONFIG.amounts.small
      const invId = Date.now()
      const description = 'Test payment'

      const invoiceUrl = await getInvoiceId(
        process.env.MERCHANT_LOGIN || '',
        amount,
        invId,
        description,
        process.env.MERCHANT_PASSWORD1 || ''
      )

      // Проверяем доступность URL
      const response = await axios.get(invoiceUrl)
      expect(response.status).toBe(200)
    })

    it('should contain all required form fields', async () => {
      const amount = TEST_PAYMENT_CONFIG.amounts.small
      const invId = Date.now()
      const description = 'Test payment'

      const invoiceUrl = await getInvoiceId(
        process.env.MERCHANT_LOGIN || '',
        amount,
        invId,
        description,
        process.env.MERCHANT_PASSWORD1 || ''
      )

      // Загружаем страницу и проверяем наличие необходимых полей
      const response = await axios.get(invoiceUrl)
      const dom = new JSDOM(response.data)
      const document = dom.window.document

      // Проверяем наличие основных элементов формы
      expect(document.querySelector('form')).toBeTruthy()
      expect(document.querySelector('[name="OutSum"]')).toBeTruthy()
      expect(document.querySelector('[name="InvId"]')).toBeTruthy()
      expect(document.querySelector('[name="Description"]')).toBeTruthy()
      
      // Проверяем значения полей
      const outSumField = document.querySelector('[name="OutSum"]') as HTMLInputElement
      expect(outSumField?.value).toBe(amount.toString())
      
      const invIdField = document.querySelector('[name="InvId"]') as HTMLInputElement
      expect(invIdField?.value).toBe(invId.toString())
      
      const descriptionField = document.querySelector('[name="Description"]') as HTMLInputElement
      expect(descriptionField?.value).toBe(description)
    })
  })

  describe('Payment Form Integration', () => {
    it('should show payment form in browser preview', async () => {
      const amount = TEST_PAYMENT_CONFIG.amounts.small
      const invId = Date.now()
      const description = 'Test payment'

      const invoiceUrl = await getInvoiceId(
        process.env.MERCHANT_LOGIN || '',
        amount,
        invId,
        description,
        process.env.MERCHANT_PASSWORD1 || ''
      )

      // Открываем платёжную форму в предпросмотре браузера
      const previewUrl = new URL(invoiceUrl)
      await browser_preview({
        Name: 'Payment Form Preview',
        Url: previewUrl.origin
      })

      // Проверяем, что форма открылась и содержит нужные параметры
      const response = await axios.get(invoiceUrl)
      expect(response.status).toBe(200)
      expect(response.data).toContain('form')
      expect(response.data).toContain(amount.toString())
      expect(response.data).toContain(description)
    })

    it('should handle payment form errors gracefully', async () => {
      // Пробуем создать платёжку с некорректными данными
      const amount = -100 // Некорректная сумма
      const invId = Date.now()
      const description = 'Test payment'

      await expect(
        getInvoiceId(
          process.env.MERCHANT_LOGIN || '',
          amount,
          invId,
          description,
          process.env.MERCHANT_PASSWORD1 || ''
        )
      ).rejects.toThrow()
    })

    it('should validate payment form parameters', async () => {
      const amount = TEST_PAYMENT_CONFIG.amounts.small
      const invId = Date.now()
      const description = 'Test payment'

      const invoiceUrl = await getInvoiceId(
        process.env.MERCHANT_LOGIN || '',
        amount,
        invId,
        description,
        process.env.MERCHANT_PASSWORD1 || ''
      )

      const url = new URL(invoiceUrl)
      
      // Проверяем обязательные параметры
      expect(url.searchParams.has('MerchantLogin')).toBeTruthy()
      expect(url.searchParams.has('OutSum')).toBeTruthy()
      expect(url.searchParams.has('Description')).toBeTruthy()
      expect(url.searchParams.has('SignatureValue')).toBeTruthy()
      expect(url.searchParams.has('InvId')).toBeTruthy()
      
      // Проверяем формат значений
      expect(Number(url.searchParams.get('OutSum'))).toBe(amount)
      expect(Number(url.searchParams.get('InvId'))).toBe(invId)
      expect(url.searchParams.get('Description')).toBe(description)
    })
  })
})
