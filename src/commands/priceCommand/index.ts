import { MyContext } from '../../interfaces'
import { ModeEnum } from '@/interfaces/modes'
import {
  calculateFinalStarPrice,
  CalculationParams,
  CostCalculationResult,
} from '@/price/calculator'
import {
  STAR_COST_USD,
  CURRENCY_RATES,
  MARKUP_MULTIPLIER,
} from '@/config/pricing.config'
import { logger } from '@/utils/logger'

// Helper function to get price in stars or return 'N/A' on error
const getPrice = (mode: ModeEnum, params?: CalculationParams): string => {
  try {
    const result = calculateFinalStarPrice(mode, params)
    if (result === null) {
      logger.warn('[priceCommand] Could not calculate price for mode', {
        mode,
        params,
      })
      return 'N/A'
    }
    // Show 0 for free services
    return result.stars === 0 ? '0' : result.stars.toString()
  } catch (error) {
    logger.error('[priceCommand] Error calculating price for mode', {
      mode,
      params,
      error,
    })
    return 'Error'
  }
}

export async function priceCommand(ctx: MyContext) {
  logger.info('Executing /price command', { userId: ctx.from?.id })
  const isRu = ctx.from?.language_code === 'ru'

  // --- Calculate specific prices ---
  const stepCost = getPrice(ModeEnum.DigitalAvatarBody, { steps: 1 })
  const textToImageCost = getPrice(ModeEnum.TextToImage)
  const imageToPromptCost = getPrice(ModeEnum.ImageToPrompt)
  const textToVideoCost = getPrice(ModeEnum.TextToVideo)
  const voiceCost = getPrice(ModeEnum.Voice)
  const textToSpeechCost = getPrice(ModeEnum.TextToSpeech)
  const imageToVideoCost = getPrice(ModeEnum.ImageToVideo)
  const lipSyncCost = getPrice(ModeEnum.LipSync)
  const voiceToTextCost = getPrice(ModeEnum.VoiceToText)
  const neuroPhotoCost = getPrice(ModeEnum.NeuroPhoto)

  // --- Calculate star cost in RUB ---
  let starCostRub = 'N/A'
  try {
    // Calculate base cost in RUB and apply markup implicitly included in calculateFinalStarPrice logic
    // Here we just show the effective rate based on config
    starCostRub = (
      STAR_COST_USD *
      MARKUP_MULTIPLIER *
      CURRENCY_RATES.USD_TO_RUB
    ).toFixed(2)
  } catch (error) {
    logger.error('[priceCommand] Error calculating star cost in RUB', { error })
  }

  const message = isRu
    ? `
<b>💰 Стоимость услуг (в ⭐️):</b>
- <b>Цифровой Аватар</b> (1 шаг): ${stepCost}
- <b>Текст в Изображение:</b> ${textToImageCost}
- <b>Изображение в Промпт:</b> ${imageToPromptCost}
- <b>Текст в Видео:</b> ${textToVideoCost} (зависит от модели)
- <b>Изображение в Видео:</b> ${imageToVideoCost} (зависит от модели)
- <b>Голос (Клонирование):</b> ${voiceCost}
- <b>Текст в Речь:</b> ${textToSpeechCost}
- <b>Lip Sync (Анимация губ):</b> ${lipSyncCost}
- <b>Голос в Текст:</b> ${voiceToTextCost}
- <b>НейроФото:</b> ${neuroPhotoCost}

<i>(Стоимость видео/изображений может зависеть от выбранной модели)</i>

<b>💵 Стоимость 1 ⭐️:</b> ~${starCostRub} руб.
(Может незначительно отличаться из-за округления и курсов)

Для пополнения баланса используйте команду /buy
    `
    : `
<b>💰 Service Prices (in ⭐️):</b>
- <b>Digital Avatar</b> (1 step): ${stepCost}
- <b>Text to Image:</b> ${textToImageCost}
- <b>Image to Prompt:</b> ${imageToPromptCost}
- <b>Text to Video:</b> ${textToVideoCost} (model dependent)
- <b>Image to Video:</b> ${imageToVideoCost} (model dependent)
- <b>Voice Cloning:</b> ${voiceCost}
- <b>Text to Speech:</b> ${textToSpeechCost}
- <b>Lip Sync:</b> ${lipSyncCost}
- <b>Voice to Text:</b> ${voiceToTextCost}
- <b>NeuroPhoto:</b> ${neuroPhotoCost}

<i>(Video/image costs may vary depending on the selected model)</i>

<b>💵 Cost of 1 ⭐️:</b> ~$${STAR_COST_USD.toFixed(3)} USD
(Displayed RUB price is approximate)

To top up your balance, use the /buy command
    `

  await ctx.reply(message, { parse_mode: 'HTML' })
}
