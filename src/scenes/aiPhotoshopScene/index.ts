import { Scenes, Markup } from 'telegraf'
import { downloadTelegramFileBuffer } from '@/helpers/downloadTelegramFile'
import { MyContext } from '../../interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { getMainMenuText } from '@/navigation'
import { logger } from '../../utils/logger'
import { saveFileLocally } from '@/helpers/saveFileLocally'
import fs from 'fs'
import path from 'path'
// ✅ AI PHOTOSHOP DIALOG VALIDATION (local types for production)
enum UserInputTypeEnum {
  TEXT = 'text',
  IMAGE = 'image',
  COMMAND = 'command',
}

enum DialogStateEnum {
  WAITING_INPUT = 'waiting_input',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
}

// Simple validation function for production
function validateUserInput(input: any): {
  success: boolean
  data?: any
  error?: string
} {
  if (!input || typeof input !== 'object') {
    return { success: false, error: 'Invalid input' }
  }
  return { success: true, data: input }
}
import { promisify } from 'util'
import { calculateFinalPriceInStars } from '@/interfaces/paidServices'

const writeFile = promisify(fs.writeFile)
const mkdir = promisify(fs.mkdir)

// 💎 ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ ДЛЯ ЦЕНООБРАЗОВАНИЯ AI PHOTOSHOP
// ============================================================
// Все цены в системе берутся ТОЛЬКО отсюда!
// Изменения цен делать ТОЛЬКО здесь, чтобы они применились везде.

const AI_PHOTOSHOP_PRICING = {
  // 🎯 БАЗОВЫЕ USD ЦЕНЫ МОДЕЛЕЙ (себестоимость Replicate)
  // Проверено на https://replicate.com/ - актуальные цены 2025
  modelsUSD: {
    seedream: 0.03, // SeeDream-4 (ByteDance)
    nano_banana: 0.039, // Nano Banana (Google Gemini 2.5)
    nano_banana_pro: 0.05, // Nano Banana Pro (Google Gemini 3 Pro) - text rendering, 14 images, 4K
    seedream_45: 0.06, // Seedream 4.5 (ByteDance) - superior aesthetics, spatial understanding, 4K
    flux_multi_kontext: 0.03, // FLUX Multi-Kontext
    qwen_edit_plus: 0.03, // Qwen Image Edit Plus
    // ✨ NEW AI PHOTOSHOP MODELS - January 2025 (ONLY image transformation models)
    flux_kontext_pro: 0.05, // FLUX Kontext Pro (8x faster, Adobe integrated)
    flux_kontext_max: 0.08, // FLUX Kontext Max (advanced editing and transformation)
    seededit_3: 0.05, // SeedEdit 3.0 (56.1% usability, 4K support)
    qwen_image_edit: 0.025, // Qwen Image Edit (SOTA, bilingual, FREE)
  },

  // 💰 НАЦЕНКА для AI Photoshop (множитель)
  // Купили за 100 → продали за 240 = наценка 140%
  // The four ALL_MODELS entries were intended to reach 5+6+5+5 = 21 stars.
  // They do not: the function floors, so they compute to 4+5+4+4 = 17.
  // Reaching 21 means raising the markup or rounding instead of flooring,
  // and both raise what people pay -- an owner decision, not a repair.
  // Recorded as item 22 in docs/OWNER-DECISIONS.md. The comments on each
  // entry below state the COMPUTED price and are held there by
  // src/__tests__/money/aiPhotoshopPriceCommentsMatch.test.ts
  markup: 2.4,

  // 💎 ЦЕНЫ МОДЕЛЕЙ В ЗВЁЗДАХ (рассчитываются автоматически с наценкой)
  get models() {
    return {
      seedream: calculateFinalPriceInStars(
        this.modelsUSD.seedream,
        0.016,
        this.markup
      ), // $0.03 → 4⭐
      nano_banana: calculateFinalPriceInStars(
        this.modelsUSD.nano_banana,
        0.016,
        this.markup
      ), // $0.039 → 5⭐
      nano_banana_pro: calculateFinalPriceInStars(
        this.modelsUSD.nano_banana_pro,
        0.016,
        this.markup
      ), // $0.05 → 7⭐
      seedream_45: calculateFinalPriceInStars(
        this.modelsUSD.seedream_45,
        0.016,
        this.markup
      ), // $0.06 → 9⭐
      flux_multi_kontext: calculateFinalPriceInStars(
        this.modelsUSD.flux_multi_kontext,
        0.016,
        this.markup
      ), // $0.03 → 4⭐
      qwen_edit_plus: calculateFinalPriceInStars(
        this.modelsUSD.qwen_edit_plus,
        0.016,
        this.markup
      ), // $0.03 → 4⭐
      // ✨ NEW AI PHOTOSHOP MODELS - January 2025 (ONLY image transformation models)
      flux_kontext_pro: calculateFinalPriceInStars(
        this.modelsUSD.flux_kontext_pro,
        0.016,
        this.markup
      ), // $0.05 → 7⭐
      flux_kontext_max: calculateFinalPriceInStars(
        this.modelsUSD.flux_kontext_max,
        0.016,
        this.markup
      ), // $0.08 → 12⭐
      seededit_3: calculateFinalPriceInStars(
        this.modelsUSD.seededit_3,
        0.016,
        this.markup
      ), // $0.05 → 7⭐
      qwen_image_edit: calculateFinalPriceInStars(
        this.modelsUSD.qwen_image_edit,
        0.016,
        this.markup
      ), // $0.025 → 3⭐
    }
  },

  // Множители качества для режима ALL_MODELS
  qualityMultipliers: {
    '1K': 1, // Базовое качество (без множителя)
    '2K': 4, // 2K = 4x от базовой цены
    '4K': 6, // 4K = 6x от базовой цены
  },

  // 📐 ЦЕНТРАЛИЗОВАННЫЕ ASPECT RATIO
  // Все модели используют единый aspect ratio из этой настройки
  defaultAspectRatio: '9:16' as
    | '1:1'
    | '16:9'
    | '9:16'
    | '4:3'
    | '3:4'
    | '21:9'
    | '9:21',

  // Mapping размеров к aspect ratio (ЦЕНТРАЛИЗОВАНО - ВСЕ используют 9:16)
  sizeToAspectRatio: {
    '1K': '9:16',
    '2K': '9:16',
    '4K': '9:16', // ✅ ИСПРАВЛЕНО: был 16:9, теперь единообразно 9:16
    custom: '9:16',
  } as Record<
    string,
    '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9' | '9:21'
  >,

  // Базовые USD цены для SINGLE MODEL режима (конвертируются в звёзды)
  singleModelUSD: {
    '1K': 0.1, // $0.10 → ~5⭐
    '2K': 0.4, // $0.40 → ~20⭐
    '4K': 0.6, // $0.60 → ~30⭐
  },

  // Вспомогательные функции расчёта
  getModelCost(modelKey: keyof typeof AI_PHOTOSHOP_PRICING.models): number {
    return this.models[modelKey] || 5
  },

  getAllModelsCost(): number {
    // Сумма всех моделей: 5+6+5+5 = 21⭐
    return (Object.values(this.models) as number[]).reduce(
      (sum, cost) => sum + cost,
      0
    )
  },

  getAllModelsWithQuality(quality: '1K' | '2K' | '4K'): number {
    const baseCost = this.getAllModelsCost()
    const multiplier = this.qualityMultipliers[quality] || 1
    return baseCost * multiplier
  },

  getSingleModelCost(quality: '1K' | '2K' | '4K'): number {
    const usdPrice = this.singleModelUSD[quality] || 0.1
    return calculateFinalPriceInStars(usdPrice)
  },
} as const

// 📐 Size & Aspect Ratio keyboard for single model flow
function createSizeAndRatioKeyboard(
  isRu: boolean,
  currentRatio: string = '9:16',
  currentSize: string = '2K'
) {
  const ratioOptions = [
    { key: '9:16', label_ru: '📱 9:16', label_en: '📱 9:16' },
    { key: '16:9', label_ru: '📺 16:9', label_en: '📺 16:9' },
    { key: '1:1', label_ru: '🔲 1:1', label_en: '🔲 1:1' },
    { key: '4:3', label_ru: '🖼️ 4:3', label_en: '🖼️ 4:3' },
    { key: '3:4', label_ru: '🖼️ 3:4', label_en: '🖼️ 3:4' },
    { key: '21:9', label_ru: '🎬 21:9', label_en: '🎬 21:9' },
  ]

  const sizeOptions: Array<{
    key: string
    label_ru: string
    label_en: string
  }> = [
    {
      key: '1K',
      label_ru: `1K - ${AI_PHOTOSHOP_PRICING.getSingleModelCost('1K')}⭐`,
      label_en: `1K - ${AI_PHOTOSHOP_PRICING.getSingleModelCost('1K')}⭐`,
    },
    {
      key: '2K',
      label_ru: `2K - ${AI_PHOTOSHOP_PRICING.getSingleModelCost('2K')}⭐ ✨`,
      label_en: `2K - ${AI_PHOTOSHOP_PRICING.getSingleModelCost('2K')}⭐ ✨`,
    },
    {
      key: '4K',
      label_ru: `4K - ${AI_PHOTOSHOP_PRICING.getSingleModelCost('4K')}⭐`,
      label_en: `4K - ${AI_PHOTOSHOP_PRICING.getSingleModelCost('4K')}⭐`,
    },
  ]

  const ratioButtons = ratioOptions.map(r => {
    const check = r.key === currentRatio ? ' ✅' : ''
    const label = isRu ? r.label_ru : r.label_en
    return Markup.button.callback(`${label}${check}`, `ai_ps_ratio_${r.key}`)
  })

  const sizeButtons = sizeOptions.map(s => {
    const check = s.key === currentSize ? ' ✅' : ''
    const label = isRu ? s.label_ru : s.label_en
    return Markup.button.callback(`${label}${check}`, `ai_ps_res_${s.key}`)
  })

  return Markup.inlineKeyboard([
    // Ratio row 1: 3 buttons
    ratioButtons.slice(0, 3),
    // Ratio row 2: 3 buttons
    ratioButtons.slice(3, 6),
    // Size row
    sizeButtons,
    // Confirm + navigation
    [
      Markup.button.callback(
        isRu ? '✅ Продолжить' : '✅ Continue',
        'ai_ps_size_confirm'
      ),
    ],
    [
      Markup.button.callback(
        isRu ? '🔙 Назад' : '🔙 Back',
        'ai_photoshop_back_to_styles'
      ),
      Markup.button.callback(
        isRu ? '❌ Отмена' : '❌ Cancel',
        'ai_photoshop_cancel'
      ),
    ],
  ])
}

// Log when this module loads
logger.info('🚨 AI Photoshop: Scene module loading...')
import { generateSeeDream4 } from '@/services/generateSeeDream4'
import { generateNanoBanana } from '@/services/generateNanoBanana'
import { generateNanoBananaProReplicate } from '@/services/generateNanoBananaProReplicate'
import { generateSeedream45Replicate } from '@/services/generateSeedream45Replicate'
import { generateAdvancedFluxKontext } from '@/services/generateFluxKontext'
import { generateQwenImageEditPlus } from '@/services/generateQwenImageEditPlus'
// ✅ NEW AI PHOTOSHOP MODELS - January 2025
import { generateFluxKontextPro } from '@/services/generateFluxKontextPro'
import { generateFluxKontextMax } from '@/services/generateFluxKontextMax'
import { generateSeedEdit3 } from '@/services/generateSeedEdit3'
import { generateQwenImageEdit } from '@/services/generateQwenImageEdit'
// ✅ IMPORT MULTI-PHOTO SUPPORT FOR AI PHOTOSHOP
import {
  detectMultiPhotoUpload,
  handleMultiPhotoNeurophoto,
  checkMultiPhotoEvents,
} from '@/handlers/multiPhotoHandler'
import { getBotToken } from '@/handlers/getBotToken'
// ✅ IMPORT UPSCALER FOR DIALOG MODE
import { upscaleImage } from '@/services/imageUpscaler'

// 🎬 CAMERA CONTROL SYSTEM (transferred from FLUX Kontext)
export const AI_PHOTOSHOP_CAMERA_ANGLES = {
  medium_shot:
    '[camera: medium shot, balanced composition, natural perspective]',
  close_up: '[camera: close-up shot, intimate detail, emotional connection]',
  extreme_close_up:
    '[camera: extreme close-up, fine detail focus, artistic impact]',
  wide_shot: '[camera: wide shot, environmental context, spacious composition]',
  high_angle: '[camera: high angle shot, looking down, vulnerable perspective]',
  low_angle: '[camera: low angle shot, looking up, empowering perspective]',
  dutch_angle: '[camera: dutch angle, dynamic tilt, creative composition]',
  over_shoulder: '[camera: over-the-shoulder shot, intimate perspective]',
  profile_shot: '[camera: profile shot, sculptural beauty, classic elegance]',
  three_quarter:
    '[camera: three-quarter view, dimensional depth, natural pose]',
  bird_eye: "[camera: bird's eye view, top-down perspective, unique angle]",
  macro_beauty:
    '[camera: macro beauty shot, skin texture perfection, luxury detail]',
}

// 🖼️ FRAME COMPOSITION (Professional Photography)
export const AI_PHOTOSHOP_FRAME_COMPOSITION = {
  center_weighted:
    '[composition: center-weighted balance, professional stability]',
  rule_thirds:
    '[composition: rule of thirds, dynamic balance, photographic standard]',
  golden_ratio:
    '[composition: golden ratio portrait, mathematical beauty, perfect proportion]',
  symmetrical:
    '[composition: symmetrical perfection, luxury brand precision, flawless geometry]',
  negative_space:
    '[composition: negative space elegant, minimalist sophistication]',
  leading_lines:
    '[composition: leading lines flow, premium visual journey, luxury storytelling]',
}

// ✨ PROFESSIONAL LIGHTING SETUPS
export const AI_PHOTOSHOP_LIGHTING_SETUPS = {
  soft_natural:
    '[lighting: soft natural light, gentle illumination, flattering glow]',
  dramatic: '[lighting: dramatic lighting, high contrast, artistic shadows]',
  golden_hour:
    '[lighting: golden hour warmth, magical illumination, perfect timing]',
  studio:
    '[lighting: professional studio setup, perfect illumination, commercial quality]',
  rembrandt:
    '[lighting: rembrandt lighting, classic portrait technique, artistic shadows]',
  butterfly:
    '[lighting: butterfly lighting, glamour technique, facial contouring]',
  split: '[lighting: split lighting, dramatic contrast, artistic division]',
  rim: '[lighting: rim lighting, edge illumination, subject separation]',
  candlelight:
    '[lighting: warm candlelight, intimate atmosphere, cozy ambiance]',
  neon_noir: '[lighting: neon noir, urban atmosphere, cyberpunk aesthetic]',
  morning:
    '[lighting: fresh morning light, clean illumination, new day energy]',
  sunset:
    "[lighting: warm sunset glow, romantic illumination, day's end beauty]",
}

// 🎨 AI PHOTOSHOP MODELS CONFIGURATION WITH MULTI-IMAGE SUPPORT
// ✅ Цены берутся из AI_PHOTOSHOP_PRICING (единый источник правды)
const AI_PHOTOSHOP_MODELS = {
  seedream: {
    title_ru: '🎭 SeeDream-4',
    title_en: '🎭 SeeDream-4',
    description_ru:
      'ByteDance SeeDream-4 - Продвинутая генерация и трансформация изображений',
    description_en:
      'ByteDance SeeDream-4 - Advanced image generation and transformation',
    cost: AI_PHOTOSHOP_PRICING.models.seedream,
    key: 'seedream',
    supports_image_input: true,
    supports_text_only: true,
    supports_multi_image: true,
    max_images: 10,
  },
  nano_banana: {
    title_ru: '🍌 Nano Banana',
    title_en: '🍌 Nano Banana',
    description_ru: 'Google Nano Banana - ИИ редактирование на базе Gemini 2.5',
    description_en: 'Google Nano Banana - AI editing powered by Gemini 2.5',
    cost: AI_PHOTOSHOP_PRICING.models.nano_banana,
    key: 'nano_banana',
    supports_image_input: true,
    supports_text_only: false,
    supports_multi_image: true,
    max_images: 3,
  },
  nano_banana_pro: {
    title_ru: '🍌 Nano Banana Pro',
    title_en: '🍌 Nano Banana Pro',
    description_ru:
      'Google Nano Banana Pro - Gemini 3 Pro, рендеринг текста, до 14 изображений, 4K',
    description_en:
      'Google Nano Banana Pro - Gemini 3 Pro, text rendering, up to 14 images, 4K',
    cost: AI_PHOTOSHOP_PRICING.models.nano_banana_pro,
    key: 'nano_banana_pro',
    supports_image_input: true,
    supports_text_only: true,
    supports_multi_image: true,
    max_images: 14,
  },
  seedream_45: {
    title_ru: '🌱 Seedream 4.5',
    title_en: '🌱 Seedream 4.5',
    description_ru:
      'ByteDance Seedream 4.5 - Превосходная эстетика, пространственное понимание, до 4K',
    description_en:
      'ByteDance Seedream 4.5 - Superior aesthetics, spatial understanding, up to 4K',
    cost: AI_PHOTOSHOP_PRICING.models.seedream_45,
    key: 'seedream_45',
    supports_image_input: true,
    supports_text_only: true,
    supports_multi_image: true,
    max_images: 14,
  },
  flux_multi_kontext: {
    title_ru: '🎯 FLUX Multi-Kontext',
    title_en: '🎯 FLUX Multi-Kontext',
    description_ru:
      'FLUX Multi-Kontext Pro - Объединение двух изображений в единый композит',
    description_en:
      'FLUX Multi-Kontext Pro - Combine two images into seamless composite',
    cost: AI_PHOTOSHOP_PRICING.models.flux_multi_kontext,
    key: 'flux_multi_kontext',
    supports_image_input: true,
    supports_text_only: false,
    supports_multi_image: true,
    max_images: 2,
  },
  qwen_edit_plus: {
    title_ru: '🎨 Qwen Image Edit Plus',
    title_en: '🎨 Qwen Image Edit Plus',
    description_ru:
      'Qwen Image Edit Plus - Продвинутое редактирование множественных изображений',
    description_en:
      'Qwen Image Edit Plus - Advanced multi-image editing with improved consistency',
    cost: AI_PHOTOSHOP_PRICING.models.qwen_edit_plus,
    key: 'qwen_edit_plus',
    supports_image_input: true,
    supports_text_only: false,
    supports_multi_image: true,
    max_images: 10,
  },
  // ✨ NEW AI PHOTOSHOP MODELS - January 2025
  flux_kontext_pro: {
    title_ru: '⚡ FLUX Kontext Pro',
    title_en: '⚡ FLUX Kontext Pro',
    description_ru:
      'FLUX Kontext Pro - 8x быстрее, интеграция с Adobe Photoshop Beta',
    description_en:
      'FLUX Kontext Pro - 8x faster, Adobe Photoshop Beta integrated',
    cost: AI_PHOTOSHOP_PRICING.models.flux_kontext_pro,
    key: 'flux_kontext_pro',
    supports_image_input: true,
    supports_text_only: true,
    supports_multi_image: false,
    max_images: 1,
  },
  flux_kontext_max: {
    title_ru: '🚀 FLUX Kontext Max',
    title_en: '🚀 FLUX Kontext Max',
    description_ru:
      'FLUX Kontext Max - Продвинутое редактирование и трансформация изображений',
    description_en:
      'FLUX Kontext Max - Advanced image editing and transformation',
    cost: AI_PHOTOSHOP_PRICING.models.flux_kontext_max,
    key: 'flux_kontext_max',
    supports_image_input: true,
    supports_text_only: true,
    supports_multi_image: false,
    max_images: 1,
  },
  seededit_3: {
    title_ru: '🎯 SeedEdit 3.0',
    title_en: '🎯 SeedEdit 3.0',
    description_ru:
      'SeedEdit 3.0 - 56.1% usability, поддержка 4K, лучшая детализация',
    description_en:
      'SeedEdit 3.0 - 56.1% usability, 4K support, superior detail preservation',
    cost: AI_PHOTOSHOP_PRICING.models.seededit_3,
    key: 'seededit_3',
    supports_image_input: true,
    supports_text_only: true,
    supports_multi_image: false,
    max_images: 1,
  },
  qwen_image_edit: {
    title_ru: '🔥 Qwen Edit (SOTA)',
    title_en: '🔥 Qwen Edit (SOTA)',
    description_ru:
      'Qwen Image Edit - SOTA производительность, билингвальное редактирование текста',
    description_en:
      'Qwen Image Edit - SOTA performance, bilingual text editing',
    cost: AI_PHOTOSHOP_PRICING.models.qwen_image_edit,
    key: 'qwen_image_edit',
    supports_image_input: true,
    supports_text_only: false,
    supports_multi_image: true,
    max_images: 10,
  },
}

// 🎨 PROMPT TEMPLATES FOR DIFFERENT STYLES
const AI_PHOTOSHOP_STYLES = {
  portrait: {
    title_ru: '👤 Портрет',
    title_en: '👤 Portrait',
    template:
      'professional portrait, high quality, studio lighting, detailed face',
  },
  artistic: {
    title_ru: '🎨 Художественный',
    title_en: '🎨 Artistic',
    template:
      'artistic style, creative composition, vibrant colors, detailed artwork',
  },
  photorealistic: {
    title_ru: '📸 Фотореализм',
    title_en: '📸 Photorealistic',
    template:
      'photorealistic, ultra detailed, high resolution, professional photography',
  },
  fantasy: {
    title_ru: '🧙‍♂️ Фэнтези',
    title_en: '🧙‍♂️ Fantasy',
    template:
      'fantasy style, magical atmosphere, mystical elements, epic composition',
  },
  cyberpunk: {
    title_ru: '🤖 Киберпанк',
    title_en: '🤖 Cyberpunk',
    template:
      'cyberpunk style, neon lights, futuristic, technological atmosphere',
  },
  vintage: {
    title_ru: '📻 Винтаж',
    title_en: '📻 Vintage',
    template:
      'vintage style, retro aesthetic, classic composition, nostalgic mood',
  },
  figure_3d: {
    title_ru: '🖨️ 3D Фигурка',
    title_en: '🖨️ 3D Figure',
    template:
      "turn this photo into a character figure. Behind it, place a box with the character's image printed on it, and a computer showing the Blender modeling process on its screen. In front of the box, add a round plastic base with the character figure standing on it. set the scene indoors if possible",
  },
}

// Create the scene
export const aiPhotoshopScene = new Scenes.BaseScene<MyContext>(
  'ai_photoshop_scene'
)

// Function to create model selection keyboard
const createModelSelectionKeyboard = (isRu: boolean) => {
  const keyboard = []

  // ✅ Add models 1 per row (changed from 2 per row)
  const models = Object.entries(AI_PHOTOSHOP_MODELS)
  for (let i = 0; i < models.length; i++) {
    const [modelKey, model] = models[i]
    keyboard.push([
      Markup.button.callback(
        `${isRu ? model.title_ru : model.title_en} (${model.cost}⭐)`,
        `ai_photoshop_model_${modelKey}`
      ),
    ])
  }

  // ✅ Add "All at once" button - автоматически считает все модели из AI_PHOTOSHOP_MODELS
  const totalCostAllModels = AI_PHOTOSHOP_PRICING.getAllModelsCost()
  keyboard.push([
    Markup.button.callback(
      isRu
        ? `🎯 Все сразу (${totalCostAllModels}⭐)`
        : `🎯 All at once (${totalCostAllModels}⭐)`,
      'ai_photoshop_all_models_from_selector'
    ),
  ])

  // Add cancel button
  keyboard.push([
    Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'ai_photoshop_cancel'),
  ])

  return Markup.inlineKeyboard(keyboard)
}

// 🎬 Camera control functions (transferred from FLUX Kontext)
const getCameraAngleLabel = (angle: string, isRu: boolean): string => {
  const labels: Record<string, { ru: string; en: string }> = {
    medium_shot: { ru: '🎥 Средний план', en: '🎥 Medium Shot' },
    close_up: { ru: '🔍 Крупный план', en: '🔍 Close-up' },
    extreme_close_up: { ru: '🔎 Сверхкрупный план', en: '🔎 Extreme Close-up' },
    wide_shot: { ru: '🌐 Общий план', en: '🌐 Wide Shot' },
    high_angle: { ru: '📐 Верхний ракурс', en: '📐 High Angle' },
    low_angle: { ru: '📐 Нижний ракурс', en: '📐 Low Angle' },
    dutch_angle: { ru: '🎭 Голландский угол', en: '🎭 Dutch Angle' },
    over_shoulder: { ru: '👤 Через плечо', en: '👤 Over Shoulder' },
    profile_shot: { ru: '👤 Профиль', en: '👤 Profile' },
    three_quarter: { ru: '📐 Три четверти', en: '📐 Three Quarter' },
    bird_eye: { ru: '🦅 Птичий взгляд', en: "🦅 Bird's Eye" },
    macro_beauty: { ru: '💎 Макро красота', en: '💎 Macro Beauty' },
  }

  return labels[angle] ? (isRu ? labels[angle].ru : labels[angle].en) : angle
}

const getLightingLabel = (lighting: string, isRu: boolean): string => {
  const labels: Record<string, { ru: string; en: string }> = {
    soft_natural: { ru: '☀️ Мягкий свет', en: '☀️ Soft Natural' },
    dramatic: { ru: '🎭 Драматично', en: '🎭 Dramatic' },
    golden_hour: { ru: '🌅 Золотой час', en: '🌅 Golden Hour' },
    studio: { ru: '🏢 Студийный', en: '🏢 Studio' },
    rembrandt: { ru: '🎨 Рембрандт', en: '🎨 Rembrandt' },
    butterfly: { ru: '🦋 Бабочка', en: '🦋 Butterfly' },
    split: { ru: '🌗 Разделенный', en: '🌗 Split' },
    rim: { ru: '💫 Контровой', en: '💫 Rim' },
    candlelight: { ru: '🕯️ Свечи', en: '🕯️ Candlelight' },
    neon_noir: { ru: '🌃 Неон нуар', en: '🌃 Neon Noir' },
    morning: { ru: '🌄 Утренний', en: '🌄 Morning' },
    sunset: { ru: '🌇 Закат', en: '🌇 Sunset' },
  }

  return labels[lighting]
    ? isRu
      ? labels[lighting].ru
      : labels[lighting].en
    : lighting
}

const getCompositionLabel = (composition: string, isRu: boolean): string => {
  const labels: Record<string, { ru: string; en: string }> = {
    center_weighted: { ru: '⚖️ Центровес', en: '⚖️ Center Weighted' },
    rule_thirds: { ru: '📐 Правило третей', en: '📐 Rule of Thirds' },
    golden_ratio: { ru: '🌟 Золотое сечение', en: '🌟 Golden Ratio' },
    symmetrical: { ru: '🔄 Симметрия', en: '🔄 Symmetrical' },
    negative_space: {
      ru: '🌌 Негативное пространство',
      en: '🌌 Negative Space',
    },
    leading_lines: { ru: '📏 Направляющие линии', en: '📏 Leading Lines' },
  }

  return labels[composition]
    ? isRu
      ? labels[composition].ru
      : labels[composition].en
    : composition
}

// Function to create camera angle selection keyboard
const createCameraAngleKeyboard = (isRu: boolean) => {
  const keyboard = []
  const angles = Object.keys(AI_PHOTOSHOP_CAMERA_ANGLES)

  // Add camera angles 2 per row
  for (let i = 0; i < angles.length; i += 2) {
    const row = []

    const angle1 = angles[i]
    const angle1Label = getCameraAngleLabel(angle1, isRu)
    row.push(
      Markup.button.callback(angle1Label, `ai_photoshop_camera_${angle1}`)
    )

    if (i + 1 < angles.length) {
      const angle2 = angles[i + 1]
      const angle2Label = getCameraAngleLabel(angle2, isRu)
      row.push(
        Markup.button.callback(angle2Label, `ai_photoshop_camera_${angle2}`)
      )
    }

    keyboard.push(row)
  }

  // Add control buttons
  keyboard.push([
    Markup.button.callback(
      isRu ? '🎬 Автовыбор' : '🎬 Auto Select',
      'ai_photoshop_camera_auto'
    ),
    Markup.button.callback(
      isRu ? 'Назад' : 'Back',
      'ai_photoshop_back_to_main'
    ),
  ])

  return Markup.inlineKeyboard(keyboard)
}

// Function to create lighting selection keyboard
const createLightingKeyboard = (isRu: boolean) => {
  const keyboard = []
  const lightings = Object.keys(AI_PHOTOSHOP_LIGHTING_SETUPS)

  // Add lightings 2 per row
  for (let i = 0; i < lightings.length; i += 2) {
    const row = []

    const lighting1 = lightings[i]
    const lighting1Label = getLightingLabel(lighting1, isRu)
    row.push(
      Markup.button.callback(
        lighting1Label,
        `ai_photoshop_lighting_${lighting1}`
      )
    )

    if (i + 1 < lightings.length) {
      const lighting2 = lightings[i + 1]
      const lighting2Label = getLightingLabel(lighting2, isRu)
      row.push(
        Markup.button.callback(
          lighting2Label,
          `ai_photoshop_lighting_${lighting2}`
        )
      )
    }

    keyboard.push(row)
  }

  // Add control buttons
  keyboard.push([
    Markup.button.callback(
      isRu ? '💡 Автовыбор' : '💡 Auto Select',
      'ai_photoshop_lighting_auto'
    ),
    Markup.button.callback(
      isRu ? 'Назад' : 'Back',
      'ai_photoshop_back_to_main'
    ),
  ])

  return Markup.inlineKeyboard(keyboard)
}

