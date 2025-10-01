import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '../../utils/logger'
import { saveFileLocally } from '@/helpers/saveFileLocally'
import fs from 'fs'
import path from 'path'
// ✅ AI PHOTOSHOP DIALOG VALIDATION (local types for production)
enum UserInputTypeEnum {
  TEXT = 'text',
  IMAGE = 'image',
  COMMAND = 'command'
}

enum DialogStateEnum {
  WAITING_INPUT = 'waiting_input',
  PROCESSING = 'processing',
  COMPLETED = 'completed'
}

// Simple validation function for production
function validateUserInput(input: any): { success: boolean; data?: any; error?: string } {
  if (!input || typeof input !== 'object') {
    return { success: false, error: 'Invalid input' }
  }
  return { success: true, data: input }
}
import { promisify } from 'util'
import { calculateFinalPriceInStars } from '@/interfaces/paidServices'

const writeFile = promisify(fs.writeFile)
const mkdir = promisify(fs.mkdir)

// Log when this module loads
logger.info('🚨 AI Photoshop: Scene module loading...');
import { generateSeeDream4 } from '@/services/generateSeeDream4'
import { generateNanoBanana } from '@/services/generateNanoBanana'
import { generateFluxKontextMax } from '@/services/generateFluxKontextMax'
import { generateQwenImageEditPlus } from '@/services/generateQwenImageEditPlus'
// ✅ IMPORT MULTI-PHOTO SUPPORT FOR AI PHOTOSHOP
import { detectMultiPhotoUpload, handleMultiPhotoNeurophoto, checkMultiPhotoEvents } from '@/handlers/multiPhotoHandler'
import { getBotToken } from '@/handlers/getBotToken'
// ✅ IMPORT UPSCALER FOR DIALOG MODE
import { upscaleImage } from '@/services/imageUpscaler'

// 🎬 CAMERA CONTROL SYSTEM (transferred from FLUX Kontext)
export const AI_PHOTOSHOP_CAMERA_ANGLES = {
  medium_shot: '[camera: medium shot, balanced composition, natural perspective]',
  close_up: '[camera: close-up shot, intimate detail, emotional connection]',
  extreme_close_up: '[camera: extreme close-up, fine detail focus, artistic impact]',
  wide_shot: '[camera: wide shot, environmental context, spacious composition]',
  high_angle: '[camera: high angle shot, looking down, vulnerable perspective]',
  low_angle: '[camera: low angle shot, looking up, empowering perspective]',
  dutch_angle: '[camera: dutch angle, dynamic tilt, creative composition]',
  over_shoulder: '[camera: over-the-shoulder shot, intimate perspective]',
  profile_shot: '[camera: profile shot, sculptural beauty, classic elegance]',
  three_quarter: '[camera: three-quarter view, dimensional depth, natural pose]',
  bird_eye: "[camera: bird's eye view, top-down perspective, unique angle]",
  macro_beauty: '[camera: macro beauty shot, skin texture perfection, luxury detail]',
}

// 🖼️ FRAME COMPOSITION (Professional Photography)
export const AI_PHOTOSHOP_FRAME_COMPOSITION = {
  center_weighted: '[composition: center-weighted balance, professional stability]',
  rule_thirds: '[composition: rule of thirds, dynamic balance, photographic standard]',
  golden_ratio: '[composition: golden ratio portrait, mathematical beauty, perfect proportion]',
  symmetrical: '[composition: symmetrical perfection, luxury brand precision, flawless geometry]',
  negative_space: '[composition: negative space elegant, minimalist sophistication]',
  leading_lines: '[composition: leading lines flow, premium visual journey, luxury storytelling]',
}

// ✨ PROFESSIONAL LIGHTING SETUPS
export const AI_PHOTOSHOP_LIGHTING_SETUPS = {
  soft_natural: '[lighting: soft natural light, gentle illumination, flattering glow]',
  dramatic: '[lighting: dramatic lighting, high contrast, artistic shadows]',
  golden_hour: '[lighting: golden hour warmth, magical illumination, perfect timing]',
  studio: '[lighting: professional studio setup, perfect illumination, commercial quality]',
  rembrandt: '[lighting: rembrandt lighting, classic portrait technique, artistic shadows]',
  butterfly: '[lighting: butterfly lighting, glamour technique, facial contouring]',
  split: '[lighting: split lighting, dramatic contrast, artistic division]',
  rim: '[lighting: rim lighting, edge illumination, subject separation]',
  candlelight: '[lighting: warm candlelight, intimate atmosphere, cozy ambiance]',
  neon_noir: '[lighting: neon noir, urban atmosphere, cyberpunk aesthetic]',
  morning: '[lighting: fresh morning light, clean illumination, new day energy]',
  sunset: "[lighting: warm sunset glow, romantic illumination, day's end beauty]",
}

// 🎨 AI PHOTOSHOP MODELS CONFIGURATION WITH MULTI-IMAGE SUPPORT
const AI_PHOTOSHOP_MODELS = {
  seedream: {
    title_ru: '🎭 SeeDream-4',
    title_en: '🎭 SeeDream-4',
    description_ru: 'ByteDance SeeDream-4 - Продвинутая генерация и трансформация изображений',
    description_en: 'ByteDance SeeDream-4 - Advanced image generation and transformation',
    cost: 5, // stars - Updated: Replicate actual price $0.03
    key: 'seedream',
    supports_image_input: true,
    supports_text_only: true,
    supports_multi_image: true, // ✅ NEW: Multi-image support
    max_images: 10 // Updated from 5 to 10
  },
  nano_banana: {
    title_ru: '🍌 Nano Banana',
    title_en: '🍌 Nano Banana',
    description_ru: 'Google Nano Banana - ИИ редактирование на базе Gemini 2.5',
    description_en: 'Google Nano Banana - AI editing powered by Gemini 2.5',
    cost: 7, // stars - Updated: Replicate actual price $0.039
    key: 'nano_banana',
    supports_image_input: true,
    supports_text_only: false,
    supports_multi_image: true, // ✅ NEW: Multi-image support
    max_images: 3
  },
  flux_max: {
    title_ru: '🚀 FLUX Kontext Max',
    title_en: '🚀 FLUX Kontext Max',
    description_ru: 'Black Forest Labs FLUX Kontext Max - Профессиональное редактирование',
    description_en: 'Black Forest Labs FLUX Kontext Max - Professional editing',
    cost: 13, // stars - Updated: Replicate actual price $0.08
    key: 'flux_max',
    supports_image_input: true,
    supports_text_only: false,
    supports_multi_image: false, // ❌ FIXED: FLUX Max поддерживает только ОДНО изображение
    max_images: 1
  },
  qwen_edit_plus: {
    title_ru: '🎨 Qwen Image Edit Plus',
    title_en: '🎨 Qwen Image Edit Plus',
    description_ru: 'Qwen Image Edit Plus - Продвинутое редактирование множественных изображений',
    description_en: 'Qwen Image Edit Plus - Advanced multi-image editing with improved consistency',
    cost: 5, // stars - Replicate price $0.03
    key: 'qwen_edit_plus',
    supports_image_input: true,
    supports_text_only: false,
    supports_multi_image: true, // ✅ Multi-image support
    max_images: 10
  }
}

// 🎨 PROMPT TEMPLATES FOR DIFFERENT STYLES
const AI_PHOTOSHOP_STYLES = {
  portrait: {
    title_ru: '👤 Портрет',
    title_en: '👤 Portrait',
    template: 'professional portrait, high quality, studio lighting, detailed face'
  },
  artistic: {
    title_ru: '🎨 Художественный',
    title_en: '🎨 Artistic',
    template: 'artistic style, creative composition, vibrant colors, detailed artwork'
  },
  photorealistic: {
    title_ru: '📸 Фотореализм',
    title_en: '📸 Photorealistic',
    template: 'photorealistic, ultra detailed, high resolution, professional photography'
  },
  fantasy: {
    title_ru: '🧙‍♂️ Фэнтези',
    title_en: '🧙‍♂️ Fantasy',
    template: 'fantasy style, magical atmosphere, mystical elements, epic composition'
  },
  cyberpunk: {
    title_ru: '🤖 Киберпанк',
    title_en: '🤖 Cyberpunk',
    template: 'cyberpunk style, neon lights, futuristic, technological atmosphere'
  },
  vintage: {
    title_ru: '📻 Винтаж',
    title_en: '📻 Vintage',
    template: 'vintage style, retro aesthetic, classic composition, nostalgic mood'
  },
  figure_3d: {
    title_ru: '🖨️ 3D Фигурка',
    title_en: '🖨️ 3D Figure',
    template: 'turn this photo into a character figure. Behind it, place a box with the character\'s image printed on it, and a computer showing the Blender modeling process on its screen. In front of the box, add a round plastic base with the character figure standing on it. set the scene indoors if possible'
  }
}

// Create the scene
export const aiPhotoshopScene = new Scenes.BaseScene<MyContext>('ai_photoshop_scene')

// Function to create model selection keyboard
const createModelSelectionKeyboard = (isRu: boolean) => {
  const keyboard = []

  // Add models 2 per row
  const models = Object.entries(AI_PHOTOSHOP_MODELS)
  for (let i = 0; i < models.length; i += 2) {
    const row = []
    const [modelKey1, model1] = models[i]
    row.push(
      Markup.button.callback(
        `${isRu ? model1.title_ru : model1.title_en} (${model1.cost}⭐)`,
        `ai_photoshop_model_${modelKey1}`
      )
    )

    if (i + 1 < models.length) {
      const [modelKey2, model2] = models[i + 1]
      row.push(
        Markup.button.callback(
          `${isRu ? model2.title_ru : model2.title_en} (${model2.cost}⭐)`,
          `ai_photoshop_model_${modelKey2}`
        )
      )
    }

    keyboard.push(row)
  }

  // ✅ Add "All at once" button
  const totalCostAllModels = Object.values(AI_PHOTOSHOP_MODELS).reduce((sum, model) => sum + model.cost, 0)
  keyboard.push([
    Markup.button.callback(
      isRu ? `🎯 Все сразу (${totalCostAllModels}⭐)` : `🎯 All at once (${totalCostAllModels}⭐)`,
      'ai_photoshop_all_models_from_selector'
    )
  ])

  // Add cancel button
  keyboard.push([
    Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'ai_photoshop_cancel')
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

  return labels[lighting] ? (isRu ? labels[lighting].ru : labels[lighting].en) : lighting
}

const getCompositionLabel = (composition: string, isRu: boolean): string => {
  const labels: Record<string, { ru: string; en: string }> = {
    center_weighted: { ru: '⚖️ Центровес', en: '⚖️ Center Weighted' },
    rule_thirds: { ru: '📐 Правило третей', en: '📐 Rule of Thirds' },
    golden_ratio: { ru: '🌟 Золотое сечение', en: '🌟 Golden Ratio' },
    symmetrical: { ru: '🔄 Симметрия', en: '🔄 Symmetrical' },
    negative_space: { ru: '🌌 Негативное пространство', en: '🌌 Negative Space' },
    leading_lines: { ru: '📏 Направляющие линии', en: '📏 Leading Lines' },
  }

  return labels[composition] ? (isRu ? labels[composition].ru : labels[composition].en) : composition
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
    Markup.button.callback(isRu ? 'Назад' : 'Back', 'ai_photoshop_back_to_main'),
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
      Markup.button.callback(lighting1Label, `ai_photoshop_lighting_${lighting1}`)
    )

    if (i + 1 < lightings.length) {
      const lighting2 = lightings[i + 1]
      const lighting2Label = getLightingLabel(lighting2, isRu)
      row.push(
        Markup.button.callback(lighting2Label, `ai_photoshop_lighting_${lighting2}`)
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
    Markup.button.callback(isRu ? 'Назад' : 'Back', 'ai_photoshop_back_to_main'),
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
      Markup.button.callback(composition1Label, `ai_photoshop_composition_${composition1}`)
    )

    if (i + 1 < compositions.length) {
      const composition2 = compositions[i + 1]
      const composition2Label = getCompositionLabel(composition2, isRu)
      row.push(
        Markup.button.callback(composition2Label, `ai_photoshop_composition_${composition2}`)
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
    Markup.button.callback(isRu ? 'Назад' : 'Back', 'ai_photoshop_back_to_main'),
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
    { count: 50, label: '50' }
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
    Markup.button.callback(isRu ? '🔙 Назад' : '🔙 Back', 'ai_photoshop_back_to_main'),
  ])

  return Markup.inlineKeyboard(keyboard)
}

// Function to create aspect ratio selection keyboard
const createAspectRatioKeyboard = (isRu: boolean) => {
  const aspectRatios = [
    { key: '1:1', labelRu: '🔲 1:1 (Квадрат)', labelEn: '🔲 1:1 (Square)' },
    { key: '16:9', labelRu: '📺 16:9 (Широкий)', labelEn: '📺 16:9 (Wide)' },
    { key: '9:16', labelRu: '📱 9:16 (Портрет)', labelEn: '📱 9:16 (Portrait)' },
    { key: '4:3', labelRu: '🖼️ 4:3 (Стандарт)', labelEn: '🖼️ 4:3 (Standard)' },
    { key: '3:4', labelRu: '🖼️ 3:4 (Портрет)', labelEn: '🖼️ 3:4 (Portrait)' },
    { key: '21:9', labelRu: '🎬 21:9 (Кино)', labelEn: '🎬 21:9 (Cinema)' },
    { key: '9:21', labelRu: '🎬 9:21 (Портрет)', labelEn: '🎬 9:21 (Portrait)' }
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
    Markup.button.callback(isRu ? '🔙 Назад' : '🔙 Back', 'ai_photoshop_back_to_main'),
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
    )
  ])

  keyboard.push([
    Markup.button.callback(isRu ? 'Назад' : 'Back', 'ai_photoshop_back_to_models'),
    Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'ai_photoshop_cancel')
  ])

  return Markup.inlineKeyboard(keyboard)
}

