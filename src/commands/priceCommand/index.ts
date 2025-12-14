import { SYSTEM_CONFIG } from '@/price/constants/index'
import { MyContext } from '@/interfaces'
import { modeCosts } from '@/price/helpers/modelsCost'
import { ModeEnum } from '@/interfaces'
import { imageModelPrices } from '@/price/models/imageModelPrices'
import { UNIFIED_VIDEO_MODELS as VIDEO_MODELS_CONFIG } from '@/config/unified-video-models.config'
import { calculateFinalPrice as calculateVideoFinalPrice } from '@/price/helpers'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

// Helper function to handle potential function types in modeCosts.
const getCost = (
  cost: number | ((steps?: number) => number),
  steps?: number
): string => {
  if (typeof cost === 'function') {
    return cost(steps).toFixed(2)
  }
  return cost.toFixed(2)
}

export const handlePriceCommand = async (ctx: MyContext) => {
  try {
    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
    const isRu = isRussianFromState(ctx)
    const currentBotUsername = ctx.botInfo.username // Получаем имя бота

    // Расчет диапазона цен для генерации изображений (TextToImage)
    const imageCosts = Object.values(imageModelPrices).map(
      modelInfo => modelInfo.costPerImage
    )
    const minImageCost = imageCosts.length > 0 ? Math.min(...imageCosts) : 0
    const maxImageCost = imageCosts.length > 0 ? Math.max(...imageCosts) : 0

    // Расчет диапазона цен для Текст-в-Видео
    const textToVideoModelKeys = Object.keys(VIDEO_MODELS_CONFIG).filter(key =>
      VIDEO_MODELS_CONFIG[key].inputTypes.includes('text')
    )
    const textToVideoCosts = textToVideoModelKeys.map(key =>
      calculateVideoFinalPrice(key)
    )
    const minTextToVideoCost =
      textToVideoCosts.length > 0 ? Math.min(...textToVideoCosts) : 0
    const maxTextToVideoCost =
      textToVideoCosts.length > 0 ? Math.max(...textToVideoCosts) : 0

    // Расчет диапазона цен для Изображение-в-Видео
    const imageToVideoModelKeys = Object.keys(VIDEO_MODELS_CONFIG).filter(key =>
      VIDEO_MODELS_CONFIG[key].inputTypes.includes('image')
    )
    const imageToVideoCosts = imageToVideoModelKeys.map(key =>
      calculateVideoFinalPrice(key)
    )
    const minImageToVideoCost =
      imageToVideoCosts.length > 0 ? Math.min(...imageToVideoCosts) : 0
    const maxImageToVideoCost =
      imageToVideoCosts.length > 0 ? Math.max(...imageToVideoCosts) : 0

    // Стоимость обучения за 1 шаг
    // conversionRates.costPerStepInStars уже учитывает версию v1 по умолчанию
    // Для v2 нам нужно явно вызвать calculateCost или иметь отдельную константу
    // Предположим, что modeCosts[ModeEnum.DigitalAvatarBody] и modeCosts[ModeEnum.DigitalAvatarBodyV2]
    // являются функциями, принимающими steps.

    const trainingCostV1 = getCost(modeCosts[ModeEnum.DigitalAvatarBody], 1)
    const trainingCostV2 = getCost(modeCosts[ModeEnum.DigitalAvatarBodyV2], 1)

    // Стоимость звезды в рублях (динамический курс)
    let starCostInfoRu = ''
    if (currentBotUsername !== 'NeurostylistShtogrina_bot') {
      const currentRate = await SYSTEM_CONFIG.getRubRate()
      starCostInfoRu = `\n\n<b>💵 Стоимость 1 ⭐️:</b> ${(
        SYSTEM_CONFIG.starCost * currentRate
      ).toFixed(2)} руб`
    }

    const message = isRu
      ? `<b>💰 Стоимость услуг (в ⭐️):</b>
- 🧠 Обучение модели (1 шаг):
    v1: ${trainingCostV1}
    v2: ${trainingCostV2}
- ✍️ Генерация промпта: ${getCost(modeCosts[ModeEnum.ImageToPrompt])}
- 🖼️ Генерация изображения: от ${minImageCost.toFixed(2)} до ${maxImageCost.toFixed(2)}
- 🤖 Нейро-генерация изображения: ${getCost(modeCosts[ModeEnum.NeuroPhoto])}
- 🎤 Создание голоса: ${getCost(modeCosts[ModeEnum.Voice])}
- 🗣️ Текст в речь: ${getCost(modeCosts[ModeEnum.TextToSpeech])}
- 🎥 Текст в видео: от ${minTextToVideoCost.toFixed(2)} до ${maxTextToVideoCost.toFixed(2)}
- 📽️ Изображение в видео: от ${minImageToVideoCost.toFixed(2)} до ${maxImageToVideoCost.toFixed(2)}
- 🎭 LipSync: ${getCost(modeCosts[ModeEnum.LipSync])}
- 🔍 Улучшение изображения: ${getCost(modeCosts[ModeEnum.ImageUpscaler])}
- 🎙️ Голос в текст: ${getCost(modeCosts[ModeEnum.VoiceToText])}
- 🧬 Морфинг: ${getCost(modeCosts[ModeEnum.MorphingWizard])}
${starCostInfoRu}`
      : `<b>💰 Price of services (in ⭐️):</b>
- 🧠 Training model (1 step):
    v1: ${trainingCostV1}
    v2: ${trainingCostV2}
- ✍️ Prompt generation: ${getCost(modeCosts[ModeEnum.ImageToPrompt])}
- 🖼️ Image generation: from ${minImageCost.toFixed(2)} to ${maxImageCost.toFixed(2)}
- 🤖 Neuro-image generation: ${getCost(modeCosts[ModeEnum.NeuroPhoto])}
- 🎤 Voice creation: ${getCost(modeCosts[ModeEnum.Voice])}
- 🗣️ Text to speech: ${getCost(modeCosts[ModeEnum.TextToSpeech])}
- 🎥 Text to video: from ${minTextToVideoCost.toFixed(2)} to ${maxTextToVideoCost.toFixed(2)}
- 📽️ Image to video: from ${minImageToVideoCost.toFixed(2)} to ${maxImageToVideoCost.toFixed(2)}
- 🎭 LipSync: ${getCost(modeCosts[ModeEnum.LipSync])}
- 🔍 Image upscale: ${getCost(modeCosts[ModeEnum.ImageUpscaler])}
- 🎙️ Voice to text: ${getCost(modeCosts[ModeEnum.VoiceToText])}
- 🧬 Morphing: ${getCost(modeCosts[ModeEnum.MorphingWizard])}

<b>💵 Star cost (1 ⭐️):</b> ${SYSTEM_CONFIG.starCost.toFixed(3)} $`

    await ctx.reply(message, { parse_mode: 'HTML' })
  } catch (error) {
    console.error('Error in handlePriceCommand:', error)
    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
    const isRu = isRussianFromState(ctx)
    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка при получении цен.'
        : '❌ Error getting prices.'
    )
  }
}

// 🔄 Обратная совместимость: экспортируем старое имя
export { handlePriceCommand as priceCommand }
