import {
  getMerchantLogin,
  UNIFIED_RESULT_URL,
  getRobokassaPassword1,
} from '@/config'
import md5 from 'md5'
import { SubscriptionType } from '@/interfaces/subscription.interface'

export const merchantLogin = getMerchantLogin() || ''
export const password1 = getRobokassaPassword1() || ''

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
  neurophoto: isRu ? '📸 Нейрофото' : '📸 NeuroPhoto',
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
  // ✅ КРИТИЧЕСКАЯ ПРОВЕРКА: Все параметры обязательны
  if (!merchantLogin) {
    throw new Error('❌ MERCHANT_LOGIN is missing or empty!')
  }
  if (!password1) {
    throw new Error('❌ ROBOKASSA_PASSWORD_1 is missing or empty!')
  }
  if (!resultUrl2) {
    throw new Error('❌ UNIFIED_RESULT_URL is missing or empty!')
  }
  if (!outSum || outSum <= 0) {
    throw new Error(`❌ Invalid OutSum: ${outSum}. Must be > 0`)
  }
  if (!invId || invId <= 0) {
    throw new Error(`❌ Invalid InvId: ${invId}. Must be > 0`)
  }
  if (!description || description.trim() === '') {
    throw new Error('❌ Description is missing or empty!')
  }

  // Формируем подпись согласно документации Robokassa
  // В подпись НЕ включается ResultURL!
  // Формат: MerchantLogin:OutSum:InvId:Password1
  const signatureString = `${merchantLogin}:${outSum}:${invId}:${password1}`
  const signatureValue = md5(signatureString).toUpperCase()

  console.log('✅ [generateRobokassaUrl] Generating URL with params:', {
    merchantLogin: merchantLogin ? `${merchantLogin.substring(0, 3)}...` : 'MISSING',
    outSum,
    invId,
    description,
    resultUrl2: resultUrl2 || 'MISSING',
    signatureString: `${merchantLogin.substring(0, 3)}...:${outSum}:${invId}:***`,
    signatureValue,
  })

  const url = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${outSum}&InvId=${invId}&Description=${encodeURIComponent(
    description
  )}&SignatureValue=${signatureValue}&ResultURL=${encodeURIComponent(
    resultUrl2
  )}`

  console.log('✅ [generateRobokassaUrl] Generated URL:', url.substring(0, 100) + '...')

  return url
}

export async function getInvoiceId(
  merchantLogin: string,
  outSum: number,
  invId: number,
  description: string,
  password1: string
): Promise<string> {
  console.log('🔍 [getInvoiceId] Starting invoice generation', {
    merchantLogin: merchantLogin ? `${merchantLogin.substring(0, 3)}...` : 'MISSING',
    outSum,
    invId,
    description,
    hasPassword: !!password1,
    resultUrl2: resultUrl2 || 'MISSING',
  })

  try {
    // ✅ КРИТИЧЕСКАЯ ПРОВЕРКА: Все параметры обязательны
    if (!merchantLogin || merchantLogin.trim() === '') {
      const error = new Error('❌ MERCHANT_LOGIN is missing or empty in getInvoiceId!')
      console.error('❌ [getInvoiceId] Validation failed:', {
        hasMerchantLogin: !!merchantLogin,
        merchantLoginValue: merchantLogin,
      })
      throw error
    }

    if (!password1 || password1.trim() === '') {
      const error = new Error('❌ ROBOKASSA_PASSWORD_1 is missing or empty in getInvoiceId!')
      console.error('❌ [getInvoiceId] Validation failed:', {
        hasPassword: !!password1,
      })
      throw error
    }

    if (!resultUrl2 || resultUrl2.trim() === '') {
      const error = new Error('❌ UNIFIED_RESULT_URL is missing or empty in getInvoiceId!')
      console.error('❌ [getInvoiceId] Validation failed:', {
        hasResultUrl: !!resultUrl2,
        resultUrl2Value: resultUrl2,
      })
      throw error
    }

    if (!outSum || outSum <= 0) {
      const error = new Error(`❌ Invalid OutSum: ${outSum}. Must be > 0`)
      console.error('❌ [getInvoiceId] Validation failed:', { outSum })
      throw error
    }

    if (!invId || invId <= 0) {
      const error = new Error(`❌ Invalid InvId: ${invId}. Must be > 0`)
      console.error('❌ [getInvoiceId] Validation failed:', { invId })
      throw error
    }

    if (!description || description.trim() === '') {
      const error = new Error('❌ Description is missing or empty in getInvoiceId!')
      console.error('❌ [getInvoiceId] Validation failed:', { description })
      throw error
    }

    console.log('✅ [getInvoiceId] All parameters validated successfully')

    // Вызываем generateRobokassaUrl (она сама сформирует подпись)
    const invoiceUrl = generateRobokassaUrl(
      merchantLogin,
      outSum,
      invId,
      description,
      password1
    )

    console.log('✅ [getInvoiceId] Invoice URL generated successfully:', {
      urlLength: invoiceUrl.length,
      urlPreview: invoiceUrl.substring(0, 150) + '...',
    })

    return invoiceUrl
  } catch (error) {
    console.error('❌ [getInvoiceId] Error generating invoice:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      merchantLogin: merchantLogin ? `${merchantLogin.substring(0, 3)}...` : 'MISSING',
      outSum,
      invId,
      hasPassword: !!password1,
      hasResultUrl: !!resultUrl2,
    })
    throw error
  }
}