// Scene entry
aiPhotoshopScene.enter(async ctx => {
  try {
    logger.info('🚨 AI Photoshop: Entering scene', {
      telegramId: ctx.from?.id,
      sessionExists: !!ctx.session
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
      logger.info('🎨 AI Photoshop: Continuing in dialog mode with saved photos', {
        telegramId: ctx.from?.id,
        savedPhotosCount: ctx.session?.savedAiPhotoshopResults?.length
      })
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

🎭 *SeeDream-4* - Генерация и трансформация (5⭐, до 10 фото)
🍌 *Nano Banana* - ИИ редактирование Gemini 2.5 (7⭐, до 3 фото)
🚀 *FLUX Kontext Max* - Профессиональное (13⭐, 1 фото)
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

🎭 *SeeDream-4* - Generation and transformation (5⭐, up to 10 photos)
🍌 *Nano Banana* - AI editing powered by Gemini 2.5 (7⭐, up to 3 photos)
🚀 *FLUX Kontext Max* - Professional editing (13⭐, single photo)
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

      const model = AI_PHOTOSHOP_MODELS[modelKey as keyof typeof AI_PHOTOSHOP_MODELS]
      const modelTitle = isRu ? model.title_ru : model.title_en
      const modelDescription = isRu ? model.description_ru : model.description_en

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
      sessionStateBefore: ctx.session ? {
        aiPhotoshopModel: ctx.session.aiPhotoshopModel,
        awaitingAiPhotoshopImage: ctx.session.awaitingAiPhotoshopImage
      } : null
    })

    // Set session to indicate multi-model processing
    if (ctx.session) {
      ctx.session.aiPhotoshopModel = 'all_models' as any
      ctx.session.aiPhotoshopStep = 'quality_selection'
      ctx.session.awaitingAiPhotoshopImage = false

      // 🚨 CRITICAL DEBUG: Log after setting
      logger.info('🎯 AI Photoshop: Session UPDATED for ALL_MODELS quality selection', {
        telegramId: ctx.from?.id,
        aiPhotoshopModel: ctx.session.aiPhotoshopModel,
        awaitingAiPhotoshopImage: ctx.session.awaitingAiPhotoshopImage,
        aiPhotoshopStep: ctx.session.aiPhotoshopStep
      })
    }

    // ✅ Calculate costs for all quality levels
    const baseCost = Object.values(AI_PHOTOSHOP_MODELS).reduce((sum, model) => sum + model.cost, 0)
    const modelNames = Object.values(AI_PHOTOSHOP_MODELS).map(model =>
      isRu ? model.title_ru : model.title_en
    )

    // Quality multipliers based on single model pricing
    const quality1KCost = baseCost // 30⭐ (5+7+13+5)
    const quality2KCost = baseCost * 4 // 120⭐ (20×4 vs 5×4)
    const quality4KCost = baseCost * 6 // 180⭐ (30×4 vs 5×4)

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
                text: isRu ? `1K - ${quality1KCost}⭐` : `1K - ${quality1KCost}⭐`,
                callback_data: 'ai_photoshop_all_models_size_1K'
              }
            ],
            [
              {
                text: isRu ? `2K - ${quality2KCost}⭐` : `2K - ${quality2KCost}⭐`,
                callback_data: 'ai_photoshop_all_models_size_2K'
              }
            ],
            [
              {
                text: isRu ? `4K - ${quality4KCost}⭐` : `4K - ${quality4KCost}⭐`,
                callback_data: 'ai_photoshop_all_models_size_4K'
              }
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
          ]
        }
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
        ctx.session.aiPhotoshopStep = 'image_upload'
        ctx.session.awaitingAiPhotoshopImage = true
      }

      const style = AI_PHOTOSHOP_STYLES[styleKey as keyof typeof AI_PHOTOSHOP_STYLES]
      const styleTitle = isRu ? style.title_ru : style.title_en
      const model = AI_PHOTOSHOP_MODELS[ctx.session?.aiPhotoshopModel as keyof typeof AI_PHOTOSHOP_MODELS]

      await ctx.editMessageText(
        isRu
          ? `✅ *Модель:* ${isRu ? model?.title_ru : model?.title_en}\n🎨 *Стиль:* ${styleTitle}\n\n📷 Отправьте изображение для обработки:`
          : `✅ *Model:* ${isRu ? model?.title_ru : model?.title_en}\n🎨 *Style:* ${styleTitle}\n\n📷 Send an image for processing:`,
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
      logger.error('Error handling style selection', {
        error: error instanceof Error ? error.message : 'Unknown error',
        telegramId: ctx.from?.id,
        style: styleKey,
      })
    }
  })
})

// Handle custom prompt selection
aiPhotoshopScene.action('ai_photoshop_custom_prompt', async ctx => {
  try {
    logger.info('🚨 AI Photoshop: Custom prompt button clicked!', {
      telegramId: ctx.from?.id,
      callbackData: (ctx.callbackQuery as any)?.data
    })

    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    if (ctx.session) {
      ctx.session.aiPhotoshopStyle = 'custom'
      ctx.session.aiPhotoshopStep = 'custom_prompt'
      ctx.session.awaitingAiPhotoshopImage = false
      ctx.session.awaitingAiPhotoshopPrompt = true
    }

    logger.info('🎨 AI Photoshop: Custom prompt selected, requesting prompt first', {
      telegramId: ctx.from?.id,
      newState: {
        aiPhotoshopStyle: 'custom',
        aiPhotoshopStep: 'custom_prompt',
        awaitingAiPhotoshopImage: false,
        awaitingAiPhotoshopPrompt: true
      }
    })

    const model = AI_PHOTOSHOP_MODELS[ctx.session?.aiPhotoshopModel as keyof typeof AI_PHOTOSHOP_MODELS]

    await ctx.editMessageText(
      isRu
        ? `✅ *Модель:* ${isRu ? model?.title_ru : model?.title_en}\n✍️ *Стиль:* Пользовательский промпт\n\n💬 Опишите, как обработать изображение:\n\n💡 *После ввода промпта вы отправите фото для обработки*`
        : `✅ *Model:* ${isRu ? model?.title_ru : model?.title_en}\n✍️ *Style:* Custom prompt\n\n💬 Describe how to process the image:\n\n💡 *After entering the prompt, you'll send the photo for processing*`,
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
      ctx.session.aiPhotoshopStep = 'image_upload'
      ctx.session.awaitingAiPhotoshopImage = true
    }

    // Price calculation with proper markup for AI Photoshop models
    const sizeBasePricesUSD = {
      '1K': 0.10,  // $0.10 base cost
      '2K': 0.13,  // $0.13 base cost
      '4K': 0.20   // $0.20 base cost
    }

    const sizePrices = {
      '1K': calculateFinalPriceInStars(sizeBasePricesUSD['1K']),
      '2K': calculateFinalPriceInStars(sizeBasePricesUSD['2K']),
      '4K': calculateFinalPriceInStars(sizeBasePricesUSD['4K'])
    }

    const sizeDimensions = {
      '1K': '1K',
      '2K': '2K',
      '4K': '4K'
    }

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
                callback_data: 'ai_photoshop_change_size'
              }
            ],
            [
              {
                text: isRu ? '🚪 Назад в меню' : '🚪 Back to Menu',
                callback_data: 'back_to_menu'
              }
            ]
          ]
        }
      }
    )

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
      isRu
        ? `📏 Выберите размер изображения:`
        : `📏 Choose image size:`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '1K - 5⭐',
                callback_data: 'ai_photoshop_size_1K'
              }
            ],
            [
              {
                text: '2K - 20⭐',
                callback_data: 'ai_photoshop_size_2K'
              }
            ],
            [
              {
                text: '4K - 30⭐',
                callback_data: 'ai_photoshop_size_4K'
              }
            ],
            [
              {
                text: isRu ? '🚪 Назад в меню' : '🚪 Back to Menu',
                callback_data: 'back_to_menu'
              }
            ]
          ]
        }
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
aiPhotoshopScene.action(/^ai_photoshop_all_models_size_(1K|2K|4K)$/, async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    const sizeMatch = ctx.match[1] as '1K' | '2K' | '4K'

    if (ctx.session) {
      ctx.session.aiPhotoshopSize = sizeMatch
      ctx.session.aiPhotoshopModel = 'all_models' as any // Ensure model is set to all_models
      ctx.session.aiPhotoshopStep = 'image_upload'
      ctx.session.awaitingAiPhotoshopImage = true

      logger.info('🎯 AI Photoshop: ALL_MODELS size selected', {
        telegramId: ctx.from?.id,
        selectedSize: sizeMatch,
        aiPhotoshopModel: ctx.session.aiPhotoshopModel,
        awaitingAiPhotoshopImage: ctx.session.awaitingAiPhotoshopImage
      })
    }

    // Calculate costs based on selected quality
    const baseCost = Object.values(AI_PHOTOSHOP_MODELS).reduce((sum, model) => sum + model.cost, 0)
    const modelNames = Object.values(AI_PHOTOSHOP_MODELS).map(model =>
      isRu ? model.title_ru : model.title_en
    )

    let totalCost: number
    let qualityDesc: string

    switch (sizeMatch) {
      case '1K':
        totalCost = baseCost // 30⭐
        qualityDesc = isRu ? '1K качество (базовое)' : '1K quality (base)'
        break
      case '2K':
        totalCost = baseCost * 4 // 120⭐
        qualityDesc = isRu ? '2K качество (×4)' : '2K quality (×4)'
        break
      case '4K':
        totalCost = baseCost * 6 // 180⭐
        qualityDesc = isRu ? '4K качество (×6)' : '4K quality (×6)'
        break
      default:
        totalCost = baseCost
        qualityDesc = isRu ? '1K качество (базовое)' : '1K quality (base)'
    }

    await ctx.editMessageText(
      isRu
        ? `🎯 *Все модели сразу!*\n\n📊 *Выбрано: ${qualityDesc}*\n\n🔸 *Модели для обработки:*\n${modelNames.map((name, i) => `• ${name}`).join('\n')}\n\n💎 *Общая стоимость: ${totalCost}⭐*\n\n📸 *Отправьте фото для обработки:*`
        : `🎯 *All models at once!*\n\n📊 *Selected: ${qualityDesc}*\n\n🔸 *Models to process:*\n${modelNames.map((name, i) => `• ${name}`).join('\n')}\n\n💎 *Total cost: ${totalCost}⭐*\n\n📸 *Send photo for processing:*`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              Markup.button.callback(
                isRu ? 'Изменить качество' : 'Change quality',
                'ai_photoshop_all_models_from_selector'
              )
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
          ]
        }
      }
    )

  } catch (error) {
    logger.error('Error handling all models size selection', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

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
      isRu
        ? '📸 Загружаю изображение...'
        : '📸 Uploading image...',
      {
        reply_markup: {
          inline_keyboard: [[
            {
              text: isRu ? '⏳ Загрузка...' : '⏳ Loading...',
              callback_data: 'loading_indicator'
            }
          ]]
        }
      }
    )

    // Если пользователь отправил фото без выбора модели - используем SeeDream-4 по умолчанию
    if (!ctx.session?.awaitingAiPhotoshopImage && !ctx.session?.aiPhotoshopModel) {
      logger.info('🎨 AI Photoshop: Photo sent without model selection, using SeeDream-4 default', {
        telegramId: ctx.from?.id,
      })

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
    } else if (!ctx.session?.awaitingAiPhotoshopImage && !ctx.session?.awaitingAiPhotoshopPrompt) {
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
        isRu
          ? '❌ Сначала выберите модель и стиль обработки.'
          : '❌ Please select a model and processing style first.'
      )
      return
    } else if (ctx.session?.awaitingAiPhotoshopPrompt && ctx.session?.aiPhotoshopStyle === 'custom') {
      // User sent photo while we were waiting for prompt - this is OK, but ask for prompt first
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
        isRu
          ? '✅ Фото получено! Но сначала опишите, как его обработать:\n\n📝 Напишите промпт для обработки фото:'
          : '✅ Photo received! But first describe how to process it:\n\n📝 Write a prompt for photo processing:'
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

      // If we were waiting for prompt (user sent photo early), keep waiting for prompt
      if (ctx.session.awaitingAiPhotoshopPrompt && ctx.session.aiPhotoshopStyle === 'custom') {
        // Don't change awaitingAiPhotoshopPrompt - keep it true
        ctx.session.awaitingAiPhotoshopImage = false

        await ctx.telegram.editMessageText(
          ctx.chat?.id,
          loadingMsg.message_id,
          undefined,
          isRu
            ? '✅ Фото сохранено! Теперь опишите, как его обработать:\n\n📝 Напишите промпт для обработки фото:'
            : '✅ Photo saved! Now describe how to process it:\n\n📝 Write a prompt for photo processing:'
        )
        return
      } else {
        // Normal flow - photo received when expected
        ctx.session.awaitingAiPhotoshopImage = false
      }
    }

    // If style is custom, we need to wait for the prompt
    if (ctx.session?.aiPhotoshopStyle === 'custom') {
      if (ctx.session) {
        ctx.session.aiPhotoshopStep = 'custom_prompt'
        ctx.session.awaitingAiPhotoshopPrompt = true
      }

      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
        isRu
          ? '✅ Изображение загружено!\n\n📝 Теперь опишите, как его обработать:\n\n💡 *Для лучших результатов пишите на английском языке*'
          : '✅ Image uploaded!\n\n📝 Now describe how to process it:\n\n💡 *For best results, write in English*',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              {
                text: isRu ? 'Отмена' : 'Cancel',
                callback_data: 'ai_photoshop_cancel'
              }
            ]]
          }
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
        await ctx.telegram.deleteMessage(ctx.chat?.id!, loadingMsg.message_id)
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
// 🚨 DEDICATED FUNCTION: Handle all_models prompt BEFORE everything else
async function handleAllModelsPrompt(ctx: MyContext, messageText: string): Promise<boolean> {
  const isRu = isRussianFromState(ctx)

  // Check if this is all_models prompt waiting state
  if (ctx.session?.aiPhotoshopModel === 'all_models' && ctx.session?.awaitingAiPhotoshopPrompt) {
    console.log('🎯🎯🎯 ALL_MODELS PROMPT DETECTED!', {
      telegramId: ctx.from?.id,
      prompt: messageText.substring(0, 50),
      imageCount: ctx.session.morphingImages?.length || 0
    })

    // Save prompt and show confirmation
    ctx.session.aiPhotoshopPrompt = messageText
    ctx.session.awaitingAiPhotoshopPrompt = false

    await ctx.reply(
      isRu
        ? `✅ Промпт получен: "${messageText}"\n\n🎯 Готово к обработке всеми 4 моделями!\n\n⚙️ Выберите качество для расчета стоимости`
        : `✅ Prompt received: "${messageText}"\n\n🎯 Ready to process with all 4 models!\n\n⚙️ Select quality to calculate cost`,
      {
        reply_markup: {
          inline_keyboard: [[
            {
              text: isRu ? '🚀 Начать обработку всеми моделями' : '🚀 Start processing with all models',
              callback_data: 'ai_photoshop_multi_confirm'
            }
          ], [
            {
              text: isRu ? '❌ Отмена' : '❌ Cancel',
              callback_data: 'ai_photoshop_multi_cancel'
            }
          ]]
        }
      }
    )
    return true // Handled
  }

  return false // Not handled
}