// Function to create composition selection keyboard
const createCompositionKeyboard = (isRu: boolean) => {
  const keyboard = []
  const compositions = Object.keys(AI_PHOTOSHOP_FRAME_COMPOSITION)

  // Add compositions 2 per row
  for (let i = 0; i < compositions.length; i += 2) {
    const row = []

    const composition1 = compositions[i]
    const composition1Label = getCompositionLabel(composition1, isRu)
    row.push(
      Markup.button.callback(
        composition1Label,
        `ai_photoshop_composition_${composition1}`
      )
    )

    if (i + 1 < compositions.length) {
      const composition2 = compositions[i + 1]
      const composition2Label = getCompositionLabel(composition2, isRu)
      row.push(
        Markup.button.callback(
          composition2Label,
          `ai_photoshop_composition_${composition2}`
        )
      )
    }

    keyboard.push(row)
  }

  // Add control buttons
  keyboard.push([
    Markup.button.callback(
      isRu ? '📐 Автовыбор' : '📐 Auto Select',
      'ai_photoshop_composition_auto'
    ),
    Markup.button.callback(
      isRu ? 'Назад' : 'Back',
      'ai_photoshop_back_to_main'
    ),
  ])

  return Markup.inlineKeyboard(keyboard)
}

// Function to create variations count selection keyboard
const createVariationsKeyboard = (isRu: boolean) => {
  const variations = [
    { count: 1, label: '1' },
    { count: 2, label: '2' },
    { count: 3, label: '3' },
    { count: 4, label: '4' },
    { count: 10, label: '10' },
    { count: 20, label: '20' },
    { count: 30, label: '30' },
    { count: 50, label: '50' },
  ]

  const keyboard = []

  // Add variations 4 per row
  for (let i = 0; i < variations.length; i += 4) {
    const row = []
    for (let j = 0; j < 4 && i + j < variations.length; j++) {
      const variation = variations[i + j]
      row.push(
        Markup.button.callback(
          `🔢 ${variation.label}`,
          `ai_photoshop_variations_${variation.count}`
        )
      )
    }
    keyboard.push(row)
  }

  // Add back button
  keyboard.push([
    Markup.button.callback(
      isRu ? '🔙 Назад' : '🔙 Back',
      'ai_photoshop_back_to_main'
    ),
  ])

  return Markup.inlineKeyboard(keyboard)
}

// Function to create aspect ratio selection keyboard
const createAspectRatioKeyboard = (isRu: boolean) => {
  const aspectRatios = [
    { key: '1:1', labelRu: '🔲 1:1 (Квадрат)', labelEn: '🔲 1:1 (Square)' },
    { key: '16:9', labelRu: '📺 16:9 (Широкий)', labelEn: '📺 16:9 (Wide)' },
    {
      key: '9:16',
      labelRu: '📱 9:16 (Портрет)',
      labelEn: '📱 9:16 (Portrait)',
    },
    { key: '4:3', labelRu: '🖼️ 4:3 (Стандарт)', labelEn: '🖼️ 4:3 (Standard)' },
    { key: '3:4', labelRu: '🖼️ 3:4 (Портрет)', labelEn: '🖼️ 3:4 (Portrait)' },
    { key: '21:9', labelRu: '🎬 21:9 (Кино)', labelEn: '🎬 21:9 (Cinema)' },
    {
      key: '9:21',
      labelRu: '🎬 9:21 (Портрет)',
      labelEn: '🎬 9:21 (Portrait)',
    },
  ]

  const keyboard = []

  // Add aspect ratios 2 per row
  for (let i = 0; i < aspectRatios.length; i += 2) {
    const row = []

    const ratio1 = aspectRatios[i]
    row.push(
      Markup.button.callback(
        isRu ? ratio1.labelRu : ratio1.labelEn,
        `ai_photoshop_ratio_${ratio1.key.replace(':', '_')}`
      )
    )

    if (i + 1 < aspectRatios.length) {
      const ratio2 = aspectRatios[i + 1]
      row.push(
        Markup.button.callback(
          isRu ? ratio2.labelRu : ratio2.labelEn,
          `ai_photoshop_ratio_${ratio2.key.replace(':', '_')}`
        )
      )
    }

    keyboard.push(row)
  }

  // Add back button
  keyboard.push([
    Markup.button.callback(
      isRu ? '🔙 Назад' : '🔙 Back',
      'ai_photoshop_back_to_main'
    ),
  ])

  return Markup.inlineKeyboard(keyboard)
}

// Function to create style selection keyboard
const createStyleSelectionKeyboard = (isRu: boolean) => {
  const keyboard = []

  // Add styles 2 per row
  const styles = Object.entries(AI_PHOTOSHOP_STYLES)
  for (let i = 0; i < styles.length; i += 2) {
    const row = []
    const [styleKey1, style1] = styles[i]
    row.push(
      Markup.button.callback(
        isRu ? style1.title_ru : style1.title_en,
        `ai_photoshop_style_${styleKey1}`
      )
    )

    if (i + 1 < styles.length) {
      const [styleKey2, style2] = styles[i + 1]
      row.push(
        Markup.button.callback(
          isRu ? style2.title_ru : style2.title_en,
          `ai_photoshop_style_${styleKey2}`
        )
      )
    }

    keyboard.push(row)
  }

  // Add custom prompt and cancel buttons
  keyboard.push([
    Markup.button.callback(
      isRu ? '✍️ Свой промпт' : '✍️ Custom Prompt',
      'ai_photoshop_custom_prompt'
    ),
  ])

  keyboard.push([
    Markup.button.callback(
      isRu ? 'Назад' : 'Back',
      'ai_photoshop_back_to_models'
    ),
    Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'ai_photoshop_cancel'),
  ])

  return Markup.inlineKeyboard(keyboard)
}

// Scene entry
aiPhotoshopScene.enter(async ctx => {
  try {
    logger.info('🚨 AI Photoshop: Entering scene', {
      telegramId: ctx.from?.id,
      sessionExists: !!ctx.session,
    })

    const isRu = isRussianFromState(ctx)

    // ✅ СКРЫТЬ ГЛАВНОЕ МЕНЮ ПРИ ВХОДЕ В СЦЕНУ
    // Пользователь не должен видеть кнопки главного меню во время работы с AI Photoshop

    // ✅ CHECK FOR PENDING MULTI-PHOTO EVENTS IN AI PHOTOSHOP
    const hasMultiPhotoEvent = await checkMultiPhotoEvents(ctx)
    if (hasMultiPhotoEvent) {
      logger.info('✅ AI Photoshop: Multi-photo event detected and handled')
      return
    }

    if (!ctx.from?.id) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка получения ID пользователя'
          : '❌ Error getting user ID'
      )
      await ctx.scene.leave()
      return
    }

    // ✅ ENHANCED: Don't reset if we have saved photos (dialog mode)
    const hasSavedPhotos = ctx.session?.savedAiPhotoshopResults?.length > 0

    if (!hasSavedPhotos) {
      // Reset session state only for new sessions
      if (ctx.session) {
        ctx.session.aiPhotoshopModel = undefined
        ctx.session.aiPhotoshopStyle = undefined
        ctx.session.aiPhotoshopImage = undefined
        // Evict the cross-scene morphingImages batch. morphingWizard populates
        // it (buffers, no url) and never clears it on cancel/leave, so a stale
        // batch would hijack a fresh single-photo edit: the multi-photo branch
        // yields empty urls and the paid generation runs on the wrong/empty
        // image. aiPhotoshop's own multi-photo flow repopulates it after enter.
        ctx.session.morphingImages = undefined
        ctx.session.aiPhotoshopPrompt = undefined
        ctx.session.aiPhotoshopSize = undefined
        ctx.session.awaitingAiPhotoshopImage = false
        ctx.session.awaitingAiPhotoshopPrompt = false
        ctx.session.aiPhotoshopStep = 'model_select'
        ctx.session.savedAiPhotoshopResults = []
        ctx.session.dialogMode = false
      }
    } else {
      // Continue in dialog mode with saved photos
      logger.info(
        '🎨 AI Photoshop: Continuing in dialog mode with saved photos',
        {
          telegramId: ctx.from?.id,
          savedPhotosCount: ctx.session?.savedAiPhotoshopResults?.length,
        }
      )
      await showDialogInterface(ctx)
      return
    }

    const title = isRu
      ? '🎨 *ИИ Фотошоп* - Продвинутая обработка изображений'
      : '🎨 *AI Photoshop* - Advanced Image Processing'

    const description = isRu
      ? `🚀 *Добро пожаловать в ИИ Фотошоп!*

🎯 *Что умеет бот:*
• Обрабатывать одно фото или целые альбомы
• Применять различные стили и эффекты
• Улучшать фото по вашим текстовым описаниям
• Сохранять все результаты в диалоговом режиме

📋 *Процесс работы:*
1️⃣ Выберите модель ИИ → 2️⃣ Выберите стиль → 3️⃣ Загрузите фото → 4️⃣ Получите результат!

⬇️ *Выберите модель ИИ для обработки:*

🎭 *SeeDream-4* - Генерация и трансформация (4⭐, до 10 фото)
🍌 *Nano Banana* - ИИ редактирование Gemini 2.5 (5⭐, до 3 фото)
🚀 *FLUX Multi-Kontext* - Профессиональное (4⭐, 1 фото)
🎨 *Qwen Image Edit Plus* - Продвинутое (5⭐, до 10 фото)

💡 *Или просто отправьте фото сразу для обработки SeeDream-4!*`
      : `🚀 *Welcome to AI Photoshop!*

🎯 *What the bot can do:*
• Process single photos or entire albums
• Apply various styles and effects
• Enhance photos based on your text descriptions
• Save all results in dialog mode

📋 *How it works:*
1️⃣ Choose AI model → 2️⃣ Select style → 3️⃣ Upload photo → 4️⃣ Get result!

⬇️ *Choose an AI model for processing:*

🎭 *SeeDream-4* - Generation and transformation (4⭐, up to 10 photos)
🍌 *Nano Banana* - AI editing powered by Gemini 2.5 (5⭐, up to 3 photos)
🚀 *FLUX Multi-Kontext* - Professional editing (4⭐, single photo)
🎨 *Qwen Image Edit Plus* - Advanced editing (5⭐, up to 10 photos)

💡 *Or just send a photo directly for SeeDream-4 processing!*`

    // ✅ СКРЫТЬ ГЛАВНОЕ МЕНЮ ПЕРЕД ПОКАЗОМ INLINE КНОПОК
    await ctx.reply('🎨', Markup.removeKeyboard())

    await ctx.reply(title + '\n\n' + description, {
      parse_mode: 'Markdown',
      reply_markup: createModelSelectionKeyboard(isRu).reply_markup,
    })
  } catch (error) {
    logger.error('Error in AI Photoshop scene enter', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
    await ctx.scene.leave()
  }
})

// Handle model selection
Object.keys(AI_PHOTOSHOP_MODELS).forEach(modelKey => {
  aiPhotoshopScene.action(`ai_photoshop_model_${modelKey}`, async ctx => {
    try {
      await ctx.answerCbQuery()
      const isRu = isRussianFromState(ctx)

      if (ctx.session) {
        ctx.session.aiPhotoshopModel = modelKey as any
        ctx.session.aiPhotoshopStep = 'style_select'
      }

      const model =
        AI_PHOTOSHOP_MODELS[modelKey as keyof typeof AI_PHOTOSHOP_MODELS]
      const modelTitle = isRu ? model.title_ru : model.title_en
      const modelDescription = isRu
        ? model.description_ru
        : model.description_en

      await ctx.editMessageText(
        isRu
          ? `✅ *Выбрана модель:* ${modelTitle}\n\n${modelDescription}\n\n🎨 *Выберите стиль обработки:*`
          : `✅ *Selected model:* ${modelTitle}\n\n${modelDescription}\n\n🎨 *Choose processing style:*`,
        {
          parse_mode: 'Markdown',
          reply_markup: createStyleSelectionKeyboard(isRu).reply_markup,
        }
      )
    } catch (error) {
      logger.error('Error handling AI Photoshop model selection', {
        error: error instanceof Error ? error.message : 'Unknown error',
        telegramId: ctx.from?.id,
        model: modelKey,
      })
    }
  })
})

// ✅ NEW: Handle "All at once" from model selector
aiPhotoshopScene.action('ai_photoshop_all_models_from_selector', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    // 🚨 CRITICAL DEBUG: Log button press
    console.log('🎯🎯🎯 AI Photoshop: ALL_MODELS button pressed', {
      telegramId: ctx.from?.id,
      sessionExistsBefore: !!ctx.session,
      sessionStateBefore: ctx.session
        ? {
            aiPhotoshopModel: ctx.session.aiPhotoshopModel,
            awaitingAiPhotoshopImage: ctx.session.awaitingAiPhotoshopImage,
          }
        : null,
    })

    // Set session to indicate multi-model processing
    if (ctx.session) {
      ctx.session.aiPhotoshopModel = 'all_models' as any
      ctx.session.aiPhotoshopStep = 'quality_selection'
      ctx.session.awaitingAiPhotoshopImage = false

      // 🚨 CRITICAL DEBUG: Log after setting
      logger.info(
        '🎯 AI Photoshop: Session UPDATED for ALL_MODELS quality selection',
        {
          telegramId: ctx.from?.id,
          aiPhotoshopModel: ctx.session.aiPhotoshopModel,
          awaitingAiPhotoshopImage: ctx.session.awaitingAiPhotoshopImage,
          aiPhotoshopStep: ctx.session.aiPhotoshopStep,
        }
      )
    }

    // ✅ Calculate costs using centralized pricing
    const baseCost = AI_PHOTOSHOP_PRICING.getAllModelsCost() // Единый источник правды
    const modelNames = Object.values(AI_PHOTOSHOP_MODELS).map(model =>
      isRu ? model.title_ru : model.title_en
    )

    // Quality costs from centralized config
    const quality1KCost = AI_PHOTOSHOP_PRICING.getAllModelsWithQuality('1K') // 24⭐
    const quality2KCost = AI_PHOTOSHOP_PRICING.getAllModelsWithQuality('2K') // 96⭐
    const quality4KCost = AI_PHOTOSHOP_PRICING.getAllModelsWithQuality('4K') // 144⭐

    await ctx.editMessageText(
      isRu
        ? `🎯 *Все модели сразу!*\n\n📊 *Выберите качество обработки для всех ${modelNames.length} моделей:*\n\n🔸 *Модели:*\n${modelNames.map((name, i) => `• ${name}`).join('\n')}\n\n💰 *Стоимость зависит от качества:*\n🔹 1K качество - база\n🔸 2K качество - ×4 от базы\n🔹 4K качество - ×6 от базы\n\n⚡ *Выберите качество ниже:*`
        : `🎯 *All models at once!*\n\n📊 *Choose quality for processing with all ${modelNames.length} models:*\n\n🔸 *Models:*\n${modelNames.map((name, i) => `• ${name}`).join('\n')}\n\n💰 *Cost depends on quality:*\n🔹 1K quality - base\n🔸 2K quality - ×4 from base\n🔹 4K quality - ×6 from base\n\n⚡ *Select quality below:*`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: isRu
                  ? `1K - ${quality1KCost}⭐`
                  : `1K - ${quality1KCost}⭐`,
                callback_data: 'ai_photoshop_all_models_size_1K',
              },
            ],
            [
              {
                text: isRu
                  ? `2K - ${quality2KCost}⭐`
                  : `2K - ${quality2KCost}⭐`,
                callback_data: 'ai_photoshop_all_models_size_2K',
              },
            ],
            [
              {
                text: isRu
                  ? `4K - ${quality4KCost}⭐`
                  : `4K - ${quality4KCost}⭐`,
                callback_data: 'ai_photoshop_all_models_size_4K',
              },
            ],
            [
              Markup.button.callback(
                isRu ? 'Назад к моделям' : 'Back to models',
                'ai_photoshop_back_to_models'
              ),
              Markup.button.callback(
                isRu ? 'Отмена' : 'Cancel',
                'ai_photoshop_cancel'
              ),
            ],
          ],
        },
      }
    )
  } catch (error) {
    logger.error('Error handling all models from selector', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Handle style selection
Object.keys(AI_PHOTOSHOP_STYLES).forEach(styleKey => {
  aiPhotoshopScene.action(`ai_photoshop_style_${styleKey}`, async ctx => {
    try {
      await ctx.answerCbQuery()
      const isRu = isRussianFromState(ctx)

      if (ctx.session) {
        ctx.session.aiPhotoshopStyle = styleKey as any
        ctx.session.aiPhotoshopStep = 'size_ratio_select'
        ctx.session.awaitingAiPhotoshopImage = false
        // Set defaults for size/ratio
        if (!ctx.session.aiPhotoshopSize) {
          ctx.session.aiPhotoshopSize = '2K'
        }
        if (!ctx.session.aiPhotoshopAspectRatio) {
          ctx.session.aiPhotoshopAspectRatio = '9:16'
        }
      }

      const style =
        AI_PHOTOSHOP_STYLES[styleKey as keyof typeof AI_PHOTOSHOP_STYLES]
      const styleTitle = isRu ? style.title_ru : style.title_en
      const model =
        AI_PHOTOSHOP_MODELS[
          ctx.session?.aiPhotoshopModel as keyof typeof AI_PHOTOSHOP_MODELS
        ]

      const currentRatio = ctx.session?.aiPhotoshopAspectRatio || '9:16'
      const currentSize = ctx.session?.aiPhotoshopSize || '2K'

      await ctx.editMessageText(
        isRu
          ? `✅ *Модель:* ${model?.title_ru || model?.title_en}\n🎨 *Стиль:* ${styleTitle}\n\n📐 *Выберите соотношение сторон и разрешение:*\n\n📱 Текущее: *${currentRatio}* | 📏 *${currentSize}*`
          : `✅ *Model:* ${model?.title_en}\n🎨 *Style:* ${styleTitle}\n\n📐 *Choose aspect ratio and resolution:*\n\n📱 Current: *${currentRatio}* | 📏 *${currentSize}*`,
        {
          parse_mode: 'Markdown',
          reply_markup: createSizeAndRatioKeyboard(
            isRu,
            currentRatio,
            currentSize
          ).reply_markup,
        }
      )
    } catch (error) {
      logger.error('Error handling style selection', {
        error: error instanceof Error ? error.message : 'Unknown error',
        telegramId: ctx.from?.id,
        style: styleKey,
      })
    }
  })
})

// Handle aspect ratio selection in size_ratio_select step
aiPhotoshopScene.action(
  /^ai_ps_ratio_(1:1|16:9|9:16|4:3|3:4|21:9|9:21)$/,
  async ctx => {
    try {
      await ctx.answerCbQuery()
      const isRu = isRussianFromState(ctx)
      const ratio = ctx.match[1] as
        | '1:1'
        | '16:9'
        | '9:16'
        | '4:3'
        | '3:4'
        | '21:9'
        | '9:21'

      if (ctx.session) {
        ctx.session.aiPhotoshopAspectRatio = ratio
      }

      const currentSize = ctx.session?.aiPhotoshopSize || '2K'
      const style =
        AI_PHOTOSHOP_STYLES[
          ctx.session?.aiPhotoshopStyle as keyof typeof AI_PHOTOSHOP_STYLES
        ]
      const styleTitle = isRu ? style?.title_ru : style?.title_en
      const model =
        AI_PHOTOSHOP_MODELS[
          ctx.session?.aiPhotoshopModel as keyof typeof AI_PHOTOSHOP_MODELS
        ]

      await ctx.editMessageText(
        isRu
          ? `✅ *Модель:* ${model?.title_ru || model?.title_en}\n🎨 *Стиль:* ${styleTitle}\n\n📐 *Выберите соотношение сторон и разрешение:*\n\n📱 Текущее: *${ratio}* | 📏 *${currentSize}*`
          : `✅ *Model:* ${model?.title_en}\n🎨 *Style:* ${styleTitle}\n\n📐 *Choose aspect ratio and resolution:*\n\n📱 Current: *${ratio}* | 📏 *${currentSize}*`,
        {
          parse_mode: 'Markdown',
          reply_markup: createSizeAndRatioKeyboard(isRu, ratio, currentSize)
            .reply_markup,
        }
      )
    } catch (error) {
      logger.error('Error handling ratio selection', {
        error: error instanceof Error ? error.message : 'Unknown error',
        telegramId: ctx.from?.id,
      })
    }
  }
)

// Handle resolution selection in size_ratio_select step
aiPhotoshopScene.action(/^ai_ps_res_(1K|2K|4K)$/, async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)
    const size = ctx.match[1] as '1K' | '2K' | '4K'

    if (ctx.session) {
      ctx.session.aiPhotoshopSize = size
    }

    const currentRatio = ctx.session?.aiPhotoshopAspectRatio || '9:16'
    const style =
      AI_PHOTOSHOP_STYLES[
        ctx.session?.aiPhotoshopStyle as keyof typeof AI_PHOTOSHOP_STYLES
      ]
    const styleTitle = isRu ? style?.title_ru : style?.title_en
    const model =
      AI_PHOTOSHOP_MODELS[
        ctx.session?.aiPhotoshopModel as keyof typeof AI_PHOTOSHOP_MODELS
      ]

    await ctx.editMessageText(
      isRu
        ? `✅ *Модель:* ${model?.title_ru || model?.title_en}\n🎨 *Стиль:* ${styleTitle}\n\n📐 *Выберите соотношение сторон и разрешение:*\n\n📱 Текущее: *${currentRatio}* | 📏 *${size}*`
        : `✅ *Model:* ${model?.title_en}\n🎨 *Style:* ${styleTitle}\n\n📐 *Choose aspect ratio and resolution:*\n\n📱 Current: *${currentRatio}* | 📏 *${size}*`,
      {
        parse_mode: 'Markdown',
        reply_markup: createSizeAndRatioKeyboard(isRu, currentRatio, size)
          .reply_markup,
      }
    )
  } catch (error) {
    logger.error('Error handling resolution selection', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Handle confirm button - proceed to image upload
aiPhotoshopScene.action('ai_ps_size_confirm', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    if (ctx.session) {
      ctx.session.aiPhotoshopStep = 'image_upload'
      ctx.session.awaitingAiPhotoshopImage = true
    }

    const model =
      AI_PHOTOSHOP_MODELS[
        ctx.session?.aiPhotoshopModel as keyof typeof AI_PHOTOSHOP_MODELS
      ]
    const style =
      AI_PHOTOSHOP_STYLES[
        ctx.session?.aiPhotoshopStyle as keyof typeof AI_PHOTOSHOP_STYLES
      ]
    const styleTitle = isRu ? style?.title_ru : style?.title_en
    const currentRatio = ctx.session?.aiPhotoshopAspectRatio || '9:16'
    const currentSize = ctx.session?.aiPhotoshopSize || '2K'

    await ctx.editMessageText(
      isRu
        ? `✅ *Модель:* ${model?.title_ru || model?.title_en}\n🎨 *Стиль:* ${styleTitle}\n📐 *Формат:* ${currentRatio} | 📏 *${currentSize}*\n\n📷 Отправьте изображение для обработки:`
        : `✅ *Model:* ${model?.title_en}\n🎨 *Style:* ${styleTitle}\n📐 *Format:* ${currentRatio} | 📏 *${currentSize}*\n\n📷 Send an image for processing:`,
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu ? '🔙 Назад' : '🔙 Back',
              'ai_photoshop_back_to_size_ratio'
            ),
            Markup.button.callback(
              isRu ? '❌ Отмена' : '❌ Cancel',
              'ai_photoshop_cancel'
            ),
          ],
        ]).reply_markup,
      }
    )
  } catch (error) {
    logger.error('Error handling size confirm', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Handle back to size/ratio selection from image upload
aiPhotoshopScene.action('ai_photoshop_back_to_size_ratio', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    if (ctx.session) {
      ctx.session.aiPhotoshopStep = 'size_ratio_select'
      ctx.session.awaitingAiPhotoshopImage = false
    }

    const currentRatio = ctx.session?.aiPhotoshopAspectRatio || '9:16'
    const currentSize = ctx.session?.aiPhotoshopSize || '2K'
    const model =
      AI_PHOTOSHOP_MODELS[
        ctx.session?.aiPhotoshopModel as keyof typeof AI_PHOTOSHOP_MODELS
      ]
    const style =
      AI_PHOTOSHOP_STYLES[
        ctx.session?.aiPhotoshopStyle as keyof typeof AI_PHOTOSHOP_STYLES
      ]
    const styleTitle = isRu ? style?.title_ru : style?.title_en

    await ctx.editMessageText(
      isRu
        ? `✅ *Модель:* ${model?.title_ru || model?.title_en}\n🎨 *Стиль:* ${styleTitle}\n\n📐 *Выберите соотношение сторон и разрешение:*\n\n📱 Текущее: *${currentRatio}* | 📏 *${currentSize}*`
        : `✅ *Model:* ${model?.title_en}\n🎨 *Style:* ${styleTitle}\n\n📐 *Choose aspect ratio and resolution:*\n\n📱 Current: *${currentRatio}* | 📏 *${currentSize}*`,
      {
        parse_mode: 'Markdown',
        reply_markup: createSizeAndRatioKeyboard(
          isRu,
          currentRatio,
          currentSize
        ).reply_markup,
      }
    )
  } catch (error) {
    logger.error('Error handling back to size/ratio', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Handle custom prompt selection
aiPhotoshopScene.action('ai_photoshop_custom_prompt', async ctx => {
  try {
    logger.info('🚨 AI Photoshop: Custom prompt button clicked!', {
      telegramId: ctx.from?.id,
      callbackData: (ctx.callbackQuery as any)?.data,
    })

    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    if (ctx.session) {
      ctx.session.aiPhotoshopStyle = 'custom'
      ctx.session.aiPhotoshopStep = 'custom_prompt' // ✅ Request PROMPT first
      ctx.session.awaitingAiPhotoshopPrompt = true // ✅ Await prompt first
      ctx.session.awaitingAiPhotoshopImage = false // ✅ Not awaiting image yet
    }

    logger.info(
      '🎨 AI Photoshop: Custom prompt selected, requesting prompt first',
      {
        telegramId: ctx.from?.id,
        newState: {
          aiPhotoshopStyle: 'custom',
          aiPhotoshopStep: 'custom_prompt',
          awaitingAiPhotoshopPrompt: true,
          awaitingAiPhotoshopImage: false,
        },
      }
    )

    const model =
      AI_PHOTOSHOP_MODELS[
        ctx.session?.aiPhotoshopModel as keyof typeof AI_PHOTOSHOP_MODELS
      ]

    await ctx.editMessageText(
      isRu
        ? `✅ *Модель:* ${isRu ? model?.title_ru : model?.title_en}\n✍️ *Стиль:* Пользовательский промпт\n\n📝 *Введите промпт для обработки изображения:*\n\n💡 *После ввода промпта отправьте фото для обработки*`
        : `✅ *Model:* ${isRu ? model?.title_ru : model?.title_en}\n✍️ *Style:* Custom prompt\n\n📝 *Enter a prompt for image processing:*\n\n💡 *After entering the prompt, send a photo for processing*`,
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu ? 'Назад' : 'Back',
              'ai_photoshop_back_to_styles'
            ),
            Markup.button.callback(
              isRu ? 'Отмена' : 'Cancel',
              'ai_photoshop_cancel'
            ),
          ],
        ]).reply_markup,
      }
    )
  } catch (error) {
    logger.error('Error handling custom prompt selection', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Handle size selection for SeeDream-4
aiPhotoshopScene.action(/^ai_photoshop_size_(1K|2K|4K)$/, async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    const sizeMatch = ctx.match[1] as '1K' | '2K' | '4K'

    if (ctx.session) {
      ctx.session.aiPhotoshopSize = sizeMatch
      // ✅ CRITICAL FIX: Preserve previously selected model and style
      if (!ctx.session.aiPhotoshopModel) {
        ctx.session.aiPhotoshopModel = 'seedream' // Default model if not set
      }

      // ✅ If photos already uploaded, go straight to confirmation. Otherwise, await photo.
      const hasPhotos =
        ctx.session.morphingImages && ctx.session.morphingImages.length > 0

      if (hasPhotos) {
        ctx.session.aiPhotoshopStep = 'processing'
        ctx.session.awaitingAiPhotoshopImage = false
        ctx.session.awaitingAiPhotoshopPrompt = false
      } else {
        ctx.session.aiPhotoshopStep = 'image_upload'
        ctx.session.awaitingAiPhotoshopImage = true
      }
    }

    // ✅ Price calculation using centralized pricing
    const sizePrices = {
      '1K': AI_PHOTOSHOP_PRICING.getSingleModelCost('1K'), // ✅ Единый источник
      '2K': AI_PHOTOSHOP_PRICING.getSingleModelCost('2K'), // ✅ Единый источник
      '4K': AI_PHOTOSHOP_PRICING.getSingleModelCost('4K'), // ✅ Единый источник
    }

    const sizeDimensions = {
      '1K': '1K',
      '2K': '2K',
      '4K': '4K',
    }

    // ✅ If photos already uploaded, show summary and "Process" button
    const hasPhotos =
      ctx.session.morphingImages && ctx.session.morphingImages.length > 0

    if (hasPhotos) {
      const imageCount = ctx.session.morphingImages!.length
      const costPerImage = sizePrices[sizeMatch]
      const totalCost = costPerImage * imageCount

      // Get variations count for cost calculation
      const variationsCount = ctx.session.aiPhotoshopVariationsCount || 1
      const finalCost = totalCost * variationsCount

      // Get model and style info
      const currentModel = ctx.session.aiPhotoshopModel || 'seedream'
      const currentStyle = ctx.session.aiPhotoshopStyle || 'artistic'
      const currentPrompt = ctx.session.aiPhotoshopPrompt

      let modelTitle: string
      const modelInfo =
        AI_PHOTOSHOP_MODELS[currentModel as keyof typeof AI_PHOTOSHOP_MODELS]
      modelTitle = isRu ? modelInfo?.title_ru : modelInfo?.title_en

      let styleDisplay = ''
      if (currentStyle === 'custom' && currentPrompt) {
        styleDisplay = isRu
          ? `✍️ Пользовательский: "${currentPrompt.substring(0, 50)}${currentPrompt.length > 50 ? '...' : ''}"`
          : `✍️ Custom: "${currentPrompt.substring(0, 50)}${currentPrompt.length > 50 ? '...' : ''}"`
      } else if (currentStyle && currentStyle !== 'custom') {
        const styleInfo =
          AI_PHOTOSHOP_STYLES[currentStyle as keyof typeof AI_PHOTOSHOP_STYLES]
        styleDisplay = isRu
          ? styleInfo?.title_ru || 'Художественный'
          : styleInfo?.title_en || 'Artistic'
      }

      await ctx.editMessageText(
        isRu
          ? `✅ Качество изменено: ${sizeMatch}\n\n✨ Готово к обработке ${imageCount} изображений!\n\n🎭 Модель: ${modelTitle}\n🎨 Стиль: ${styleDisplay}\n📏 Размер: ${sizeMatch}\n🔢 Вариаций: ${variationsCount}\n💎 Стоимость: ${finalCost} ⭐ (${costPerImage}⭐ за фото)`
          : `✅ Quality changed: ${sizeMatch}\n\n✨ Ready to process ${imageCount} images!\n\n🎭 Model: ${modelTitle}\n🎨 Style: ${styleDisplay}\n📏 Size: ${sizeMatch}\n🔢 Variations: ${variationsCount}\n💎 Cost: ${finalCost} ⭐ (${costPerImage}⭐ per photo)`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: isRu ? '🚀 Начать обработку' : '🚀 Start Processing',
                  callback_data: 'ai_photoshop_multi_confirm',
                },
              ],
              [
                {
                  text: isRu ? '📏 Изменить качество' : '📏 Change Quality',
                  callback_data: 'ai_photoshop_change_size',
                },
              ],
              [
                {
                  text: isRu ? '⚙️ Выбрать модель' : '⚙️ Choose Model',
                  callback_data: 'ai_photoshop_multi_choose_model',
                },
              ],
              [
                {
                  text: isRu
                    ? `🔢 Вариации (${variationsCount})`
                    : `🔢 Variations (${variationsCount})`,
                  callback_data: 'ai_photoshop_variations_menu',
                },
              ],
              [
                {
                  text: isRu ? 'Отмена' : 'Cancel',
                  callback_data: 'ai_photoshop_multi_cancel',
                },
              ],
            ],
          },
        }
      )
    } else {
      // No photos yet, request upload
      await ctx.editMessageText(
        isRu
          ? `✅ Размер выбран: ${sizeMatch} (${sizeDimensions[sizeMatch]})\n💰 Стоимость: ${sizePrices[sizeMatch]}⭐\n\n📷 Теперь загрузите фото или альбом изображений:`
          : `✅ Size selected: ${sizeMatch} (${sizeDimensions[sizeMatch]})\n💰 Cost: ${sizePrices[sizeMatch]}⭐\n\n📷 Now upload a photo or album of images:`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: isRu ? '🔄 Изменить размер' : '🔄 Change Size',
                  callback_data: 'ai_photoshop_change_size',
                },
              ],
              [
                {
                  text: isRu ? '🚪 Назад в меню' : '🚪 Back to Menu',
                  callback_data: 'back_to_menu',
                },
              ],
            ],
          },
        }
      )
    }
  } catch (error) {
    logger.error('Error handling AI Photoshop size selection', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
      size: ctx.match?.[1],
    })
  }
})

