import request from 'supertest'
import crypto from 'crypto'

// TODO: Нужно как-то получить доступ к запущенному Express-приложению
// или запускать его перед тестами и останавливать после.
// Пока что будем считать, что сервер запущен отдельно на http://localhost:2999

const SERVER_URL = 'http://localhost:2999'
const WEBHOOK_PATH = '/payment-success'

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

describe('Robokassa Webhook Integration Test', () => {
  let merchantLogin: string
  let password2: string

  beforeAll(() => {
    // Получаем учетные данные из переменных окружения
    // ПРЕДПОЛАГАЕМ, что jest.config.js настроен для загрузки .env
    merchantLogin = process.env.MERCHANT_LOGIN || ''
    password2 = process.env.PASSWORD2 || ''

    if (!merchantLogin || !password2) {
      throw new Error(
        'MERCHANT_LOGIN or PASSWORD2 not found in environment variables. Make sure .env is loaded for integration tests.'
      )
    }
  })

  it('should handle a valid Robokassa notification for a non-existent payment', async () => {
    const outSum = '10.00'
    const invId = '777001' // Эмулированный ID, которого нет в базе

    const signatureValue = calculateRobokassaSignature(outSum, invId, password2)

    // Отправляем POST запрос на вебхук
    const response = await request(SERVER_URL)
      .post(WEBHOOK_PATH)
      .type('form') // Указываем тип контента как form-data
      .send({
        OutSum: outSum,
        InvId: invId,
        SignatureValue: signatureValue,
        // Можно добавить другие параметры Robokassa при необходимости
      })

    // Проверяем ответ сервера
    expect(response.status).toBe(200)
    expect(response.text).toBe(`OK${invId}`) // Ожидаем OK<InvId>, так как платеж не найден

    // Дополнительно: можно было бы проверить логи сервера,
    // но это сложнее автоматизировать в этом тесте.
  })

  // TODO: Добавить тесты для существующих платежей:
  // 1. Успешное пополнение звезд (нужен реальный InvId из подготовленной тестовой базы)
  // 2. Успешная покупка подписки (когда будет реализовано)
})