aiPhotoshopScene.on('text', async ctx => {
  try {
    // 🔥 ULTRA DEBUG: Always log text handler entry
    console.log('🚨🚨🚨 TEXT HANDLER TRIGGERED!', {
      telegramId: ctx.from?.id,
      text: ctx.message.text.substring(0, 30),
      timestamp: new Date().toISOString()
    })

    const messageText = ctx.message.text

    // 🚨 FIRST PRIORITY: Check for all_models prompt handling
    if (await handleAllModelsPrompt(ctx, messageText)) {
      console.log('🎯 ALL_MODELS prompt handled, returning early')
      return
    }

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
        aiPhotoshopModel: ctx.session?.aiPhotoshopModel
      }
    })

    // ✅ ENHANCED: Support dialog mode for improving last photo
    const isInDialogMode = ctx.session?.dialogMode && ctx.session?.savedAiPhotoshopResults?.length > 0

    // ✅ NEW: Zod validation for dialog mode input
    if (isInDialogMode && !ctx.session?.aiPhotoshopStep) {
      try {
        const inputValidation = validateUserInput({
          inputId: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
          type: 'text',
          timestamp: new Date().toISOString(),
          userId: ctx.from?.id?.toString() || '0',
          content: {
            text: messageText
          },
          sessionId: ctx.session?.sessionId || Date.now().toString(),
          messageId: ctx.message.message_id,
          chatId: ctx.chat?.id || 0,
          isValid: true,
          validationErrors: []
        })

        if (!inputValidation.success) {
          logger.warn('🚨 AI Photoshop: Dialog input validation failed', {
            telegramId: ctx.from?.id,
            error: inputValidation.error,
            text: messageText.substring(0, 50)
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
          textLength: messageText.length
        })
      } catch (error) {
        logger.error('🚨 AI Photoshop: Dialog validation error', {
          telegramId: ctx.from?.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        // Continue with processing even if validation fails
      }
    }

    // ✅ SMART VALIDATION: Allow custom prompt workflow, text with existing images, and dialog mode
    const allowTextInput = ctx.session?.awaitingAiPhotoshopPrompt ||
                          (ctx.session?.aiPhotoshopImage || ctx.session?.morphingImages?.length) ||
                          isInDialogMode

    if (!allowTextInput) {
      logger.info('💡 AI Photoshop: Text input not ready - guiding user', {
        telegramId: ctx.from?.id,
        awaitingPrompt: ctx.session?.awaitingAiPhotoshopPrompt,
        hasImage: !!ctx.session?.aiPhotoshopImage,
        hasMorphingImages: !!ctx.session?.morphingImages?.length,
        isInDialogMode,
        step: ctx.session?.aiPhotoshopStep
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
        promptLength: ctx.message.text?.length
      })

      const prompt = ctx.message.text

      if (!prompt || prompt.trim().length === 0) {
        await ctx.reply(isRu ? '❌ Пустой промпт. Попробуйте еще раз.' : '❌ Empty prompt. Please try again.')
        return
      }

      if (ctx.session) {
        ctx.session.aiPhotoshopPrompt = prompt
        ctx.session.awaitingAiPhotoshopPrompt = false
        ctx.session.aiPhotoshopStep = 'image_upload'
        ctx.session.awaitingAiPhotoshopImage = true

        logger.info('✅ AI Photoshop: Custom prompt saved successfully', {
          telegramId: ctx.from?.id,
          promptLength: prompt.length,
          promptPreview: prompt.substring(0, 100) + '...',
          step: ctx.session.aiPhotoshopStep
        })
      }

      const model = AI_PHOTOSHOP_MODELS[ctx.session?.aiPhotoshopModel as keyof typeof AI_PHOTOSHOP_MODELS]

      // Size selection for SeeDream-4 model
      if (ctx.session.aiPhotoshopModel === 'seedream') {
        await ctx.reply(
          isRu
            ? `✅ Промпт сохранен: "${prompt}"\n\n📏 Выберите размер изображения:`
            : `✅ Prompt saved: "${prompt}"\n\n📏 Choose image size:`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '1K - 5⭐',
                    callback_data: 'ai_photoshop_size_1K'
                  }
                ],
                [
                  {
                    text: '2K - 20⭐',
                    callback_data: 'ai_photoshop_size_2K'
                  }
                ],
                [
                  {
                    text: '4K - 30⭐',
                    callback_data: 'ai_photoshop_size_4K'
                  }
                ],
                [
                  {
                    text: isRu ? '🚪 Назад в меню' : '🚪 Back to Menu',
                    callback_data: 'back_to_menu'
                  }
                ]
              ]
            }
          }
        )
      } else {
        // Direct to photo upload for other models
        await ctx.reply(
          isRu
            ? `✅ Промпт сохранен: "${prompt}"\n\n📷 Теперь загрузите фото или альбом изображений:`
            : `✅ Prompt saved: "${prompt}"\n\n📷 Now upload a photo or album of images:`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: isRu ? '🚪 Назад в меню' : '🚪 Back to Menu',
                    callback_data: 'back_to_menu'
                  }
                ]
              ]
            }
          }
        )
        ctx.session.awaitingAiPhotoshopImage = true
      }
      return
    }

    // ✅ NEW: Handle dialog mode - improve last photo with text prompt
    if (isInDialogMode && !ctx.session?.aiPhotoshopStep) {
      logger.info('🎨 AI Photoshop: Dialog mode - improving last photo', {
        telegramId: ctx.from?.id,
        savedResultsCount: ctx.session?.savedAiPhotoshopResults?.length,
        promptText: messageText.substring(0, 50) + '...'
      })

      const lastResult = ctx.session.savedAiPhotoshopResults?.[ctx.session.savedAiPhotoshopResults.length - 1]

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
        ru: ['upscale', 'апскейл', 'увеличить качество', 'улучшить качество', 'повысить разрешение', 'увеличить разрешение', 'сделать четче', 'четкость', 'разрешение'],
        en: ['upscale', 'enhance quality', 'improve quality', 'increase resolution', 'enhance resolution', 'make sharper', 'sharpen', 'clarity', 'resolution']
      }

      const keywords = isRu ? upscalerKeywords.ru : upscalerKeywords.en
      const isUpscaleRequest = keywords.some(keyword =>
        messageText.toLowerCase().includes(keyword.toLowerCase())
      )

      if (isUpscaleRequest) {
        logger.info('🔍 AI Photoshop: Upscaler request detected in dialog mode', {
          telegramId: ctx.from?.id,
          messageText: messageText.substring(0, 100),
          lastResultUrl: lastResult.url || lastResult.imageUrl
        })

        await ctx.reply(
          isRu
            ? `⬆️ *Увеличиваю качество последнего фото!*\n\n🎯 Применяю Clarity Upscaler для улучшения разрешения...\n\n💎 Стоимость: 3 ⭐`
            : `⬆️ *Upscaling last photo quality!*\n\n🎯 Applying Clarity Upscaler to enhance resolution...\n\n💎 Cost: 3 ⭐`,
          {
            parse_mode: 'Markdown'
          }
        )

        try {
          const imageUrl = typeof lastResult.imageUrl === 'string' ? lastResult.imageUrl : lastResult.url

          await upscaleImage({
            imageUrl,
            telegram_id: String(ctx.from?.id),
            username: ctx.from?.username || 'unknown_user',
            is_ru: isRu,
            ctx,
            originalPrompt: lastResult.prompt || 'Dialog mode upscale'
          })

          // Show dialog interface again after upscaling
          await showDialogInterface(ctx)
          return
        } catch (error) {
          logger.error('🚨 AI Photoshop: Upscaler failed in dialog mode', {
            telegramId: ctx.from?.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          })

          await ctx.reply(
            isRu
              ? '❌ Произошла ошибка при увеличении качества. Попробуйте другую команду для улучшения фото.'
              : '❌ Error occurred during upscaling. Try another command to improve the photo.'
          )
          return
        }
      }

      // Set up session for processing with last result as image input
      if (ctx.session) {
        // ✅ FIX: Ensure imageUrl is a string URL, not an object
        const imageUrl = typeof lastResult.imageUrl === 'string' ? lastResult.imageUrl : lastResult.url
        ctx.session.aiPhotoshopImage = imageUrl
        ctx.session.aiPhotoshopPrompt = messageText
        ctx.session.aiPhotoshopModel = lastResult.model as keyof typeof AI_PHOTOSHOP_MODELS
        ctx.session.aiPhotoshopStep = 'processing'

        // Use the same size as the previous result if it was SeeDream-4
        if (lastResult.model === 'seedream' && lastResult.additionalInfo?.size) {
          ctx.session.aiPhotoshopSize = lastResult.additionalInfo.size
        }
      }

      await ctx.reply(
        isRu
          ? `✨ *Диалоговый режим активен!*\n\n🎯 Применяю улучшения к последнему фото:\n"${messageText}"\n\n🔄 Обрабатываю с помощью модели ${AI_PHOTOSHOP_MODELS[lastResult.model as keyof typeof AI_PHOTOSHOP_MODELS]?.title_ru}...\n\n💡 *Совет:* После обработки вы сможете снова написать команду для дальнейших улучшений!`
          : `✨ *Dialog mode is active!*\n\n🎯 Applying improvements to last photo:\n"${messageText}"\n\n🔄 Processing with ${AI_PHOTOSHOP_MODELS[lastResult.model as keyof typeof AI_PHOTOSHOP_MODELS]?.title_en} model...\n\n💡 *Tip:* After processing, you can write another command for further improvements!`,
        {
          parse_mode: 'Markdown'
        }
      )

      await processAiPhotoshopRequest(ctx, messageText)
      return
    }

    // For other steps, require image to be present
    if (!ctx.session?.aiPhotoshopImage && !ctx.session?.morphingImages?.length) {
      logger.error('🚨 AI Photoshop: REJECTED - no image', {
        telegramId: ctx.from?.id,
        hasImage: !!ctx.session?.aiPhotoshopImage,
        hasMorphingImages: !!ctx.session?.morphingImages?.length
      })
      await ctx.reply(
        isRu
          ? '❌ Сначала загрузите изображение для обработки.'
          : '❌ Please upload an image for processing first.'
      )
      return
    }

    logger.info('🚨 AI Photoshop: Text validation PASSED - processing with existing image', {
      telegramId: ctx.from?.id,
      validationStatus: 'ALL_CHECKS_PASSED'
    })

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
      hasAnyAiPhotoshopData: !!(ctx.session?.aiPhotoshopModel || ctx.session?.aiPhotoshopImage)
    })

    if (ctx.session) {
      ctx.session.aiPhotoshopPrompt = prompt
      ctx.session.awaitingAiPhotoshopPrompt = false
      ctx.session.aiPhotoshopStep = 'processing'
    }

    // 🚨 ENHANCED CRITICAL FIX: Check for 'all_models' mode with multiple conditions
    const isAllModelsMode = ctx.session?.aiPhotoshopModel === 'all_models' ||
                           (ctx.session?.morphingImages?.length > 0 && ctx.session?.awaitingAiPhotoshopPrompt)

    console.log('🚨🚨🚨 ALL_MODELS CHECK DEBUG:', {
      telegramId: ctx.from?.id,
      aiPhotoshopModel: ctx.session?.aiPhotoshopModel,
      morphingImagesCount: ctx.session?.morphingImages?.length || 0,
      awaitingPrompt: ctx.session?.awaitingAiPhotoshopPrompt,
      isAllModelsMode,
      promptReceived: prompt.substring(0, 30) + '...'
    })

    if (isAllModelsMode) {
      logger.info('🎯 AI Photoshop: All models mode detected in text handler - returning to confirmation', {
        telegramId: ctx.from?.id,
        promptReceived: prompt.substring(0, 30) + '...',
        imageCount: ctx.session?.morphingImages?.length || 0,
        condition: 'ENHANCED_ALL_MODELS_CHECK'
      })

      // ✅ CRITICAL: Save prompt for all_models processing
      if (ctx.session) {
        ctx.session.aiPhotoshopPrompt = prompt
        ctx.session.awaitingAiPhotoshopPrompt = false
        ctx.session.aiPhotoshopModel = 'all_models' as any // Force set if missing
      }

      // Show confirmation message for all_models mode
      await ctx.reply(
        isRu
          ? `✅ Промпт получен: "${prompt}"\n\n🎯 Готово к обработке всеми 4 моделями!\n\n⚙️ Выберите качество для расчета стоимости`
          : `✅ Prompt received: "${prompt}"\n\n🎯 Ready to process with all 4 models!\n\n⚙️ Select quality to calculate cost`,
        {
          reply_markup: {
            inline_keyboard: [[
              {
                text: isRu ? '🚀 Начать обработку всеми моделями' : '🚀 Start processing with all models',
                callback_data: 'ai_photoshop_multi_confirm'
              }
            ], [
              {
                text: isRu ? '❌ Отмена' : '❌ Cancel',
                callback_data: 'ai_photoshop_multi_cancel'
              }
            ]]
          }
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

🎭 *SeeDream-4* - Генерация и трансформация изображений (5⭐, до 10 фото)
🍌 *Nano Banana* - ИИ редактирование на базе Gemini 2.5 (7⭐, до 3 фото)
🚀 *FLUX Kontext Max* - Профессиональное редактирование (13⭐, только 1 фото)
🎨 *Qwen Image Edit Plus* - Продвинутое редактирование (5⭐, до 10 фото)

📸 *Или сразу отправьте фото/альбом для быстрой обработки через SeeDream-4*
💡 *Каждая модель поддерживает несколько фотографий одновременно!*
✨ *Загружайте альбомы для пакетной обработки*`
    : `Choose an AI model for processing:

🎭 *SeeDream-4* - Image generation and transformation (5⭐, up to 10 photos)
🍌 *Nano Banana* - AI editing powered by Gemini 2.5 (7⭐, up to 3 photos)
🚀 *FLUX Kontext Max* - Professional editing (13⭐, single photo only)
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
const createAiPhotoshopProgressMessage = (images: any[], isRu: boolean, isAllModelsMode: boolean = false): string => {
  const count = images.length
  const progressBar = createAiPhotoshopProgressBar(count)

  // ✅ Special message for 'all_models' mode
  if (isAllModelsMode) {
    const baseMessage = isRu
      ? `🎯 *ИИ Фотошоп - Все модели сразу*\n\n📸 ${progressBar}\n\n✨ Отлично! Загружайте еще фотографии\n💡 Каждое фото будет обработано всеми 4 моделями\n⚙️ Цена зависит от выбранного качества (1K/2K/4K)`
      : `🎯 *AI Photoshop - All Models*\n\n📸 ${progressBar}\n\n✨ Great! Upload more photos\n💡 Each photo will be processed by all 4 models\n⚙️ Price depends on selected quality (1K/2K/4K)`

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
    keyboard.push([{
      text: isRu ? '🎨 Обработать изображения' : '🎨 Process Images',
      callback_data: 'ai_photoshop_multi_process'
    }])
  }

  // Always show restart option
  keyboard.push([{
    text: isRu ? '🔄 Начать заново' : '🔄 Start Over',
    callback_data: 'ai_photoshop_multi_restart'
  }])

  return Markup.inlineKeyboard(keyboard)
}

// ✅ AI PHOTOSHOP MULTI-PHOTO DETECTION AND HANDLING

/**
 * AI Photoshop multi-photo detection - collects multiple photos using buffer logic like Infinity Morphing
 */
async function detectMultiPhotoAiPhotoshop(ctx: MyContext): Promise<boolean> {
  if (!ctx.message || !('photo' in ctx.message)) return false

  const userId = ctx.from?.id?.toString()
  if (!userId) return false

  const photo = ctx.message.photo?.pop() // Get highest resolution
  if (!photo) return false

  const mediaGroupId = 'media_group_id' in ctx.message ? ctx.message.media_group_id : undefined

  // ✅ ENHANCED: Collect photos if part of media group OR if photos are being sent sequentially OR in 'all_models' mode
  const shouldCollectPhoto = mediaGroupId ||
    (ctx.session.morphingImages && ctx.session.morphingImages.length > 0 &&
     Date.now() - (ctx.session.lastPhotoTimestamp || 0) < 60000) || // 60 seconds window
    (ctx.session?.aiPhotoshopModel === 'all_models' && ctx.session?.awaitingAiPhotoshopImage) // ✅ NEW: Collect photos in 'all_models' mode

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
      const response = await fetch(telegramUrl)
      const buffer = Buffer.from(await response.arrayBuffer())

      // Add image with timestamp and order like Infinity Morphing
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
        isSequential: !mediaGroupId
      })

      // Create dynamic progress message like Infinity Morphing
      const isAllModelsMode = ctx.session?.aiPhotoshopModel === 'all_models'
      const progressMessage = createAiPhotoshopProgressMessage(ctx.session.morphingImages, isRu, isAllModelsMode)
      const keyboard = createAiPhotoshopProgressKeyboard(ctx.session.morphingImages, isRu)

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
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return false
    }
  }

  // ✅ NEW: Handle single photos that might be part of a sequence
  // If user is actively adding photos (no existing collection or recent activity), start/continue collection
  const isActivelyAddingPhotos = ctx.session?.awaitingAiPhotoshopImage ||
    ctx.session?.aiPhotoshopStep === 'image_upload' ||
    (ctx.session?.lastPhotoTimestamp && Date.now() - ctx.session.lastPhotoTimestamp < 60000)

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
      const response = await fetch(telegramUrl)
      const buffer = Buffer.from(await response.arrayBuffer())

      // Add image with timestamp and order
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
        isFirstPhoto: imageIndex === 1
      })

      // Create or update progress message
      const isAllModelsMode = ctx.session?.aiPhotoshopModel === 'all_models'
      const progressMessage = createAiPhotoshopProgressMessage(ctx.session.morphingImages, isRu, isAllModelsMode)
      const keyboard = createAiPhotoshopProgressKeyboard(ctx.session.morphingImages, isRu)

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
          logger.warn('Failed to edit progress message for sequential photo', { editError })
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
        userId
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

  // ✅ NEW: Calculate total cost for "All Models" button
  const totalCostAllModels = Object.values(AI_PHOTOSHOP_MODELS).reduce((sum, model) => sum + model.cost, 0)

  const title = isRu
    ? '🎨 *Продолжить работу с фотографиями*'
    : '🎨 *Continue working with photos*'

  const description = isRu
    ? `✨ У вас есть ${savedResults.length} обработанных фото в галерее!\n\n🎯 *Диалоговый режим активен* - теперь вы можете:\n\n💬 *Просто написать текст для улучшения:*\n• "Добавь туда побольше атмосферы и девчонок"\n• "Сделай более яркие цвета"\n• "Добавь эффект дождя или снега"\n• "Измени стиль на винтажный"\n• "Убери фон, оставь только человека"\n• "Увеличить качество" или "upscale" для апскейлинга\n\n🔄 *Использовать кнопки для быстрых действий*\n⬆️ *Увеличить качество* фото с помощью Clarity Upscaler\n🎯 *Все сразу* - генерация во ВСЕХ 4 моделях одновременно (${totalCostAllModels}⭐)\n📸 *Добавить новое фото* для обработки\n📋 *Посмотреть всю галерею* (${savedResults.length} фото)\n\n🚀 *Продвинутые команды:*\n• "Увеличь контрастность на 20%"\n• "Добавь теплые тона"\n• "Сделай как в стиле Ван Гога"\n\n💡 *Совет:* Пишите простые команды - я понимаю естественный язык!`
    : `✨ You have ${savedResults.length} processed photos in your gallery!\n\n🎯 *Dialog mode is active* - now you can:\n\n💬 *Simply write text to improve:*\n• "Add more atmosphere and girls there"\n• "Make colors more vibrant"\n• "Add rain or snow effect"\n• "Change style to vintage"\n• "Remove background, keep only person"\n• "Upscale" or "enhance quality" for upscaling\n\n🔄 *Use buttons for quick actions*\n⬆️ *Upscale photo quality* with Clarity Upscaler\n🎯 *All at once* - generate with ALL 4 models simultaneously (${totalCostAllModels}⭐)\n📸 *Add new photo* to process\n📋 *View entire gallery* (${savedResults.length} photos)\n\n🚀 *Advanced commands:*\n• "Increase contrast by 20%"\n• "Add warm tones"\n• "Make it Van Gogh style"\n\n💡 *Tip:* Write simple commands - I understand natural language!`

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback(
        isRu ? '🔄 Продолжить с теми же настройками' : '🔄 Continue with same settings',
        'ai_photoshop_continue_same'
      )
    ],
    [
      Markup.button.callback(
        isRu ? '⬆️ Увеличить качество фото' : '⬆️ Upscale photo quality',
        'ai_photoshop_upscale_last'
      )
    ],
    [
      Markup.button.callback(
        isRu ? `🎯 Все сразу (${totalCostAllModels}⭐)` : `🎯 All at once (${totalCostAllModels}⭐)`,
        'ai_photoshop_all_models_from_selector'
      )
    ],
    [
      Markup.button.callback(
        isRu ? '🎬 Ракурс камеры' : '🎬 Camera Angle',
        'ai_photoshop_camera_menu'
      ),
      Markup.button.callback(
        isRu ? '💡 Освещение' : '💡 Lighting',
        'ai_photoshop_lighting_menu'
      )
    ],
    [
      Markup.button.callback(
        isRu ? '📐 Композиция' : '📐 Composition',
        'ai_photoshop_composition_menu'
      ),
      Markup.button.callback(
        isRu ? '📏 Соотношение сторон' : '📏 Aspect Ratio',
        'ai_photoshop_aspect_ratio_menu'
      )
    ],
    [
      Markup.button.callback(
        isRu ? '🔢 Количество вариаций' : '🔢 Number of variations',
        'ai_photoshop_variations_menu'
      )
    ],
    [
      Markup.button.callback(
        isRu ? '📸 Добавить фото' : '📸 Add photo',
        'ai_photoshop_add_new'
      ),
      Markup.button.callback(
        isRu ? `📋 Галерея (${savedResults.length})` : `📋 Gallery (${savedResults.length})`,
        'ai_photoshop_show_all'
      )
    ],
    [
      Markup.button.callback(
        isRu ? '🔄 Начать заново' : '🔄 Start over',
        'ai_photoshop_restart'
      ),
      Markup.button.callback(
        isRu ? '🚪 Главное меню' : '🚪 Main menu',
        'ai_photoshop_exit_to_menu'
      )
    ]
  ])

  await ctx.reply(title + '\n\n' + description, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup
  })

}

