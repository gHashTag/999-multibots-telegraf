import {
import { logger } from '@/utils/enhancedLogger'
  MERCHANT_LOGIN,
  RESULT_URL2,
  UNIFIED_RESULT_URL,
  ROBOKASSA_PASSWORD_1,
} from '@/config'
import { levels } from '@/menu/mainMenu'
import md5 from 'md5'
import { SubscriptionType } from '@/interfaces/subscription.interface'

logger.debug('Payment variables check:')
logger.debug('MERCHANT_LOGIN:', MERCHANT_LOGIN)
logger.debug(
  'ROBOKASSA_PASSWORD_1:',
  ROBOKASSA_PASSWORD_1 ? '[PROTECTED]' : 'undefined'
)
logger.debug('RESULT_URL2 (legacy):', RESULT_URL2)
logger.debug('UNIFIED_RESULT_URL (new):', UNIFIED_RESULT_URL)

export const merchantLogin = MERCHANT_LOGIN
export const password1 = ROBOKASSA_PASSWORD_1

export const description = 'Покупка звезд'

export const paymentOptions: {
  amount: number
  stars: string
  subscription: SubscriptionType
}[] = [
  { amount: 1110, stars: '476', subscription: SubscriptionType.NEUROPHOTO },
  { amount: 2999, stars: '1303', subscription: SubscriptionType.NEUROVIDEO },
  // { amount: 49999, stars: '5000', subscription: 'neuromeeting' },
  // { amount: 99999, stars: '7500', subscription: 'neuroblogger' },
  //   { amount: 120000, stars: '10000', subscription: 'neuromentor' },
]

export const subscriptionTitles = (isRu: boolean) => ({
  neurophoto: isRu ? levels[2].title_ru : levels[2].title_en,
  neurovideo: isRu ? '📚 НейроВидео' : '📚 NeuroVideo',
})

export const resultUrl2 = UNIFIED_RESULT_URL

export function generateRobokassaUrl(
  merchantLogin: string,
  outSum: number,
  invId: number,
  description: string,
  password1: string
): string {
  // Проверяем все параметры
  if (!merchantLogin || !password1 || !resultUrl2) {
    logger.error('Missing required parameters in generateRobokassaUrl', {
      hasMerchantLogin: !!merchantLogin,
      hasPassword: !!password1,
      hasResultUrl: !!resultUrl2,
    })
  }

  // Формируем подпись согласно документации Robokassa
  // В подпись НЕ включается ResultURL!
  // Формат: MerchantLogin:OutSum:InvId:Password1
  const signatureValue = md5(
    `${merchantLogin}:${outSum}:${invId}:${password1}`
  ).toUpperCase()

  logger.debug('generateRobokassaUrl params:', {
    merchantLogin,
    outSum,
    invId,
    description,
    resultUrl2: resultUrl2 || 'undefined',
    signatureValue,
  })

  const url = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${outSum}&InvId=${invId}&Description=${encodeURIComponent(
    description
  )}&SignatureValue=${signatureValue}&ResultURL=${encodeURIComponent(
    resultUrl2 || ''
  )}`

  return url
}

export async function getInvoiceId(
  merchantLogin: string,
  outSum: number,
  invId: number,
  description: string,
  password1: string
): Promise<string> {
  logger.debug('Start getInvoiceId rubGetWizard', {
    merchantLogin,
    outSum,
    invId,
    description,
    password1,
    resultUrl2,
  })
  try {
    // Проверяем, определены ли все необходимые параметры
    if (!merchantLogin || !password1 || !resultUrl2) {
      logger.error('Missing required parameters for Robokassa payment', {
        hasMerchantLogin: !!merchantLogin,
        hasPassword: !!password1,
        hasResultUrl: !!resultUrl2,
      })
    }

    // Формируем подпись согласно документации Robokassa
    // В подпись НЕ включается ResultURL!
    const signatureValue = md5(
      `${merchantLogin}:${outSum}:${invId}:${password1}`
    )
    logger.debug('signatureValue', signatureValue)

    const response = generateRobokassaUrl(
      merchantLogin,
      outSum,
      invId,
      description,
      password1
    )
    logger.debug('response', response)

    return response
  } catch (error) {
    logger.error('Error in getInvoiceId:', error)
    throw error
  }
}
