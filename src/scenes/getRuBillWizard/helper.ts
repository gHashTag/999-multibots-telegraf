import { MERCHANT_LOGIN, PASSWORD1, RESULT_URL2 } from '@/config'
import { levels } from '@/menu/mainMenu'
import md5 from 'md5'
import type { SubscriptionType } from '@/interfaces/subscription.interface'

console.log('Payment variables check:')
console.log('MERCHANT_LOGIN:', MERCHANT_LOGIN)
console.log('PASSWORD1:', PASSWORD1 ? '[PROTECTED]' : 'undefined')
console.log('RESULT_URL2:', RESULT_URL2)

export const merchantLogin = MERCHANT_LOGIN
export const password1 = PASSWORD1

export const description = 'Покупка звезд'

export const paymentOptions: {
  amount: number
  stars: string
  subscription: SubscriptionType
}[] = [
  { amount: 1110, stars: '476', subscription: SubscriptionType.NEUROPHOTO },
  { amount: 2999, stars: '1303', subscription: SubscriptionType.NEUROBASE },
  // { amount: 49999, stars: '5000', subscription: 'neuromeeting' },
  // { amount: 99999, stars: '7500', subscription: 'neuroblogger' },
  //   { amount: 120000, stars: '10000', subscription: 'neuromentor' },
]

export const subscriptionTitles = (isRu: boolean) => ({
  neurophoto: isRu ? levels[2].title_ru : levels[2].title_en,
  neurobase: isRu ? '📚 НейроБаза' : '📚 NeuroBase',
  neuromeeting: isRu ? '🧠 НейроВстреча' : '🧠 NeuroMeeting',
  neuroblogger: isRu ? '🤖 НейроБлогер' : '🤖 NeuroBlogger',
  //   neuromentor: isRu ? '🦸🏼‍♂️ НейроМентор' : '🦸🏼‍♂️ NeuroMentor',
})

export const resultUrl2 = RESULT_URL2

export function generateRobokassaUrl(
  merchantLogin: string,
  outSum: number,
  invId: number,
  description: string,
  password1: string
): string {
  // Проверяем все параметры
  if (!merchantLogin || !password1 || !resultUrl2) {
    console.error('Missing required parameters in generateRobokassaUrl', {
      hasMerchantLogin: !!merchantLogin,
      hasPassword: !!password1,
      hasResultUrl: !!resultUrl2,
    })
  }

  // Используем тот же формат подписи
  const signatureValue = md5(
    `${merchantLogin}:${outSum}:${invId}:${encodeURIComponent(
      resultUrl2
    )}:${password1}`
  ).toUpperCase()

  console.log('generateRobokassaUrl params:', {
    merchantLogin,
    outSum,
    invId,
    description,
    resultUrl2: resultUrl2 || 'undefined',
    signatureValue,
  })

  const url = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${outSum}&InvId=${invId}&Description=${encodeURIComponent(
    description
  )}&SignatureValue=${signatureValue}&ResultUrl2=${encodeURIComponent(
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
  console.log('Start getInvoiceId rubGetWizard', {
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
      console.error('Missing required parameters for Robokassa payment', {
        hasMerchantLogin: !!merchantLogin,
        hasPassword: !!password1,
        hasResultUrl: !!resultUrl2,
      })
    }

    const signatureValue = md5(
      `${merchantLogin}:${outSum}:${invId}:${encodeURIComponent(
        resultUrl2
      )}:${password1}`
    )
    console.log('signatureValue', signatureValue)

    const response = generateRobokassaUrl(
      merchantLogin,
      outSum,
      invId,
      description,
      password1
    )
    console.log('response', response)

    return response
  } catch (error) {
    console.error('Error in getInvoiceId:', error)
    throw error
  }
}