// ✅ NEW: Save photo result function
async function savePhotoResult(ctx: MyContext, imageUrl: string, model: string, prompt: string, wasAllModels: boolean = false): Promise<void> {
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
      originalImage: ctx.session.aiPhotoshopImage !== imageUrl ? ctx.session.aiPhotoshopImage : undefined,
      isImprovement: ctx.session.savedAiPhotoshopResults && ctx.session.savedAiPhotoshopResults.length > 0,
      fullPrompt: prompt // Keep full prompt for context
    }
  }

  ctx.session.savedAiPhotoshopResults.push(result)

  // ✅ ENHANCED: Automatically activate dialog mode after saving results
  ctx.session.dialogMode = true

  // ✅ NEW: Initialize sessionId if not exists for Zod validation
  if (!ctx.session.sessionId) {
    ctx.session.sessionId = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9)
  }

  // Keep only last 10 results to prevent session bloat
  if (ctx.session.savedAiPhotoshopResults.length > 10) {
    ctx.session.savedAiPhotoshopResults = ctx.session.savedAiPhotoshopResults.slice(-10)
  }

  logger.info('🎨 AI Photoshop: Photo result saved', {
    telegramId: ctx.from?.id,
    totalSaved: ctx.session.savedAiPhotoshopResults.length,
    model,
    promptLength: prompt.length
  })
}

