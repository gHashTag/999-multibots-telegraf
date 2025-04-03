import { Context } from 'telegraf'

interface TranslationResult {
  buttons?: Array<{
    callback_data: string
    stars_price: number
  }>
  text?: string
}

interface TranslationRequest {
  key: string
  ctx: Context
}

export function getTranslation(request: TranslationRequest): TranslationResult {
  const { key, ctx } = request
  const isRu = ctx.from?.language_code === 'ru'

  const translations: Record<string, TranslationResult> = {
    subscriptionScene: {
      buttons: [
        {
          callback_data: 'basic',
          stars_price: 100,
        },
        {
          callback_data: 'premium',
          stars_price: 500,
        },
      ],
    },
  }

  return translations[key] || { text: key }
}

export * from './language'