// Handle change size action
aiPhotoshopScene.action('ai_photoshop_change_size', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    await ctx.editMessageText(
      isRu ? `📏 Выберите размер изображения:` : `📏 Choose image size:`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '2K - 20⭐',
                callback_data: 'ai_photoshop_size_2K',
              },
            ],
            [
              {
                text: '4K - 30⭐',
                callback_data: 'ai_photoshop_size_4K',
              },
            ],
            [
              {
                text: isRu ? '🚪 Назад в меню' : '🚪 Back to Menu',
                callback_data: 'back_to_menu',
              },
            ],
          ],
        },
      }
    )
  } catch (error) {
    logger.error('Error handling change size action', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// ✅ NEW: Handle size selection for "All Models" mode
aiPhotoshopScene.action(
  /^ai_photoshop_all_models_size_(1K|2K|4K)$/,
  async ctx => {
    try {
      await ctx.answerCbQuery()
      const isRu = isRussianFromState(ctx)

      const sizeMatch = ctx.match[1] as '1K' | '2K' | '4K'

      if (ctx.session) {
        ctx.session.aiPhotoshopSize = sizeMatch
        ctx.session.aiPhotoshopModel = 'all_models' as any // Ensure model is set to all_models

        // ✅ If photos already uploaded, go straight to confirmation. Otherwise, await photo.
        const hasPhotos =
          ctx.session.morphingImages && ctx.session.morphingImages.length > 0

        if (hasPhotos) {
          ctx.session.aiPhotoshopStep = 'processing'
          ctx.session.awaitingAiPhotoshopImage = false
          ctx.session.awaitingAiPhotoshopPrompt = false
        } else {
          ctx.session.aiPhotoshopStep = 'image_upload'
          ctx.session.awaitingAiPhotoshopPrompt = false
          ctx.session.awaitingAiPhotoshopImage = true
        }

        logger.info('🎯 AI Photoshop: ALL_MODELS size selected', {
          telegramId: ctx.from?.id,
          selectedSize: sizeMatch,
          aiPhotoshopModel: ctx.session.aiPhotoshopModel,
          hasPhotos,
          awaitingAiPhotoshopImage: ctx.session.awaitingAiPhotoshopImage,
        })
      }

      // ✅ Calculate costs using centralized pricing
      const modelNames = Object.values(AI_PHOTOSHOP_MODELS).map(model =>
        isRu ? model.title_ru : model.title_en
      )
      const totalModelsCount = Object.keys(AI_PHOTOSHOP_MODELS).length

      let totalCost: number
      let qualityDesc: string

      switch (sizeMatch) {
        case '1K':
          totalCost = AI_PHOTOSHOP_PRICING.getAllModelsWithQuality('1K') // ✅ Единый источник
          qualityDesc = isRu ? '1K качество (базовое)' : '1K quality (base)'
          break
        case '2K':
          totalCost = AI_PHOTOSHOP_PRICING.getAllModelsWithQuality('2K') // ✅ Единый источник
          qualityDesc = isRu ? '2K качество (×4)' : '2K quality (×4)'
          break
        case '4K':
          totalCost = AI_PHOTOSHOP_PRICING.getAllModelsWithQuality('4K') // ✅ Единый источник
          qualityDesc = isRu ? '4K качество (×6)' : '4K quality (×6)'
          break
        default:
          totalCost = AI_PHOTOSHOP_PRICING.getAllModelsWithQuality('1K') // ✅ Единый источник
          qualityDesc = isRu ? '1K качество (базовое)' : '1K quality (base)'
      }

      // ✅ If photos already uploaded, show summary and "Process" button
      const hasPhotos =
        ctx.session.morphingImages && ctx.session.morphingImages.length > 0

      if (hasPhotos) {
        const imageCount = ctx.session.morphingImages!.length
        const costPerImage = Math.round(totalCost / imageCount)

        await ctx.editMessageText(
          isRu
            ? `✨ Готово к обработке ${imageCount} изображений!\n\n🎯 Модель: 🎯 Все модели сразу\n📏 Размер: ${qualityDesc}\n💎 Стоимость: ${totalCost} ⭐ (${costPerImage}⭐ за фото)`
            : `✨ Ready to process ${imageCount} images!\n\n🎯 Model: 🎯 All Models\n📏 Size: ${qualityDesc}\n💎 Cost: ${totalCost} ⭐ (${costPerImage}⭐ per photo)`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: isRu ? '🚀 Начать обработку' : '🚀 Start Processing',
                    callback_data: 'ai_photoshop_multi_confirm',
                  },
                ],
                [
                  Markup.button.callback(
                    isRu ? '📏 Изменить качество' : '📏 Change quality',
                    'ai_photoshop_all_models_from_selector'
                  ),
                ],
                [
                  Markup.button.callback(
                    isRu ? 'Назад к моделям' : 'Back to models',
                    'ai_photoshop_back_to_models'
                  ),
                  Markup.button.callback(
                    isRu ? 'Отмена' : 'Cancel',
                    'ai_photoshop_cancel'
                  ),
                ],
              ],
            },
          }
        )
      } else {
        // No photos yet - request photo upload
        await ctx.editMessageText(
          isRu
            ? `🎯 *Все модели сразу!*\n\n📊 *Выбрано: ${qualityDesc}*\n\n🔸 *Модели для обработки:*\n${modelNames.map((name, i) => `• ${name}`).join('\n')}\n\n💎 *Общая стоимость: ${totalCost}⭐*\n\n📸 *Отправьте изображение для обработки:*\n\n💡 _После отправки фото вы введёте промпт для всех ${totalModelsCount} моделей_`
            : `🎯 *All models at once!*\n\n📊 *Selected: ${qualityDesc}*\n\n🔸 *Models to process:*\n${modelNames.map((name, i) => `• ${name}`).join('\n')}\n\n💎 *Total cost: ${totalCost}⭐*\n\n📸 *Send an image for processing:*\n\n💡 _After sending the photo, you'll enter the prompt for all ${totalModelsCount} models_`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  Markup.button.callback(
                    isRu ? 'Изменить качество' : 'Change quality',
                    'ai_photoshop_all_models_from_selector'
                  ),
                ],
                [
                  Markup.button.callback(
                    isRu ? 'Назад к моделям' : 'Back to models',
                    'ai_photoshop_back_to_models'
                  ),
                  Markup.button.callback(
                    isRu ? 'Отмена' : 'Cancel',
                    'ai_photoshop_cancel'
                  ),
                ],
              ],
            },
          }
        )
      }
    } catch (error) {
      logger.error('Error handling all models size selection', {
        error: error instanceof Error ? error.message : 'Unknown error',
        telegramId: ctx.from?.id,
      })
    }
  }
)