// Function to process AI Photoshop request
const processAiPhotoshopRequest = async (ctx: MyContext, customPrompt?: string) => {
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
  const hasImages = aiPhotoshopImage || (ctx.session?.morphingImages?.length && ctx.session.morphingImages.length > 0)

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
        aiPhotoshopPrompt: !!ctx.session?.aiPhotoshopPrompt
      }
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
    logger.info('🎯 AI Photoshop: Processing with ALL models from initial selector', {
      telegramId: ctx.from?.id,
      hasImage: !!aiPhotoshopImage
    })

    const totalCost = Object.values(AI_PHOTOSHOP_MODELS).reduce((sum, model) => sum + model.cost, 0)
    const availableModels = Object.keys(AI_PHOTOSHOP_MODELS) as Array<keyof typeof AI_PHOTOSHOP_MODELS>
    const modelNames = availableModels.map(key =>
      isRu ? AI_PHOTOSHOP_MODELS[key].title_ru : AI_PHOTOSHOP_MODELS[key].title_en
    )

    await ctx.reply(
      isRu
        ? `🎯 *Генерация во ВСЕХ моделях!*\n\n📸 Обрабатываю ваше фото во всех ${availableModels.length} моделях:\n\n${modelNames.map((name, i) => `${i + 1}. ${name} (${Object.values(AI_PHOTOSHOP_MODELS)[i].cost}⭐)`).join('\n')}\n\n💎 *Общая стоимость: ${totalCost}⭐*\n\n⏳ Это займет больше времени, но вы получите результаты от всех моделей для сравнения!`
        : `🎯 *Generating with ALL models!*\n\n📸 Processing your photo with all ${availableModels.length} models:\n\n${modelNames.map((name, i) => `${i + 1}. ${name} (${Object.values(AI_PHOTOSHOP_MODELS)[i].cost}⭐)`).join('\n')}\n\n💎 *Total cost: ${totalCost}⭐*\n\n⏳ This will take longer, but you'll get results from all models for comparison!`,
      {
        parse_mode: 'Markdown'
      }
    )

    // Process with each model sequentially, handling multiple images
    const prompt = customPrompt || 'enhance this image'
    const imagesToProcess = ctx.session?.morphingImages || (ctx.session?.aiPhotoshopImage ? [{ url: ctx.session.aiPhotoshopImage }] : [])

    logger.info(`🎨 AI Photoshop: Processing ${imagesToProcess.length} images with ${availableModels.length} models`, {
      telegramId: ctx.from?.id,
      imageCount: imagesToProcess.length,
      modelCount: availableModels.length
    })

    for (const modelKey of availableModels) {
      try {
        logger.info(`🎨 AI Photoshop: Processing with model ${modelKey}`, {
          telegramId: ctx.from?.id,
          model: modelKey,
          currentStep: `${availableModels.indexOf(modelKey) + 1}/${availableModels.length}`,
          imageCount: imagesToProcess.length
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
            originalOrder: 1
          }))
          if (!ctx.session.aiPhotoshopSize) {
            ctx.session.aiPhotoshopSize = '1K'
          }
        }

        // ✅ CRITICAL: One call per model with ALL images, not per image
        await processSingleAiPhotoshopModel(ctx, prompt, modelKey, true)

        // Small delay between models to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000))
      } catch (modelError) {
        logger.error(`❌ AI Photoshop: Error processing with model ${modelKey}`, {
          telegramId: ctx.from?.id,
          model: modelKey,
          error: modelError instanceof Error ? modelError.message : 'Unknown error'
        })
        // Log error but don't spam user with individual error messages
      }
    }

    // ✅ CRITICAL FIX: Restore aiPhotoshopModel back to 'all_models' after loop
    if (ctx.session) {
      ctx.session.aiPhotoshopModel = 'all_models'
      logger.info('🔄 AI Photoshop: Restored model to all_models after processing', {
        telegramId: ctx.from?.id,
        restoredModel: 'all_models'
      })
    }

    // Show final results summary
    await ctx.reply(
      isRu
        ? `✅ *Обработка всеми моделями завершена!*\n\n🎨 Проверьте результаты выше - теперь у вас есть варианты от всех ${availableModels.length} моделей для сравнения!\n\n💡 Используйте команды для дальнейшего улучшения любого результата.`
        : `✅ *Processing with all models completed!*\n\n🎨 Check the results above - now you have variations from all ${availableModels.length} models for comparison!\n\n💡 Use commands to further improve any result.`,
      {
        parse_mode: 'Markdown'
      }
    )

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

  try {
    // Build prompt
    let finalPrompt = ''

    if (customPrompt) {
      finalPrompt = customPrompt
    } else if (aiPhotoshopStyle && aiPhotoshopStyle !== 'custom') {
      const style = AI_PHOTOSHOP_STYLES[aiPhotoshopStyle as keyof typeof AI_PHOTOSHOP_STYLES]
      finalPrompt = style?.template || 'enhance this image'
    } else {
      finalPrompt = 'enhance this image'
    }

    // 🎬 ADD CAMERA CONTROL PROMPTS (transferred from FLUX Kontext)
    const cameraEnhancements = []

    // Add camera angle if selected
    if (ctx.session?.aiPhotoshopCameraAngle) {
      const cameraPrompt = AI_PHOTOSHOP_CAMERA_ANGLES[ctx.session.aiPhotoshopCameraAngle as keyof typeof AI_PHOTOSHOP_CAMERA_ANGLES]
      if (cameraPrompt) {
        cameraEnhancements.push(cameraPrompt)
      }
    }

    // Add lighting if selected
    if (ctx.session?.aiPhotoshopLighting) {
      const lightingPrompt = AI_PHOTOSHOP_LIGHTING_SETUPS[ctx.session.aiPhotoshopLighting as keyof typeof AI_PHOTOSHOP_LIGHTING_SETUPS]
      if (lightingPrompt) {
        cameraEnhancements.push(lightingPrompt)
      }
    }

    // Add composition if selected
    if (ctx.session?.aiPhotoshopComposition) {
      const compositionPrompt = AI_PHOTOSHOP_FRAME_COMPOSITION[ctx.session.aiPhotoshopComposition as keyof typeof AI_PHOTOSHOP_FRAME_COMPOSITION]
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

    if (ctx.session?.morphingImages?.length && ctx.session.morphingImages.length > 0) {
      // Multi-photo via buffer approach - use the original Telegram file URLs from session
      isMultiPhoto = ctx.session.morphingImages.length > 1

      logger.info('AI Photoshop: Using original Telegram URLs from session', {
        telegramId: ctx.from.id,
        imageCount: ctx.session.morphingImages.length
      })

      // Use the original URLs that were stored when the images were uploaded
      logger.info('🔍 AI Photoshop: Checking morphingImages URLs', {
        telegramId: ctx.from.id,
        morphingImagesCount: ctx.session.morphingImages.length,
        sampleImage: ctx.session.morphingImages[0] ? {
          hasBuffer: !!ctx.session.morphingImages[0].buffer,
          hasUrl: !!ctx.session.morphingImages[0].url,
          urlPreview: ctx.session.morphingImages[0].url ? ctx.session.morphingImages[0].url.substring(0, 100) + '...' : 'NO_URL',
          filename: ctx.session.morphingImages[0].filename
        } : 'NO_IMAGES'
      })

      actualImageUrls = ctx.session.morphingImages.map(img => img.url).filter(url => url)

      logger.info('🎯 AI Photoshop: URL extraction result', {
        telegramId: ctx.from.id,
        totalImages: ctx.session.morphingImages.length,
        extractedUrls: actualImageUrls.length,
        urlPreviews: actualImageUrls.map(url => url ? url.substring(0, 100) + '...' : 'EMPTY')
      })
    } else if (multiPhotoUrls && multiPhotoCount && multiPhotoCount > 1) {
      // Multi-photo via URL approach (from multiPhotoHandler)
      isMultiPhoto = true
      actualImageUrls = Array.isArray(multiPhotoUrls) ? multiPhotoUrls : [multiPhotoUrls]
    } else {
      // Single photo
      isMultiPhoto = false
      actualImageUrls = [aiPhotoshopImage || '']
    }

    const currentModel = AI_PHOTOSHOP_MODELS[aiPhotoshopModel as keyof typeof AI_PHOTOSHOP_MODELS]
    const maxImages = isMultiPhoto ? Math.min(actualImageUrls.length, currentModel?.max_images || 1) : 1

    logger.info('AI Photoshop processing setup', {
      telegramId: ctx.from.id,
      isMultiPhoto,
      imageCount: actualImageUrls.length,
      maxImages,
      modelSupportsMulti: currentModel?.supports_multi_image,
      usingBuffers: !!(ctx.session?.morphingImages?.length),
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
      model: aiPhotoshopModel
    })

    switch (aiPhotoshopModel) {
      case 'seedream':
        // ✅ CRITICAL FIX: Get selected size from session or use user's choice
        const selectedSize = ctx.session?.aiPhotoshopSize || '1K'

        logger.info('🎯 AI Photoshop: SeeDream processing with size', {
          telegramId: ctx.from.id,
          selectedSize,
          isMultiPhoto,
          imageCount: actualImageUrls.length,
          maxImages,
          variationsCount
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
          variationsCount
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
            aspect_ratio: 'match_input_image'
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
            aspect_ratio: 'match_input_image'
          })
        }
        break

      case 'nano_banana':
        result = await generateNanoBanana({
          telegram_id: ctx.from.id.toString(),
          promptText: finalPrompt,
          inputImageUrl: actualImageUrls, // Nano Banana supports multiple images
          ctx,
          username: ctx.from.username || 'unknown',
          is_ru: isRu,
          promptStyle: 'artistic'
        })
        break

      case 'flux_max':
        result = await generateFluxKontextMax({
          prompt: finalPrompt,
          inputImageUrl: actualImageUrls[0], // FLUX Max uses single image
          telegram_id: ctx.from.id.toString(),
          username: ctx.from.username || 'unknown',
          is_ru: isRu,
          ctx,
          aspect_ratio: 'match_input_image',
          output_format: 'png',
          safety_tolerance: 2
        })
        break

      case 'qwen_edit_plus':
        // ✅ GET SELECTED SIZE FROM SESSION LIKE OTHER MODELS
        const qwenSelectedSize = ctx.session?.aiPhotoshopSize || '2K'

        // Map size to aspect ratio (общий паттерн)
        const sizeToAspectRatio: Record<string, '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9' | '9:21'> = {
          '1K': '1:1',
          '2K': '9:16',
          '4K': '16:9',
          'custom': '1:1'
        }

        result = await generateQwenImageEditPlus({
          prompt: finalPrompt,
          inputImageUrl: actualImageUrls, // Qwen supports multiple images
          telegram_id: ctx.from.id.toString(),
          username: ctx.from.username || 'unknown',
          is_ru: isRu,
          ctx,
          aspect_ratio: sizeToAspectRatio[qwenSelectedSize as keyof typeof sizeToAspectRatio] || '1:1',
          output_format: 'webp',
          output_quality: 90
        })
        break

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
      const imageUrl = typeof result === 'string' ? result : result.image || result
      await savePhotoResult(ctx, imageUrl, aiPhotoshopModel, finalPrompt)

      // Show continue/exit options after successful processing (ONLY for single model mode, not all_models)
      if (aiPhotoshopModel && (aiPhotoshopModel as string) !== 'all_models') {
        const isRu = isRussianFromState(ctx)
        const continueKeyboard = Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu ? '⬆️ Увеличить качество' : '⬆️ Upscale quality',
              'ai_photoshop_upscale_last'
            )
          ],
          [
            Markup.button.callback(
              isRu ? '📸 Добавить фото' : '📸 Add photo',
              'ai_photoshop_add_new'
            )
          ],
          [
            Markup.button.callback(
              isRu ? '🚪 Главное меню' : '🚪 Main menu',
              'ai_photoshop_exit_to_menu'
            )
          ]
        ])

        await ctx.reply(
          isRu
            ? `✨ *Фото успешно обработано и сохранено!*\n\n🎯 *Диалоговый режим активен* - теперь вы можете:\n\n💬 *Просто написать текст для дальнейших улучшений:*\n• "Добавь туда побольше атмосферы и девчонок"\n• "Сделай более яркие цвета"\n• "Добавь эффект дождя или снега"\n• "Измени стиль на винтажный"\n• "Убери фон, оставь только человека"\n• "Увеличить качество" или "upscale" для апскейлинга\n\n⬆️ *Или нажмите кнопку для увеличения качества в 2 раза*\n📸 *Добавить новое фото для обработки*\n\n🚀 *Продвинутые команды:*\n• "Увеличь контрастность на 20%"\n• "Добавь теплые тона"\n• "Сделай как в стиле Ван Гога"\n\n💡 *Совет:* Пишите простые команды - я понимаю естественный язык!\n🎨 *Все фото сохраняются в галерее до выхода из сцены*`
            : `✨ *Photo successfully processed and saved!*\n\n🎯 *Dialog mode is active* - now you can:\n\n💬 *Simply write text for further improvements:*\n• "Add more atmosphere and girls there"\n• "Make colors more vibrant"\n• "Add rain or snow effect"\n• "Change style to vintage"\n• "Remove background, keep only person"\n• "Upscale" or "enhance quality" for upscaling\n\n⬆️ *Or click button to upscale quality 2x*\n📸 *Add new photo to process*\n\n🚀 *Advanced commands:*\n• "Increase contrast by 20%"\n• "Add warm tones"\n• "Make it Van Gogh style"\n\n💡 *Tip:* Write simple commands - I understand natural language!\n🎨 *All photos are saved in gallery until you exit the scene*`,
          {
            parse_mode: 'Markdown',
            reply_markup: continueKeyboard.reply_markup
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
        )
      ],
      [
        Markup.button.callback(
          isRu ? '🚪 Главное меню' : '🚪 Main menu',
          'ai_photoshop_exit_to_menu'
        )
      ]
    ])

    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка при обработке изображения.\n\n🔧 Попробуйте еще раз или вернитесь в главное меню.'
        : '❌ An error occurred while processing the image.\n\n🔧 Please try again or return to the main menu.',
      {
        reply_markup: errorKeyboard.reply_markup
      }
    )

    // Clear session on error but keep saved results
    if (ctx.session) {
      ctx.session.aiPhotoshopModel = undefined
      ctx.session.aiPhotoshopStyle = undefined
      ctx.session.aiPhotoshopImage = undefined
      ctx.session.aiPhotoshopPrompt = undefined
      ctx.session.aiPhotoshopStep = undefined
      ctx.session.aiPhotoshopSize = undefined
      // Keep savedAiPhotoshopResults for recovery
    }

    // Stay in scene to allow recovery instead of leaving
    logger.info('🎨 AI Photoshop: Staying in scene after error for recovery options', {
      telegramId: ctx.from?.id,
    })
  }
}

