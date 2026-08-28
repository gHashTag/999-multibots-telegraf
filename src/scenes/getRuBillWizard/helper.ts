import { UNIFIED_RESULT_URL } from '@/config'
import md5 from 'md5'
import { SubscriptionType } from '@/interfaces/subscription.interface'

// ⚠️ DEPRECATED: Не используйте эти экспорты!
// Используйте getMerchantLogin() и getRobokassaPassword1() из @/config напрямую
// Эти экспорты оставлены только для обратной совместимости
// export const merchantLogin = getMerchantLogin() || ''
// export const password1 = getRobokassaPassword1() || ''

export const description = 'Покупка звезд'

export const paymentOptions: {
  amount: number
  stars: string
  subscription: SubscriptionType
}[] = [
  { amount: 299, stars: '130', subscription: SubscriptionType.BASIC },
  { amount: 699, stars: '304', subscription: SubscriptionType.PRO },
  { amount: 1999, stars: '869', subscription: SubscriptionType.STUDIO },
  // Legacy plans kept for backward compatibility with existing payments
  // { amount: 1110, stars: '476', subscription: SubscriptionType.NEUROPHOTO },
  // { amount: 2999, stars: '1303', subscription: SubscriptionType.NEUROVIDEO },
]

export const subscriptionTitles = (isRu: boolean) => ({
  basic: isRu ? 'Basic' : 'Basic',
  pro: isRu ? 'Pro' : 'Pro',
  studio: isRu ? 'Studio' : 'Studio',
  // Legacy titles
  neurophoto: isRu ? '📸 Нейрофото' : '📸 NeuroPhoto',
  neurovideo: isRu ? '📚 НейроВидео' : '📚 NeuroVideo',
})

export const resultUrl2 = UNIFIED_RESULT_URL

// 🔍 DEBUG: Логируем ResultURL при загрузке модуля
console.log('🔍 [Robokassa Helper] Module loaded with:', {
  resultUrl2,
  hasTunnelUrl: !!process.env.CLOUDFLARE_TUNNEL_URL,
  tunnelUrl: process.env.CLOUDFLARE_TUNNEL_URL || 'NOT SET',
  isDev: process.env.NODE_ENV !== 'production',
})

// 🌐 Robokassa domain configuration
// Используйте ROBOKASSA_DOMAIN=kz для Казахстана или ru (default) для России
const ROBOKASSA_DOMAIN = process.env.ROBOKASSA_DOMAIN || 'ru'
const ROBOKASSA_BASE_URL = `https://auth.robokassa.${ROBOKASSA_DOMAIN}/Merchant/Index.aspx`

// 🧪 Test mode: IsTest=1 для тестовых платежей
// В тестовом режиме Robokassa НЕ списывает реальные деньги
const isTestMode =
  process.env.NODE_ENV !== 'production' ||
  process.env.ROBOKASSA_TEST_MODE === 'true'

console.log('🔧 [Robokassa Config]:', {
  domain: ROBOKASSA_DOMAIN,
  baseUrl: ROBOKASSA_BASE_URL,
  isTestMode,
  nodeEnv: process.env.NODE_ENV,
})

