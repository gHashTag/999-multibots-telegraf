import request from 'supertest'
import crypto from 'crypto'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { handleRobokassaResult } from '@/webhooks/robokassa/robokassa.handler'
import { PaymentStatus, PaymentType, MyContext } from '@/interfaces'
import { config as appConfig } from '@/config'
import { calculateRobokassaSignature as calculateSig } from '@/webhooks/robokassa/utils/calculateSignature'
import * as botUtils from '@/core/bot'
import { mock } from 'jest-mock-extended'
import { Telegraf } from 'telegraf'
import { Request, Response } from 'express'

// TODO: Нужно как-то получить доступ к запущенному Express-приложению
// или запускать его перед тестами и останавливать после.
// Пока что будем считать, что сервер запущен отдельно на http://localhost:2999

const SERVER_URL = 'http://localhost:2999'
const WEBHOOK_PATH = '/payment-success'

// --- Supabase Client for Test Verification ---
let supabase: SupabaseClient | null = null

// Функция для расчета MD5 подписи Robokassa
const calculateRobokassaSignature = (
  outSum: string,
  invId: string,
  password2: string
): string => {
  const signatureString = `${outSum}:${invId}:${password2}`
  return crypto
    .createHash('md5')
    .update(signatureString)
    .digest('hex')
    .toUpperCase()
}

// Мокируем функцию создания бота
jest.mock('@/core/bot', () => ({
  ...jest.requireActual('@/core/bot'),
  createBotByName: jest.fn(),
}))

const mockedCreateBotByName = botUtils.createBotByName as jest.Mock

describe('Robokassa Webhook Integration Test', () => {
  let supabaseUrl: string
  let supabaseAnonKey: string
  let resultUrl: string
  let testPaymentId: number | null = null

  // Возвращаем тестовые переменные
  const testInvId = 777002
  const testOutSum = '10.00'
  const testStars = 6
  const testUserId = '144022504'
  const testBotName = 'ai_koshey_bot'

  let mockSend: jest.Mock
  let mockStatus: jest.Mock
  let mockRes: Partial<Response>

  beforeEach(() => {
    // Мокируем createBotByName перед каждым тестом
    const mockBotInstance = mock<Telegraf<MyContext>>()
    if (!mockBotInstance.telegram) {
      mockBotInstance.telegram = { sendMessage: jest.fn() } as any
    }
    if (
      typeof mockBotInstance.telegram.sendMessage !== 'function' ||
      !('mockResolvedValue' in mockBotInstance.telegram.sendMessage)
    ) {
      mockBotInstance.telegram.sendMessage = jest.fn()
    }
    ;(mockBotInstance.telegram.sendMessage as jest.Mock).mockResolvedValue({})
    mockedCreateBotByName.mockResolvedValue({ bot: mockBotInstance })

    // Создаем моки для Response
    mockSend = jest.fn()
    mockStatus = jest.fn().mockReturnThis()
    mockRes = {
      status: mockStatus,
      send: mockSend,
    }
  })

  afterEach(() => {
    // Очищаем мок после каждого теста
    mockedCreateBotByName.mockClear()
  })

  beforeAll(async () => {
    // Используем appConfig
    supabaseUrl = appConfig.supabaseUrl
    supabaseAnonKey = appConfig.supabaseKey
    resultUrl = appConfig.robokassaResultUrl

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase URL or Key not found in config')
    }
    // Инициализируем supabase здесь
    supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Удаляем старый тестовый платеж
    await supabase.from('payments_v2').delete().eq('inv_id', testInvId)

    // Создаем тестовую запись PENDING в БД
    const { data, error } = await supabase
      .from('payments_v2')
      .insert({
        inv_id: testInvId,
        telegram_id: testUserId,
        bot_name: testBotName,
        amount: parseFloat(testOutSum),
        stars: testStars,
        status: PaymentStatus.PENDING,
        type: PaymentType.MONEY_INCOME,
        description: 'Integration Test Payment',
        payment_method: 'Robokassa',
      })
      .select('id')
      .single()

    if (error) {
      console.error('[Test Setup] Error creating test payment:', error)
      throw error
    }
    if (!data || !data.id) {
      throw new Error(
        '[Test Setup] Failed to create test payment or get its ID'
      )
    }
    testPaymentId = data.id
    console.log(
      `[Test Setup] Created test payment with InvId ${testInvId} and DB ID ${testPaymentId}`
    )
  })

  afterAll(async () => {
    // --- Очистка данных после тестов ---
    if (testPaymentId) {
      console.log(
        `[Test Cleanup] Deleting test payment with ID ${testPaymentId} (InvId ${testInvId})`
      )
      const { error } = await supabase
        .from('payments_v2')
        .delete()
        .eq('id', testPaymentId)
      if (error) {
        console.error('[Test Cleanup] Error deleting test payment:', error)
      }
    } else {
      console.log('[Test Cleanup] No test payment ID found to delete.')
    }
    supabase = null // Закрываем соединение (если есть метод close)
  })

  it('should handle a valid Robokassa notification for a non-existent payment', async () => {
    const nonExistentInvId = '777001'
    const outSum = '10.00'
    const invId = '777001' // Эмулированный ID, которого нет в базе

    const signatureValue = calculateRobokassaSignature(outSum, invId, password2)

    const response = await request(SERVER_URL)
      .post(WEBHOOK_PATH)
      .type('form')
      .send({
        OutSum: outSum,
        InvId: invId,
        SignatureValue: signatureValue,
      })

    expect(response.status).toBe(200)
    expect(response.text).toBe(`OK${invId}`)
  })

  // --- Новый тест для УСПЕШНОГО платежа ---
  it('should handle a valid Robokassa notification and update existing payment status', async () => {
    if (!supabase || !testPaymentId) {
      throw new Error(
        'Supabase client not initialized or test payment not created'
      )
    }

    const signatureValue = calculateRobokassaSignature(
      testOutSum,
      testInvId.toString(),
      password2
    )

    // Отправляем запрос на вебхук для нашего тестового платежа
    const response = await request(SERVER_URL)
      .post(WEBHOOK_PATH)
      .type('form')
      .send({
        OutSum: testOutSum,
        InvId: testInvId.toString(),
        SignatureValue: signatureValue,
      })

    // 1. Проверяем ответ сервера
    expect(response.status).toBe(200)
    expect(response.text).toBe(`OK${testInvId}`)

    // 2. Проверяем статус платежа в базе данных
    // Ждем немного, чтобы Supabase успел обработать обновление
    await new Promise(resolve => setTimeout(resolve, 1000)) // Пауза в 1 секунду

    const { data: updatedPayment, error: selectError } = await supabase
      .from('payments_v2')
      .select('status')
      .eq('id', testPaymentId)
      .single()

    if (selectError) {
      console.error('Error fetching updated payment status:', selectError)
      throw new Error('Could not verify payment status in Supabase')
    }

    expect(updatedPayment).toBeDefined()
    expect(updatedPayment?.status).toBe('COMPLETED')
    console.log(
      `[Test Verification] Payment status for InvId ${testInvId} successfully updated to COMPLETED.`
    )

    // TODO: В будущем можно добавить проверку баланса пользователя или отправки уведомления
  })
})