// Handle photo upload with multi-photo support
aiPhotoshopScene.on('photo', async ctx => {
  try {
    const isRu = isRussianFromState(ctx)

    // ✅ CHECK FOR MULTI-PHOTO EVENTS FIRST
    const hasMultiPhotoEvent = await checkMultiPhotoEvents(ctx)
    if (hasMultiPhotoEvent) {
      logger.info('✅ AI Photoshop: Multi-photo event detected and handled')
      return
    }

    // ✅ DETECT MULTI-PHOTO UPLOAD FOR AI PHOTOSHOP
    const isMultiPhoto = await detectMultiPhotoAiPhotoshop(ctx)
    if (isMultiPhoto) {
      logger.info('🎨 AI Photoshop: Multi-photo upload detected', {
        telegramId: ctx.from?.id,
        mediaGroupId: ctx.message?.media_group_id,
      })
      return // Will be handled by multi-photo system
    }

    logger.info('🎨 AI Photoshop: Single photo received', {
      telegramId: ctx.from?.id,
      awaitingImage: ctx.session?.awaitingAiPhotoshopImage,
      step: ctx.session?.aiPhotoshopStep,
      model: ctx.session?.aiPhotoshopModel,
    })

    // Show loading indicator like Infinity Morphing
    const loadingMsg = await ctx.reply(
      isRu ? '📸 Загружаю изображение...' : '📸 Uploading image...',
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: isRu ? '⏳ Загрузка...' : '⏳ Loading...',
                callback_data: 'loading_indicator',
              },
            ],
          ],
        },
      }
    )

    // Если пользователь отправил фото без выбора модели - используем SeeDream-4 по умолчанию
    if (
      !ctx.session?.awaitingAiPhotoshopImage &&
      !ctx.session?.aiPhotoshopModel
    ) {
      logger.info(
        '🎨 AI Photoshop: Photo sent without model selection, using SeeDream-4 default',
        {
          telegramId: ctx.from?.id,
        }
      )

      // Устанавливаем значения по умолчанию
      if (ctx.session) {
        ctx.session.aiPhotoshopModel = 'seedream'
        ctx.session.aiPhotoshopStyle = 'artistic'
        ctx.session.awaitingAiPhotoshopImage = true
        ctx.session.aiPhotoshopStep = 'processing'
      }

      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
        isRu
          ? '✨ Отлично! Обрабатываю ваше фото с помощью SeeDream-4 в художественном стиле...'
          : '✨ Great! Processing your photo with SeeDream-4 in artistic style...'
      )
    } else if (
      !ctx.session?.awaitingAiPhotoshopImage &&
      !ctx.session?.awaitingAiPhotoshopPrompt
    ) {
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
        isRu
          ? '❌ Сначала выберите модель и стиль обработки.'
          : '❌ Please select a model and processing style first.'
      )
      return
    }

    const photo = ctx.message.photo?.pop()
    if (!photo) {
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
        isRu ? '❌ Не удалось получить изображение.' : '❌ Failed to get image.'
      )
      return
    }

    const fileLink = await ctx.telegram.getFileLink(photo.file_id)

    // Save the photo and handle different states
    if (ctx.session) {
      ctx.session.aiPhotoshopImage = fileLink.href
      ctx.session.awaitingAiPhotoshopImage = false
    }

    // ✅ NEW: If style is custom OR model is all_models, we need to wait for the prompt
    if (
      ctx.session?.aiPhotoshopStyle === 'custom' ||
      ctx.session?.aiPhotoshopModel === 'all_models'
    ) {
      if (ctx.session) {
        ctx.session.aiPhotoshopStep = 'custom_prompt'
        ctx.session.awaitingAiPhotoshopPrompt = true
      }

      // ✅ Different messages for all_models vs custom
      const promptMessage =
        ctx.session?.aiPhotoshopModel === 'all_models'
          ? isRu
            ? `✅ Изображение загружено!\n\n📝 Теперь опишите, как его обработать:\n\n🎯 *Этот промпт будет использован для всех ${Object.keys(AI_PHOTOSHOP_MODELS).length} моделей*\n\n💡 *Для лучших результатов пишите на английском языке*`
            : `✅ Image uploaded!\n\n📝 Now describe how to process it:\n\n🎯 *This prompt will be used for all ${Object.keys(AI_PHOTOSHOP_MODELS).length} models*\n\n💡 *For best results, write in English*`
          : isRu
            ? '✅ Изображение загружено!\n\n📝 Теперь опишите, как его обработать:\n\n💡 *Для лучших результатов пишите на английском языке*'
            : '✅ Image uploaded!\n\n📝 Now describe how to process it:\n\n💡 *For best results, write in English*'

      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
        promptMessage,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: isRu ? 'Отмена' : 'Cancel',
                  callback_data: 'ai_photoshop_cancel',
                },
              ],
            ],
          },
        }
      )
    } else {
      // Update loading message to processing status
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
        isRu
          ? '✅ Изображение загружено! Начинаю обработку...'
          : '✅ Image uploaded! Starting processing...'
      )

      // Process with predefined style
      await processAiPhotoshopRequest(ctx)

      // Remove loading message after processing starts
      try {
        if (ctx.chat) {
          await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id)
        }
      } catch (error) {
        // Ignore deletion errors
      }
    }
  } catch (error) {
    logger.error('Error handling AI Photoshop image', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Handle text messages (custom prompts)
aiPhotoshopScene.on('text', async ctx => {
  try {
    // 🔥 ULTRA DEBUG: Always log text handler entry
    console.log('🚨🚨🚨 TEXT HANDLER TRIGGERED!', {
      telegramId: ctx.from?.id,
      text: ctx.message.text.substring(0, 30),
      timestamp: new Date().toISOString(),
    })

    const messageText = ctx.message.text
    const isRu = isRussianFromState(ctx)

    // Skip commands
    if (messageText.startsWith('/')) {
      return
    }

    // Handle menu button click
    if (messageText === '🎨 ИИ Фотошоп' || messageText === '🎨 AI Photoshop') {
      await ctx.scene.reenter()
      return
    }

    // Debug logging for session state
    logger.info('🚨 AI Photoshop: Text message received', {
      telegramId: ctx.from?.id,
      text: messageText.substring(0, 20) + '...',
      sessionState: {
        awaitingAiPhotoshopPrompt: ctx.session?.awaitingAiPhotoshopPrompt,
        aiPhotoshopStep: ctx.session?.aiPhotoshopStep,
        hasImage: !!ctx.session?.aiPhotoshopImage,
        aiPhotoshopStyle: ctx.session?.aiPhotoshopStyle,
        aiPhotoshopModel: ctx.session?.aiPhotoshopModel,
      },
    })

    // ✅ ENHANCED: Support dialog mode for improving last photo
    const isInDialogMode =
      ctx.session?.dialogMode &&
      ctx.session?.savedAiPhotoshopResults?.length > 0

    // ✅ NEW: Zod validation for dialog mode input
    if (isInDialogMode && !ctx.session?.aiPhotoshopStep) {
      try {
        const inputValidation = validateUserInput({
          inputId:
            Date.now().toString() +
            '-' +
            Math.random().toString(36).substr(2, 9),
          type: 'text',
          timestamp: new Date().toISOString(),
          userId: ctx.from?.id?.toString() || '0',
          content: {
            text: messageText,
          },
          sessionId: ctx.session?.sessionId || Date.now().toString(),
          messageId: ctx.message.message_id,
          chatId: ctx.chat?.id || 0,
          isValid: true,
          validationErrors: [],
        })

        if (!inputValidation.success) {
          logger.warn('🚨 AI Photoshop: Dialog input validation failed', {
            telegramId: ctx.from?.id,
            error: inputValidation.error,
            text: messageText.substring(0, 50),
          })

          await ctx.reply(
            isRu
              ? '❌ Некорректный формат команды. Попробуйте написать простую команду типа "сделать ярче" или "добавить снег".'
              : '❌ Invalid command format. Try writing a simple command like "make brighter" or "add snow".'
          )
          return
        }

        logger.info('✅ AI Photoshop: Dialog input validation passed', {
          telegramId: ctx.from?.id,
          inputId: inputValidation.data.inputId,
          textLength: messageText.length,
        })
      } catch (error) {
        logger.error('🚨 AI Photoshop: Dialog validation error', {
          telegramId: ctx.from?.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        // Continue with processing even if validation fails
      }
    }

    // ✅ SMART VALIDATION: Allow custom prompt workflow, text with existing images, and dialog mode
    const allowTextInput =
      ctx.session?.awaitingAiPhotoshopPrompt ||
      ctx.session?.aiPhotoshopImage ||
      ctx.session?.morphingImages?.length ||
      isInDialogMode

    if (!allowTextInput) {
      logger.info('💡 AI Photoshop: Text input not ready - guiding user', {
        telegramId: ctx.from?.id,
        awaitingPrompt: ctx.session?.awaitingAiPhotoshopPrompt,
        hasImage: !!ctx.session?.aiPhotoshopImage,
        hasMorphingImages: !!ctx.session?.morphingImages?.length,
        isInDialogMode,
        step: ctx.session?.aiPhotoshopStep,
      })

      await ctx.reply(
        isRu
          ? '💡 Для ИИ Фотошопа сначала выберите модель и стиль:\n\n🎨 Используйте /aiphotoshop или кнопку "🎨 ИИ Фотошоп" в меню'
          : '💡 For AI Photoshop, first select a model and style:\n\n🎨 Use /aiphotoshop or the "🎨 AI Photoshop" button in the menu'
      )
      return
    }

    // Handle custom prompt input (no image required yet)
    if (ctx.session?.aiPhotoshopStep === 'custom_prompt') {
      logger.info('🎯 AI Photoshop: Processing custom prompt input', {
        telegramId: ctx.from?.id,
        promptLength: ctx.message.text?.length,
      })

      const prompt = ctx.message.text

      if (!prompt || prompt.trim().length === 0) {
        await ctx.reply(
          isRu
            ? '❌ Пустой промпт. Попробуйте еще раз.'
            : '❌ Empty prompt. Please try again.'
        )
        return
      }

      if (ctx.session) {
        ctx.session.aiPhotoshopPrompt = prompt
        ctx.session.awaitingAiPhotoshopPrompt = false
        ctx.session.aiPhotoshopStep = 'processing'

        logger.info('✅ AI Photoshop: Custom prompt saved successfully', {
          telegramId: ctx.from?.id,
          promptLength: prompt.length,
          promptPreview: prompt.substring(0, 100) + '...',
          step: ctx.session.aiPhotoshopStep,
          hasImage: !!ctx.session.aiPhotoshopImage,
          model: ctx.session.aiPhotoshopModel,
        })
      }

      // ✅ HANDLE ALL_MODELS MODE - check morphingImages instead of single image
      if (ctx.session?.aiPhotoshopModel === 'all_models') {
        if (
          !ctx.session?.morphingImages ||
          ctx.session.morphingImages.length === 0
        ) {
          await ctx.reply(
            isRu
              ? '❌ Фото не найдено. Отправьте фото сначала.'
              : '❌ Photo not found. Send a photo first.'
          )
          return
        }

        // ✅ Set first image as aiPhotoshopImage for all_models processing
        if (ctx.session.morphingImages[0]?.url) {
          ctx.session.aiPhotoshopImage = ctx.session.morphingImages[0].url
        }

        await ctx.reply(
          isRu
            ? `✅ Промпт получен: "${prompt}"\n\n⏳ Начинаю обработку всеми ${Object.keys(AI_PHOTOSHOP_MODELS).length} моделями для ${ctx.session.morphingImages.length} изображений...`
            : `✅ Prompt received: "${prompt}"\n\n⏳ Starting processing with all ${Object.keys(AI_PHOTOSHOP_MODELS).length} models for ${ctx.session.morphingImages.length} images...`
        )

        // ✅ Process with all models - processAiPhotoshopRequest handles all_models internally
        await processAiPhotoshopRequest(ctx, prompt)
        return
      }

      // ✅ REGULAR MODE: If no image yet, save prompt and request image
      if (!ctx.session?.aiPhotoshopImage) {
        await ctx.reply(
          isRu
            ? `✅ Промпт сохранен: "${prompt}"\n\n📸 Теперь отправьте изображение для обработки`
            : `✅ Prompt saved: "${prompt}"\n\n📸 Now send an image for processing`
        )

        // Update session to await image
        if (ctx.session) {
          ctx.session.aiPhotoshopStep = 'image_upload'
          ctx.session.awaitingAiPhotoshopImage = true
          ctx.session.awaitingAiPhotoshopPrompt = false
        }
        return
      }

      // ✅ REGULAR MODE: Both prompt and image ready - start processing
      await ctx.reply(
        isRu
          ? `✅ Промпт получен: "${prompt}"\n\n⏳ Начинаю обработку...`
          : `✅ Prompt received: "${prompt}"\n\n⏳ Starting processing...`
      )

      // ✅ Process the request
      await processAiPhotoshopRequest(ctx)
      return
    }

    // ✅ NEW: Handle dialog mode - improve last photo with text prompt
    if (isInDialogMode && !ctx.session?.aiPhotoshopStep) {
      logger.info('🎨 AI Photoshop: Dialog mode - improving last photo', {
        telegramId: ctx.from?.id,
        savedResultsCount: ctx.session?.savedAiPhotoshopResults?.length,
        promptText: messageText.substring(0, 50) + '...',
      })

      const lastResult =
        ctx.session.savedAiPhotoshopResults?.[
          ctx.session.savedAiPhotoshopResults.length - 1
        ]

      if (!lastResult) {
        await ctx.reply(
          isRu
            ? '❌ Не найдены предыдущие результаты для улучшения.\n\n🎨 Начните заново с /aiphotoshop'
            : '❌ No previous results found for improvement.\n\n🎨 Start over with /aiphotoshop'
        )
        return
      }

      // ✅ NEW: Check for Upscaler keywords
      const upscalerKeywords = {
        ru: [
          'upscale',
          'апскейл',
          'увеличить качество',
          'улучшить качество',
          'повысить разрешение',
          'увеличить разрешение',
          'сделать четче',
          'четкость',
          'разрешение',
        ],
        en: [
          'upscale',
          'enhance quality',
          'improve quality',
          'increase resolution',
          'enhance resolution',
          'make sharper',
          'sharpen',
          'clarity',
          'resolution',
        ],
      }

      const keywords = isRu ? upscalerKeywords.ru : upscalerKeywords.en
      const isUpscaleRequest = keywords.some(keyword =>
        messageText.toLowerCase().includes(keyword.toLowerCase())
      )

      if (isUpscaleRequest) {
        logger.info(
          '🔍 AI Photoshop: Upscaler request detected in dialog mode',
          {
            telegramId: ctx.from?.id,
            messageText: messageText.substring(0, 100),
            lastResultUrl: lastResult.url || lastResult.imageUrl,
          }
        )

        // In-flight guard (same class as the upscale button below): this text
        // branch charges via upscaleImage directly, bypassing the
        // aiPhotoshopInProgress choke point. A fast double-send of an upscale
        // keyword would otherwise double-charge. Check-then-set is atomic; the
        // "Upscaling..." reply lives inside the try; released in finally.
        if (ctx.session.aiPhotoshopUpscaleInProgress) {
          await ctx.reply(
            isRu
              ? '⏳ Уже увеличиваю качество, подождите...'
              : '⏳ Already upscaling, please wait...'
          )
          return
        }
        ctx.session.aiPhotoshopUpscaleInProgress = true

        try {
          await ctx.reply(
            isRu
              ? `⬆️ *Увеличиваю качество последнего фото!*\n\n🎯 Применяю Clarity Upscaler для улучшения разрешения...\n\n💎 Стоимость: 3 ⭐`
              : `⬆️ *Upscaling last photo quality!*\n\n🎯 Applying Clarity Upscaler to enhance resolution...\n\n💎 Cost: 3 ⭐`,
            {
              parse_mode: 'Markdown',
            }
          )

          const imageUrl =
            typeof lastResult.imageUrl === 'string'
              ? lastResult.imageUrl
              : lastResult.url

          await upscaleImage({
            imageUrl,
            telegram_id: String(ctx.from?.id),
            username: ctx.from?.username || 'unknown_user',
            is_ru: isRu,
            ctx,
            originalPrompt: lastResult.prompt || 'Dialog mode upscale',
          })

          // Show dialog interface again after upscaling
          await showDialogInterface(ctx)
          return
        } catch (error) {
          logger.error('🚨 AI Photoshop: Upscaler failed in dialog mode', {
            telegramId: ctx.from?.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          })

          await ctx.reply(
            isRu
              ? '❌ Произошла ошибка при увеличении качества. Попробуйте другую команду для улучшения фото.'
              : '❌ Error occurred during upscaling. Try another command to improve the photo.'
          )
          return
        } finally {
          ctx.session.aiPhotoshopUpscaleInProgress = false
        }
      }

      // Set up session for processing with last result as image input
      if (ctx.session) {
        // ✅ FIX: Ensure imageUrl is a string URL, not an object
        const imageUrl =
          typeof lastResult.imageUrl === 'string'
            ? lastResult.imageUrl
            : lastResult.url
        ctx.session.aiPhotoshopImage = imageUrl
        ctx.session.aiPhotoshopPrompt = messageText
        ctx.session.aiPhotoshopModel =
          lastResult.model as keyof typeof AI_PHOTOSHOP_MODELS
        ctx.session.aiPhotoshopStep = 'processing'

        // Use the same size as the previous result if it was SeeDream-4
        if (
          lastResult.model === 'seedream' &&
          lastResult.additionalInfo?.size
        ) {
          ctx.session.aiPhotoshopSize = lastResult.additionalInfo.size
        }
      }

      // The status reply interpolates raw user text ("${messageText}") under
      // parse_mode:'Markdown'; an unbalanced reserved char (_ * backtick [) makes
      // Telegram 400 and reject the promise. A thrown reply here would skip
      // processAiPhotoshopRequest below AND leave aiPhotoshopStep stuck at
      // 'processing' -- a sticky dialog lockout the user cannot escape. Fall back
      // to plain text and never let a cosmetic status failure abort the edit.
      try {
        await ctx.reply(
          isRu
            ? `✨ *Диалоговый режим активен!*\n\n🎯 Применяю улучшения к последнему фото:\n"${messageText}"\n\n🔄 Обрабатываю с помощью модели ${AI_PHOTOSHOP_MODELS[lastResult.model as keyof typeof AI_PHOTOSHOP_MODELS]?.title_ru}...\n\n💡 *Совет:* После обработки вы сможете снова написать команду для дальнейших улучшений!`
            : `✨ *Dialog mode is active!*\n\n🎯 Applying improvements to last photo:\n"${messageText}"\n\n🔄 Processing with ${AI_PHOTOSHOP_MODELS[lastResult.model as keyof typeof AI_PHOTOSHOP_MODELS]?.title_en} model...\n\n💡 *Tip:* After processing, you can write another command for further improvements!`,
          {
            parse_mode: 'Markdown',
          }
        )
      } catch {
        await ctx
          .reply(
            isRu
              ? '✨ Диалоговый режим активен! Обрабатываю ваш запрос к последнему фото...'
              : '✨ Dialog mode active! Processing your request on the last photo...'
          )
          .catch(() => {})
      }

      await processAiPhotoshopRequest(ctx, messageText)
      return
    }

    // For other steps, require image to be present
    if (
      !ctx.session?.aiPhotoshopImage &&
      !ctx.session?.morphingImages?.length
    ) {
      logger.error('🚨 AI Photoshop: REJECTED - no image', {
        telegramId: ctx.from?.id,
        hasImage: !!ctx.session?.aiPhotoshopImage,
        hasMorphingImages: !!ctx.session?.morphingImages?.length,
      })
      await ctx.reply(
        isRu
          ? '❌ Сначала загрузите изображение для обработки.'
          : '❌ Please upload an image for processing first.'
      )
      return
    }

    logger.info(
      '🚨 AI Photoshop: Text validation PASSED - processing with existing image',
      {
        telegramId: ctx.from?.id,
        validationStatus: 'ALL_CHECKS_PASSED',
      }
    )

    const prompt = ctx.message.text

    if (!prompt) {
      await ctx.reply(isRu ? '❌ Пустой промпт.' : '❌ Empty prompt.')
      return
    }

    // 🚨 CRITICAL DEBUG: Log session state
    console.log('🔍🔍🔍 AI Photoshop: Text handler session state DEBUG', {
      telegramId: ctx.from?.id,
      promptReceived: prompt.substring(0, 30) + '...',
      sessionExists: !!ctx.session,
      aiPhotoshopModel: ctx.session?.aiPhotoshopModel,
      awaitingAiPhotoshopPrompt: ctx.session?.awaitingAiPhotoshopPrompt,
      morphingImagesCount: ctx.session?.morphingImages?.length || 0,
      hasAnyAiPhotoshopData: !!(
        ctx.session?.aiPhotoshopModel || ctx.session?.aiPhotoshopImage
      ),
    })

    if (ctx.session) {
      ctx.session.aiPhotoshopPrompt = prompt
      ctx.session.awaitingAiPhotoshopPrompt = false
      ctx.session.aiPhotoshopStep = 'processing'
    }

    // 🚨 ENHANCED CRITICAL FIX: Check for 'all_models' mode with multiple conditions
    const isAllModelsMode =
      ctx.session?.aiPhotoshopModel === 'all_models' ||
      (ctx.session?.morphingImages?.length > 0 &&
        ctx.session?.awaitingAiPhotoshopPrompt)

    console.log('🚨🚨🚨 ALL_MODELS CHECK DEBUG:', {
      telegramId: ctx.from?.id,
      aiPhotoshopModel: ctx.session?.aiPhotoshopModel,
      morphingImagesCount: ctx.session?.morphingImages?.length || 0,
      awaitingPrompt: ctx.session?.awaitingAiPhotoshopPrompt,
      isAllModelsMode,
      promptReceived: prompt.substring(0, 30) + '...',
    })

    if (isAllModelsMode) {
      logger.info(
        '🎯 AI Photoshop: All models mode detected in text handler - returning to confirmation',
        {
          telegramId: ctx.from?.id,
          promptReceived: prompt.substring(0, 30) + '...',
          imageCount: ctx.session?.morphingImages?.length || 0,
          condition: 'ENHANCED_ALL_MODELS_CHECK',
        }
      )

      // ✅ CRITICAL: Save prompt for all_models processing
      if (ctx.session) {
        ctx.session.aiPhotoshopPrompt = prompt
        ctx.session.awaitingAiPhotoshopPrompt = false
        ctx.session.aiPhotoshopModel = 'all_models' as any // Force set if missing
      }

      // Show confirmation message for all_models mode
      const totalModelsCount = Object.keys(AI_PHOTOSHOP_MODELS).length
      await ctx.reply(
        isRu
          ? `✅ Промпт получен: "${prompt}"\n\n🎯 Готово к обработке всеми ${totalModelsCount} моделями!\n\n⚙️ Выберите качество для расчета стоимости`
          : `✅ Prompt received: "${prompt}"\n\n🎯 Ready to process with all ${totalModelsCount} models!\n\n⚙️ Select quality to calculate cost`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: isRu
                    ? '🚀 Начать обработку всеми моделями'
                    : '🚀 Start processing with all models',
                  callback_data: 'ai_photoshop_multi_confirm',
                },
              ],
              [
                {
                  text: isRu ? 'Отмена' : 'Cancel',
                  callback_data: 'ai_photoshop_multi_cancel',
                },
              ],
            ],
          },
        }
      )
      return // CRITICAL: Do not call processAiPhotoshopRequest for all_models here!
    }

    await ctx.reply(
      isRu
        ? '✅ Промпт получен! Начинаю обработку изображения...'
        : '✅ Prompt received! Starting image processing...',
      {
        reply_markup: {
          remove_keyboard: true,
        },
      }
    )

    await processAiPhotoshopRequest(ctx, prompt)
  } catch (error) {
    logger.error('Error handling AI Photoshop prompt', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// ✅ SHOW AI PHOTOSHOP MODELS SELECTION
async function showAiPhotoshopModels(ctx: MyContext): Promise<void> {
  const isRu = isRussianFromState(ctx)

  const title = isRu
    ? '🎨 *ИИ Фотошоп* - Продвинутая обработка изображений'
    : '🎨 *AI Photoshop* - Advanced Image Processing'

  const description = isRu
    ? `Выберите модель ИИ для обработки:

🎭 *SeeDream-4* - Генерация и трансформация изображений (4⭐, до 10 фото)
🍌 *Nano Banana* - ИИ редактирование на базе Gemini 2.5 (5⭐, до 3 фото)
🚀 *FLUX Multi-Kontext* - Профессиональное редактирование (4⭐, только 1 фото)
🎨 *Qwen Image Edit Plus* - Продвинутое редактирование (5⭐, до 10 фото)

📸 *Или сразу отправьте фото/альбом для быстрой обработки через SeeDream-4*
💡 *Каждая модель поддерживает несколько фотографий одновременно!*
✨ *Загружайте альбомы для пакетной обработки*`
    : `Choose an AI model for processing:

🎭 *SeeDream-4* - Image generation and transformation (4⭐, up to 10 photos)
🍌 *Nano Banana* - AI editing powered by Gemini 2.5 (5⭐, up to 3 photos)
🚀 *FLUX Multi-Kontext* - Professional editing (4⭐, single photo only)
🎨 *Qwen Image Edit Plus* - Advanced multi-image editing (5⭐, up to 10 photos)

📸 *Or send photos/album directly for quick processing with SeeDream-4*
💡 *Each model supports multiple photos simultaneously!*
✨ *Upload albums for batch processing*`

  await ctx.reply(title + '\n\n' + description, {
    parse_mode: 'Markdown',
    reply_markup: createModelSelectionKeyboard(isRu).reply_markup,
  })
}

// ✅ AI PHOTOSHOP MULTI-PHOTO UTILITIES (adapted from Infinity Morphing)

// ✅ Progress bar for AI Photoshop multi-photo collection
const createAiPhotoshopProgressBar = (current: number, length = 10): string => {
  let filled: number
  if (current <= 2) {
    filled = Math.floor((current / 2) * 2)
  } else if (current <= 5) {
    filled = 2 + Math.floor(((current - 2) / 3) * 3)
  } else if (current <= 10) {
    filled = 5 + Math.floor(((current - 5) / 5) * 3)
  } else {
    filled = Math.min(9, 8 + Math.floor(Math.log10(current - 9)))
  }

  const empty = length - filled
  return `[${'▓'.repeat(filled) + '░'.repeat(empty)}] ${current} фото`
}

// ✅ Progress message for AI Photoshop multi-photo collection
const createAiPhotoshopProgressMessage = (
  images: any[],
  isRu: boolean,
  isAllModelsMode: boolean = false
): string => {
  const count = images.length
  const progressBar = createAiPhotoshopProgressBar(count)

  // ✅ Special message for 'all_models' mode
  if (isAllModelsMode) {
    const totalModelsCount = Object.keys(AI_PHOTOSHOP_MODELS).length
    const baseMessage = isRu
      ? `🎯 *ИИ Фотошоп - Все модели сразу*\n\n📸 ${progressBar}\n\n✨ Отлично! Загружайте еще фотографии\n💡 Каждое фото будет обработано всеми ${totalModelsCount} моделями\n⚙️ Цена зависит от выбранного качества (1K/2K/4K)`
      : `🎯 *AI Photoshop - All Models*\n\n📸 ${progressBar}\n\n✨ Great! Upload more photos\n💡 Each photo will be processed by all ${totalModelsCount} models\n⚙️ Price depends on selected quality (1K/2K/4K)`

    if (count >= 1) {
      const actionMessage = isRu
        ? '\n\n🚀 *Готово к обработке всеми моделями!* Нажмите "Обработать"'
        : '\n\n🚀 *Ready to process with all models!* Click "Process"'
      return baseMessage + actionMessage
    }
    return baseMessage
  }

  // ✅ Regular multi-photo message
  const baseMessage = isRu
    ? `🎨 *ИИ Фотошоп - Сбор изображений*\n\n📸 ${progressBar}\n\n✨ Отлично! Загружайте еще фотографии для пакетной обработки\n💡 Все модели поддерживают несколько изображений одновременно`
    : `🎨 *AI Photoshop - Collecting Images*\n\n📸 ${progressBar}\n\n✨ Great! Upload more photos for batch processing\n💡 All models support multiple images simultaneously`

  if (count >= 1) {
    const actionMessage = isRu
      ? '\n\n🚀 *Готово к обработке!* Нажмите "Обработать" или загрузите еще фото'
      : '\n\n🚀 *Ready to process!* Click "Process" or upload more photos'
    return baseMessage + actionMessage
  }

  return baseMessage
}

// ✅ Progress keyboard for AI Photoshop multi-photo collection
const createAiPhotoshopProgressKeyboard = (images: any[], isRu: boolean) => {
  const keyboard = []

  if (images.length >= 1) {
    // Ready to process - show process button (allow single image too)
    keyboard.push([
      {
        text: isRu ? '🎨 Обработать изображения' : '🎨 Process Images',
        callback_data: 'ai_photoshop_multi_process',
      },
    ])
  }

  // Always show restart option
  keyboard.push([
    {
      text: isRu ? '🔄 Начать заново' : '🔄 Start Over',
      callback_data: 'ai_photoshop_multi_restart',
    },
  ])

  return Markup.inlineKeyboard(keyboard)
}

// ✅ AI PHOTOSHOP MULTI-PHOTO DETECTION AND HANDLING

/**
 * AI Photoshop multi-photo detection - collects multiple photos using buffer logic like Infinity Morphing
 */
// Cap the number of collected images. Each is a full Buffer kept in the
// in-memory Telegraf session (bot.ts session(), no TTL/eviction) shared by the
// one process that runs every bot; without a cap a subscriber can climb RSS
// until the container OOM-kills the whole multi-bot process. Same guard as
// morphingWizard (#1145); morphing needs >= 2, 20 is a generous ceiling.
const MAX_AI_PHOTOSHOP_IMAGES = 20
async function aiPhotoshopImageCapReached(
  ctx: MyContext,
  isRu: boolean
): Promise<boolean> {
  const count = ctx.session.morphingImages?.length ?? 0
  if (count >= MAX_AI_PHOTOSHOP_IMAGES) {
    await ctx.reply(
      isRu
        ? '❌ Достигнут лимит изображений (максимум 20). Запустите обработку.'
        : '❌ Image limit reached (max 20). Start processing.'
    )
    return true
  }
  return false
}

async function detectMultiPhotoAiPhotoshop(ctx: MyContext): Promise<boolean> {
  if (!ctx.message || !('photo' in ctx.message)) return false

  const userId = ctx.from?.id?.toString()
  if (!userId) return false

  const photo = ctx.message.photo?.pop() // Get highest resolution
  if (!photo) return false

  const mediaGroupId =
    'media_group_id' in ctx.message ? ctx.message.media_group_id : undefined

  // ✅ ENHANCED: Collect photos if part of media group OR if photos are being sent sequentially OR in 'all_models' mode
  const shouldCollectPhoto =
    mediaGroupId ||
    (ctx.session.morphingImages &&
      ctx.session.morphingImages.length > 0 &&
      Date.now() - (ctx.session.lastPhotoTimestamp || 0) < 60000) || // 60 seconds window
    (ctx.session?.aiPhotoshopModel === 'all_models' &&
      ctx.session?.awaitingAiPhotoshopImage) // ✅ NEW: Collect photos in 'all_models' mode

  if (shouldCollectPhoto) {
    try {
      const isRu = isRussianFromState(ctx)

      // Initialize session data if not exists
      if (!ctx.session.morphingImages) {
        ctx.session.morphingImages = []
      }

      // Get file and convert to buffer
      const file = await ctx.telegram.getFile(photo.file_id)
      if (!file.file_path) {
        logger.error('❌ AI Photoshop: No file path for photo')
        return false
      }

      const botToken = getBotToken(ctx)
      const telegramUrl = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`
      const buffer = await downloadTelegramFileBuffer(telegramUrl)

      // Add image with timestamp and order like Infinity Morphing
      if (await aiPhotoshopImageCapReached(ctx, isRu)) return false

      const imageIndex = ctx.session.morphingImages.length + 1
      const currentTimestamp = Date.now() + imageIndex

      ctx.session.morphingImages.push({
        buffer: Buffer.from(buffer),
        url: telegramUrl, // ✅ Сохраняем оригинальный URL от Telegram
        filename: `ai_photoshop_image_${imageIndex}.jpg`,
        timestamp: currentTimestamp,
        originalOrder: imageIndex,
      })

      // ✅ Save timestamp for sequential photo detection
      ctx.session.lastPhotoTimestamp = Date.now()

      logger.info('🎨 AI Photoshop: Multi-photo collected', {
        userId,
        mediaGroupId: mediaGroupId || 'sequential',
        photoCount: ctx.session.morphingImages.length,
        imageSize: buffer.length,
        isSequential: !mediaGroupId,
      })

      // Create dynamic progress message like Infinity Morphing
      const isAllModelsMode = ctx.session?.aiPhotoshopModel === 'all_models'
      const progressMessage = createAiPhotoshopProgressMessage(
        ctx.session.morphingImages,
        isRu,
        isAllModelsMode
      )
      const keyboard = createAiPhotoshopProgressKeyboard(
        ctx.session.morphingImages,
        isRu
      )

      // Update existing message or create new one
      if (ctx.session.morphingProgressMessageId) {
        try {
          await ctx.telegram.editMessageText(
            ctx.chat?.id,
            ctx.session.morphingProgressMessageId,
            undefined,
            progressMessage,
            {
              parse_mode: 'HTML',
              reply_markup: keyboard.reply_markup,
            }
          )
        } catch (error) {
          // If edit fails, create new message
          const sentMessage = await ctx.reply(progressMessage, {
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup,
          })
          ctx.session.morphingProgressMessageId = sentMessage.message_id
        }
      } else {
        // Create first progress message
        const sentMessage = await ctx.reply(progressMessage, {
          parse_mode: 'HTML',
          reply_markup: keyboard.reply_markup,
        })
        ctx.session.morphingProgressMessageId = sentMessage.message_id
      }

      return true
    } catch (error) {
      logger.error('❌ AI Photoshop: Error collecting multi-photo', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return false
    }
  }

  // ✅ NEW: Handle single photos that might be part of a sequence
  // If user is actively adding photos (no existing collection or recent activity), start/continue collection
  const isActivelyAddingPhotos =
    ctx.session?.awaitingAiPhotoshopImage ||
    ctx.session?.aiPhotoshopStep === 'image_upload' ||
    (ctx.session?.lastPhotoTimestamp &&
      Date.now() - ctx.session.lastPhotoTimestamp < 60000)

  if (isActivelyAddingPhotos) {
    try {
      const isRu = isRussianFromState(ctx)

      // Initialize session data if not exists
      if (!ctx.session.morphingImages) {
        ctx.session.morphingImages = []
      }

      // Get file and convert to buffer
      const file = await ctx.telegram.getFile(photo.file_id)
      if (!file.file_path) {
        logger.error('❌ AI Photoshop: No file path for sequential photo')
        return false
      }

      const botToken = getBotToken(ctx)
      const telegramUrl = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`
      const buffer = await downloadTelegramFileBuffer(telegramUrl)

      // Add image with timestamp and order
      if (await aiPhotoshopImageCapReached(ctx, isRu)) return false

      const imageIndex = ctx.session.morphingImages.length + 1
      const currentTimestamp = Date.now() + imageIndex

      ctx.session.morphingImages.push({
        buffer: Buffer.from(buffer),
        url: telegramUrl,
        filename: `ai_photoshop_image_${imageIndex}.jpg`,
        timestamp: currentTimestamp,
        originalOrder: imageIndex,
      })

      // ✅ Save timestamp for sequential photo detection
      ctx.session.lastPhotoTimestamp = Date.now()

      logger.info('🎨 AI Photoshop: Sequential photo collected', {
        userId,
        photoCount: ctx.session.morphingImages.length,
        imageSize: buffer.length,
        isFirstPhoto: imageIndex === 1,
      })

      // Create or update progress message
      const isAllModelsMode = ctx.session?.aiPhotoshopModel === 'all_models'
      const progressMessage = createAiPhotoshopProgressMessage(
        ctx.session.morphingImages,
        isRu,
        isAllModelsMode
      )
      const keyboard = createAiPhotoshopProgressKeyboard(
        ctx.session.morphingImages,
        isRu
      )

      // Update existing message or create new one
      if (ctx.session.morphingProgressMessageId) {
        try {
          await ctx.telegram.editMessageText(
            ctx.chat?.id,
            ctx.session.morphingProgressMessageId,
            undefined,
            progressMessage,
            {
              parse_mode: 'Markdown',
              reply_markup: keyboard.reply_markup,
            }
          )
        } catch (editError) {
          logger.warn('Failed to edit progress message for sequential photo', {
            editError,
          })
          // Create new message if editing fails
          const sentMessage = await ctx.reply(progressMessage, {
            parse_mode: 'Markdown',
            reply_markup: keyboard.reply_markup,
          })
          ctx.session.morphingProgressMessageId = sentMessage.message_id
        }
      } else {
        const sentMessage = await ctx.reply(progressMessage, {
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup,
        })
        ctx.session.morphingProgressMessageId = sentMessage.message_id
      }

      return true // Photo collected successfully
    } catch (error) {
      logger.error('Error collecting sequential photo for AI Photoshop', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      })
      return false
    }
  }

  return false
}

/**
 * Handle AI Photoshop multi-photo processing - now unused (logic moved to callback handlers)
 */
async function handleAiPhotoshopMultiPhoto(ctx: MyContext): Promise<void> {
  // This function is now handled by callback handlers: ai_photoshop_multi_process
}

// ✅ NEW: Dialog interface for saved photos
async function showDialogInterface(ctx: MyContext): Promise<void> {
  const isRu = isRussianFromState(ctx)
  const savedResults = ctx.session?.savedAiPhotoshopResults || []

  if (savedResults.length === 0) {
    await showAiPhotoshopModels(ctx)
    return
  }

  const recentPhoto = savedResults[savedResults.length - 1]

  // ✅ NEW: Calculate total cost and count for "All Models" button - автоматически считает все модели
  const totalCostAllModels = AI_PHOTOSHOP_PRICING.getAllModelsCost()
  const totalModelsCount = Object.keys(AI_PHOTOSHOP_MODELS).length

  const title = isRu
    ? '🎨 *Продолжить работу с фотографиями*'
    : '🎨 *Continue working with photos*'

  const description = isRu
    ? `✨ У вас есть ${savedResults.length} обработанных фото в галерее!\n\n🎯 *Диалоговый режим активен* - теперь вы можете:\n\n💬 *Просто написать текст для улучшения:*\n• "Добавь туда побольше атмосферы и девчонок"\n• "Сделай более яркие цвета"\n• "Добавь эффект дождя или снега"\n• "Измени стиль на винтажный"\n• "Убери фон, оставь только человека"\n• "Увеличить качество" или "upscale" для апскейлинга\n\n🔄 *Использовать кнопки для быстрых действий*\n⬆️ *Увеличить качество* фото с помощью Clarity Upscaler\n🎯 *Все сразу* - генерация во ВСЕХ ${totalModelsCount} моделях одновременно (${totalCostAllModels}⭐)\n📸 *Добавить новое фото* для обработки\n📋 *Посмотреть всю галерею* (${savedResults.length} фото)\n\n🚀 *Продвинутые команды:*\n• "Увеличь контрастность на 20%"\n• "Добавь теплые тона"\n• "Сделай как в стиле Ван Гога"\n\n💡 *Совет:* Пишите простые команды - я понимаю естественный язык!`
    : `✨ You have ${savedResults.length} processed photos in your gallery!\n\n🎯 *Dialog mode is active* - now you can:\n\n💬 *Simply write text to improve:*\n• "Add more atmosphere and girls there"\n• "Make colors more vibrant"\n• "Add rain or snow effect"\n• "Change style to vintage"\n• "Remove background, keep only person"\n• "Upscale" or "enhance quality" for upscaling\n\n🔄 *Use buttons for quick actions*\n⬆️ *Upscale photo quality* with Clarity Upscaler\n🎯 *All at once* - generate with ALL ${totalModelsCount} models simultaneously (${totalCostAllModels}⭐)\n📸 *Add new photo* to process\n📋 *View entire gallery* (${savedResults.length} photos)\n\n🚀 *Advanced commands:*\n• "Increase contrast by 20%"\n• "Add warm tones"\n• "Make it Van Gogh style"\n\n💡 *Tip:* Write simple commands - I understand natural language!`

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback(
        isRu
          ? '🔄 Продолжить с теми же настройками'
          : '🔄 Continue with same settings',
        'ai_photoshop_continue_same'
      ),
    ],
    [
      Markup.button.callback(
        isRu ? '⬆️ Увеличить качество фото' : '⬆️ Upscale photo quality',
        'ai_photoshop_upscale_last'
      ),
    ],
    [
      Markup.button.callback(
        isRu
          ? `🎯 Все сразу (${totalCostAllModels}⭐)`
          : `🎯 All at once (${totalCostAllModels}⭐)`,
        'ai_photoshop_all_models_from_selector'
      ),
    ],
    [
      Markup.button.callback(
        isRu ? '🎬 Ракурс камеры' : '🎬 Camera Angle',
        'ai_photoshop_camera_menu'
      ),
      Markup.button.callback(
        isRu ? '💡 Освещение' : '💡 Lighting',
        'ai_photoshop_lighting_menu'
      ),
    ],
    [
      Markup.button.callback(
        isRu ? '📐 Композиция' : '📐 Composition',
        'ai_photoshop_composition_menu'
      ),
      Markup.button.callback(
        isRu ? '📏 Соотношение сторон' : '📏 Aspect Ratio',
        'ai_photoshop_aspect_ratio_menu'
      ),
    ],
    [
      Markup.button.callback(
        isRu ? '🔢 Количество вариаций' : '🔢 Number of variations',
        'ai_photoshop_variations_menu'
      ),
    ],
    [
      Markup.button.callback(
        isRu ? '📸 Добавить фото' : '📸 Add photo',
        'ai_photoshop_add_new'
      ),
      Markup.button.callback(
        isRu
          ? `📋 Галерея (${savedResults.length})`
          : `📋 Gallery (${savedResults.length})`,
        'ai_photoshop_show_all'
      ),
    ],
    [
      Markup.button.callback(
        isRu ? '🔄 Начать заново' : '🔄 Start over',
        'ai_photoshop_restart'
      ),
      Markup.button.callback(
        isRu ? '🚪 Главное меню' : '🚪 Main menu',
        'ai_photoshop_exit_to_menu'
      ),
    ],
  ])

  await ctx.reply(title + '\n\n' + description, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup,
  })
}

// ✅ NEW: Save photo result function
async function savePhotoResult(
  ctx: MyContext,
  imageUrl: string,
  model: string,
  prompt: string,
  wasAllModels: boolean = false
): Promise<void> {
  if (!ctx.session) return

  if (!ctx.session.savedAiPhotoshopResults) {
    ctx.session.savedAiPhotoshopResults = []
  }

  const result = {
    url: imageUrl,
    imageUrl: imageUrl, // ✅ Compatibility with dialog mode logic
    model,
    prompt: prompt.substring(0, 200),
    timestamp: new Date().toISOString(),
    id: Date.now().toString(),
    wasAllModels, // ✅ NEW: Track if this was generated in all_models mode
    additionalInfo: {
      size: ctx.session.aiPhotoshopSize,
      originalImage:
        ctx.session.aiPhotoshopImage !== imageUrl
          ? ctx.session.aiPhotoshopImage
          : undefined,
      isImprovement:
        ctx.session.savedAiPhotoshopResults &&
        ctx.session.savedAiPhotoshopResults.length > 0,
      fullPrompt: prompt, // Keep full prompt for context
    },
  }

  ctx.session.savedAiPhotoshopResults.push(result)

  // ✅ ENHANCED: Automatically activate dialog mode after saving results
  ctx.session.dialogMode = true

  // ✅ NEW: Initialize sessionId if not exists for Zod validation
  if (!ctx.session.sessionId) {
    ctx.session.sessionId =
      Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9)
  }

  // Keep only last 10 results to prevent session bloat
  if (ctx.session.savedAiPhotoshopResults.length > 10) {
    ctx.session.savedAiPhotoshopResults =
      ctx.session.savedAiPhotoshopResults.slice(-10)
  }

  logger.info('🎨 AI Photoshop: Photo result saved', {
    telegramId: ctx.from?.id,
    totalSaved: ctx.session.savedAiPhotoshopResults.length,
    model,
    promptLength: prompt.length,
  })
}