// ✅ NEW: Process single AI Photoshop model (non-recursive version for all_models processing)
const processSingleAiPhotoshopModel = async (ctx: MyContext, customPrompt: string, modelKey: keyof typeof AI_PHOTOSHOP_MODELS, isAllModelsMode: boolean = false) => {
  const isRu = isRussianFromState(ctx)

  try {
    logger.info(`🎨 AI Photoshop: Processing single model ${modelKey}`, {
      telegramId: ctx.from?.id,
      model: modelKey,
      hasCustomPrompt: !!customPrompt
    })

    // Get session data
    const { aiPhotoshopImage, morphingImages } = ctx.session || {}

    // ✅ CRITICAL FIX: Get ALL images, not just the first one!
    let imagesToProcess: string[] = []

    if (isAllModelsMode && morphingImages && morphingImages.length > 0) {
      // ✅ ALL_MODELS режим: берем ВСЕ фотографии из morphingImages
      imagesToProcess = morphingImages.map(img => img.url).filter(url => url)
      logger.info(`🎨 ALL_MODELS: Processing ${imagesToProcess.length} images with ${modelKey}`, {
        telegramId: ctx.from?.id,
        imageCount: imagesToProcess.length,
        model: modelKey
      })
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
        isAllModelsMode
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
        ctx.session.aiPhotoshopSize = '1K'
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

    if (isAllModelsMode) {
      // 🚨 ALL_MODELS MODE: Each model processes ALL images in ONE call
      logger.info(`🎨 ALL_MODELS: Processing ${imagesToProcess.length} images with ${modelKey} in ONE call`, {
        telegramId: ctx.from?.id,
        imageCount: imagesToProcess.length,
        model: modelKey
      })

      // Process based on model capabilities
      if (modelKey === 'seedream') {
        // SeeDream supports multiple images (up to 10)
        result = await generateSeeDream4({
          prompt,
          inputImageUrl: imagesToProcess, // Pass array of ALL images
          telegram_id: userId.toString(),
          username: ctx.from?.username || 'unknown',
          is_ru: isRu,
          ctx,
          size: ctx.session?.aiPhotoshopSize || '1K',
          max_images: Math.min(imagesToProcess.length, 10),
          aspect_ratio: '9:16'
        })
      } else if (modelKey === 'nano_banana') {
        // Nano Banana supports up to 3 images
        const limitedImages = imagesToProcess.slice(0, 3)
        result = await generateNanoBanana({
          promptText: prompt,
          inputImageUrl: limitedImages.length === 1 ? limitedImages[0] : limitedImages,
          telegram_id: userId.toString(),
          username: ctx.from?.username || 'unknown',
          is_ru: isRu,
          ctx,
          promptStyle: 'artistic'
        })
      } else if (modelKey === 'flux_max') {
        // FLUX Max supports only 1 image
        const firstImage = imagesToProcess[0]
        result = await generateFluxKontextMax({
          prompt,
          inputImageUrl: firstImage,
          telegram_id: userId.toString(),
          username: ctx.from?.username || 'unknown',
          is_ru: isRu,
          ctx,
          aspect_ratio: 'match_input_image',
          output_format: 'png',
          safety_tolerance: 2
        })
      } else if (modelKey === 'qwen_edit_plus') {
        // Qwen supports multiple images (up to 10)
        const selectedSize = ctx.session?.aiPhotoshopSize || '2K'
        const sizeToAspectRatio: Record<string, '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9' | '9:21'> = {
          '1K': '9:16',
          '2K': '9:16',
          '4K': '16:9',
          'custom': '9:16'
        }

        result = await generateQwenImageEditPlus({
          prompt,
          inputImageUrl: imagesToProcess, // Pass array of ALL images
          telegram_id: userId.toString(),
          username: ctx.from?.username || 'unknown',
          is_ru: isRu,
          ctx,
          aspect_ratio: sizeToAspectRatio[selectedSize] || '1:1',
          output_format: 'jpg',
          output_quality: 90
        })
      }

      // Save result for later reference (all_models mode)
      if (result) {
        const imageUrl = typeof result === 'string' ? result : result.image || result.imageUrl || result
        if (imageUrl) {
          await savePhotoResult(ctx, imageUrl, modelKey, prompt, true) // ✅ Mark as all_models mode
        }
      }
    } else {
      // 🚨 NORMAL MODE: Process images individually for backward compatibility
      const results = []

      for (let i = 0; i < imagesToProcess.length; i++) {
        const currentImageUrl = imagesToProcess[i]

        logger.info(`🎨 Processing image ${i + 1}/${imagesToProcess.length} with ${modelKey}`, {
          telegramId: ctx.from?.id,
          imageIndex: i + 1,
          totalImages: imagesToProcess.length,
          model: modelKey
        })

        if (modelKey === 'seedream') {
          result = await generateSeeDream4({
            prompt,
            inputImageUrl: currentImageUrl,
            telegram_id: userId.toString(),
            username: ctx.from?.username || 'unknown',
            is_ru: isRu,
            ctx,
            size: ctx.session?.aiPhotoshopSize || '1K',
            max_images: 1,
            aspect_ratio: '9:16'
          })
        } else if (modelKey === 'nano_banana') {
          result = await generateNanoBanana({
            promptText: prompt,
            inputImageUrl: currentImageUrl,
            telegram_id: userId.toString(),
            username: ctx.from?.username || 'unknown',
            is_ru: isRu,
            ctx,
            promptStyle: 'artistic'
          })
        } else if (modelKey === 'flux_max') {
          // FLUX Max supports only 1 image - always use first image
          const firstImage = imagesToProcess[0]
          result = await generateFluxKontextMax({
            prompt,
            inputImageUrl: firstImage,
            telegram_id: userId.toString(),
            username: ctx.from?.username || 'unknown',
            is_ru: isRu,
            ctx,
            aspect_ratio: 'match_input_image',
            output_format: 'png',
            safety_tolerance: 2
          })
        } else if (modelKey === 'qwen_edit_plus') {
          const selectedSize = ctx.session?.aiPhotoshopSize || '2K'
          const sizeToAspectRatio: Record<string, '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9' | '9:21'> = {
            '1K': '9:16',
            '2K': '9:16',
            '4K': '16:9',
            'custom': '9:16'
          }

          result = await generateQwenImageEditPlus({
            prompt,
            inputImageUrl: currentImageUrl,
            telegram_id: userId.toString(),
            username: ctx.from?.username || 'unknown',
            is_ru: isRu,
            ctx,
            aspect_ratio: sizeToAspectRatio[selectedSize] || '1:1',
            output_format: 'jpg',
            output_quality: 90
          })
        }

        // ✅ CRITICAL FIX: Collect results from all images
        if (result?.success && result.imageUrl) {
          results.push({
            imageUrl: result.imageUrl,
            imageIndex: i + 1,
            success: true,
            model: modelKey
          })

          // Save result for later reference
          await savePhotoResult(ctx, result.imageUrl, modelKey, prompt)

        // Send result with model name and image number
        const imageInfo = imagesToProcess.length > 1
          ? ` (${i + 1}/${imagesToProcess.length})`
          : ''

        await ctx.replyWithPhoto(result.imageUrl, {
          caption: isRu
            ? `✅ *${modelTitle}${imageInfo}*\n\n📝 Промпт: "${prompt}"\n\n💎 *Стоимость: ${modelConfig.cost}⭐*`
            : `✅ *${modelTitle}${imageInfo}*\n\n📝 Prompt: "${prompt}"\n\n💎 *Cost: ${modelConfig.cost}⭐*`,
          parse_mode: 'Markdown'
        })

        logger.info(`✅ ${modelKey} image ${i + 1}/${imagesToProcess.length} completed successfully`, {
          telegramId: ctx.from?.id,
          model: modelKey,
          imageIndex: i + 1
        })
      } else {
        results.push({
          imageIndex: i + 1,
          success: false,
          model: modelKey,
          error: result?.error || 'Unknown error'
        })

        logger.error(`❌ ${modelKey} image ${i + 1}/${imagesToProcess.length} failed`, {
          telegramId: ctx.from?.id,
          model: modelKey,
          imageIndex: i + 1,
          error: result?.error || 'Unknown error'
        })

        // Don't send error messages to user in multi-model processing - they're handled upstream
      }
    }

      // ✅ Log summary of all processed images (normal mode only)
      const successCount = results.filter(r => r.success).length
      logger.info(`🎯 ${modelKey} processing summary: ${successCount}/${imagesToProcess.length} images successful`, {
        telegramId: ctx.from?.id,
        model: modelKey,
        totalImages: imagesToProcess.length,
        successfulImages: successCount,
        failedImages: imagesToProcess.length - successCount
      })
    }

    // Restore original session state
    if (ctx.session) {
      ctx.session.aiPhotoshopModel = originalModel
    }

  } catch (error) {
    logger.error(`Error in processSingleAiPhotoshopModel for ${modelKey}`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
      model: modelKey
    })

    // Don't send error messages to user in multi-model processing - they're handled upstream
  }
}