export function generateRobokassaUrl(
  merchantLogin: string,
  outSum: number,
  invId: number,
  description: string,
  password1: string
): string {
  console.log('═══════════════════════════════════════════════════════')
  console.log('🏦 [ROBOKASSA] GENERATING PAYMENT URL')
  console.log('═══════════════════════════════════════════════════════')

  // ✅ КРИТИЧЕСКАЯ ПРОВЕРКА: Все параметры обязательны
  if (!merchantLogin) {
    console.error('❌ [generateRobokassaUrl] MERCHANT_LOGIN is MISSING!')
    throw new Error('❌ MERCHANT_LOGIN is missing or empty!')
  }
  if (!password1) {
    console.error('❌ [generateRobokassaUrl] ROBOKASSA_PASSWORD_1 is MISSING!')
    throw new Error('❌ ROBOKASSA_PASSWORD_1 is missing or empty!')
  }
  if (!resultUrl2) {
    console.error('❌ [generateRobokassaUrl] UNIFIED_RESULT_URL is MISSING!')
    throw new Error('❌ UNIFIED_RESULT_URL is missing or empty!')
  }
  if (!outSum || outSum <= 0) {
    console.error('❌ [generateRobokassaUrl] Invalid OutSum:', outSum)
    throw new Error(`❌ Invalid OutSum: ${outSum}. Must be > 0`)
  }
  if (!invId || invId <= 0) {
    console.error('❌ [generateRobokassaUrl] Invalid InvId:', invId)
    throw new Error(`❌ Invalid InvId: ${invId}. Must be > 0`)
  }
  if (!description || description.trim() === '') {
    console.error('❌ [generateRobokassaUrl] Description is MISSING!')
    throw new Error('❌ Description is missing or empty!')
  }

  // Формируем подпись согласно документации Robokassa
  // В подпись НЕ включается ResultURL!
  // Формат: MerchantLogin:OutSum:InvId:Password1
  const signatureString = `${merchantLogin}:${outSum}:${invId}:${password1}`
  const signatureValue = md5(signatureString).toUpperCase()

  console.log('📝 [generateRobokassaUrl] Input params:', {
    merchantLogin: merchantLogin
      ? `${merchantLogin.substring(0, 5)}...`
      : 'MISSING',
    outSum,
    invId,
    description,
    password1Preview: password1 ? `${password1.substring(0, 5)}...` : 'MISSING',
    signatureString: `${merchantLogin.substring(0, 5)}...:${outSum}:${invId}:***`,
    signatureValue,
  })

  // 🚨 ВАЖНО: Полный ResultURL для webhook
  console.log(
    '🌐 [generateRobokassaUrl] ResultURL (webhook endpoint):',
    resultUrl2
  )
  console.log(
    '🔧 [generateRobokassaUrl] Test mode:',
    isTestMode ? 'YES (IsTest=1)' : 'NO (Production)'
  )
  console.log(
    '🌍 [generateRobokassaUrl] Domain:',
    ROBOKASSA_DOMAIN,
    '→',
    ROBOKASSA_BASE_URL
  )

  // 🏗️ Собираем URL с параметрами
  const params = new URLSearchParams({
    MerchantLogin: merchantLogin,
    OutSum: outSum.toString(),
    InvId: invId.toString(),
    Description: description,
    SignatureValue: signatureValue,
    ResultURL: resultUrl2,
  })

  // 🧪 Добавляем IsTest=1 для тестового режима
  if (isTestMode) {
    params.append('IsTest', '1')
    console.log('🧪 [generateRobokassaUrl] Added IsTest=1 for test mode')
  }

  const url = `${ROBOKASSA_BASE_URL}?${params.toString()}`

  // 🔗 Полный URL для отладки
  console.log('═══════════════════════════════════════════════════════')
  console.log('🔗 [generateRobokassaUrl] FULL URL:')
  console.log(url)
  console.log('═══════════════════════════════════════════════════════')
  console.log('📋 [generateRobokassaUrl] URL length:', url.length)
  console.log('📌 [generateRobokassaUrl] Params breakdown:')
  params.forEach((value, key) => {
    if (key === 'SignatureValue' || key === 'ResultURL') {
      console.log(`   ${key}: ${value}`)
    } else {
      console.log(`   ${key}: ${value}`)
    }
  })
  console.log('═══════════════════════════════════════════════════════')

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
    merchantLogin: merchantLogin
      ? `${merchantLogin.substring(0, 3)}...`
      : 'MISSING',
    outSum,
    invId,
    description,
    hasPassword: !!password1,
    resultUrl2: resultUrl2 || 'MISSING',
  })

  try {
    // ✅ КРИТИЧЕСКАЯ ПРОВЕРКА: Все параметры обязательны
    if (!merchantLogin || merchantLogin.trim() === '') {
      const error = new Error(
        '❌ MERCHANT_LOGIN is missing or empty in getInvoiceId!'
      )
      console.error('❌ [getInvoiceId] Validation failed:', {
        hasMerchantLogin: !!merchantLogin,
        merchantLoginValue: merchantLogin,
      })
      throw error
    }

    if (!password1 || password1.trim() === '') {
      const error = new Error(
        '❌ ROBOKASSA_PASSWORD_1 is missing or empty in getInvoiceId!'
      )
      console.error('❌ [getInvoiceId] Validation failed:', {
        hasPassword: !!password1,
      })
      throw error
    }

    if (!resultUrl2 || resultUrl2.trim() === '') {
      const error = new Error(
        '❌ UNIFIED_RESULT_URL is missing or empty in getInvoiceId!'
      )
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
      const error = new Error(
        '❌ Description is missing or empty in getInvoiceId!'
      )
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
      merchantLogin: merchantLogin
        ? `${merchantLogin.substring(0, 3)}...`
        : 'MISSING',
      outSum,
      invId,
      hasPassword: !!password1,
      hasResultUrl: !!resultUrl2,
    })
    throw error
  }
}