// Function to process AI Photoshop request
const processAiPhotoshopRequest = async (
  ctx: MyContext,
  customPrompt?: string
) => {
  const isRu = isRussianFromState(ctx)

  // Get data from session
  const {
    aiPhotoshopModel,
    aiPhotoshopStyle,
    aiPhotoshopImage,
    multiPhotoUrls,
    multiPhotoCount,
  } = ctx.session || {}

  // Validate data - check for either aiPhotoshopImage OR morphingImages
  const hasImages =
    aiPhotoshopImage ||
    (ctx.session?.morphingImages?.length &&
      ctx.session.morphingImages.length > 0)

  if (!aiPhotoshopModel || !hasImages || !ctx.from?.id) {
    logger.error('Missing required data for AI Photoshop processing', {
      telegramId: ctx.from?.id,
      model: aiPhotoshopModel,
      hasImage: !!aiPhotoshopImage,
      hasMorphingImages: ctx.session?.morphingImages?.length || 0,
      sessionState: {
        aiPhotoshopModel: ctx.session?.aiPhotoshopModel,
        aiPhotoshopStyle: ctx.session?.aiPhotoshopStyle,
        aiPhotoshopSize: ctx.session?.aiPhotoshopSize,
        aiPhotoshopStep: ctx.session?.aiPhotoshopStep,
        aiPhotoshopPrompt: !!ctx.session?.aiPhotoshopPrompt,
      },
    })

    await ctx.reply(
      isRu
        ? '❌ Ошибка: недостаточно данных для обработки.'
        : '❌ Error: insufficient data for processing.'
    )
    return
  }

  // ✅ NEW: Handle "all_models" case - process with all models simultaneously
  if (aiPhotoshopModel === 'all_models') {
    logger.info(
      '🎯 AI Photoshop: Processing with ALL models from initial selector',
      {
        telegramId: ctx.from?.id,
        hasImage: !!aiPhotoshopImage,
      }
    )

    // ✅ FIX: Use quality multiplier for correct cost display
    const selectedQuality = (ctx.session?.aiPhotoshopSize || '1K') as
      | '1K'
      | '2K'
      | '4K'
    const totalCost =
      AI_PHOTOSHOP_PRICING.getAllModelsWithQuality(selectedQuality)
    const availableModels = Object.keys(AI_PHOTOSHOP_MODELS) as Array<
      keyof typeof AI_PHOTOSHOP_MODELS
    >
    const modelNames = availableModels.map(key =>
      isRu
        ? AI_PHOTOSHOP_MODELS[key].title_ru
        : AI_PHOTOSHOP_MODELS[key].title_en
    )

    await ctx.reply(
      isRu
        ? `🎯 *Генерация во ВСЕХ моделях!*\n\n📸 Обрабатываю ваше фото во всех ${availableModels.length} моделях:\n\n${modelNames.map((name, i) => `${i + 1}. ${name} (${Object.values(AI_PHOTOSHOP_MODELS)[i].cost}⭐)`).join('\n')}\n\n💎 *Общая стоимость: ${totalCost}⭐*\n\n⏳ Это займет больше времени, но вы получите результаты от всех моделей для сравнения!`
        : `🎯 *Generating with ALL models!*\n\n📸 Processing your photo with all ${availableModels.length} models:\n\n${modelNames.map((name, i) => `${i + 1}. ${name} (${Object.values(AI_PHOTOSHOP_MODELS)[i].cost}⭐)`).join('\n')}\n\n💎 *Total cost: ${totalCost}⭐*\n\n⏳ This will take longer, but you'll get results from all models for comparison!`,
      {
        parse_mode: 'Markdown',
      }
    )

    // Process with each model sequentially, handling multiple images
    const prompt = customPrompt || 'enhance this image'
    const imagesToProcess =
      ctx.session?.morphingImages ||
      (ctx.session?.aiPhotoshopImage
        ? [{ url: ctx.session.aiPhotoshopImage }]
        : [])

    logger.info(
      `🎨 AI Photoshop: Processing ${imagesToProcess.length} images with ${availableModels.length} models`,
      {
        telegramId: ctx.from?.id,
        imageCount: imagesToProcess.length,
        modelCount: availableModels.length,
      }
    )

    for (const modelKey of availableModels) {
      try {
        console.log('🔥🔥🔥 [ALL_MODELS LOOP] Starting iteration:', {
          modelKey,
          modelIndex: availableModels.indexOf(modelKey) + 1,
          totalModels: availableModels.length,
          telegram_id: ctx.from?.id,
        })

        logger.info(`🎨 AI Photoshop: Processing with model ${modelKey}`, {
          telegramId: ctx.from?.id,
          model: modelKey,
          currentStep: `${availableModels.indexOf(modelKey) + 1}/${availableModels.length}`,
          imageCount: imagesToProcess.length,
        })

        // ✅ CRITICAL FIX: Process ALL images with current model in ONE call
        // Not in a loop - each model should get ALL images at once

        // Prepare session for this model with ALL images
        if (ctx.session) {
          ctx.session.aiPhotoshopModel = modelKey
          ctx.session.aiPhotoshopPrompt = prompt
          // ✅ KEY FIX: Set session.morphingImages so the model gets ALL images
          // Ensure proper type compatibility
          ctx.session.morphingImages = imagesToProcess.map(img => ({
            buffer: Buffer.alloc(0), // Empty buffer as placeholder
            url: img.url,
            filename: `image_${Date.now()}.jpg`,
            timestamp: Date.now(),
            originalOrder: 1,
          }))
          if (!ctx.session.aiPhotoshopSize) {
            ctx.session.aiPhotoshopSize = '2K'
          }
        }

        // ✅ CRITICAL: One call per model with ALL images, not per image
        await processSingleAiPhotoshopModel(ctx, prompt, modelKey, true)

        // Small delay between models to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000))
      } catch (modelError) {
        const errorMsg =
          modelError instanceof Error ? modelError.message : 'Unknown error'
        const isContentModeration =
          errorMsg.toLowerCase().includes('e005') ||
          errorMsg.toLowerCase().includes('flagged as sensitive') ||
          errorMsg.toLowerCase().includes('nsfw') ||
          errorMsg.toLowerCase().includes('safety')

        // ✅ Content moderation errors are WARN (expected behavior), not ERROR
        if (isContentModeration) {
          logger.warn(
            `⚠️ AI Photoshop: Content moderation blocked ${modelKey} - trying next model`,
            {
              telegramId: ctx.from?.id,
              model: modelKey,
              reason: 'CONTENT_MODERATION',
            }
          )
        } else {
          // Real errors logged as ERROR
          logger.error(
            `❌ AI Photoshop: Error processing with model ${modelKey}`,
            {
              telegramId: ctx.from?.id,
              model: modelKey,
              error: errorMsg,
              errorStack:
                modelError instanceof Error ? modelError.stack : undefined,
            }
          )
        }

        // Log error but don't spam user with individual error messages - failover will handle it
      }
    }

    // ✅ CRITICAL FIX: Restore aiPhotoshopModel back to 'all_models' after loop
    if (ctx.session) {
      ctx.session.aiPhotoshopModel = 'all_models'
      logger.info(
        '🔄 AI Photoshop: Restored model to all_models after processing',
        {
          telegramId: ctx.from?.id,
          restoredModel: 'all_models',
        }
      )
    }

    // 🚨 CRITICAL FIX: Send all saved photos from ALL_MODELS processing
    if (
      ctx.session?.savedAiPhotoshopResults &&
      ctx.session.savedAiPhotoshopResults.length > 0
    ) {
      logger.info(
        '📤 AI Photoshop: Sending all saved results from ALL_MODELS mode',
        {
          telegramId: ctx.from?.id,
          resultCount: ctx.session.savedAiPhotoshopResults.length,
        }
      )

      for (const result of ctx.session.savedAiPhotoshopResults) {
        try {
          const modelConfig =
            AI_PHOTOSHOP_MODELS[
              result.model as keyof typeof AI_PHOTOSHOP_MODELS
            ]
          const modelTitle = modelConfig
            ? isRu
              ? modelConfig.title_ru
              : modelConfig.title_en
            : result.model
          const modelCost = modelConfig?.cost || 0

          await ctx.replyWithPhoto(result.imageUrl, {
            caption: isRu
              ? `✅ *${modelTitle}*\n\n📝 Промпт: "${result.prompt}"\n\n💎 *Стоимость: ${modelCost}⭐*`
              : `✅ *${modelTitle}*\n\n📝 Prompt: "${result.prompt}"\n\n💎 *Cost: ${modelCost}⭐*`,
            parse_mode: 'Markdown',
          })

          logger.info(`✅ Sent photo from ${result.model}`, {
            telegramId: ctx.from?.id,
            model: result.model,
          })
        } catch (photoError) {
          logger.error(`❌ Failed to send photo from ${result.model}`, {
            telegramId: ctx.from?.id,
            model: result.model,
            error:
              photoError instanceof Error
                ? photoError.message
                : String(photoError),
          })
          // The Markdown caption interpolates the raw user prompt; a reserved
          // char (_ * backtick [) makes Telegram 400 and rejects the whole
          // sendPhoto, silently losing a PAID image. Re-send it WITHOUT
          // parse_mode so the caption cannot abort delivery (the same
          // fall-back-to-plain remedy used for the dialog status reply above).
          await ctx
            .replyWithPhoto(result.imageUrl, {
              caption: isRu
                ? `📝 Промпт: "${result.prompt}"`
                : `📝 Prompt: "${result.prompt}"`,
            })
            .catch(() => {})
        }

        // Small delay between photos to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      logger.info('✅ All photos sent successfully', {
        telegramId: ctx.from?.id,
        totalSent: ctx.session.savedAiPhotoshopResults.length,
      })
    }

    // Show final results summary
    await ctx.reply(
      isRu
        ? `✅ *Обработка всеми моделями завершена!*\n\n🎨 Проверьте результаты выше - теперь у вас есть варианты от всех ${availableModels.length} моделей для сравнения!\n\n💡 Используйте команды для дальнейшего улучшения любого результата.`
        : `✅ *Processing with all models completed!*\n\n🎨 Check the results above - now you have variations from all ${availableModels.length} models for comparison!\n\n💡 Use commands to further improve any result.`,
      {
        parse_mode: 'Markdown',
      }
    )

    // Consume the paid input before showing the persistent dialog buttons.
    // The all_models branch returns here, BEFORE the single-model "Clear working
    // session" reset below, so without this it leaves aiPhotoshopImage /
    // morphingImages hot. The persistent "Continue with same settings" button
    // (ai_photoshop_continue_same) does not set its own image -- it re-runs
    // processAiPhotoshopRequest on whatever is still in the session, re-charging
    // the full multi-model cost from stale input (the stale-button re-charge
    // class). Consuming it here makes the button inert exactly as it already is
    // after a single-model run. Dialog-mode text edits re-derive the image from
    // the saved results, so this does not break them.
    if (ctx.session) {
      ctx.session.aiPhotoshopImage = undefined
      ctx.session.morphingImages = undefined
    }

    // Show dialog interface
    await showDialogInterface(ctx)
    return
  }

  logger.info('Processing AI Photoshop request', {
    telegramId: ctx.from?.id,
    model: aiPhotoshopModel,
    style: aiPhotoshopStyle,
    hasImage: !!aiPhotoshopImage,
    hasCustomPrompt: !!customPrompt,
  })

  // In-flight guard: this choke point (reached from on('photo')/on('text') and
  // several confirm/generate button actions) charges + generates below. Without
  // this, a second photo/text OR a double-tap during the ~generation re-enters
  // and double-charges. Reject-before-set (sync); released in the finally. #1362
  if (ctx.session.aiPhotoshopInProgress) {
    await ctx.reply(
      isRu
        ? '⏳ Уже обрабатываю, подождите...'
        : '⏳ Already processing, please wait...'
    )
    return
  }

  ctx.session.aiPhotoshopInProgress = true

  try {
    // Build prompt
    let finalPrompt = ''

    if (customPrompt) {
      finalPrompt = customPrompt
    } else if (aiPhotoshopStyle && aiPhotoshopStyle !== 'custom') {
      const style =
        AI_PHOTOSHOP_STYLES[
          aiPhotoshopStyle as keyof typeof AI_PHOTOSHOP_STYLES
        ]
      finalPrompt = style?.template || 'enhance this image'
    } else {
      finalPrompt = 'enhance this image'
    }

    // 🎬 ADD CAMERA CONTROL PROMPTS (transferred from FLUX Kontext)
    const cameraEnhancements = []

    // Add camera angle if selected
    if (ctx.session?.aiPhotoshopCameraAngle) {
      const cameraPrompt =
        AI_PHOTOSHOP_CAMERA_ANGLES[
          ctx.session
            .aiPhotoshopCameraAngle as keyof typeof AI_PHOTOSHOP_CAMERA_ANGLES
        ]
      if (cameraPrompt) {
        cameraEnhancements.push(cameraPrompt)
      }
    }

    // Add lighting if selected
    if (ctx.session?.aiPhotoshopLighting) {
      const lightingPrompt =
        AI_PHOTOSHOP_LIGHTING_SETUPS[
          ctx.session
            .aiPhotoshopLighting as keyof typeof AI_PHOTOSHOP_LIGHTING_SETUPS
        ]
      if (lightingPrompt) {
        cameraEnhancements.push(lightingPrompt)
      }
    }

    // Add composition if selected
    if (ctx.session?.aiPhotoshopComposition) {
      const compositionPrompt =
        AI_PHOTOSHOP_FRAME_COMPOSITION[
          ctx.session
            .aiPhotoshopComposition as keyof typeof AI_PHOTOSHOP_FRAME_COMPOSITION
        ]
      if (compositionPrompt) {
        cameraEnhancements.push(compositionPrompt)
      }
    }

    // Combine base prompt with camera enhancements
    if (cameraEnhancements.length > 0) {
      finalPrompt = `${finalPrompt} ${cameraEnhancements.join(' ')}`
    }

    logger.info('AI Photoshop enhanced prompt generated', {
      telegramId: ctx.from.id,
      model: aiPhotoshopModel,
      style: aiPhotoshopStyle,
      finalPrompt: finalPrompt.substring(0, 100) + '...',
    })

    // ✅ CHECK FOR MULTI-PHOTO PROCESSING
    // If we have morphingImages (buffer approach), convert them to temporary URLs
    let actualImageUrls: string[] = []
    let isMultiPhoto = false

    if (
      ctx.session?.morphingImages?.length &&
      ctx.session.morphingImages.length > 0
    ) {
      // Multi-photo via buffer approach - use the original Telegram file URLs from session
      isMultiPhoto = ctx.session.morphingImages.length > 1

      logger.info('AI Photoshop: Using original Telegram URLs from session', {
        telegramId: ctx.from.id,
        imageCount: ctx.session.morphingImages.length,
      })

      // Use the original URLs that were stored when the images were uploaded
      logger.info('🔍 AI Photoshop: Checking morphingImages URLs', {
        telegramId: ctx.from.id,
        morphingImagesCount: ctx.session.morphingImages.length,
        sampleImage: ctx.session.morphingImages[0]
          ? {
              hasBuffer: !!ctx.session.morphingImages[0].buffer,
              hasUrl: !!ctx.session.morphingImages[0].url,
              urlPreview: ctx.session.morphingImages[0].url
                ? ctx.session.morphingImages[0].url.substring(0, 100) + '...'
                : 'NO_URL',
              filename: ctx.session.morphingImages[0].filename,
            }
          : 'NO_IMAGES',
      })

      actualImageUrls = ctx.session.morphingImages
        .map(img => img.url)
        .filter(url => url)

      logger.info('🎯 AI Photoshop: URL extraction result', {
        telegramId: ctx.from.id,
        totalImages: ctx.session.morphingImages.length,
        extractedUrls: actualImageUrls.length,
        urlPreviews: actualImageUrls.map(url =>
          url ? url.substring(0, 100) + '...' : 'EMPTY'
        ),
      })
    } else if (multiPhotoUrls && multiPhotoCount && multiPhotoCount > 1) {
      // Multi-photo via URL approach (from multiPhotoHandler)
      isMultiPhoto = true
      actualImageUrls = Array.isArray(multiPhotoUrls)
        ? multiPhotoUrls
        : [multiPhotoUrls]
    } else {
      // Single photo
      isMultiPhoto = false
      actualImageUrls = [aiPhotoshopImage || '']
    }

    const currentModel =
      AI_PHOTOSHOP_MODELS[aiPhotoshopModel as keyof typeof AI_PHOTOSHOP_MODELS]
    const maxImages = isMultiPhoto
      ? Math.min(actualImageUrls.length, currentModel?.max_images || 1)
      : 1

    logger.info('AI Photoshop processing setup', {
      telegramId: ctx.from.id,
      isMultiPhoto,
      imageCount: actualImageUrls.length,
      maxImages,
      modelSupportsMulti: currentModel?.supports_multi_image,
      usingBuffers: !!ctx.session?.morphingImages?.length,
    })

    // ✅ ВАЛИДАЦИЯ: Проверяем поддержку multi-image для выбранной модели
    if (isMultiPhoto && !currentModel?.supports_multi_image) {
      const errorMessage = isRu
        ? `❌ Модель ${currentModel.title_ru} поддерживает только одно изображение!\n\n🔄 Выберите другую модель:\n🎭 SeeDream-4 (до 10 фото)\n🍌 Nano Banana (до 3 фото)\n\nИли отправьте одно фото для FLUX Kontext Max.`
        : `❌ ${currentModel.title_en} model supports only single image!\n\n🔄 Choose another model:\n🎭 SeeDream-4 (up to 10 photos)\n🍌 Nano Banana (up to 3 photos)\n\nOr send a single photo for FLUX Kontext Max.`

      await ctx.reply(errorMessage)
      return
    }

    // Call appropriate service based on selected model
    let result: any = null

    // ✅ Get variations count from session (default 1)
    const variationsCount = ctx.session?.aiPhotoshopVariationsCount || 1

    logger.info('AI Photoshop: Using variations count', {
      telegramId: ctx.from.id,
      variationsCount,
      model: aiPhotoshopModel,
    })

    switch (aiPhotoshopModel) {
      case 'seedream': {
        // ✅ CRITICAL FIX: Get selected size from session or use user's choice
        const selectedSize = ctx.session?.aiPhotoshopSize || '1K'

        logger.info('🎯 AI Photoshop: SeeDream processing with size', {
          telegramId: ctx.from.id,
          selectedSize,
          isMultiPhoto,
          imageCount: actualImageUrls.length,
          maxImages,
          variationsCount,
        })

        // ✅ CRITICAL FIX: Handle multi-photo and merge prompts correctly
        const isActualMultiPhoto = actualImageUrls.length > 1

        logger.info('🎯 AI Photoshop: SeeDream-4 processing decision', {
          telegramId: ctx.from.id,
          isActualMultiPhoto,
          imageCount: actualImageUrls.length,
          prompt: finalPrompt.substring(0, 50) + '...',
          size: selectedSize,
          maxImages,
          variationsCount,
        })

        if (isActualMultiPhoto && currentModel?.supports_multi_image) {
          // Multi-photo processing with array - variations N/A for multi-photo
          result = await generateSeeDream4({
            prompt: finalPrompt,
            inputImageUrl: actualImageUrls, // Pass array for multi-photo
            telegram_id: ctx.from.id.toString(),
            username: ctx.from.username || 'unknown',
            is_ru: isRu,
            ctx,
            size: selectedSize,
            max_images: maxImages,
            aspect_ratio: 'match_input_image',
          })
        } else {
          // Single photo processing (or first image if multiple) - APPLY VARIATIONS
          result = await generateSeeDream4({
            prompt: finalPrompt,
            inputImageUrl: actualImageUrls[0],
            telegram_id: ctx.from.id.toString(),
            username: ctx.from.username || 'unknown',
            is_ru: isRu,
            ctx,
            size: selectedSize,
            max_images: variationsCount, // ✅ USE VARIATIONS COUNT
            aspect_ratio: 'match_input_image',
          })
        }
        break
      }

      case 'nano_banana':
        result = await generateNanoBanana({
          telegram_id: ctx.from.id.toString(),
          promptText: finalPrompt,
          inputImageUrl: actualImageUrls, // Nano Banana supports multiple images
          ctx,
          username: ctx.from.username || 'unknown',
          is_ru: isRu,
          promptStyle: 'artistic',
        })
        break

      case 'nano_banana_pro': {
        // ✅ Nano Banana Pro - Gemini 3 Pro, text rendering, up to 14 images, 4K
        const nanoBananaProSize = ctx.session?.aiPhotoshopSize || '1K'
        result = await generateNanoBananaProReplicate({
          telegram_id: ctx.from.id.toString(),
          promptText: finalPrompt,
          inputImageUrl: actualImageUrls,
          ctx,
          username: ctx.from.username || 'unknown',
          is_ru: isRu,
          resolution: (nanoBananaProSize as '1K' | '2K' | '4K') || '1K',
          aspectRatio:
            ctx.session?.aiPhotoshopAspectRatio ||
            AI_PHOTOSHOP_PRICING.sizeToAspectRatio[nanoBananaProSize] ||
            '9:16',
        })
        break
      }

      case 'seedream_45': {
        // ✅ Seedream 4.5 - ByteDance, superior aesthetics, spatial understanding, up to 14 images, 4K
        const seedream45Size = ctx.session?.aiPhotoshopSize || '2K'
        result = await generateSeedream45Replicate({
          telegram_id: ctx.from.id.toString(),
          promptText: finalPrompt,
          inputImageUrl: actualImageUrls,
          ctx,
          username: ctx.from.username || 'unknown',
          is_ru: isRu,
          size: (seedream45Size as '2K' | '4K') || '2K',
          aspectRatio:
            ctx.session?.aiPhotoshopAspectRatio ||
            AI_PHOTOSHOP_PRICING.sizeToAspectRatio[seedream45Size] ||
            '9:16',
        })
        break
      }

      case 'flux_multi_kontext':
        // ✅ FLUX Multi-Kontext Pro - поддержка 2 изображений
        if (actualImageUrls.length < 2) {
          await ctx.reply(
            isRu
              ? '⚠️ FLUX Multi-Kontext требует 2 изображения. Пожалуйста, загрузите второе изображение.'
              : '⚠️ FLUX Multi-Kontext requires 2 images. Please upload a second image.',
            Markup.keyboard([[getMainMenuText(isRu)]]).resize()
          )
          return
        }

        result = await generateAdvancedFluxKontext({
          prompt: finalPrompt,
          mode: 'multi',
          imageA: actualImageUrls[0],
          imageB: actualImageUrls[1],
          modelType: 'pro',
          telegram_id: ctx.from.id.toString(),
          username: ctx.from.username || 'unknown',
          is_ru: isRu,
          ctx,
        })
        break

      case 'qwen_edit_plus': {
        // ✅ GET SELECTED SIZE FROM SESSION LIKE OTHER MODELS
        const qwenSelectedSize = ctx.session?.aiPhotoshopSize || '2K'

        // Map size to aspect ratio (централизованно из AI_PHOTOSHOP_PRICING)
        // ✅ REFACTOR: inputImageUrl FIRST (what), then prompt (how)
        result = await generateQwenImageEditPlus({
          inputImageUrl: actualImageUrls, // WHAT to edit - Qwen supports multiple images
          prompt: finalPrompt, // HOW to edit
          telegram_id: ctx.from.id.toString(),
          username: ctx.from.username || 'unknown',
          is_ru: isRu,
          ctx,
          aspect_ratio:
            ctx.session?.aiPhotoshopAspectRatio ||
            AI_PHOTOSHOP_PRICING.sizeToAspectRatio[qwenSelectedSize] ||
            '1:1',
          output_format: 'webp',
          output_quality: 90,
        })
        break

        // ✨ NEW AI PHOTOSHOP MODELS - January 2025
      }
      case 'flux_kontext_pro': {
        logger.info('⚡ Processing with FLUX Kontext Pro', {
          telegram_id: ctx.from.id,
          imageCount: actualImageUrls.length,
        })

        const fluxProSize = ctx.session?.aiPhotoshopSize || '2K'

        // ✅ REFACTOR: inputImageUrl FIRST (what), then prompt (how)
        result = await generateFluxKontextPro({
          inputImageUrl: actualImageUrls[0], // WHAT to edit - Single image only
          prompt: finalPrompt, // HOW to edit
          telegram_id: ctx.from.id.toString(),
          username: ctx.from.username || 'unknown',
          is_ru: isRu,
          ctx,
          size: fluxProSize,
          aspect_ratio:
            ctx.session?.aiPhotoshopAspectRatio ||
            AI_PHOTOSHOP_PRICING.sizeToAspectRatio[fluxProSize] ||
            '9:16',
        })
        break
      }

      case 'flux_kontext_max':
        logger.info('🚀 Processing with FLUX Kontext Max', {
          telegram_id: ctx.from.id,
          imageCount: actualImageUrls.length,
        })

        result = await generateFluxKontextMax({
          inputImageUrl: actualImageUrls[0], // WHAT to edit - Single image only
          prompt: finalPrompt, // HOW to edit
          telegram_id: ctx.from.id.toString(),
          username: ctx.from.username || 'unknown',
          is_ru: isRu,
          ctx,
          aspect_ratio:
            ctx.session?.aiPhotoshopAspectRatio === '16:9'
              ? '16:9'
              : ctx.session?.aiPhotoshopAspectRatio === '1:1'
                ? '1:1'
                : 'match_input_image',
        })
        break

      case 'seededit_3': {
        logger.info('🎯 Processing with SeedEdit 3.0', {
          telegram_id: ctx.from.id,
          imageCount: actualImageUrls.length,
        })

        const seedEdit3Size = ctx.session?.aiPhotoshopSize || '2K'

        // ✅ REFACTOR: inputImageUrl FIRST (what), then prompt (how)
        result = await generateSeedEdit3({
          inputImageUrl: actualImageUrls[0], // WHAT to edit - Single image only
          prompt: finalPrompt, // HOW to edit
          telegram_id: ctx.from.id.toString(),
          username: ctx.from.username || 'unknown',
          is_ru: isRu,
          ctx,
          size: seedEdit3Size,
        })
        break
      }

      case 'qwen_image_edit': {
        logger.info('🔥 Processing with Qwen Image Edit (SOTA)', {
          telegram_id: ctx.from.id,
          imageCount: actualImageUrls.length,
        })

        const qwenImageEditSize = ctx.session?.aiPhotoshopSize || '2K'

        // ✅ REFACTOR: inputImageUrl FIRST (what), then prompt (how)
        result = await generateQwenImageEdit({
          inputImageUrl: actualImageUrls[0], // WHAT to edit - Single image only
          prompt: finalPrompt, // HOW to edit
          telegram_id: ctx.from.id.toString(),
          username: ctx.from.username || 'unknown',
          is_ru: isRu,
          ctx,
          size: qwenImageEditSize,
        })
        break
      }

      default:
        throw new Error(`Unknown model: ${aiPhotoshopModel}`)
    }

    logger.info('AI Photoshop processing completed successfully', {
      telegramId: ctx.from.id,
      model: aiPhotoshopModel,
      hasResult: !!result,
    })

    // ✅ ENHANCED: Save photo result and show dialog options
    if (result) {
      // ✅ FIX: Extract image URL from result object
      const imageUrl =
        typeof result === 'string' ? result : result.image || result
      await savePhotoResult(ctx, imageUrl, aiPhotoshopModel, finalPrompt)

      // Show continue/exit options after successful processing (ONLY for single model mode, not all_models)
      if (aiPhotoshopModel && (aiPhotoshopModel as string) !== 'all_models') {
        const isRu = isRussianFromState(ctx)
        const continueKeyboard = Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu ? '⬆️ Увеличить качество' : '⬆️ Upscale quality',
              'ai_photoshop_upscale_last'
            ),
          ],
          [
            Markup.button.callback(
              isRu ? '📸 Добавить фото' : '📸 Add photo',
              'ai_photoshop_add_new'
            ),
          ],
          [
            Markup.button.callback(
              isRu ? '🚪 Главное меню' : '🚪 Main menu',
              'ai_photoshop_exit_to_menu'
            ),
          ],
        ])

        await ctx.reply(
          isRu
            ? `✨ *Фото успешно обработано и сохранено!*\n\n🎯 *Диалоговый режим активен* - теперь вы можете:\n\n💬 *Просто написать текст для дальнейших улучшений:*\n• "Добавь туда побольше атмосферы и девчонок"\n• "Сделай более яркие цвета"\n• "Добавь эффект дождя или снега"\n• "Измени стиль на винтажный"\n• "Убери фон, оставь только человека"\n• "Увеличить качество" или "upscale" для апскейлинга\n\n⬆️ *Или нажмите кнопку для увеличения качества в 2 раза*\n📸 *Добавить новое фото для обработки*\n\n🚀 *Продвинутые команды:*\n• "Увеличь контрастность на 20%"\n• "Добавь теплые тона"\n• "Сделай как в стиле Ван Гога"\n\n💡 *Совет:* Пишите простые команды - я понимаю естественный язык!\n🎨 *Все фото сохраняются в галерее до выхода из сцены*`
            : `✨ *Photo successfully processed and saved!*\n\n🎯 *Dialog mode is active* - now you can:\n\n💬 *Simply write text for further improvements:*\n• "Add more atmosphere and girls there"\n• "Make colors more vibrant"\n• "Add rain or snow effect"\n• "Change style to vintage"\n• "Remove background, keep only person"\n• "Upscale" or "enhance quality" for upscaling\n\n⬆️ *Or click button to upscale quality 2x*\n📸 *Add new photo to process*\n\n🚀 *Advanced commands:*\n• "Increase contrast by 20%"\n• "Add warm tones"\n• "Make it Van Gogh style"\n\n💡 *Tip:* Write simple commands - I understand natural language!\n🎨 *All photos are saved in gallery until you exit the scene*`,
          {
            parse_mode: 'Markdown',
            reply_markup: continueKeyboard.reply_markup,
          }
        )
      }

      // Clear working session but keep saved results
      if (ctx.session) {
        ctx.session.aiPhotoshopModel = undefined
        ctx.session.aiPhotoshopStyle = undefined
        ctx.session.aiPhotoshopImage = undefined
        ctx.session.aiPhotoshopPrompt = undefined
        ctx.session.aiPhotoshopStep = undefined
        ctx.session.aiPhotoshopSize = undefined
        ctx.session.awaitingAiPhotoshopImage = false
        ctx.session.awaitingAiPhotoshopPrompt = false
        // Clear multi-photo data
        ctx.session.multiPhotoUrls = undefined
        ctx.session.multiPhotoCount = undefined
        ctx.session.awaitingMultiPhotoConfirmation = false
        // Clear buffer-based images
        ctx.session.morphingImages = undefined
        ctx.session.morphingButtonsMessageId = undefined
        ctx.session.morphingProgressMessageId = undefined
        // Keep savedAiPhotoshopResults and dialogMode
      }

      // Stay in scene for dialog mode instead of leaving
      logger.info('🎨 AI Photoshop: Staying in scene for dialog mode', {
        telegramId: ctx.from.id,
      })
    } else {
      // If no result, exit scene
      await ctx.scene.leave()
    }
  } catch (error) {
    logger.error('Error in AI Photoshop processing', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
      model: aiPhotoshopModel,
    })

    // ✅ ENHANCED ERROR HANDLING: Show user-friendly error with exit options
    const isRu = isRussianFromState(ctx)
    const errorKeyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          isRu ? '🔄 Попробовать снова' : '🔄 Try again',
          'ai_photoshop_restart'
        ),
      ],
      [
        Markup.button.callback(
          isRu ? '🚪 Главное меню' : '🚪 Main menu',
          'ai_photoshop_exit_to_menu'
        ),
      ],
    ])

    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка при обработке изображения.\n\n🔧 Попробуйте еще раз или вернитесь в главное меню.'
        : '❌ An error occurred while processing the image.\n\n🔧 Please try again or return to the main menu.',
      {
        reply_markup: errorKeyboard.reply_markup,
      }
    )

    // Clear session on error but keep saved results
    if (ctx.session) {
      ctx.session.aiPhotoshopModel = undefined
      ctx.session.aiPhotoshopStyle = undefined
      ctx.session.aiPhotoshopImage = undefined
      // Evict the (possibly url-bearing) morphingImages batch on error too, so a
      // failed multi-photo run does not leave a stale batch that a subsequent
      // single-photo edit would be charged against (the within-scene variant).
      ctx.session.morphingImages = undefined
      ctx.session.aiPhotoshopPrompt = undefined
      ctx.session.aiPhotoshopStep = undefined
      ctx.session.aiPhotoshopSize = undefined
      // Keep savedAiPhotoshopResults for recovery
    }

    // Stay in scene to allow recovery instead of leaving
    logger.info(
      '🎨 AI Photoshop: Staying in scene after error for recovery options',
      {
        telegramId: ctx.from?.id,
      }
    )
  } finally {
    ctx.session.aiPhotoshopInProgress = false
  }
}

