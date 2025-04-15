import md5 from 'md5'
import { isDev, TEST_PASSWORD1 } from '@/config'
import { logger } from '@/utils/logger'

const useTestMode = isDev

/**
 * Генерирует URL для оплаты через Robokassa
 */
export async function generateRobokassaUrl(
  merchantLogin: string,
  outSum: number,
  invId: number,
  description: string,
  password1: string,
  isTest: boolean = useTestMode
): Promise<string> {
  if (!merchantLogin || !password1) {
    throw new Error('merchantLogin or password1 is not defined')
  }

  // Если включен тестовый режим и доступен тестовый пароль, используем его
  const actualPassword = isTest && TEST_PASSWORD1 ? TEST_PASSWORD1 : password1

  logger.info('🔍 Формирование URL для Robokassa', {
    description: 'Generating Robokassa URL',
    merchantLogin,
    outSum,
    invId,
    isTestMode: isTest,
    usingTestPassword: isTest && TEST_PASSWORD1 ? true : false,
    mode: isTest ? 'ТЕСТОВЫЙ РЕЖИМ' : 'БОЕВОЙ РЕЖИМ',
  })

  // Убеждаемся, что invId - целое число и не слишком длинное
  if (!Number.isInteger(invId) || invId > 2147483647) {
    logger.error('❌ Ошибка: InvId некорректный, будет преобразован', {
      description: 'Error: InvId is incorrect, will be converted',
      originalInvId: invId,
    })
    // Преобразуем в целое число если это не так и ограничиваем длину
    invId = Math.floor(invId % 1000000)
  }

  // Убеждаемся, что сумма положительная
  if (outSum <= 0) {
    logger.error('❌ Ошибка: Сумма должна быть положительной', {
      description: 'Error: Sum must be positive',
      originalSum: outSum,
    })
    outSum = Math.abs(outSum) || 1 // Используем абсолютное значение или 1 если 0
  }

  // Проверяем description
  if (!description || description.trim() === '') {
    logger.warn(
      '⚠️ Предупреждение: Описание пустое, используем значение по умолчанию',
      {
        description: 'Warning: Description is empty, using default',
      }
    )
    description = 'Покупка звезд'
  }

  // Формируем строку для подписи с корректными значениями
  const signatureString = `${merchantLogin}:${outSum}:${invId}:${actualPassword}`
  logger.info('📝 Строка для подписи:', {
    description: 'Signature string',
    signatureString,
  })

  const signatureValue = md5(signatureString).toUpperCase()

  // Формируем базовый URL Robokassa
  const baseUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx'

  // Создаем параметры запроса
  const params = new URLSearchParams()

  // Добавляем все параметры
  params.append('MerchantLogin', merchantLogin)
  params.append('OutSum', outSum.toString())
  params.append('InvId', invId.toString())
  params.append('Description', description)
  params.append('SignatureValue', signatureValue)

  // Добавляем параметр IsTest только если включен тестовый режим
  if (isTest) {
    params.append('IsTest', '1')
  }

  const url = `${baseUrl}?${params.toString()}`

  // Проверяем готовый URL
  try {
    const parsedUrl = new URL(url)
    const requiredParams = [
      'MerchantLogin',
      'OutSum',
      'InvId',
      'Description',
      'SignatureValue',
    ]
    const missingParams = []

    for (const param of requiredParams) {
      if (!parsedUrl.searchParams.has(param)) {
        missingParams.push(param)
      }
    }

    if (missingParams.length > 0) {
      logger.error('❌ Ошибка: В URL отсутствуют обязательные параметры', {
        description: 'Error: URL is missing required parameters',
        missingParams,
      })
      throw new Error(
        `URL не содержит обязательные параметры: ${missingParams.join(', ')}`
      )
    }
  } catch (error) {
    logger.error('❌ Ошибка при проверке URL:', {
      description: 'Error checking URL',
      error,
    })
    throw error
  }

  logger.info('✅ URL сформирован для Robokassa:', {
    message: 'URL generated for Robokassa',
    testMode: isTest,
    paymentUrl: url,
  })

  return url
}