// Navigation buttons
aiPhotoshopScene.action('ai_photoshop_back_to_models', async ctx => {
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

🎭 *SeeDream-4* - Генерация и трансформация изображений (5⭐)
🍌 *Nano Banana* - ИИ редактирование на базе Gemini 2.5 (7⭐)
🚀 *FLUX Kontext Max* - Профессиональное редактирование (13⭐)`
      : `Choose an AI model for processing:

🎭 *SeeDream-4* - Image generation and transformation (5⭐)
🍌 *Nano Banana* - AI editing powered by Gemini 2.5 (7⭐)
🚀 *FLUX Kontext Max* - Professional editing (13⭐)`

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
})

aiPhotoshopScene.action('ai_photoshop_back_to_styles', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    if (ctx.session) {
      ctx.session.aiPhotoshopStyle = undefined
      ctx.session.aiPhotoshopImage = undefined
      ctx.session.awaitingAiPhotoshopImage = false
      ctx.session.awaitingAiPhotoshopPrompt = false
    }

    const model = AI_PHOTOSHOP_MODELS[ctx.session?.aiPhotoshopModel as keyof typeof AI_PHOTOSHOP_MODELS]

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
    await ctx.scene.enter('main_menu')
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

    // Calculate cost based on selected size or use default
    const selectedSize = ctx.session.aiPhotoshopSize || '1K'
    // Use same price calculation as in size selection
    const sizeBasePricesUSD = {
      '1K': 0.10,  // $0.10 base cost
      '2K': 0.13,  // $0.13 base cost
      '4K': 0.20   // $0.20 base cost
    }

    const sizePrices = {
      '1K': calculateFinalPriceInStars(sizeBasePricesUSD['1K']),
      '2K': calculateFinalPriceInStars(sizeBasePricesUSD['2K']),
      '4K': calculateFinalPriceInStars(sizeBasePricesUSD['4K'])
    }

    // Get current model selection first
    const currentModel = ctx.session.aiPhotoshopModel || 'seedream'

    // Calculate cost based on model selection
    let costPerImage: number
    if (currentModel === 'all_models') {
      // All models mode: dynamic cost based on selected quality
      const baseCost = Object.values(AI_PHOTOSHOP_MODELS).reduce((sum, model) => sum + model.cost, 0) // 30⭐
      switch (selectedSize) {
        case '1K':
          costPerImage = baseCost // 30⭐
          break
        case '2K':
          costPerImage = baseCost * 4 // 120⭐
          break
        case '4K':
          costPerImage = baseCost * 6 // 180⭐
          break
        default:
          costPerImage = baseCost // Default to 1K
      }
    } else {
      // Single model mode: use size-based pricing
      costPerImage = sizePrices[selectedSize as keyof typeof sizePrices] || calculateFinalPriceInStars(0.10)
    }
    const totalCost = costPerImage * ctx.session.morphingImages.length

    // Preserve user's prompt and model selections
    const currentStyle = ctx.session.aiPhotoshopStyle || 'artistic'
    const currentPrompt = ctx.session.aiPhotoshopPrompt

    // Handle 'all_models' case specially
    let modelTitle: string
    if (currentModel === 'all_models') {
      modelTitle = isRu ? '🎯 Все модели сразу' : '🎯 All models at once'
    } else {
      const modelInfo = AI_PHOTOSHOP_MODELS[currentModel as keyof typeof AI_PHOTOSHOP_MODELS]
      modelTitle = isRu ? modelInfo?.title_ru : modelInfo?.title_en
    }

    let styleDisplay = ''
    if (currentStyle === 'custom' && currentPrompt) {
      styleDisplay = isRu ? `✍️ Пользовательский: "${currentPrompt.substring(0, 50)}${currentPrompt.length > 50 ? '...' : ''}"`
                           : `✍️ Custom: "${currentPrompt.substring(0, 50)}${currentPrompt.length > 50 ? '...' : ''}"`
    } else if (currentStyle && currentStyle !== 'custom') {
      const styleInfo = AI_PHOTOSHOP_STYLES[currentStyle as keyof typeof AI_PHOTOSHOP_STYLES]
      styleDisplay = isRu ? styleInfo?.title_ru || 'Художественный' : styleInfo?.title_en || 'Artistic'
    } else {
      styleDisplay = isRu ? 'Художественный' : 'Artistic'
    }

    // Show model/style selection for multi-photo
    await ctx.reply(
      isRu
        ? `✨ Готово к обработке ${ctx.session.morphingImages.length} изображений!\n\n🎭 Модель: ${modelTitle}\n🎨 Стиль: ${styleDisplay}\n📏 Размер: ${selectedSize}\n💎 Стоимость: ${totalCost} ⭐ (${costPerImage}⭐ за фото)`
        : `✨ Ready to process ${ctx.session.morphingImages.length} images!\n\n🎭 Model: ${modelTitle}\n🎨 Style: ${styleDisplay}\n📏 Size: ${selectedSize}\n💎 Cost: ${totalCost} ⭐ (${costPerImage}⭐ per photo)`,
      {
        reply_markup: {
          inline_keyboard: [
            [{
              text: isRu ? '🚀 Начать обработку' : '🚀 Start Processing',
              callback_data: 'ai_photoshop_multi_confirm'
            }],
            [{
              text: isRu ? '⚙️ Выбрать модель' : '⚙️ Choose Model',
              callback_data: 'ai_photoshop_multi_choose_model'
            }],
            [{
              text: isRu ? '❌ Отмена' : '❌ Cancel',
              callback_data: 'ai_photoshop_multi_cancel'
            }]
          ]
        }
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
      logger.info('🎯 AI Photoshop: ALL_MODELS processing detected, triggering multi-model generation', {
        telegramId: ctx.from?.id,
        imageCount: ctx.session.morphingImages?.length || 0
      })

      // Check if prompt is already provided for all_models
      if (!ctx.session.aiPhotoshopPrompt) {
        // Ask for prompt first for all_models mode
        await ctx.editMessageText(
          isRu
            ? `🎯 <b>Все модели сразу</b>\n\n📝 Опишите, как обработать ваши ${ctx.session.morphingImages?.length || 0} изображений:\n\n💡 <i>Этот промпт будет использован для всех 4 моделей</i>`
            : `🎯 <b>All models at once</b>\n\n📝 Describe how to process your ${ctx.session.morphingImages?.length || 0} images:\n\n💡 <i>This prompt will be used for all 4 models</i>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[
                {
                  text: isRu ? '❌ Отмена' : '❌ Cancel',
                  callback_data: 'ai_photoshop_multi_cancel'
                }
              ]]
            }
          }
        )

        // Set session state to await prompt for all_models
        Object.assign(ctx.session, {
          aiPhotoshopStep: 'custom_prompt',
          awaitingAiPhotoshopPrompt: true,
          awaitingAiPhotoshopImage: false,
          aiPhotoshopModel: 'all_models' // 🚨 CRITICAL FIX: Ensure all_models is set!
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
    logger.info('🚨 AI Photoshop: Multi-photo processing initiated - FULL DEBUG', {
      telegramId: ctx.from?.id,
      sessionExists: !!ctx.session,
      morphingImagesExists: !!ctx.session?.morphingImages,
      morphingImagesCount: ctx.session?.morphingImages?.length || 0,
      hasModel: !!ctx.session?.aiPhotoshopModel,
      hasPrompt: !!ctx.session?.aiPhotoshopPrompt,
      sessionKeys: ctx.session ? Object.keys(ctx.session) : [],
      morphingImagesPreview: ctx.session?.morphingImages?.map((img, index) => ({
        index,
        hasBuffer: !!img.buffer,
        hasUrl: !!img.url,
        bufferSize: img.buffer?.length || 0,
        filename: img.filename
      })) || []
    })

    if (!ctx.session.morphingImages || ctx.session.morphingImages.length < 1) {
      logger.error('AI Photoshop: No images found for processing', {
        telegramId: ctx.from?.id,
        imageCount: ctx.session.morphingImages?.length || 0
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
      logger.warn('Failed to delete confirmation message', { error: error.message })
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
        promptLength: currentPrompt?.length || 0
      },
      currentStep: ctx.session.aiPhotoshopStep
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
        promptLength: currentPrompt.length
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
            inline_keyboard: [[
              {
                text: isRu ? '⏳ Обработка...' : '⏳ Processing...',
                callback_data: 'loading_processing_indicator'
              }
            ]]
          }
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
        step: ctx.session.aiPhotoshopStep
      }
    })

    // ✅ ENHANCED PROMPT VALIDATION with automatic fallback
    if (!ctx.session.aiPhotoshopPrompt) {
      logger.warn('⚠️ AI Photoshop: No custom prompt found, using style-based fallback', {
        telegramId: ctx.from?.id,
        currentStyle: ctx.session.aiPhotoshopStyle,
        availableStyles: Object.keys(AI_PHOTOSHOP_STYLES)
      })

      // Use style-based prompt as fallback
      if (ctx.session.aiPhotoshopStyle && ctx.session.aiPhotoshopStyle !== 'custom') {
        const style = AI_PHOTOSHOP_STYLES[ctx.session.aiPhotoshopStyle as keyof typeof AI_PHOTOSHOP_STYLES]
        ctx.session.aiPhotoshopPrompt = style?.template || 'enhance this image'
        logger.info('✅ AI Photoshop: Fallback prompt applied', {
          telegramId: ctx.from?.id,
          style: ctx.session.aiPhotoshopStyle,
          fallbackPrompt: ctx.session.aiPhotoshopPrompt
        })
      } else {
        // Ultimate fallback for multi-photo processing
        ctx.session.aiPhotoshopPrompt = 'merge and enhance these images'
        logger.info('✅ AI Photoshop: Multi-photo fallback prompt applied', {
          telegramId: ctx.from?.id,
          imageCount: ctx.session.morphingImages?.length,
          ultimatePrompt: ctx.session.aiPhotoshopPrompt
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
      ctx.session.aiPhotoshopModel = (lastPhoto.model as 'seedream' | 'nano_banana' | 'flux_max' | 'qwen_edit_plus') || 'seedream'
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
                callback_data: 'ai_photoshop_exit_to_menu'
              }
            ]
          ]
        }
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
    const imageUrl = typeof lastPhoto.imageUrl === 'string' ? lastPhoto.imageUrl : lastPhoto.url

    await ctx.editMessageText(
      isRu
        ? `⬆️ *Увеличиваю качество последнего фото!*\n\n🎯 Применяю Clarity Upscaler для улучшения разрешения в 2 раза...\n\n💎 Стоимость: 3 ⭐`
        : `⬆️ *Upscaling last photo quality!*\n\n🎯 Applying Clarity Upscaler to enhance resolution 2x...\n\n💎 Cost: 3 ⭐`,
      {
        parse_mode: 'Markdown'
      }
    )

    try {
      await upscaleImage({
        imageUrl,
        telegram_id: String(ctx.from?.id),
        username: ctx.from?.username || 'unknown_user',
        is_ru: isRu,
        ctx,
        originalPrompt: lastPhoto.prompt || 'Dialog mode button upscale'
      })

      // Show dialog interface again after upscaling
      await showDialogInterface(ctx)

    } catch (error) {
      logger.error('🚨 AI Photoshop: Upscaler button failed', {
        telegramId: ctx.from?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при увеличении качества. Попробуйте позже.'
          : '❌ Error occurred during upscaling. Please try again later.'
      )
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
    const totalCost = Object.values(AI_PHOTOSHOP_MODELS).reduce((sum, model) => sum + model.cost, 0)

    // ✅ EXTENSIBLE: Get all available models dynamically
    const availableModels = Object.keys(AI_PHOTOSHOP_MODELS) as Array<keyof typeof AI_PHOTOSHOP_MODELS>
    const modelNames = availableModels.map(key =>
      isRu ? AI_PHOTOSHOP_MODELS[key].title_ru : AI_PHOTOSHOP_MODELS[key].title_en
    )

    await ctx.reply(
      isRu
        ? `🎯 *Генерация во ВСЕХ моделях!*\n\n📸 Обрабатываю последнее фото во всех ${availableModels.length} моделях:\n\n${modelNames.map((name, i) => `${i + 1}. ${name} (${Object.values(AI_PHOTOSHOP_MODELS)[i].cost}⭐)`).join('\n')}\n\n💎 *Общая стоимость: ${totalCost}⭐*\n\n⏳ Это займет больше времени, но вы получите результаты от всех моделей для сравнения!`
        : `🎯 *Generating with ALL models!*\n\n📸 Processing last photo with all ${availableModels.length} models:\n\n${modelNames.map((name, i) => `${i + 1}. ${name} (${Object.values(AI_PHOTOSHOP_MODELS)[i].cost}⭐)`).join('\n')}\n\n💎 *Total cost: ${totalCost}⭐*\n\n⏳ This will take longer, but you'll get results from all models for comparison!`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            {
              text: isRu ? '⏳ Обработка всеми моделями...' : '⏳ Processing with all models...',
              callback_data: 'loading_all_models_indicator'
            }
          ]]
        }
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
          originalPrompt: lastPhoto.prompt
        })

        // Set up session for this model
        if (ctx.session) {
          ctx.session.aiPhotoshopModel = modelKey as any
          ctx.session.aiPhotoshopPrompt = lastPhoto.prompt
          ctx.session.aiPhotoshopImage = lastPhoto.url
          ctx.session.aiPhotoshopStep = 'processing'
          // Default size for SeeDream-4 model
          if (modelKey === 'seedream') {
            ctx.session.aiPhotoshopSize = lastPhoto.additionalInfo?.size || '1K'
          }
        }

        // Process with current model
        await processAiPhotoshopRequest(ctx, lastPhoto.prompt)

        // Small delay between models to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000))

      } catch (modelError) {
        logger.error(`❌ AI Photoshop: Error processing with model ${modelKey}`, {
          telegramId: ctx.from?.id,
          model: modelKey,
          error: modelError instanceof Error ? modelError.message : 'Unknown error'
        })

        // Log error but don't spam user with individual error messages
      }
    }

    // Show final results summary
    await ctx.reply(
      isRu
        ? `✅ *Обработка всеми моделями завершена!*\n\n🎨 Проверьте результаты выше - теперь у вас есть варианты от всех ${availableModels.length} моделей для сравнения!\n\n💡 Используйте команды для дальнейшего улучшения любого результата.`
        : `✅ *Processing with all models completed!*\n\n🎨 Check the results above - now you have variations from all ${availableModels.length} models for comparison!\n\n💡 Use commands to further improve any result.`,
      {
        parse_mode: 'Markdown'
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
        reply_markup: createModelSelectionKeyboard(isRu).reply_markup
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
        isRu
          ? '❌ Нет сохраненных фотографий.'
          : '❌ No saved photos.'
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
            : `${i + 1}. Model: ${photo.model}\n💬 "${photo.prompt}"\n⏰ ${new Date(photo.timestamp).toLocaleString('en')}`
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
        reply_markup: createModelSelectionKeyboard(isRu).reply_markup
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
          remove_keyboard: true
        }
      }
    )

    // Clear working session but keep saved results for next time
    if (ctx.session) {
      ctx.session.aiPhotoshopModel = undefined
      ctx.session.aiPhotoshopStyle = undefined
      ctx.session.aiPhotoshopImage = undefined
      ctx.session.aiPhotoshopPrompt = undefined
      ctx.session.aiPhotoshopSize = undefined
      ctx.session.awaitingAiPhotoshopImage = false
      ctx.session.awaitingAiPhotoshopPrompt = false
      ctx.session.aiPhotoshopStep = undefined
      // Keep savedAiPhotoshopResults and dialogMode for next entry
    }

    await ctx.scene.leave()
    await ctx.scene.enter('main_menu')

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
      isRu
        ? '🚪 Выходим из AI Photoshop...'
        : '🚪 Exiting AI Photoshop...'
    )

    await ctx.scene.leave()
    await ctx.scene.enter('main_menu')
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
    await ctx.scene.enter('start_scene')
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
      await ctx.reply(isRu ? '❌ Нет сохраненных результатов' : '❌ No saved results')
      return
    }

    const lastResult = savedResults[savedResults.length - 1]
    const lastPrompt = lastResult.prompt || ''

    // ✅ CRITICAL FIX: Check if this was from all_models mode
    const wasAllModels = lastResult.wasAllModels || false
    const lastModel = wasAllModels ? 'all_models' : lastResult.model

    // ✅ CRITICAL FIX: Restore the correct model mode to session
    if (ctx.session) {
      ctx.session.aiPhotoshopModel = lastModel as keyof typeof AI_PHOTOSHOP_MODELS
    }

    logger.info('AI Photoshop: Continue with same settings', {
      telegramId: ctx.from?.id,
      model: lastModel,
      wasAllModels,
      promptLength: lastPrompt.length
    })

    const modelDisplay = wasAllModels
      ? (isRu ? 'Все модели' : 'All models')
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
        ctx.session.aiPhotoshopCameraAngle = angle as 'medium_shot' | 'close_up' | 'extreme_close_up' | 'wide_shot' | 'high_angle' | 'low_angle' | 'dutch_angle' | 'over_shoulder' | 'profile_shot' | 'three_quarter' | 'bird_eye' | 'macro_beauty'
      }

      const angleLabel = getCameraAngleLabel(angle, isRu)
      const cameraPrompt = AI_PHOTOSHOP_CAMERA_ANGLES[angle as keyof typeof AI_PHOTOSHOP_CAMERA_ANGLES]

      await ctx.editMessageText(
        isRu
          ? `✅ *Ракурс камеры выбран:* ${angleLabel}\n\n📝 Промпт добавлен: \`${cameraPrompt}\`\n\n💡 Теперь напишите текст для обработки фотографии или выберите другие настройки.`
          : `✅ *Camera angle selected:* ${angleLabel}\n\n📝 Prompt added: \`${cameraPrompt}\`\n\n💡 Now write text to process the photo or choose other settings.`,
        {
          parse_mode: 'Markdown',
          reply_markup: createCameraAngleKeyboard(isRu).reply_markup,
        }
      )
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
        ctx.session.aiPhotoshopLighting = lighting as 'soft_natural' | 'dramatic' | 'golden_hour' | 'studio' | 'rembrandt' | 'butterfly' | 'split' | 'rim' | 'candlelight' | 'neon_noir' | 'morning' | 'sunset'
      }

      const lightingLabel = getLightingLabel(lighting, isRu)
      const lightingPrompt = AI_PHOTOSHOP_LIGHTING_SETUPS[lighting as keyof typeof AI_PHOTOSHOP_LIGHTING_SETUPS]

      await ctx.editMessageText(
        isRu
          ? `✅ *Освещение выбрано:* ${lightingLabel}\n\n📝 Промпт добавлен: \`${lightingPrompt}\`\n\n💡 Теперь напишите текст для обработки фотографии или выберите другие настройки.`
          : `✅ *Lighting selected:* ${lightingLabel}\n\n📝 Prompt added: \`${lightingPrompt}\`\n\n💡 Now write text to process the photo or choose other settings.`,
        {
          parse_mode: 'Markdown',
          reply_markup: createLightingKeyboard(isRu).reply_markup,
        }
      )
    } catch (error) {
      logger.error('Error handling lighting selection', { error, lighting })
    }
  })
})