// ✅ NEW: Process single AI Photoshop model (non-recursive version for all_models processing)
const processSingleAiPhotoshopModel = async (
  ctx: MyContext,
  customPrompt: string,
  modelKey: keyof typeof AI_PHOTOSHOP_MODELS,
  isAllModelsMode: boolean = false
) => {
  const isRu = isRussianFromState(ctx)

  try {
    logger.info(`🎨 AI Photoshop: Processing single model ${modelKey}`, {
      telegramId: ctx.from?.id,
      model: modelKey,
      hasCustomPrompt: !!customPrompt,
    })

    // Get session data
    const { aiPhotoshopImage, morphingImages } = ctx.session || {}

    // ✅ CRITICAL FIX: Get ALL images, not just the first one!
    let imagesToProcess: string[] = []

    if (isAllModelsMode && morphingImages && morphingImages.length > 0) {
      // ✅ ALL_MODELS режим: берем ВСЕ фотографии из morphingImages
      imagesToProcess = morphingImages.map(img => img.url).filter(url => url)
      logger.info(
        `🎨 ALL_MODELS: Processing ${imagesToProcess.length} images with ${modelKey}`,
        {
          telegramId: ctx.from?.id,
          imageCount: imagesToProcess.length,
          model: modelKey,
        }
      )
    } else if (aiPhotoshopImage) {
      // Обычный режим: одно изображение
      imagesToProcess = [aiPhotoshopImage]
    } else if (morphingImages && morphingImages.length > 0) {
      // Fallback: первое изображение
      imagesToProcess = [morphingImages[0].url]
    }

    if (imagesToProcess.length === 0 || !ctx.from?.id) {
      logger.error(`Missing images for ${modelKey} processing`, {
        telegramId: ctx.from?.id,
        imageCount: imagesToProcess.length,
        isAllModelsMode,
      })
      return
    }

    // Prepare session temporarily for this specific model
    const originalModel = ctx.session?.aiPhotoshopModel
    if (ctx.session) {
      ctx.session.aiPhotoshopModel = modelKey
      ctx.session.aiPhotoshopPrompt = customPrompt
      // ✅ НЕ устанавливаем aiPhotoshopImage - оставляем morphingImages как есть
      if (!ctx.session.aiPhotoshopSize) {
        ctx.session.aiPhotoshopSize = '2K'
      }
    }

    // Get model config
    const modelConfig = AI_PHOTOSHOP_MODELS[modelKey]
    if (!modelConfig) {
      logger.error(`Model config not found: ${modelKey}`)
      return
    }

    const userId = ctx.from.id
    const prompt = customPrompt || 'enhance this image'

    // No processing message - just process silently
    const modelTitle = isRu ? modelConfig.title_ru : modelConfig.title_en

    // ✅ CRITICAL FIX: For ALL_MODELS mode, process each model ONCE with ALL images
    let result

    console.log('🔎🔎🔎 [DEBUG BEFORE IF/ELSE CHAIN]', {
      isAllModelsMode,
      modelKey,
      modelKeyType: typeof modelKey,
      modelKeyValue: JSON.stringify(modelKey),
      modelConfig: !!modelConfig,
      modelConfigKey: modelConfig?.key,
    })

    if (isAllModelsMode) {
      console.log('✅✅✅ [DEBUG INSIDE ALL_MODELS BLOCK]', {
        modelKey,
        aboutToEnterModelSwitch: true,
      })

      // 🚨 ALL_MODELS MODE: Each model processes ALL images in ONE call
      logger.info(
        `🎨 ALL_MODELS: Processing ${imagesToProcess.length} images with ${modelKey} in ONE call`,
        {
          telegramId: ctx.from?.id,
          imageCount: imagesToProcess.length,
          model: modelKey,
        }
      )

      // Process based on model capabilities
      if (modelKey === 'seedream') {
        // ✅ Get variations count from session (default 1)
        const variationsCount = ctx.session?.aiPhotoshopVariationsCount || 1

        // 🎯 CRITICAL FIX: For multiple input images, max_images must be >= input count
        // For single input image, max_images = variations count
        const maxImages =
          imagesToProcess.length > 1
            ? Math.max(imagesToProcess.length, variationsCount) // Multiple inputs: at least as many as inputs
            : variationsCount // Single input: use variations count

        // SeeDream supports multiple images (up to 10)
        result = await generateSeeDream4({
          prompt,
          inputImageUrl: imagesToProcess, // Pass array of ALL images
          telegram_id: userId.toString(),
          username: ctx.from?.username || 'unknown',
          is_ru: isRu,
          ctx,
          size: ctx.session?.aiPhotoshopSize || '1K',
          max_images: maxImages, // ✅ USE CORRECT max_images based on input count
          aspect_ratio:
            ctx.session?.aiPhotoshopAspectRatio ||
            AI_PHOTOSHOP_PRICING.sizeToAspectRatio[
              ctx.session?.aiPhotoshopSize || '1K'
            ] ||
            '9:16',
        })

        // ✅ Save result to session for later sending
        if (result?.image || result?.imageUrl) {
          const imageUrl = result.image || result.imageUrl
          await savePhotoResult(ctx, imageUrl, modelKey, prompt, true)
          logger.info(`✅ ${modelKey} result saved to session`, {
            telegram_id: userId.toString(),
            imageUrl: imageUrl.substring(0, 50) + '...',
          })
        }
      } else if (modelKey === 'nano_banana') {
        console.log('🍌🍌🍌 [DEBUG] NANO_BANANA CONDITION MATCHED!')
        // Nano Banana supports up to 3 images
        const limitedImages = imagesToProcess.slice(0, 3)

        // ✅ Get aspect_ratio from centralized config
        const selectedSize = ctx.session?.aiPhotoshopSize || '2K'
        const aspectRatio =
          ctx.session?.aiPhotoshopAspectRatio ||
          AI_PHOTOSHOP_PRICING.sizeToAspectRatio[selectedSize] ||
          '9:16'

        // ✅ Nano Banana controls aspect ratio through PROMPT, not API parameter
        const promptWithAspectRatio = `[${aspectRatio} aspect ratio] ${prompt}`

        result = await generateNanoBanana({
          promptText: promptWithAspectRatio, // ✅ Include aspect ratio in prompt
          inputImageUrl:
            limitedImages.length === 1 ? limitedImages[0] : limitedImages,
          telegram_id: userId.toString(),
          username: ctx.from?.username || 'unknown',
          is_ru: isRu,
          ctx,
          promptStyle: 'artistic',
          silent: true, // ✅ ИСПРАВЛЕНО: Don't send photo in ALL_MODELS mode
          // #1274: NO skipBalanceCheck -- nothing charges this branch in all_models,
          // so the service must charge its own price (was falsely marked already-charged)
        })

        // ✅ Save result to session for later sending
        if (result?.image || result?.imageUrl) {
          const imageUrl = result.image || result.imageUrl
          await savePhotoResult(ctx, imageUrl, modelKey, prompt, true)
          logger.info(`✅ ${modelKey} result saved to session`, {
            telegram_id: userId.toString(),
            imageUrl: imageUrl.substring(0, 50) + '...',
          })
        }
      } else if (modelKey === 'flux_multi_kontext') {
        console.log('🔥🔥🔥 [DEBUG] FLUX CONDITION CHECK!', {
          modelKey,
          comparison: modelKey === 'flux_multi_kontext',
          stringMatch:
            JSON.stringify(modelKey) === JSON.stringify('flux_multi_kontext'),
        })

        try {
          console.log('🚀 [DEBUG] About to call logger.info...')
          // FLUX Multi-Kontext supports multiple images
          logger.info('🚀🚀🚀 FLUX MULTI-KONTEXT BLOCK ENTERED!', {
            telegram_id: userId.toString(),
            imageCount: imagesToProcess.length,
            mode: imagesToProcess.length === 1 ? 'single' : 'multi',
            imageA: imagesToProcess[0] ? 'present' : 'missing',
            imageB: imagesToProcess.length > 1 ? 'present' : 'missing',
          })
          console.log(
            '✅ [DEBUG] logger.info completed, calling generateAdvancedFluxKontext...'
          )
        } catch (logErr) {
          console.error('❌ [DEBUG] LOGGER ERROR:', logErr)
        }

        result = await generateAdvancedFluxKontext({
          prompt,
          mode: imagesToProcess.length === 1 ? 'single' : 'multi',
          imageA: imagesToProcess[0],
          imageB: imagesToProcess.length > 1 ? imagesToProcess[1] : undefined,
          modelType: 'pro',
          telegram_id: userId.toString(),
          username: ctx.from?.username || 'unknown',
          is_ru: isRu,
          ctx,
          silent: true, // Не отправлять статус сообщения в ALL_MODELS режиме
          aspect_ratio:
            ctx.session?.aiPhotoshopAspectRatio ||
            AI_PHOTOSHOP_PRICING.sizeToAspectRatio[
              ctx.session?.aiPhotoshopSize || '1K'
            ] ||
            '9:16',
        })

        logger.info('✅✅✅ FLUX MULTI-KONTEXT COMPLETED!', {
          telegram_id: userId.toString(),
          resultReceived: !!result,
        })

        // ✅ Save result to session for later sending
        if (result?.image || result?.imageUrl) {
          const imageUrl = result.image || result.imageUrl
          await savePhotoResult(ctx, imageUrl, modelKey, prompt, true)
          logger.info(`✅ ${modelKey} result saved to session`, {
            telegram_id: userId.toString(),
            imageUrl: imageUrl.substring(0, 50) + '...',
          })
        }
      } else if (modelKey === 'qwen_edit_plus') {
        // Qwen supports multiple images (up to 10)
        const selectedSize = ctx.session?.aiPhotoshopSize || '2K'
        // ✅ REFACTOR: inputImageUrl FIRST (what), then prompt (how)
        result = await generateQwenImageEditPlus({
          inputImageUrl: imagesToProcess, // WHAT to edit - Pass array of ALL images
          prompt, // HOW to edit
          telegram_id: userId.toString(),
          username: ctx.from?.username || 'unknown',
          is_ru: isRu,
          ctx,
          aspect_ratio:
            ctx.session?.aiPhotoshopAspectRatio ||
            AI_PHOTOSHOP_PRICING.sizeToAspectRatio[selectedSize] ||
            '1:1',
          output_format: 'jpg',
          output_quality: 90,
        })

        // ✅ Save result to session for later sending
        if (result?.image || result?.imageUrl) {
          const imageUrl = result.image || result.imageUrl
          await savePhotoResult(ctx, imageUrl, modelKey, prompt, true)
          logger.info(`✅ ${modelKey} result saved to session`, {
            telegram_id: userId.toString(),
            imageUrl: imageUrl.substring(0, 50) + '...',
          })
        }
      } else if (
        [
          'flux_kontext_pro',
          'flux_kontext_max',
          'seededit_3',
          'qwen_image_edit',
        ].includes(modelKey)
      ) {
        // 🔄 Models 5-7 support ONLY single image
        // ✅ ИСПРАВЛЕНИЕ: По умолчанию обрабатываем ТОЛЬКО ПЕРВОЕ фото (variations = 1)
        // Если нужно больше вариаций - используется variations count
        const variationsCount = ctx.session?.aiPhotoshopVariationsCount || 1
        const imagesToProcessForThisModel = imagesToProcess.slice(
          0,
          Math.min(variationsCount, imagesToProcess.length)
        )

        logger.info(
          `🔄 Processing ${imagesToProcessForThisModel.length} images with ${modelKey}`,
          {
            telegram_id: userId.toString(),
            imageCount: imagesToProcessForThisModel.length,
            totalImagesAvailable: imagesToProcess.length,
            variationsCount,
            modelKey,
          }
        )

        // ✅ Check balance ONCE before loop (prevents ctx navigation on each iteration)
        // ✅ ИСПРАВЛЕНИЕ ЦЕНООБРАЗОВАНИЯ: Берем цену из AI_PHOTOSHOP_MODELS (не AI_PHOTOSHOP_PRICING!)
        const modelCost =
          AI_PHOTOSHOP_MODELS[modelKey as keyof typeof AI_PHOTOSHOP_MODELS]
            ?.cost || 5
        const qualityMultiplier =
          ctx.session?.aiPhotoshopSize === '4K'
            ? 6
            : ctx.session?.aiPhotoshopSize === '2K'
              ? 4
              : 1
        const costPerImage = modelCost * qualityMultiplier
        const totalCostForAllImages =
          costPerImage * imagesToProcessForThisModel.length

        logger.info(`💰 Correct pricing calculation`, {
          telegram_id: userId.toString(),
          modelKey,
          modelCost,
          qualityMultiplier,
          costPerImage,
          imageCount: imagesToProcessForThisModel.length,
          totalCostForAllImages,
        })

        logger.info(`💰 Pre-loop balance check for ${modelKey}`, {
          telegram_id: userId.toString(),
          imageCount: imagesToProcess.length,
          costPerImage,
          totalCostForAllImages,
        })

        // Check balance once
        const { processBalanceOperation } = await import('@/price/helpers')
        const balanceCheck = await processBalanceOperation({
          ctx,
          telegram_id: userId,
          paymentAmount: totalCostForAllImages,
          is_ru: isRu,
          bot_name: ctx.botInfo.username,
        })

        if (!balanceCheck.success) {
          logger.error(`❌ Insufficient balance for ${modelKey}, skipping`, {
            telegram_id: userId.toString(),
            required: totalCostForAllImages,
          })
          // Skip this model - do not process images
        } else {
          // Balance check passed - process selected images (up to variations count)
          for (let i = 0; i < imagesToProcessForThisModel.length; i++) {
            const currentImageUrl = imagesToProcessForThisModel[i]

            logger.info(
              `🎨 Processing image ${i + 1}/${imagesToProcessForThisModel.length}`,
              {
                telegram_id: userId.toString(),
                imageIndex: i + 1,
                model: modelKey,
              }
            )

            try {
              if (modelKey === 'flux_kontext_pro') {
                const fluxProSize = ctx.session?.aiPhotoshopSize || '2K'
                result = await generateFluxKontextPro({
                  inputImageUrl: currentImageUrl,
                  prompt,
                  telegram_id: userId.toString(),
                  username: ctx.from?.username || 'unknown',
                  is_ru: isRu,
                  ctx,
                  size: fluxProSize,
                  aspect_ratio:
                    ctx.session?.aiPhotoshopAspectRatio ||
                    AI_PHOTOSHOP_PRICING.sizeToAspectRatio[fluxProSize] ||
                    '9:16',
                  silent: true, // ✅ Don't send photo in ALL_MODELS mode
                  skipBalanceCheck: true, // ✅ Balance already checked before loop
                  chargedCostOverride: costPerImage, // exact batch charge (batchBase*mult) so a failure refunds what was charged, not the divergent service base
                })
              } else if (modelKey === 'flux_kontext_max') {
                result = await generateFluxKontextMax({
                  inputImageUrl: currentImageUrl,
                  prompt,
                  telegram_id: userId.toString(),
                  username: ctx.from?.username || 'unknown',
                  is_ru: isRu,
                  ctx,
                  aspect_ratio:
                    ctx.session?.aiPhotoshopAspectRatio === '16:9'
                      ? '16:9'
                      : ctx.session?.aiPhotoshopAspectRatio === '1:1'
                        ? '1:1'
                        : 'match_input_image',
                  suppressUserErrors: true, // ✅ Don't notify user of errors in ALL_MODELS mode
                  skipBalanceCheck: true, // ✅ Balance already charged before loop
                  chargedCostOverride: costPerImage, // exact batch charge (batchBase*mult) so a failure refunds what was charged, not the flat service base
                })
              } else if (modelKey === 'seededit_3') {
                const seedEdit3Size = ctx.session?.aiPhotoshopSize || '2K'
                // ✅ Get centralized aspect ratio
                const targetAspectRatio =
                  ctx.session?.aiPhotoshopAspectRatio ||
                  AI_PHOTOSHOP_PRICING.sizeToAspectRatio[seedEdit3Size] ||
                  '9:16'
                // ✅ Add aspect ratio instruction to prompt for SeedEdit 3.0
                const seedEdit3Prompt =
                  targetAspectRatio === '9:16'
                    ? `${prompt}. Adjust image to vertical 9:16 portrait format, maintaining subject composition.`
                    : prompt

                result = await generateSeedEdit3({
                  inputImageUrl: currentImageUrl,
                  prompt: seedEdit3Prompt, // ✅ Use modified prompt with aspect ratio instruction
                  telegram_id: userId.toString(),
                  username: ctx.from?.username || 'unknown',
                  is_ru: isRu,
                  ctx,
                  size: seedEdit3Size,
                  silent: true, // ✅ Don't send photo in ALL_MODELS mode
                  skipBalanceCheck: true, // ✅ Balance already checked before loop
                  chargedCostOverride: costPerImage, // exact batch charge (batchBase*mult) so a failure refunds what was charged, not the divergent service base
                })
              } else if (modelKey === 'qwen_image_edit') {
                const qwenImageEditSize = ctx.session?.aiPhotoshopSize || '2K'
                // ✅ Get centralized aspect ratio
                const targetAspectRatio =
                  ctx.session?.aiPhotoshopAspectRatio ||
                  AI_PHOTOSHOP_PRICING.sizeToAspectRatio[qwenImageEditSize] ||
                  '9:16'
                // ✅ Add aspect ratio instruction to prompt for Qwen Image Edit
                const qwenImageEditPrompt =
                  targetAspectRatio === '9:16'
                    ? `${prompt}. Convert to 9:16 vertical portrait aspect ratio format.`
                    : prompt

                result = await generateQwenImageEdit({
                  inputImageUrl: currentImageUrl,
                  prompt: qwenImageEditPrompt, // ✅ Use modified prompt with aspect ratio instruction
                  telegram_id: userId.toString(),
                  username: ctx.from?.username || 'unknown',
                  is_ru: isRu,
                  ctx,
                  size: qwenImageEditSize,
                  silent: true, // ✅ Don't send photo in ALL_MODELS mode
                  skipBalanceCheck: true, // ✅ Balance already checked before loop
                })
              }

              // Save result for EACH image
              if (result) {
                const imageUrl =
                  typeof result === 'string'
                    ? result
                    : result.image || result.imageUrl || result
                if (imageUrl) {
                  await savePhotoResult(ctx, imageUrl, modelKey, prompt, true)
                  logger.info(
                    `✅ ${modelKey} image ${i + 1}/${imagesToProcessForThisModel.length} completed`,
                    {
                      telegram_id: userId.toString(),
                      imageIndex: i + 1,
                    }
                  )
                }
              }
            } catch (error) {
              logger.error(
                `❌ ${modelKey} image ${i + 1}/${imagesToProcessForThisModel.length} FAILED`,
                {
                  telegram_id: userId.toString(),
                  imageIndex: i + 1,
                  error: error instanceof Error ? error.message : String(error),
                }
              )
              // Continue with next image even if this one failed
            }
          }
        } // End else (balance check passed)
      }
    } else {
      // 🚨 NORMAL MODE: Process images individually for backward compatibility
      const results = []

      for (let i = 0; i < imagesToProcess.length; i++) {
        const currentImageUrl = imagesToProcess[i]

        logger.info(
          `🎨 Processing image ${i + 1}/${imagesToProcess.length} with ${modelKey}`,
          {
            telegramId: ctx.from?.id,
            imageIndex: i + 1,
            totalImages: imagesToProcess.length,
            model: modelKey,
          }
        )

        if (modelKey === 'seedream') {
          // ✅ Get variations count from session (default 1)
          const variationsCount = ctx.session?.aiPhotoshopVariationsCount || 1

          result = await generateSeeDream4({
            prompt,
            inputImageUrl: currentImageUrl,
            telegram_id: userId.toString(),
            username: ctx.from?.username || 'unknown',
            is_ru: isRu,
            ctx,
            size: ctx.session?.aiPhotoshopSize || '1K',
            max_images: variationsCount, // ✅ USE VARIATIONS COUNT
            aspect_ratio: AI_PHOTOSHOP_PRICING.defaultAspectRatio,
          })
        } else if (modelKey === 'nano_banana') {
          result = await generateNanoBanana({
            promptText: prompt,
            inputImageUrl: currentImageUrl,
            telegram_id: userId.toString(),
            username: ctx.from?.username || 'unknown',
            is_ru: isRu,
            ctx,
            promptStyle: 'artistic',
          })
        } else if (modelKey === 'flux_multi_kontext') {
          result = await generateAdvancedFluxKontext({
            prompt,
            mode: 'single',
            imageA: currentImageUrl,
            modelType: 'pro',
            telegram_id: userId.toString(),
            username: ctx.from?.username || 'unknown',
            is_ru: isRu,
            ctx,
          })
        } else if (modelKey === 'qwen_edit_plus') {
          const selectedSize = ctx.session?.aiPhotoshopSize || '2K'
          // ✅ REFACTOR: inputImageUrl FIRST (what), then prompt (how)
          result = await generateQwenImageEditPlus({
            inputImageUrl: currentImageUrl, // WHAT to edit
            prompt, // HOW to edit
            telegram_id: userId.toString(),
            username: ctx.from?.username || 'unknown',
            is_ru: isRu,
            ctx,
            aspect_ratio:
              ctx.session?.aiPhotoshopAspectRatio ||
              AI_PHOTOSHOP_PRICING.sizeToAspectRatio[selectedSize] ||
              '1:1',
            output_format: 'jpg',
            output_quality: 90,
          })
        } else if (modelKey === 'flux_kontext_pro') {
          // ⚡ FLUX Kontext Pro - process EACH image separately (fast 8x Adobe integrated)
          const fluxProSize = ctx.session?.aiPhotoshopSize || '2K'
          result = await generateFluxKontextPro({
            inputImageUrl: currentImageUrl, // WHAT to edit - EACH image separately
            prompt, // HOW to edit
            telegram_id: userId.toString(),
            username: ctx.from?.username || 'unknown',
            is_ru: isRu,
            ctx,
            size: fluxProSize,
            aspect_ratio:
              ctx.session?.aiPhotoshopAspectRatio ||
              AI_PHOTOSHOP_PRICING.sizeToAspectRatio[fluxProSize] ||
              '9:16',
          })
        } else if (modelKey === 'flux_kontext_max') {
          // 🚀 FLUX Kontext Max - process EACH image separately, advanced editing
          result = await generateFluxKontextMax({
            inputImageUrl: currentImageUrl, // WHAT to edit - EACH image separately
            prompt, // HOW to edit
            telegram_id: userId.toString(),
            username: ctx.from?.username || 'unknown',
            is_ru: isRu,
            ctx,
            aspect_ratio:
              ctx.session?.aiPhotoshopAspectRatio === '16:9'
                ? '16:9'
                : ctx.session?.aiPhotoshopAspectRatio === '1:1'
                  ? '1:1'
                  : 'match_input_image',
          })
        } else if (modelKey === 'seededit_3') {
          // 🎯 SeedEdit 3.0 - process EACH image separately, 4K support, detail preservation
          const seedEdit3Size = ctx.session?.aiPhotoshopSize || '2K'
          result = await generateSeedEdit3({
            inputImageUrl: currentImageUrl, // WHAT to edit - EACH image separately
            prompt, // HOW to edit
            telegram_id: userId.toString(),
            username: ctx.from?.username || 'unknown',
            is_ru: isRu,
            ctx,
            size: seedEdit3Size,
          })
        } else if (modelKey === 'qwen_image_edit') {
          // 🔥 Qwen Image Edit (SOTA) - process EACH image separately, bilingual support
          const qwenImageEditSize = ctx.session?.aiPhotoshopSize || '2K'
          result = await generateQwenImageEdit({
            inputImageUrl: currentImageUrl, // WHAT to edit - EACH image separately
            prompt, // HOW to edit
            telegram_id: userId.toString(),
            username: ctx.from?.username || 'unknown',
            is_ru: isRu,
            ctx,
            size: qwenImageEditSize,
          })
        }

        // ✅ CRITICAL FIX: Collect results from all images
        if (result?.success && result.imageUrl) {
          results.push({
            imageUrl: result.imageUrl,
            imageIndex: i + 1,
            success: true,
            model: modelKey,
          })

          // Save result for later reference
          await savePhotoResult(ctx, result.imageUrl, modelKey, prompt)

          // Send result with model name and image number
          const imageInfo =
            imagesToProcess.length > 1
              ? ` (${i + 1}/${imagesToProcess.length})`
              : ''

          try {
            await ctx.replyWithPhoto(result.imageUrl, {
              caption: isRu
                ? `✅ *${modelTitle}${imageInfo}*\n\n📝 Промпт: "${prompt}"\n\n💎 *Стоимость: ${modelConfig.cost}⭐*`
                : `✅ *${modelTitle}${imageInfo}*\n\n📝 Prompt: "${prompt}"\n\n💎 *Cost: ${modelConfig.cost}⭐*`,
              parse_mode: 'Markdown',
            })
          } catch (captionError) {
            // The Markdown caption interpolates the raw user prompt; a reserved
            // char (_ * backtick [) makes Telegram 400 and rejects the whole
            // sendPhoto, silently losing a PAID image. Re-send it WITHOUT
            // parse_mode so the caption cannot abort delivery.
            logger.error(
              `❌ ${modelKey} photo caption failed, re-sending plain`,
              {
                telegramId: ctx.from?.id,
                model: modelKey,
                error:
                  captionError instanceof Error
                    ? captionError.message
                    : String(captionError),
              }
            )
            await ctx
              .replyWithPhoto(result.imageUrl, {
                caption: isRu
                  ? `📝 Промпт: "${prompt}"`
                  : `📝 Prompt: "${prompt}"`,
              })
              .catch(() => {})
          }

          logger.info(
            `✅ ${modelKey} image ${i + 1}/${imagesToProcess.length} completed successfully`,
            {
              telegramId: ctx.from?.id,
              model: modelKey,
              imageIndex: i + 1,
            }
          )
        } else {
          results.push({
            imageIndex: i + 1,
            success: false,
            model: modelKey,
            error: result?.error || 'Unknown error',
          })

          logger.error(
            `❌ ${modelKey} image ${i + 1}/${imagesToProcess.length} failed`,
            {
              telegramId: ctx.from?.id,
              model: modelKey,
              imageIndex: i + 1,
              error: result?.error || 'Unknown error',
            }
          )

          // Don't send error messages to user in multi-model processing - they're handled upstream
        }
      }

      // ✅ Log summary of all processed images (normal mode only)
      const successCount = results.filter(r => r.success).length
      logger.info(
        `🎯 ${modelKey} processing summary: ${successCount}/${imagesToProcess.length} images successful`,
        {
          telegramId: ctx.from?.id,
          model: modelKey,
          totalImages: imagesToProcess.length,
          successfulImages: successCount,
          failedImages: imagesToProcess.length - successCount,
        }
      )
    }

    // Restore original session state
    if (ctx.session) {
      ctx.session.aiPhotoshopModel = originalModel
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    const isContentModeration =
      errorMsg.toLowerCase().includes('e005') ||
      errorMsg.toLowerCase().includes('flagged as sensitive') ||
      errorMsg.toLowerCase().includes('nsfw') ||
      errorMsg.toLowerCase().includes('safety')

    // ✅ Content moderation = WARN (expected behavior when user content is flagged)
    if (isContentModeration) {
      logger.warn(
        `⚠️ Content moderation in processSingleAiPhotoshopModel for ${modelKey}`,
        {
          telegramId: ctx.from?.id,
          model: modelKey,
          reason: 'CONTENT_MODERATION',
        }
      )
    } else {
      // Real errors = ERROR
      logger.error(`Error in processSingleAiPhotoshopModel for ${modelKey}`, {
        error: errorMsg,
        telegramId: ctx.from?.id,
        model: modelKey,
      })
    }

    // Don't send error messages to user in multi-model processing - they're handled upstream
  }
}

// Navigation buttons
/*
 * A LABEL IS NOT A CONTROL.
 *
 * Three progress chips are drawn as callback buttons -- index.ts:1876,
 * :5147 and :5476 -- purely so the spinner is visible. Nothing catches them,
 * and one of them is never cleaned up: the message holding it is neither edited
 * nor deleted, so it stays tappable in the chat for good.
 *
 * Since the dead-press net went in, a tap on one of these answers "that button
 * is out of date" and posts the main menu -- in the middle of a job that is
 * still running. Answering quietly is the honest reply: the chip is telling the
 * truth, it just has nothing to do.
 */
aiPhotoshopScene.action(/^loading_[a-z_]*indicator$/, async ctx => {
  await ctx.answerCbQuery().catch(() => undefined)
})

/*
 * TWO IDS, ONE INTENT.
 *
 * `ai_photoshop_multi_choose_model` is drawn at index.ts:1595 and :4884 with the
 * label "Выбрать модель" / "Choose Model" and was caught by nothing at all: the
 * literal appears at those two lines and nowhere else in the repository. Both
 * sites are on the mainline consumer path -- upload an album, tap the button
 * that starts processing, and the keyboard offers one that does nothing.
 *
 * The handler it is asking for is this one: it clears the model and style and
 * re-renders the model selector, which is exactly what the label promises. So
 * the id is added as a second trigger rather than rewritten at the render
 * sites, because keyboards already sent are still live in people's chats and a
 * rename would leave those pressing into nothing.
 */
aiPhotoshopScene.action(
  ['ai_photoshop_back_to_models', 'ai_photoshop_multi_choose_model'],
  async ctx => {
    try {
      await ctx.answerCbQuery()
      const isRu = isRussianFromState(ctx)

      if (ctx.session) {
        ctx.session.aiPhotoshopModel = undefined
        ctx.session.aiPhotoshopStyle = undefined
      }

      const title = isRu
        ? '🎨 *ИИ Фотошоп* - Продвинутая обработка изображений'
        : '🎨 *AI Photoshop* - Advanced Image Processing'

      const description = isRu
        ? `Выберите модель ИИ для обработки:

🎭 *SeeDream-4* - Генерация и трансформация изображений (4⭐)
🍌 *Nano Banana* - ИИ редактирование на базе Gemini 2.5 (5⭐)
🚀 *FLUX Multi-Kontext* - Профессиональное редактирование (4⭐)`
        : `Choose an AI model for processing:

🎭 *SeeDream-4* - Image generation and transformation (4⭐)
🍌 *Nano Banana* - AI editing powered by Gemini 2.5 (5⭐)
🚀 *FLUX Multi-Kontext* - Professional editing (4⭐)`

      await ctx.editMessageText(title + '\n\n' + description, {
        parse_mode: 'Markdown',
        reply_markup: createModelSelectionKeyboard(isRu).reply_markup,
      })
    } catch (error) {
      logger.error('Error returning to models', {
        error: error instanceof Error ? error.message : 'Unknown error',
        telegramId: ctx.from?.id,
      })
    }
  }
)

aiPhotoshopScene.action('ai_photoshop_back_to_styles', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    if (ctx.session) {
      ctx.session.aiPhotoshopStyle = undefined
      ctx.session.aiPhotoshopImage = undefined
      // Evict the cross-scene stale batch alongside the image-source reset.
      ctx.session.morphingImages = undefined
      ctx.session.awaitingAiPhotoshopImage = false
      ctx.session.awaitingAiPhotoshopPrompt = false
    }

    const model =
      AI_PHOTOSHOP_MODELS[
        ctx.session?.aiPhotoshopModel as keyof typeof AI_PHOTOSHOP_MODELS
      ]

    await ctx.editMessageText(
      isRu
        ? `✅ *Выбрана модель:* ${isRu ? model?.title_ru : model?.title_en}\n\n🎨 *Выберите стиль обработки:*`
        : `✅ *Selected model:* ${isRu ? model?.title_ru : model?.title_en}\n\n🎨 *Choose processing style:*`,
      {
        parse_mode: 'Markdown',
        reply_markup: createStyleSelectionKeyboard(isRu).reply_markup,
      }
    )
  } catch (error) {
    logger.error('Error returning to styles', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Cancel button
aiPhotoshopScene.action('ai_photoshop_cancel', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    await ctx.reply(
      isRu
        ? '❌ Процесс отменён. Возвращаюсь в главное меню.'
        : '❌ Process cancelled. Returning to main menu.',
      {
        reply_markup: {
          remove_keyboard: true,
        },
      }
    )

    await ctx.scene.leave()
    const { showMainMenu } = await import('@/navigation')
    await showMainMenu(ctx)
  } catch (error) {
    logger.error('Error handling AI Photoshop cancel', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// ✅ MULTI-PHOTO CALLBACK HANDLERS

// Process multi-photo images
aiPhotoshopScene.action('ai_photoshop_multi_process', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    if (!ctx.session.morphingImages || ctx.session.morphingImages.length < 1) {
      await ctx.reply(
        isRu
          ? '❌ Недостаточно изображений для обработки'
          : '❌ Not enough images for processing'
      )
      return
    }

    // Delete progress message
    await ctx.deleteMessage()

    // ✅ Calculate cost using centralized pricing
    const selectedSize = ctx.session.aiPhotoshopSize || '2K'
    const currentModel = ctx.session.aiPhotoshopModel || 'seedream'

    // Calculate cost based on model selection from centralized config
    let costPerImage: number
    if (currentModel === 'all_models') {
      // All models mode: use centralized pricing with quality multipliers
      costPerImage = AI_PHOTOSHOP_PRICING.getAllModelsWithQuality(
        selectedSize as '1K' | '2K' | '4K'
      )
    } else {
      // Single model mode: use centralized pricing for single models
      costPerImage = AI_PHOTOSHOP_PRICING.getSingleModelCost(
        selectedSize as '1K' | '2K' | '4K'
      )
    }

    // ✅ Get variations count for cost calculation and display
    const variationsCount = ctx.session?.aiPhotoshopVariationsCount || 1

    // 🎯 CRITICAL: Calculate variations multiplier for cost
    // - For 'seedream' single mode: multiply by variations count
    // - For 'all_models': SeeDream will generate max(imageCount, variationsCount) images
    let variationsMultiplier = 1
    if (currentModel === 'seedream') {
      variationsMultiplier = variationsCount // Single model: use variations
    } else if (currentModel === 'all_models') {
      // In all_models mode, SeeDream generates max(imageCount, variationsCount) images
      variationsMultiplier = Math.max(1, variationsCount) // At least 1 per image
    }

    const totalCost =
      costPerImage * ctx.session.morphingImages.length * variationsMultiplier

    // Preserve user's prompt and model selections
    const currentStyle = ctx.session.aiPhotoshopStyle || 'artistic'
    const currentPrompt = ctx.session.aiPhotoshopPrompt

    // Handle 'all_models' case specially
    let modelTitle: string
    if (currentModel === 'all_models') {
      modelTitle = isRu ? '🎯 Все модели сразу' : '🎯 All models at once'
    } else {
      const modelInfo =
        AI_PHOTOSHOP_MODELS[currentModel as keyof typeof AI_PHOTOSHOP_MODELS]
      modelTitle = isRu ? modelInfo?.title_ru : modelInfo?.title_en
    }

    let styleDisplay = ''
    if (currentStyle === 'custom' && currentPrompt) {
      styleDisplay = isRu
        ? `✍️ Пользовательский: "${currentPrompt.substring(0, 50)}${currentPrompt.length > 50 ? '...' : ''}"`
        : `✍️ Custom: "${currentPrompt.substring(0, 50)}${currentPrompt.length > 50 ? '...' : ''}"`
    } else if (currentStyle && currentStyle !== 'custom') {
      const styleInfo =
        AI_PHOTOSHOP_STYLES[currentStyle as keyof typeof AI_PHOTOSHOP_STYLES]
      styleDisplay = isRu
        ? styleInfo?.title_ru || 'Художественный'
        : styleInfo?.title_en || 'Artistic'
    } else {
      styleDisplay = isRu ? 'Художественный' : 'Artistic'
    }
    // 🎯 Variations info display
    let variationsInfo = ''
    if (currentModel === 'seedream') {
      variationsInfo = isRu
        ? `\n🔢 Вариаций: ${variationsCount}`
        : `\n🔢 Variations: ${variationsCount}`
    } else if (currentModel === 'all_models') {
      // In all_models mode, show variations info for SeeDream
      const effectiveVariations = Math.max(
        ctx.session.morphingImages.length,
        variationsCount
      )
      variationsInfo = isRu
        ? `\n🔢 Вариаций (SeeDream): ${effectiveVariations}`
        : `\n🔢 Variations (SeeDream): ${effectiveVariations}`
    } else {
      variationsInfo = isRu
        ? `\n⚠️ Модель не поддерживает вариации`
        : `\n⚠️ Model doesn't support variations`
    }

    // ✅ Build keyboard with quality selection for ALL_MODELS
    const keyboard: any[][] = [
      [
        {
          text: isRu ? '🚀 Начать обработку' : '🚀 Start Processing',
          callback_data: 'ai_photoshop_multi_confirm',
        },
      ],
      [
        {
          text: isRu ? '⚙️ Выбрать модель' : '⚙️ Choose Model',
          callback_data: 'ai_photoshop_multi_choose_model',
        },
      ],
    ]

    // ✅ Add quality selection button for ALL models
    if (ctx.session?.aiPhotoshopModel === 'all_models') {
      keyboard.push([
        {
          text: isRu ? '📏 Изменить качество' : '📏 Change Quality',
          callback_data: 'ai_photoshop_all_models_from_selector',
        },
      ])
    } else {
      // ✅ Add quality selection button for SINGLE models too
      keyboard.push([
        {
          text: isRu ? '📏 Изменить качество' : '📏 Change Quality',
          callback_data: 'ai_photoshop_change_size',
        },
      ])
    }

    // Add variations button (only for SeeDream)
    keyboard.push([
      {
        text: isRu
          ? `🔢 Вариации (${variationsCount})`
          : `🔢 Variations (${variationsCount})`,
        callback_data: 'ai_photoshop_variations_menu',
      },
    ])

    // Add cancel button
    keyboard.push([
      {
        text: isRu ? 'Отмена' : 'Cancel',
        callback_data: 'ai_photoshop_multi_cancel',
      },
    ])

    // Show model/style selection for multi-photo
    await ctx.reply(
      isRu
        ? `✨ Готово к обработке ${ctx.session.morphingImages.length} изображений!\n\n🎭 Модель: ${modelTitle}\n🎨 Стиль: ${styleDisplay}\n📏 Размер: ${selectedSize}${variationsInfo}\n💎 Стоимость: ${totalCost} ⭐ (${costPerImage}⭐ за фото)`
        : `✨ Ready to process ${ctx.session.morphingImages.length} images!\n\n🎭 Model: ${modelTitle}\n🎨 Style: ${styleDisplay}\n📏 Size: ${selectedSize}${variationsInfo}\n💎 Cost: ${totalCost} ⭐ (${costPerImage}⭐ per photo)`,
      {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      }
    )
  } catch (error) {
    logger.error('Error processing multi-photo AI Photoshop', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Restart multi-photo collection
aiPhotoshopScene.action('ai_photoshop_multi_restart', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    // Clear multi-photo session data
    if (ctx.session) {
      ctx.session.morphingImages = []
      ctx.session.morphingProgressMessageId = undefined
      ctx.session.aiPhotoshopSize = undefined
    }

    // Delete progress message
    await ctx.deleteMessage()

    await ctx.reply(
      isRu
        ? '🔄 Сбор изображений перезапущен. Отправьте новый альбом или фотографии.'
        : '🔄 Image collection restarted. Send a new album or photos.'
    )

    // Show model selection again
    await showAiPhotoshopModels(ctx)
  } catch (error) {
    logger.error('Error restarting multi-photo AI Photoshop', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Confirm multi-photo processing
aiPhotoshopScene.action('ai_photoshop_multi_confirm', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    // ✅ HANDLE ALL_MODELS CASE - if aiPhotoshopModel is 'all_models', trigger multi-model processing
    if (ctx.session?.aiPhotoshopModel === 'all_models') {
      logger.info(
        '🎯 AI Photoshop: ALL_MODELS processing detected, triggering multi-model generation',
        {
          telegramId: ctx.from?.id,
          imageCount: ctx.session.morphingImages?.length || 0,
        }
      )

      // Check if prompt is already provided for all_models
      if (!ctx.session.aiPhotoshopPrompt) {
        const totalModelsCount = Object.keys(AI_PHOTOSHOP_MODELS).length
        // Ask for prompt first for all_models mode
        await ctx.editMessageText(
          isRu
            ? `🎯 <b>Все модели сразу</b>\n\n📝 Опишите, как обработать ваши ${ctx.session.morphingImages?.length || 0} изображений:\n\n💡 <i>Этот промпт будет использован для всех ${totalModelsCount} моделей</i>`
            : `🎯 <b>All models at once</b>\n\n📝 Describe how to process your ${ctx.session.morphingImages?.length || 0} images:\n\n💡 <i>This prompt will be used for all ${totalModelsCount} models</i>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: isRu ? 'Отмена' : 'Cancel',
                    callback_data: 'ai_photoshop_multi_cancel',
                  },
                ],
              ],
            },
          }
        )

        // Set session state to await prompt for all_models
        Object.assign(ctx.session, {
          aiPhotoshopStep: 'custom_prompt',
          awaitingAiPhotoshopPrompt: true,
          awaitingAiPhotoshopImage: false,
          aiPhotoshopModel: 'all_models', // 🚨 CRITICAL FIX: Ensure all_models is set!
        })
        return
      }

      // Use the first image for all models processing (prompt already provided)
      if (ctx.session.morphingImages && ctx.session.morphingImages.length > 0) {
        const firstImage = ctx.session.morphingImages[0]
        if (firstImage.url) {
          // Set up session for all models processing
          ctx.session.aiPhotoshopImage = firstImage.url

          // Delete the current message and trigger all models processing
          try {
            await ctx.deleteMessage()
          } catch (e) {
            // Ignore deletion errors
          }

          // ✅ ALL_MODELS: Use processAiPhotoshopRequest (it handles all_models internally)
          await processAiPhotoshopRequest(ctx, ctx.session.aiPhotoshopPrompt)
          return
        }
      }

      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось найти изображение для обработки всеми моделями.'
          : '❌ Error: could not find image for processing with all models.'
      )
      return
    }

    // 🚨 CRITICAL DEBUG: Log full session state for normal multi-photo processing
    logger.info(
      '🚨 AI Photoshop: Multi-photo processing initiated - FULL DEBUG',
      {
        telegramId: ctx.from?.id,
        sessionExists: !!ctx.session,
        morphingImagesExists: !!ctx.session?.morphingImages,
        morphingImagesCount: ctx.session?.morphingImages?.length || 0,
        hasModel: !!ctx.session?.aiPhotoshopModel,
        hasPrompt: !!ctx.session?.aiPhotoshopPrompt,
        sessionKeys: ctx.session ? Object.keys(ctx.session) : [],
        morphingImagesPreview:
          ctx.session?.morphingImages?.map((img, index) => ({
            index,
            hasBuffer: !!img.buffer,
            hasUrl: !!img.url,
            bufferSize: img.buffer?.length || 0,
            filename: img.filename,
          })) || [],
      }
    )

    if (!ctx.session.morphingImages || ctx.session.morphingImages.length < 1) {
      logger.error('AI Photoshop: No images found for processing', {
        telegramId: ctx.from?.id,
        imageCount: ctx.session.morphingImages?.length || 0,
      })
      await ctx.reply(
        isRu
          ? '❌ Недостаточно изображений для обработки. Попробуйте загрузить фото снова.'
          : '❌ Not enough images for processing. Please try uploading photos again.'
      )
      return
    }

    // Delete confirmation message
    try {
      await ctx.deleteMessage()
    } catch (error) {
      logger.warn('Failed to delete confirmation message', {
        error: error.message,
      })
    }

    // ✅ CRITICAL FIX: Preserve ALL user selections from session
    const currentPrompt = ctx.session.aiPhotoshopPrompt
    const currentModel = ctx.session.aiPhotoshopModel || 'seedream'
    const currentStyle = ctx.session.aiPhotoshopStyle || 'artistic'
    const currentSize = ctx.session.aiPhotoshopSize || '1K'

    logger.info('🔍 AI Photoshop: Preserving session state before processing', {
      telegramId: ctx.from?.id,
      preservedData: {
        prompt: currentPrompt?.substring(0, 50) + '...',
        model: currentModel,
        style: currentStyle,
        size: currentSize,
        hasPrompt: !!currentPrompt,
        promptLength: currentPrompt?.length || 0,
      },
      currentStep: ctx.session.aiPhotoshopStep,
    })

    // ✅ CRITICAL: DON'T RESET - preserve user's choices!
    ctx.session.aiPhotoshopModel = currentModel
    ctx.session.aiPhotoshopStyle = currentStyle
    ctx.session.aiPhotoshopSize = currentSize
    ctx.session.aiPhotoshopStep = 'processing'
    // ✅ CRITICAL: Maintain the user's prompt!
    if (currentPrompt) {
      ctx.session.aiPhotoshopPrompt = currentPrompt
      logger.info('✅ AI Photoshop: User prompt preserved', {
        telegramId: ctx.from?.id,
        prompt: currentPrompt,
        promptLength: currentPrompt.length,
      })
    }

    // Convert buffer images to URLs - need to upload to temporary storage or process directly
    const imageCount = ctx.session.morphingImages.length

    // Show processing message
    let loadingMsg
    try {
      loadingMsg = await ctx.reply(
        isRu
          ? `🎨 Обрабатываю ${imageCount} изображений...\n⏳ Это может занять некоторое время`
          : `🎨 Processing ${imageCount} images...\n⏳ This may take some time`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: isRu ? '⏳ Обработка...' : '⏳ Processing...',
                  callback_data: 'loading_processing_indicator',
                },
              ],
            ],
          },
        }
      )
    } catch (error) {
      logger.warn('Failed to send processing message', { error: error.message })
    }

    // Process images using existing logic
    logger.info('🚀 AI Photoshop: Starting multi-image processing', {
      telegramId: ctx.from?.id,
      imageCount: ctx.session.morphingImages?.length,
      hasPrompt: !!ctx.session.aiPhotoshopPrompt,
      promptText: ctx.session.aiPhotoshopPrompt?.substring(0, 50) + '...',
      sessionData: {
        model: ctx.session.aiPhotoshopModel,
        style: ctx.session.aiPhotoshopStyle,
        step: ctx.session.aiPhotoshopStep,
      },
    })

    // ✅ ENHANCED PROMPT VALIDATION with automatic fallback
    if (!ctx.session.aiPhotoshopPrompt) {
      logger.warn(
        '⚠️ AI Photoshop: No custom prompt found, using style-based fallback',
        {
          telegramId: ctx.from?.id,
          currentStyle: ctx.session.aiPhotoshopStyle,
          availableStyles: Object.keys(AI_PHOTOSHOP_STYLES),
        }
      )

      // Use style-based prompt as fallback
      if (
        ctx.session.aiPhotoshopStyle &&
        ctx.session.aiPhotoshopStyle !== 'custom'
      ) {
        const style =
          AI_PHOTOSHOP_STYLES[
            ctx.session.aiPhotoshopStyle as keyof typeof AI_PHOTOSHOP_STYLES
          ]
        ctx.session.aiPhotoshopPrompt = style?.template || 'enhance this image'
        logger.info('✅ AI Photoshop: Fallback prompt applied', {
          telegramId: ctx.from?.id,
          style: ctx.session.aiPhotoshopStyle,
          fallbackPrompt: ctx.session.aiPhotoshopPrompt,
        })
      } else {
        // Ultimate fallback for multi-photo processing
        ctx.session.aiPhotoshopPrompt = 'merge and enhance these images'
        logger.info('✅ AI Photoshop: Multi-photo fallback prompt applied', {
          telegramId: ctx.from?.id,
          imageCount: ctx.session.morphingImages?.length,
          ultimatePrompt: ctx.session.aiPhotoshopPrompt,
        })
      }
    }

    try {
      await ctx.editMessageText(
        isRu
          ? `🚀 Начинаю обработку ${ctx.session.morphingImages?.length} изображений...\n\n⏳ Это может занять несколько минут\n\n📝 Промпт: "${ctx.session.aiPhotoshopPrompt}"`
          : `🚀 Starting to process ${ctx.session.morphingImages?.length} images...\n\n⏳ This may take several minutes\n\n📝 Prompt: "${ctx.session.aiPhotoshopPrompt}"`
      )
    } catch (error) {
      logger.warn('Failed to edit message text', { error: error.message })
    }

    // Call the actual processing function
    await processAiPhotoshopRequest(ctx, ctx.session.aiPhotoshopPrompt)
  } catch (error) {
    logger.error('Error confirming multi-photo AI Photoshop', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })

    const isRu = isRussianFromState(ctx)
    await ctx.reply(
      isRu
        ? '❌ Ошибка при обработке альбома. Попробуйте еще раз.'
        : '❌ Error processing album. Please try again.'
    )
  }
})

// Cancel multi-photo processing
aiPhotoshopScene.action('ai_photoshop_multi_cancel', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    // Clear multi-photo session data
    if (ctx.session) {
      ctx.session.morphingImages = []
      ctx.session.morphingProgressMessageId = undefined
      ctx.session.aiPhotoshopModel = undefined
      ctx.session.aiPhotoshopStyle = undefined
      ctx.session.aiPhotoshopStep = undefined
      ctx.session.aiPhotoshopSize = undefined
    }

    // Delete message
    await ctx.deleteMessage()

    await ctx.reply(
      isRu
        ? '❌ Обработка альбома отменена. Отправьте новое изображение или альбом для обработки.'
        : '❌ Album processing cancelled. Send a new image or album for processing.'
    )

    // Show model selection again
    await showAiPhotoshopModels(ctx)
  } catch (error) {
    logger.error('Error cancelling multi-photo AI Photoshop', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// ✅ NEW DIALOG MODE ACTION HANDLERS

// Improve last photo
aiPhotoshopScene.action('ai_photoshop_improve_last', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    const savedResults = ctx.session?.savedAiPhotoshopResults || []
    if (savedResults.length === 0) {
      await ctx.reply(
        isRu
          ? '❌ Нет сохраненных фотографий для улучшения.'
          : '❌ No saved photos to improve.'
      )
      return
    }

    const lastPhoto = savedResults[savedResults.length - 1]

    // Set up session for improvement
    if (ctx.session) {
      ctx.session.aiPhotoshopImage = lastPhoto.url
      ctx.session.aiPhotoshopModel =
        (lastPhoto.model as
          | 'seedream'
          | 'nano_banana'
          | 'flux_multi_kontext'
          | 'qwen_edit_plus') || 'seedream'
      ctx.session.aiPhotoshopStyle = 'custom'
      ctx.session.aiPhotoshopStep = 'custom_prompt'
      ctx.session.awaitingAiPhotoshopPrompt = true
      ctx.session.awaitingAiPhotoshopImage = false
    }

    await ctx.editMessageText(
      isRu
        ? `🔄 *Улучшаем последнее фото!*\n\n📝 *Напишите, как изменить изображение:*\n\n💡 *Примеры команд:*\n• "сделать ярче и контрастнее"\n• "добавить снег и зимнюю атмосферу"\n• "изменить на винтажный стиль"\n• "убрать фон, оставить только человека"\n• "сделать как картину маслом"\n• "добавить закат на фоне"\n\n✍️ *Просто опишите желаемый результат:*`
        : `🔄 *Improving the last photo!*\n\n📝 *Write how to modify the image:*\n\n💡 *Example commands:*\n• "make it brighter and more contrast"\n• "add snow and winter atmosphere"\n• "change to vintage style"\n• "remove background, keep only person"\n• "make it like an oil painting"\n• "add sunset in background"\n\n✍️ *Simply describe the desired result:*`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: isRu ? '🚪 Главное меню' : '🚪 Main menu',
                callback_data: 'ai_photoshop_exit_to_menu',
              },
            ],
          ],
        },
      }
    )
  } catch (error) {
    logger.error('Error in improve last photo handler', { error })
  }
})

// ✅ NEW: Upscale last photo with Clarity Upscaler
aiPhotoshopScene.action('ai_photoshop_upscale_last', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    const savedResults = ctx.session?.savedAiPhotoshopResults || []
    if (savedResults.length === 0) {
      await ctx.reply(
        isRu
          ? '❌ Нет сохраненных фотографий для увеличения качества.'
          : '❌ No saved photos to upscale.'
      )
      return
    }

    const lastPhoto = savedResults[savedResults.length - 1]
    const imageUrl =
      typeof lastPhoto.imageUrl === 'string'
        ? lastPhoto.imageUrl
        : lastPhoto.url

    // Consume-once guard. This button rides the persistent dialog keyboard that
    // is re-shown after every op and never stripped, and upscaleImage does NOT
    // append its result to savedAiPhotoshopResults -- so savedResults[last] is
    // stable until the NEXT generation. Upscaling is deterministic, so re-tapping
    // the old button later re-charges 3 stars for a byte-identical result. The
    // in-flight flag below only blocks CONCURRENT taps, not a later replay. Refuse
    // when this exact photo was already upscaled; a new generation appends a new
    // saved result whose URL differs, so its first upscale still proceeds.
    if (ctx.session.lastUpscaledPhotoUrl === imageUrl) {
      await ctx.reply(
        isRu
          ? '⏳ Это фото уже улучшено. Сгенерируйте новое, чтобы улучшить его.'
          : '⏳ This photo was already upscaled. Generate a new one to upscale.'
      )
      return
    }

    // In-flight guard: this button charges via upscaleImage directly, bypassing
    // the aiPhotoshopInProgress choke point (which only covers generation). In
    // webhook mode a double-tap dispatches two concurrent requests; without a
    // synchronous reject-before-set both reach the non-atomic balance deduct and
    // double-charge (+ two Replicate upscaler runs). Check-then-set is atomic (no
    // await between); the "Upscaling..." edit lives inside the try so a stale
    // message throw cannot leak the flag. Released in finally.
    if (ctx.session.aiPhotoshopUpscaleInProgress) {
      await ctx.reply(
        isRu
          ? '⏳ Уже увеличиваю качество, подождите...'
          : '⏳ Already upscaling, please wait...'
      )
      return
    }
    ctx.session.aiPhotoshopUpscaleInProgress = true
    // Mark this photo consumed BEFORE the charge (synchronous, no await between),
    // so a later stale re-tap of the same photo is refused above.
    ctx.session.lastUpscaledPhotoUrl = imageUrl

    try {
      await ctx.editMessageText(
        isRu
          ? `⬆️ *Увеличиваю качество последнего фото!*\n\n🎯 Применяю Clarity Upscaler для улучшения разрешения в 2 раза...\n\n💎 Стоимость: 3 ⭐`
          : `⬆️ *Upscaling last photo quality!*\n\n🎯 Applying Clarity Upscaler to enhance resolution 2x...\n\n💎 Cost: 3 ⭐`,
        {
          parse_mode: 'Markdown',
        }
      )

      await upscaleImage({
        imageUrl,
        telegram_id: String(ctx.from?.id),
        username: ctx.from?.username || 'unknown_user',
        is_ru: isRu,
        ctx,
        originalPrompt: lastPhoto.prompt || 'Dialog mode button upscale',
      })

      // Show dialog interface again after upscaling
      await showDialogInterface(ctx)
    } catch (error) {
      logger.error('🚨 AI Photoshop: Upscaler button failed', {
        telegramId: ctx.from?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при увеличении качества. Попробуйте позже.'
          : '❌ Error occurred during upscaling. Please try again later.'
      )
    } finally {
      ctx.session.aiPhotoshopUpscaleInProgress = false
    }
  } catch (error) {
    logger.error('Error in upscale last photo handler', { error })
  }
})

// ✅ NEW: Generate all models simultaneously
aiPhotoshopScene.action('ai_photoshop_generate_all_models', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    const savedResults = ctx.session?.savedAiPhotoshopResults || []
    if (savedResults.length === 0) {
      await ctx.reply(
        isRu
          ? '❌ Нет сохраненных фотографий для обработки всеми моделями.'
          : '❌ No saved photos to process with all models.'
      )
      return
    }

    const lastPhoto = savedResults[savedResults.length - 1]

    // ✅ FIX: Use quality multiplier for correct cost display
    const selectedQuality = (ctx.session?.aiPhotoshopSize || '1K') as
      | '1K'
      | '2K'
      | '4K'
    const totalCost =
      AI_PHOTOSHOP_PRICING.getAllModelsWithQuality(selectedQuality)

    // ✅ EXTENSIBLE: Get all available models dynamically
    const availableModels = Object.keys(AI_PHOTOSHOP_MODELS) as Array<
      keyof typeof AI_PHOTOSHOP_MODELS
    >
    const modelNames = availableModels.map(key =>
      isRu
        ? AI_PHOTOSHOP_MODELS[key].title_ru
        : AI_PHOTOSHOP_MODELS[key].title_en
    )

    await ctx.reply(
      isRu
        ? `🎯 *Генерация во ВСЕХ моделях!*\n\n📸 Обрабатываю последнее фото во всех ${availableModels.length} моделях:\n\n${modelNames.map((name, i) => `${i + 1}. ${name} (${Object.values(AI_PHOTOSHOP_MODELS)[i].cost}⭐)`).join('\n')}\n\n💎 *Общая стоимость: ${totalCost}⭐*\n\n⏳ Это займет больше времени, но вы получите результаты от всех моделей для сравнения!`
        : `🎯 *Generating with ALL models!*\n\n📸 Processing last photo with all ${availableModels.length} models:\n\n${modelNames.map((name, i) => `${i + 1}. ${name} (${Object.values(AI_PHOTOSHOP_MODELS)[i].cost}⭐)`).join('\n')}\n\n💎 *Total cost: ${totalCost}⭐*\n\n⏳ This will take longer, but you'll get results from all models for comparison!`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: isRu
                  ? '⏳ Обработка всеми моделями...'
                  : '⏳ Processing with all models...',
                callback_data: 'loading_all_models_indicator',
              },
            ],
          ],
        },
      }
    )

    // ✅ PROCESS WITH ALL MODELS SEQUENTIALLY
    for (const modelKey of availableModels) {
      const model = AI_PHOTOSHOP_MODELS[modelKey]
      const modelTitle = isRu ? model.title_ru : model.title_en

      try {
        logger.info(`🎯 AI Photoshop: Processing with model ${modelKey}`, {
          telegramId: ctx.from?.id,
          model: modelKey,
          modelTitle,
          originalPrompt: lastPhoto.prompt,
        })

        // Set up session for this model
        if (ctx.session) {
          ctx.session.aiPhotoshopModel = modelKey as any
          ctx.session.aiPhotoshopPrompt = lastPhoto.prompt
          ctx.session.aiPhotoshopImage = lastPhoto.url
          ctx.session.aiPhotoshopStep = 'processing'
          // Default size for SeeDream-4 model
          if (modelKey === 'seedream') {
            ctx.session.aiPhotoshopSize = lastPhoto.additionalInfo?.size || '2K'
          }
        }

        // Process with current model
        await processAiPhotoshopRequest(ctx, lastPhoto.prompt)

        // Small delay between models to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000))
      } catch (modelError) {
        logger.error(
          `❌ AI Photoshop: Error processing with model ${modelKey}`,
          {
            telegramId: ctx.from?.id,
            model: modelKey,
            error:
              modelError instanceof Error
                ? modelError.message
                : 'Unknown error',
          }
        )

        // Log error but don't spam user with individual error messages
      }
    }

    // Show final results summary
    await ctx.reply(
      isRu
        ? `✅ *Обработка всеми моделями завершена!*\n\n🎨 Проверьте результаты выше - теперь у вас есть варианты от всех ${availableModels.length} моделей для сравнения!\n\n💡 Используйте команды для дальнейшего улучшения любого результата.`
        : `✅ *Processing with all models completed!*\n\n🎨 Check the results above - now you have variations from all ${availableModels.length} models for comparison!\n\n💡 Use commands to further improve any result.`,
      {
        parse_mode: 'Markdown',
      }
    )

    // Show dialog interface again
    await showDialogInterface(ctx)
  } catch (error) {
    logger.error('Error in generate all models handler', { error })
    const isRu = isRussianFromState(ctx)
    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка при генерации всеми моделями. Попробуйте еще раз.'
        : '❌ Error occurred during generation with all models. Please try again.'
    )
  }
})

// Add new photo
aiPhotoshopScene.action('ai_photoshop_add_new', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    // Reset session for new photo
    if (ctx.session) {
      ctx.session.aiPhotoshopModel = undefined
      ctx.session.aiPhotoshopStyle = undefined
      ctx.session.aiPhotoshopImage = undefined
      // Evict the cross-scene stale batch alongside the image-source reset.
      ctx.session.morphingImages = undefined
      ctx.session.aiPhotoshopPrompt = undefined
      ctx.session.aiPhotoshopSize = undefined
      ctx.session.awaitingAiPhotoshopImage = false
      ctx.session.awaitingAiPhotoshopPrompt = false
      ctx.session.aiPhotoshopStep = 'model_select'
    }

    await ctx.editMessageText(
      isRu
        ? '📸 *Добавляем новое фото!*\n\n🎯 *Шаг 1 из 4:* Выберите модель ИИ\n\n📋 *Процесс добавления:*\n1️⃣ Выберите модель\n2️⃣ Выберите стиль обработки\n3️⃣ Загрузите фото\n4️⃣ Получите результат\n\n⬇️ *Выберите модель для обработки:*'
        : '📸 *Adding a new photo!*\n\n🎯 *Step 1 of 4:* Choose AI model\n\n📋 *Adding process:*\n1️⃣ Choose model\n2️⃣ Select processing style\n3️⃣ Upload photo\n4️⃣ Get result\n\n⬇️ *Choose a model for processing:*',
      {
        reply_markup: createModelSelectionKeyboard(isRu).reply_markup,
      }
    )
  } catch (error) {
    logger.error('Error in add new photo handler', { error })
  }
})

// Show all photos
aiPhotoshopScene.action('ai_photoshop_show_all', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    const savedResults = ctx.session?.savedAiPhotoshopResults || []
    if (savedResults.length === 0) {
      await ctx.reply(
        isRu ? '❌ Нет сохраненных фотографий.' : '❌ No saved photos.'
      )
      return
    }

    await ctx.editMessageText(
      isRu
        ? `📋 Ваши фотографии (${savedResults.length}):`
        : `📋 Your photos (${savedResults.length}):`
    )

    // Send each photo with details
    for (let i = 0; i < Math.min(savedResults.length, 5); i++) {
      const photo = savedResults[savedResults.length - 1 - i] // Show newest first
      try {
        await ctx.replyWithPhoto(photo.url, {
          caption: isRu
            ? `${i + 1}. Модель: ${photo.model}\n💬 "${photo.prompt}"\n⏰ ${new Date(photo.timestamp).toLocaleString('ru')}`
            : `${i + 1}. Model: ${photo.model}\n💬 "${photo.prompt}"\n⏰ ${new Date(photo.timestamp).toLocaleString('en')}`,
        })
      } catch (error) {
        logger.warn('Failed to send saved photo', { error, photoIndex: i })
      }
    }

    if (savedResults.length > 5) {
      await ctx.reply(
        isRu
          ? `... и еще ${savedResults.length - 5} фото`
          : `... and ${savedResults.length - 5} more photos`
      )
    }

    // Show dialog options again
    await showDialogInterface(ctx)
  } catch (error) {
    logger.error('Error in show all photos handler', { error })
  }
})

