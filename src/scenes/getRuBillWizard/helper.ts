import {
  MERCHANT_LOGIN,
  PASSWORD1,
  RESULT_URL2,
  TEST_PASSWORD1,
  isDev,
} from '@/config'

import { levels } from '@/menu/mainMenu'
import md5 from 'md5'
import { generateUniqueInvoiceId } from '@/core/supabase/generateUniqueInvoiceId'

export const merchantLogin = MERCHANT_LOGIN
export const password1 = PASSWORD1
export const testPassword1 = TEST_PASSWORD1
export const resultUrl2 = RESULT_URL2 || ''
export const description = 'Покупка звезд'

// Флаг для использования тестового режима Robokassa
export const useTestMode = isDev

export const subscriptionTitles = (isRu: boolean) => ({
  neurophoto: isRu ? levels[2].title_ru : levels[2].title_en,
  neurobase: isRu ? '📚 НейроБаза' : '📚 NeuroBase',
  neuroblogger: isRu ? '🤖 НейроБлогер' : '🤖 NeuroBlogger',
})

/**
 * Генерирует короткий ID для заказа, подходящий для Robokassa
 * Создает ID заказа на основе времени и случайного числа, но с меньшей длиной
 * @param userId ID пользователя
 * @param amount Сумма заказа
 * @returns Короткий ID заказа (до 9 цифр)
 * @deprecated Используйте асинхронную функцию generateUniqueShortInvId вместо этой
 */
export function generateShortInvId(userId: string | number, amount: number): number {
  try {
    // Берем последние 5 цифр timestamp
    const timestamp = Date.now() % 100000
    // Случайное число от 1000 до 9999
    const random = Math.floor(Math.random() * 9000) + 1000
    // Объединяем в одно число и возвращаем как целое число
    return parseInt(`${timestamp}${random}`)
  } catch (error) {
    console.error('❌ Ошибка при генерации короткого inv_id', {
      description: 'Error generating short inv_id',
      error,
      userId,
      amount,
    })
    // В случае ошибки возвращаем случайное число до 1 миллиона
    return Math.floor(Math.random() * 1000000) + 1
  }
}

/**
 * Генерирует короткий ID заказа с проверкой уникальности
 * @param userId ID пользователя
 * @param amount Сумма заказа
 * @returns Promise с коротким ID заказа
 */
export async function generateUniqueShortInvId(
  userId: string | number, 
  amount: number
): Promise<number> {
  try {
    // Используем нашу новую функцию для генерации уникального ID
    const uniqueId = await generateUniqueInvoiceId(userId, amount)
    
    // Преобразуем в число, ограничиваем длину до 9 цифр если необходимо
    const numericId = parseInt(uniqueId)
    
    // Если ID слишком длинный для Robokassa, обрезаем его
    if (numericId > 999999999) {
      return numericId % 1000000000 // Берем только последние 9 цифр
    }
    
    return numericId
  } catch (error) {
    console.error('❌ Ошибка при генерации уникального ID инвойса', {
      description: 'Error generating unique invoice ID',
      error,
      userId,
      amount,
    })
    // В случае ошибки используем старый метод как запасной вариант
    return generateShortInvId(userId, amount)
  }
}

export const generateSignature = (
  merchantLogin: string,
  outSum: number,
  invId: number,
  password1: string,
  isTest: boolean = useTestMode
): string => {
  // Если включен тестовый режим и доступен тестовый пароль, используем его
  const actualPassword = isTest && testPassword1 ? testPassword1 : password1

  console.log('🔍 Формирование подписи для Robokassa', {
    description: 'Generating Robokassa signature',
    merchantLogin,
    outSum,
    invId,
    isTestMode: isTest,
    usingTestPassword: isTest && testPassword1 ? true : false,
    mode: isTest ? 'ТЕСТОВЫЙ РЕЖИМ' : 'БОЕВОЙ РЕЖИМ',
  })

  // Корректное формирование подписи без resultUrl2
  const signatureString = `${merchantLogin}:${outSum}:${invId}:${actualPassword}`
  console.log('📝 Строка для подписи:', {
    description: 'Signature string',
    signatureString,
  })

  const signature = md5(signatureString).toUpperCase()
  console.log('✅ Подпись сгенерирована:', {
    description: 'Generated signature',
    signature,
  })

  return signature
}

export const getInvoiceId = async (
  merchantLogin: string,
  outSum: number,
  invId: number,
  description: string,
  password1: string,
  isTest: boolean = useTestMode
): Promise<string> => {
  console.log('🚀 Формирование счёта с параметрами:', {
    message: 'Generating invoice with parameters',
    merchantLogin,
    outSum,
    invId,
    isTestMode: isTest,
  })

  // Убеждаемся, что invId - целое число и не слишком длинное
  if (!Number.isInteger(invId) || invId > 2147483647) {
    console.error('❌ Ошибка: InvId некорректный, будет преобразован', {
      description: 'Error: InvId is incorrect, will be converted',
      originalInvId: invId,
    })
    // Преобразуем в целое число если это не так и ограничиваем длину
    invId = Math.floor(invId % 1000000)
  }

  const signatureValue = generateSignature(
    merchantLogin,
    outSum,
    invId,
    password1,
    isTest
  )

  // Формируем базовый URL Robokassa
  const baseUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx'

  // Создаем параметры запроса - ВАЖНО: без ResultUrl2
  const params = new URLSearchParams({
    MerchantLogin: merchantLogin,
    OutSum: outSum.toString(),
    InvId: invId.toString(),
    Description: description,
    SignatureValue: signatureValue,
  })

  // Добавляем параметр IsTest только если включен тестовый режим
  if (isTest) {
    params.append('IsTest', '1')
  }

  const url = `${baseUrl}?${params.toString()}`
  console.log('✅ URL сформирован для Robokassa:', {
    message: 'Generated URL for Robokassa',
    testMode: isTest,
    paymentUrl: url,
  })

  return url
}