// Composition selection handlers
Object.keys(AI_PHOTOSHOP_FRAME_COMPOSITION).forEach(composition => {
  aiPhotoshopScene.action(`ai_photoshop_composition_${composition}`, async ctx => {
    try {
      await ctx.answerCbQuery()
      const isRu = isRussianFromState(ctx)

      // Store composition in session
      if (ctx.session) {
        ctx.session.aiPhotoshopComposition = composition as 'center_weighted' | 'rule_thirds' | 'golden_ratio' | 'symmetrical' | 'negative_space' | 'leading_lines'
      }

      const compositionLabel = getCompositionLabel(composition, isRu)
      const compositionPrompt = AI_PHOTOSHOP_FRAME_COMPOSITION[composition as keyof typeof AI_PHOTOSHOP_FRAME_COMPOSITION]

      await ctx.editMessageText(
        isRu
          ? `✅ *Композиция выбрана:* ${compositionLabel}\n\n📝 Промпт добавлен: \`${compositionPrompt}\`\n\n💡 Теперь напишите текст для обработки фотографии или выберите другие настройки.`
          : `✅ *Composition selected:* ${compositionLabel}\n\n📝 Prompt added: \`${compositionPrompt}\`\n\n💡 Now write text to process the photo or choose other settings.`,
        {
          parse_mode: 'Markdown',
          reply_markup: createCompositionKeyboard(isRu).reply_markup,
        }
      )
    } catch (error) {
      logger.error('Error handling composition selection', { error, composition })
    }
  })
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
        variationsCount: count
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
  { key: '1_1', ratio: '1:1', labelRu: '🔲 1:1 (Квадрат)', labelEn: '🔲 1:1 (Square)', sizeKey: '1K' },
  { key: '16_9', ratio: '16:9', labelRu: '📺 16:9 (Широкий)', labelEn: '📺 16:9 (Wide)', sizeKey: '4K' },
  { key: '9_16', ratio: '9:16', labelRu: '📱 9:16 (Портрет)', labelEn: '📱 9:16 (Portrait)', sizeKey: '2K' },
  { key: '4_3', ratio: '4:3', labelRu: '🖼️ 4:3 (Стандарт)', labelEn: '🖼️ 4:3 (Standard)', sizeKey: '1K' },
  { key: '3_4', ratio: '3:4', labelRu: '🖼️ 3:4 (Портрет)', labelEn: '🖼️ 3:4 (Portrait)', sizeKey: '1K' },
  { key: '21_9', ratio: '21:9', labelRu: '🎬 21:9 (Кино)', labelEn: '🎬 21:9 (Cinema)', sizeKey: '4K' },
  { key: '9_21', ratio: '9:21', labelRu: '🎬 9:21 (Портрет)', labelEn: '🎬 9:21 (Portrait)', sizeKey: '2K' }
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
    if (ctx.session?.savedAiPhotoshopResults && ctx.session.savedAiPhotoshopResults.length > 0) {
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