// Restart AI Photoshop
aiPhotoshopScene.action('ai_photoshop_restart', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    // Clear all session data
    if (ctx.session) {
      ctx.session.aiPhotoshopModel = undefined
      ctx.session.aiPhotoshopStyle = undefined
      ctx.session.aiPhotoshopImage = undefined
      // Evict the cross-scene stale batch alongside the image-source reset.
      ctx.session.morphingImages = undefined
      ctx.session.aiPhotoshopPrompt = undefined
      ctx.session.aiPhotoshopSize = undefined
      ctx.session.awaitingAiPhotoshopImage = false
      ctx.session.awaitingAiPhotoshopPrompt = false
      ctx.session.aiPhotoshopStep = 'model_select'
      ctx.session.savedAiPhotoshopResults = []
      ctx.session.dialogMode = false
      // Clear multi-photo data
      ctx.session.morphingImages = undefined
      ctx.session.morphingProgressMessageId = undefined
      ctx.session.morphingButtonsMessageId = undefined
    }

    await ctx.editMessageText(
      isRu
        ? '🔄 Начинаем заново!\n\nВыберите модель ИИ для обработки:'
        : '🔄 Starting over!\n\nChoose an AI model for processing:',
      {
        reply_markup: createModelSelectionKeyboard(isRu).reply_markup,
      }
    )
  } catch (error) {
    logger.error('Error in restart handler', { error })
  }
})

// Exit to main menu
aiPhotoshopScene.action('ai_photoshop_exit_to_menu', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    await ctx.reply(
      isRu
        ? '🚪 Возвращаюсь в главное меню.\n\n✨ Ваши фотографии сохранены для следующего раза!'
        : '🚪 Returning to main menu.\n\n✨ Your photos are saved for next time!',
      {
        reply_markup: {
          remove_keyboard: true,
        },
      }
    )

    // Clear working session but keep saved results for next time
    if (ctx.session) {
      ctx.session.aiPhotoshopModel = undefined
      ctx.session.aiPhotoshopStyle = undefined
      ctx.session.aiPhotoshopImage = undefined
      // Evict the cross-scene stale batch alongside the image-source reset.
      ctx.session.morphingImages = undefined
      ctx.session.aiPhotoshopPrompt = undefined
      ctx.session.aiPhotoshopSize = undefined
      ctx.session.awaitingAiPhotoshopImage = false
      ctx.session.awaitingAiPhotoshopPrompt = false
      ctx.session.aiPhotoshopStep = undefined
      // Keep savedAiPhotoshopResults and dialogMode for next entry
    }

    await ctx.scene.leave()
    const { showMainMenu } = await import('@/navigation')
    await showMainMenu(ctx)
  } catch (error) {
    logger.error('Error in exit to menu handler', { error })
    // Fallback: force leave scene
    await ctx.scene.leave()
  }
})

// ✅ ENHANCED: Add universal exit command handler
aiPhotoshopScene.command('menu', async ctx => {
  try {
    const isRu = isRussianFromState(ctx)

    await ctx.reply(
      isRu ? '🚪 Выходим из AI Photoshop...' : '🚪 Exiting AI Photoshop...'
    )

    await ctx.scene.leave()
    const { showMainMenu } = await import('@/navigation')
    await showMainMenu(ctx)
  } catch (error) {
    logger.error('Error in menu command handler', { error })
    await ctx.scene.leave()
  }
})

aiPhotoshopScene.command('start', async ctx => {
  try {
    const isRu = isRussianFromState(ctx)

    await ctx.reply(
      isRu
        ? '🚪 Возвращаемся в главное меню...'
        : '🚪 Returning to main menu...'
    )

    await ctx.scene.leave()
    await ctx.scene.enter(ModeEnum.StartScene)
  } catch (error) {
    logger.error('Error in start command handler', { error })
    await ctx.scene.leave()
  }
})

// 🎬 CAMERA CONTROL HANDLERS (transferred from FLUX Kontext)

// Camera menu handler
aiPhotoshopScene.action('ai_photoshop_camera_menu', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    await ctx.editMessageText(
      isRu
        ? '🎬 *Выберите ракурс камеры для профессиональной съёмки:*\n\nВыбранный ракурс будет добавлен к вашему промпту для улучшения композиции фотографии.'
        : '🎬 *Choose camera angle for professional shooting:*\n\nSelected angle will be added to your prompt to improve photo composition.',
      {
        parse_mode: 'Markdown',
        reply_markup: createCameraAngleKeyboard(isRu).reply_markup,
      }
    )
  } catch (error) {
    logger.error('Error showing camera menu', { error })
  }
})

// Lighting menu handler
aiPhotoshopScene.action('ai_photoshop_lighting_menu', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    await ctx.editMessageText(
      isRu
        ? '💡 *Выберите освещение для профессиональной фотографии:*\n\nТип освещения повлияет на атмосферу и качество вашего изображения.'
        : '💡 *Choose lighting for professional photography:*\n\nLighting type will affect the atmosphere and quality of your image.',
      {
        parse_mode: 'Markdown',
        reply_markup: createLightingKeyboard(isRu).reply_markup,
      }
    )
  } catch (error) {
    logger.error('Error showing lighting menu', { error })
  }
})

// Composition menu handler
aiPhotoshopScene.action('ai_photoshop_composition_menu', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    await ctx.editMessageText(
      isRu
        ? '📐 *Выберите композицию кадра:*\n\nПравильная композиция поможет создать более гармоничное и профессиональное изображение.'
        : '📐 *Choose frame composition:*\n\nProper composition will help create a more harmonious and professional image.',
      {
        parse_mode: 'Markdown',
        reply_markup: createCompositionKeyboard(isRu).reply_markup,
      }
    )
  } catch (error) {
    logger.error('Error showing composition menu', { error })
  }
})

// Continue with same settings handler
aiPhotoshopScene.action('ai_photoshop_continue_same', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)
    const savedResults = ctx.session?.savedAiPhotoshopResults || []

    if (savedResults.length === 0) {
      await ctx.reply(
        isRu ? '❌ Нет сохраненных результатов' : '❌ No saved results'
      )
      return
    }

    const lastResult = savedResults[savedResults.length - 1]
    const lastPrompt = lastResult.prompt || ''

    // ✅ CRITICAL FIX: Check if this was from all_models mode
    const wasAllModels = lastResult.wasAllModels || false
    const lastModel = wasAllModels ? 'all_models' : lastResult.model

    // ✅ CRITICAL FIX: Restore the correct model mode to session
    if (ctx.session) {
      ctx.session.aiPhotoshopModel =
        lastModel as keyof typeof AI_PHOTOSHOP_MODELS
    }

    logger.info('AI Photoshop: Continue with same settings', {
      telegramId: ctx.from?.id,
      model: lastModel,
      wasAllModels,
      promptLength: lastPrompt.length,
    })

    const modelDisplay = wasAllModels
      ? isRu
        ? 'Все модели'
        : 'All models'
      : lastResult.model

    // Re-trigger processing with same settings
    await ctx.reply(
      isRu
        ? `🔄 Повторяю генерацию с настройками:\n📝 Промпт: ${lastPrompt}\n🤖 Модель: ${modelDisplay}\n\n⏳ Генерирую...`
        : `🔄 Repeating generation with settings:\n📝 Prompt: ${lastPrompt}\n🤖 Model: ${modelDisplay}\n\n⏳ Generating...`
    )

    // Process with same prompt and settings
    await processAiPhotoshopRequest(ctx, lastPrompt)
  } catch (error) {
    logger.error('Error continuing with same settings', { error })
  }
})

// Variations count menu handler
aiPhotoshopScene.action('ai_photoshop_variations_menu', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    const currentCount = ctx.session?.aiPhotoshopVariationsCount || 1

    await ctx.editMessageText(
      isRu
        ? `🔢 *Выберите количество вариаций для генерации:*\n\n📊 Текущее: ${currentCount}\n\n💡 Большее количество = больше разнообразия, но выше стоимость!`
        : `🔢 *Choose number of variations to generate:*\n\n📊 Current: ${currentCount}\n\n💡 More variations = more diversity, but higher cost!`,
      {
        parse_mode: 'Markdown',
        reply_markup: createVariationsKeyboard(isRu).reply_markup,
      }
    )
  } catch (error) {
    logger.error('Error showing variations menu', { error })
  }
})

// Aspect ratio menu handler
aiPhotoshopScene.action('ai_photoshop_aspect_ratio_menu', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    await ctx.editMessageText(
      isRu
        ? '📏 *Выберите соотношение сторон для следующей генерации:*\n\n🔲 Формат изображения будет применён при следующей обработке.'
        : '📏 *Choose aspect ratio for next generation:*\n\n🔲 Image format will be applied on next processing.',
      {
        parse_mode: 'Markdown',
        reply_markup: createAspectRatioKeyboard(isRu).reply_markup,
      }
    )
  } catch (error) {
    logger.error('Error showing aspect ratio menu', { error })
  }
})

// Camera angle selection handlers
Object.keys(AI_PHOTOSHOP_CAMERA_ANGLES).forEach(angle => {
  aiPhotoshopScene.action(`ai_photoshop_camera_${angle}`, async ctx => {
    try {
      await ctx.answerCbQuery()
      const isRu = isRussianFromState(ctx)

      // Store camera angle in session
      if (ctx.session) {
        ctx.session.aiPhotoshopCameraAngle = angle as
          | 'medium_shot'
          | 'close_up'
          | 'extreme_close_up'
          | 'wide_shot'
          | 'high_angle'
          | 'low_angle'
          | 'dutch_angle'
          | 'over_shoulder'
          | 'profile_shot'
          | 'three_quarter'
          | 'bird_eye'
          | 'macro_beauty'
      }

      const angleLabel = getCameraAngleLabel(angle, isRu)
      const cameraPrompt =
        AI_PHOTOSHOP_CAMERA_ANGLES[
          angle as keyof typeof AI_PHOTOSHOP_CAMERA_ANGLES
        ]

      // ✅ NEW: Check if we have photo - if yes, request prompt; if no, request photo
      const hasPhoto = !!ctx.session?.aiPhotoshopImage
      const hasModel = !!ctx.session?.aiPhotoshopModel

      if (hasPhoto && hasModel) {
        // Photo already uploaded, request prompt
        if (ctx.session) {
          ctx.session.aiPhotoshopStep = 'custom_prompt'
          ctx.session.awaitingAiPhotoshopPrompt = true
        }

        await ctx.editMessageText(
          isRu
            ? `✅ *Ракурс камеры выбран:* ${angleLabel}\n\n📝 Промпт добавлен: \`${cameraPrompt}\`\n\n💬 *Теперь опишите, как обработать изображение:*`
            : `✅ *Camera angle selected:* ${angleLabel}\n\n📝 Prompt added: \`${cameraPrompt}\`\n\n💬 *Now describe how to process the image:*`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  Markup.button.callback(
                    isRu ? 'Отмена' : 'Cancel',
                    'ai_photoshop_cancel'
                  ),
                ],
              ],
            },
          }
        )
      } else if (hasModel) {
        // Model selected but no photo, request photo
        if (ctx.session) {
          ctx.session.aiPhotoshopStep = 'image_upload'
          ctx.session.awaitingAiPhotoshopImage = true
        }

        await ctx.editMessageText(
          isRu
            ? `✅ *Ракурс камеры выбран:* ${angleLabel}\n\n📝 Промпт добавлен: \`${cameraPrompt}\`\n\n📸 *Отправьте изображение для обработки:*`
            : `✅ *Camera angle selected:* ${angleLabel}\n\n📝 Prompt added: \`${cameraPrompt}\`\n\n📸 *Send an image for processing:*`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  Markup.button.callback(
                    isRu ? 'Отмена' : 'Cancel',
                    'ai_photoshop_cancel'
                  ),
                ],
              ],
            },
          }
        )
      } else {
        // No model selected, just show confirmation
        await ctx.editMessageText(
          isRu
            ? `✅ *Ракурс камеры выбран:* ${angleLabel}\n\n📝 Промпт добавлен: \`${cameraPrompt}\`\n\n💡 Выберите другие настройки или вернитесь назад.`
            : `✅ *Camera angle selected:* ${angleLabel}\n\n📝 Prompt added: \`${cameraPrompt}\`\n\n💡 Choose other settings or go back.`,
          {
            parse_mode: 'Markdown',
            reply_markup: createCameraAngleKeyboard(isRu).reply_markup,
          }
        )
      }
    } catch (error) {
      logger.error('Error handling camera angle selection', { error, angle })
    }
  })
})

// Lighting selection handlers
Object.keys(AI_PHOTOSHOP_LIGHTING_SETUPS).forEach(lighting => {
  aiPhotoshopScene.action(`ai_photoshop_lighting_${lighting}`, async ctx => {
    try {
      await ctx.answerCbQuery()
      const isRu = isRussianFromState(ctx)

      // Store lighting in session
      if (ctx.session) {
        ctx.session.aiPhotoshopLighting = lighting as
          | 'soft_natural'
          | 'dramatic'
          | 'golden_hour'
          | 'studio'
          | 'rembrandt'
          | 'butterfly'
          | 'split'
          | 'rim'
          | 'candlelight'
          | 'neon_noir'
          | 'morning'
          | 'sunset'
      }

      const lightingLabel = getLightingLabel(lighting, isRu)
      const lightingPrompt =
        AI_PHOTOSHOP_LIGHTING_SETUPS[
          lighting as keyof typeof AI_PHOTOSHOP_LIGHTING_SETUPS
        ]

      // ✅ NEW: Check if we have photo - if yes, request prompt; if no, request photo
      const hasPhoto = !!ctx.session?.aiPhotoshopImage
      const hasModel = !!ctx.session?.aiPhotoshopModel

      if (hasPhoto && hasModel) {
        // Photo already uploaded, request prompt
        if (ctx.session) {
          ctx.session.aiPhotoshopStep = 'custom_prompt'
          ctx.session.awaitingAiPhotoshopPrompt = true
        }

        await ctx.editMessageText(
          isRu
            ? `✅ *Освещение выбрано:* ${lightingLabel}\n\n📝 Промпт добавлен: \`${lightingPrompt}\`\n\n💬 *Теперь опишите, как обработать изображение:*`
            : `✅ *Lighting selected:* ${lightingLabel}\n\n📝 Prompt added: \`${lightingPrompt}\`\n\n💬 *Now describe how to process the image:*`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  Markup.button.callback(
                    isRu ? 'Отмена' : 'Cancel',
                    'ai_photoshop_cancel'
                  ),
                ],
              ],
            },
          }
        )
      } else if (hasModel) {
        // Model selected but no photo, request photo
        if (ctx.session) {
          ctx.session.aiPhotoshopStep = 'image_upload'
          ctx.session.awaitingAiPhotoshopImage = true
        }

        await ctx.editMessageText(
          isRu
            ? `✅ *Освещение выбрано:* ${lightingLabel}\n\n📝 Промпт добавлен: \`${lightingPrompt}\`\n\n📸 *Отправьте изображение для обработки:*`
            : `✅ *Lighting selected:* ${lightingLabel}\n\n📝 Prompt added: \`${lightingPrompt}\`\n\n📸 *Send an image for processing:*`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  Markup.button.callback(
                    isRu ? 'Отмена' : 'Cancel',
                    'ai_photoshop_cancel'
                  ),
                ],
              ],
            },
          }
        )
      } else {
        // No model selected, just show confirmation
        await ctx.editMessageText(
          isRu
            ? `✅ *Освещение выбрано:* ${lightingLabel}\n\n📝 Промпт добавлен: \`${lightingPrompt}\`\n\n💡 Выберите другие настройки или вернитесь назад.`
            : `✅ *Lighting selected:* ${lightingLabel}\n\n📝 Prompt added: \`${lightingPrompt}\`\n\n💡 Choose other settings or go back.`,
          {
            parse_mode: 'Markdown',
            reply_markup: createLightingKeyboard(isRu).reply_markup,
          }
        )
      }
    } catch (error) {
      logger.error('Error handling lighting selection', { error, lighting })
    }
  })
})

// Composition selection handlers
Object.keys(AI_PHOTOSHOP_FRAME_COMPOSITION).forEach(composition => {
  aiPhotoshopScene.action(
    `ai_photoshop_composition_${composition}`,
    async ctx => {
      try {
        await ctx.answerCbQuery()
        const isRu = isRussianFromState(ctx)

        // Store composition in session
        if (ctx.session) {
          ctx.session.aiPhotoshopComposition = composition as
            | 'center_weighted'
            | 'rule_thirds'
            | 'golden_ratio'
            | 'symmetrical'
            | 'negative_space'
            | 'leading_lines'
        }

        const compositionLabel = getCompositionLabel(composition, isRu)
        const compositionPrompt =
          AI_PHOTOSHOP_FRAME_COMPOSITION[
            composition as keyof typeof AI_PHOTOSHOP_FRAME_COMPOSITION
          ]

        // ✅ NEW: Check if we have photo - if yes, request prompt; if no, request photo
        const hasPhoto = !!ctx.session?.aiPhotoshopImage
        const hasModel = !!ctx.session?.aiPhotoshopModel

        if (hasPhoto && hasModel) {
          // Photo already uploaded, request prompt
          if (ctx.session) {
            ctx.session.aiPhotoshopStep = 'custom_prompt'
            ctx.session.awaitingAiPhotoshopPrompt = true
          }

          await ctx.editMessageText(
            isRu
              ? `✅ *Композиция выбрана:* ${compositionLabel}\n\n📝 Промпт добавлен: \`${compositionPrompt}\`\n\n💬 *Теперь опишите, как обработать изображение:*`
              : `✅ *Composition selected:* ${compositionLabel}\n\n📝 Prompt added: \`${compositionPrompt}\`\n\n💬 *Now describe how to process the image:*`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [
                    Markup.button.callback(
                      isRu ? 'Отмена' : 'Cancel',
                      'ai_photoshop_cancel'
                    ),
                  ],
                ],
              },
            }
          )
        } else if (hasModel) {
          // Model selected but no photo, request photo
          if (ctx.session) {
            ctx.session.aiPhotoshopStep = 'image_upload'
            ctx.session.awaitingAiPhotoshopImage = true
          }

          await ctx.editMessageText(
            isRu
              ? `✅ *Композиция выбрана:* ${compositionLabel}\n\n📝 Промпт добавлен: \`${compositionPrompt}\`\n\n📸 *Отправьте изображение для обработки:*`
              : `✅ *Composition selected:* ${compositionLabel}\n\n📝 Prompt added: \`${compositionPrompt}\`\n\n📸 *Send an image for processing:*`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [
                    Markup.button.callback(
                      isRu ? 'Отмена' : 'Cancel',
                      'ai_photoshop_cancel'
                    ),
                  ],
                ],
              },
            }
          )
        } else {
          // No model selected, just show confirmation
          await ctx.editMessageText(
            isRu
              ? `✅ *Композиция выбрана:* ${compositionLabel}\n\n📝 Промпт добавлен: \`${compositionPrompt}\`\n\n💡 Выберите другие настройки или вернитесь назад.`
              : `✅ *Composition selected:* ${compositionLabel}\n\n📝 Prompt added: \`${compositionPrompt}\`\n\n💡 Choose other settings or go back.`,
            {
              parse_mode: 'Markdown',
              reply_markup: createCompositionKeyboard(isRu).reply_markup,
            }
          )
        }
      } catch (error) {
        logger.error('Error handling composition selection', {
          error,
          composition,
        })
      }
    }
  )
})

// Variations count selection handlers
const variationsHandlers = [1, 2, 3, 4, 10, 20, 30, 50]

variationsHandlers.forEach(count => {
  aiPhotoshopScene.action(`ai_photoshop_variations_${count}`, async ctx => {
    try {
      await ctx.answerCbQuery()
      const isRu = isRussianFromState(ctx)

      // Store variations count in session
      if (ctx.session) {
        ctx.session.aiPhotoshopVariationsCount = count
      }

      logger.info('AI Photoshop: Variations count selected', {
        telegramId: ctx.from?.id,
        variationsCount: count,
      })

      await ctx.editMessageText(
        isRu
          ? `✅ *Количество вариаций выбрано:* ${count}\n\n🔢 При следующей генерации будет создано ${count} ${count === 1 ? 'изображение' : count < 5 ? 'изображения' : 'изображений'}.\n\n💰 Стоимость будет умножена на ${count}.\n\n💡 Больше вариаций = больше разнообразия для выбора!`
          : `✅ *Variations count selected:* ${count}\n\n🔢 Next generation will create ${count} image${count > 1 ? 's' : ''}.\n\n💰 Cost will be multiplied by ${count}.\n\n💡 More variations = more diversity to choose from!`,
        {
          parse_mode: 'Markdown',
          reply_markup: createVariationsKeyboard(isRu).reply_markup,
        }
      )
    } catch (error) {
      logger.error('Error handling variations selection', { error, count })
    }
  })
})

// Aspect ratio selection handlers
const aspectRatioHandlers = [
  {
    key: '1_1',
    ratio: '1:1',
    labelRu: '🔲 1:1 (Квадрат)',
    labelEn: '🔲 1:1 (Square)',
    sizeKey: '1K',
  },
  {
    key: '16_9',
    ratio: '16:9',
    labelRu: '📺 16:9 (Широкий)',
    labelEn: '📺 16:9 (Wide)',
    sizeKey: '4K',
  },
  {
    key: '9_16',
    ratio: '9:16',
    labelRu: '📱 9:16 (Портрет)',
    labelEn: '📱 9:16 (Portrait)',
    sizeKey: '2K',
  },
  {
    key: '4_3',
    ratio: '4:3',
    labelRu: '🖼️ 4:3 (Стандарт)',
    labelEn: '🖼️ 4:3 (Standard)',
    sizeKey: '1K',
  },
  {
    key: '3_4',
    ratio: '3:4',
    labelRu: '🖼️ 3:4 (Портрет)',
    labelEn: '🖼️ 3:4 (Portrait)',
    sizeKey: '1K',
  },
  {
    key: '21_9',
    ratio: '21:9',
    labelRu: '🎬 21:9 (Кино)',
    labelEn: '🎬 21:9 (Cinema)',
    sizeKey: '4K',
  },
  {
    key: '9_21',
    ratio: '9:21',
    labelRu: '🎬 9:21 (Портрет)',
    labelEn: '🎬 9:21 (Portrait)',
    sizeKey: '2K',
  },
]

aspectRatioHandlers.forEach(({ key, ratio, labelRu, labelEn, sizeKey }) => {
  aiPhotoshopScene.action(`ai_photoshop_ratio_${key}`, async ctx => {
    try {
      await ctx.answerCbQuery()
      const isRu = isRussianFromState(ctx)

      // Store aspect ratio as size in session (matching the sizeToAspectRatio mapping)
      if (ctx.session) {
        ctx.session.aiPhotoshopSize = sizeKey as '1K' | '2K' | '4K' | 'custom'
      }

      await ctx.editMessageText(
        isRu
          ? `✅ *Соотношение сторон выбрано:* ${labelRu}\n\n📏 Размер установлен: ${sizeKey} (${ratio})\n\n💡 Это соотношение будет применено при следующей генерации.`
          : `✅ *Aspect ratio selected:* ${labelEn}\n\n📏 Size set: ${sizeKey} (${ratio})\n\n💡 This ratio will be applied on next generation.`,
        {
          parse_mode: 'Markdown',
          reply_markup: createAspectRatioKeyboard(isRu).reply_markup,
        }
      )
    } catch (error) {
      logger.error('Error handling aspect ratio selection', { error, ratio })
    }
  })
})

// Auto-select handlers
aiPhotoshopScene.action('ai_photoshop_camera_auto', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    // Auto-select a popular camera angle
    const autoAngle = 'medium_shot'
    if (ctx.session) {
      ctx.session.aiPhotoshopCameraAngle = autoAngle
    }

    const angleLabel = getCameraAngleLabel(autoAngle, isRu)
    await ctx.editMessageText(
      isRu
        ? `✅ *Автовыбор ракурса:* ${angleLabel}\n\n💡 Теперь напишите текст для обработки фотографии или выберите другие настройки.`
        : `✅ *Auto-selected angle:* ${angleLabel}\n\n💡 Now write text to process the photo or choose other settings.`,
      {
        parse_mode: 'Markdown',
        reply_markup: createCameraAngleKeyboard(isRu).reply_markup,
      }
    )
  } catch (error) {
    logger.error('Error in camera auto-select', { error })
  }
})

aiPhotoshopScene.action('ai_photoshop_lighting_auto', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    // Auto-select popular lighting
    const autoLighting = 'soft_natural'
    if (ctx.session) {
      ctx.session.aiPhotoshopLighting = autoLighting
    }

    const lightingLabel = getLightingLabel(autoLighting, isRu)
    await ctx.editMessageText(
      isRu
        ? `✅ *Автовыбор освещения:* ${lightingLabel}\n\n💡 Теперь напишите текст для обработки фотографии или выберите другие настройки.`
        : `✅ *Auto-selected lighting:* ${lightingLabel}\n\n💡 Now write text to process the photo or choose other settings.`,
      {
        parse_mode: 'Markdown',
        reply_markup: createLightingKeyboard(isRu).reply_markup,
      }
    )
  } catch (error) {
    logger.error('Error in lighting auto-select', { error })
  }
})

aiPhotoshopScene.action('ai_photoshop_composition_auto', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    // Auto-select popular composition
    const autoComposition = 'rule_thirds'
    if (ctx.session) {
      ctx.session.aiPhotoshopComposition = autoComposition
    }

    const compositionLabel = getCompositionLabel(autoComposition, isRu)
    await ctx.editMessageText(
      isRu
        ? `✅ *Автовыбор композиции:* ${compositionLabel}\n\n💡 Теперь напишите текст для обработки фотографии или выберите другие настройки.`
        : `✅ *Auto-selected composition:* ${compositionLabel}\n\n💡 Now write text to process the photo or choose other settings.`,
      {
        parse_mode: 'Markdown',
        reply_markup: createCompositionKeyboard(isRu).reply_markup,
      }
    )
  } catch (error) {
    logger.error('Error in composition auto-select', { error })
  }
})

// Back to main camera control handler
aiPhotoshopScene.action('ai_photoshop_back_to_main', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    // Show dialog mode menu if we have saved results
    if (
      ctx.session?.savedAiPhotoshopResults &&
      ctx.session.savedAiPhotoshopResults.length > 0
    ) {
      await showDialogInterface(ctx)
    } else {
      // Show initial model selection
      await ctx.editMessageText(
        isRu
          ? '🎨 *AI Photoshop* - профессиональное редактирование изображений с помощью ИИ\n\nВыберите модель ИИ для обработки:'
          : '🎨 *AI Photoshop* - professional image editing with AI\n\nChoose AI model for processing:',
        {
          parse_mode: 'Markdown',
          reply_markup: createModelSelectionKeyboard(isRu).reply_markup,
        }
      )
    }
  } catch (error) {
    logger.error('Error going back to main', { error })
  }
})

export default aiPhotoshopScene
