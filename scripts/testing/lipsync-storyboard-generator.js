#!/usr/bin/env node

/**
 * 🎵 CLIP TEMPLATES STORYBOARD MEGA GENERATOR
 * ПОЛНАЯ раскадровка для музыкальных клипов
 * 35+ клиповых темплейтов с ФОКУСОМ на планы по грудь!
 */

const fs = require('fs')
const path = require('path')

// Прямые импорты из нашего кода
const {
  generateAdvancedFluxKontext,
} = require('../../src/services/generateFluxKontext')

console.log('🎵 CLIP TEMPLATES STORYBOARD MEGA GENERATOR!')
console.log('==========================================')

// Конфигурация
const CONFIG = {
  sourceImage:
    '/Users/playra/999-multibots-telegraf/assets/bible_vibecoder/lyps-sync.jpg',
  outputDir:
    '/Users/playra/999-multibots-telegraf/assets/clip_templates_storyboard',
  telegram_id: '144022504',
  username: 'playra',
}

// Создаем папку
if (!fs.existsSync(CONFIG.outputDir)) {
  fs.mkdirSync(CONFIG.outputDir, { recursive: true })
  console.log('✅ Created clip templates directory:', CONFIG.outputDir)
}

// Конвертируем изображение в base64
function imageToDataURI(imagePath) {
  try {
    const imageBuffer = fs.readFileSync(imagePath)
    const mimeType =
      path.extname(imagePath) === '.jpg' || path.extname(imagePath) === '.jpeg'
        ? 'image/jpeg'
        : 'image/png'
    const base64 = imageBuffer.toString('base64')
    return `data:${mimeType};base64,${base64}`
  } catch (error) {
    console.error('❌ Error converting image to base64:', error.message)
    return null
  }
}

const sourceImageDataURI = imageToDataURI(CONFIG.sourceImage)
if (!sourceImageDataURI) {
  console.error('❌ Failed to convert source image to data URI')
  process.exit(1)
}

console.log('✅ Source image converted for clip templates generation!')

// 🎬 МЕГА КОЛЛЕКЦИЯ КЛИПОВЫХ ТЕМПЛЕЙТОВ (ФОКУС НА ПЛАНЫ ПО ГРУДЬ!)
const CLIP_TEMPLATES_SHOTS = [
  // === ОСНОВНЫЕ ПЛАНЫ ДЛЯ КЛИПОВ ===
  {
    id: 'extreme_closeup_lips',
    name: '💋 Экстра крупный план (губы)',
    prompt:
      'Extreme close-up of lips for music video, perfect mouth detail, beautiful blue eyes, professional cinematography, dramatic composition',
    cameraSettings: 'angle:extreme_closeup',
  },
  {
    id: 'close_up_emotion',
    name: '🔍 Крупный план (эмоция)',
    prompt:
      'Close-up face shot for music video performance, intense emotional expression, beautiful blue eyes, perfect for lip sync, professional framing',
    cameraSettings: 'angle:close_up',
  },

  // === CHEST-UP SHOT VARIATIONS (ПЛАНЫ ПО ГРУДЬ) ===
  {
    id: 'medium_closeup_chest_center',
    name: '📷 План по грудь (центр)',
    prompt:
      'Medium close-up chest shot for music video, centered framing, chest up composition, beautiful blue eyes, perfect for performance shots, professional cinematography',
    cameraSettings: 'angle:close_up',
  },
  {
    id: 'medium_closeup_chest_left',
    name: '📷 План по грудь (левое смещение)',
    prompt:
      'Medium close-up chest shot for music video, slightly left positioned, chest up framing with left camera shift, beautiful blue eyes, dynamic composition',
    cameraSettings: 'angle:close_up',
  },
  {
    id: 'medium_closeup_chest_right',
    name: '📷 План по грудь (правое смещение)',
    prompt:
      'Medium close-up chest shot for music video, slightly right positioned, chest up framing with right camera shift, beautiful blue eyes, balanced composition',
    cameraSettings: 'angle:close_up',
  },
  {
    id: 'medium_closeup_chest_slight_low',
    name: '📷 План по грудь (чуть снизу)',
    prompt:
      'Medium close-up chest shot for music video, slightly low angle, chest up framing from below, beautiful blue eyes, subtle upward perspective',
    cameraSettings: 'angle:close_up',
  },
  {
    id: 'medium_closeup_chest_slight_high',
    name: '📷 План по грудь (чуть сверху)',
    prompt:
      'Medium close-up chest shot for music video, slightly high angle, chest up framing from above, beautiful blue eyes, subtle downward perspective',
    cameraSettings: 'angle:close_up',
  },
  {
    id: 'medium_closeup_chest_tilted_left',
    name: '📷 План по грудь (наклон влево)',
    prompt:
      'Medium close-up chest shot for music video, tilted left composition, chest up framing with camera tilt, beautiful blue eyes, dynamic angle',
    cameraSettings: 'angle:close_up',
  },
  {
    id: 'medium_closeup_chest_tilted_right',
    name: '📷 План по грудь (наклон вправо)',
    prompt:
      'Medium close-up chest shot for music video, tilted right composition, chest up framing with camera tilt, beautiful blue eyes, energetic angle',
    cameraSettings: 'angle:close_up',
  },
  {
    id: 'medium_closeup_chest_tight',
    name: '📷 План по грудь (плотный)',
    prompt:
      'Tight medium close-up chest shot for music video, closer chest framing, intimate composition, beautiful blue eyes, focused on upper torso',
    cameraSettings: 'angle:close_up',
  },
  {
    id: 'medium_closeup_chest_loose',
    name: '📷 План по грудь (свободный)',
    prompt:
      'Loose medium close-up chest shot for music video, relaxed chest framing, comfortable composition, beautiful blue eyes, breathing room',
    cameraSettings: 'angle:close_up',
  },
  {
    id: 'medium_closeup_chest_profile_left',
    name: '📷 План по грудь (профиль влево)',
    prompt:
      'Medium close-up chest shot profile left for music video, side angle chest framing, beautiful blue eyes, elegant profile composition',
    cameraSettings: 'angle:profile_shot',
  },
  {
    id: 'medium_closeup_chest_profile_right',
    name: '📷 План по грудь (профиль вправо)',
    prompt:
      'Medium close-up chest shot profile right for music video, side angle chest framing, beautiful blue eyes, dramatic profile composition',
    cameraSettings: 'angle:profile_shot',
  },
  {
    id: 'medium_closeup_chest_three_quarter_left',
    name: '📷 План по грудь (3/4 влево)',
    prompt:
      'Medium close-up chest shot 3/4 left for music video, three quarter angle chest framing, beautiful blue eyes, dimensional composition',
    cameraSettings: 'angle:three_quarter',
  },
  {
    id: 'medium_closeup_chest_three_quarter_right',
    name: '📷 План по грудь (3/4 вправо)',
    prompt:
      'Medium close-up chest shot 3/4 right for music video, three quarter angle chest framing, beautiful blue eyes, depth composition',
    cameraSettings: 'angle:three_quarter',
  },

  // === ДОПОЛНИТЕЛЬНЫЕ CHEST-UP ВАРИАЦИИ ===
  {
    id: 'medium_closeup_chest_dutch_angle',
    name: '📷 План по грудь (голландский угол)',
    prompt:
      'Medium close-up chest shot dutch angle for music video, tilted horizon chest framing, beautiful blue eyes, dynamic tension composition',
    cameraSettings: 'angle:dutch_angle',
  },
  {
    id: 'medium_closeup_chest_over_shoulder',
    name: '📷 План по грудь (через плечо)',
    prompt:
      'Medium close-up chest shot over shoulder for music video, chest framing with shoulder depth, beautiful blue eyes, layered composition',
    cameraSettings: 'angle:over_shoulder',
  },

  // === КОНТРАСТНЫЕ ПЛАНЫ ДЛЯ РАЗНООБРАЗИЯ ===
  {
    id: 'medium_shot_waist',
    name: '📷 Средний план (пояс)',
    prompt:
      'Medium shot for music video performance, waist up framing, beautiful blue eyes, perfect for choreography and movement',
    cameraSettings: 'angle:medium_shot',
  },
  {
    id: 'american_shot_classic',
    name: '🇺🇸 Американский план (классика)',
    prompt:
      'American shot for music video, 3/4 body length, classic music video framing, beautiful blue eyes, professional cinematography',
    cameraSettings: 'angle:american_shot',
  },

  // === ДИНАМИЧЕСКИЕ УГЛЫ БЕЗ СВЕТА ===
  {
    id: 'low_angle_power',
    name: '📐 Нижний ракурс (мощь)',
    prompt:
      'Low angle shot for music video, powerful perspective, dramatic composition, beautiful blue eyes, artist dominance',
    cameraSettings: 'angle:low_angle',
  },
  {
    id: 'high_angle_vulnerability',
    name: '📐 Верхний ракурс (уязвимость)',
    prompt:
      'High angle shot for music video, intimate perspective, emotional vulnerability, beautiful blue eyes, artistic cinematography',
    cameraSettings: 'angle:high_angle',
  },
  {
    id: 'dutch_angle_energy',
    name: '🎭 Голландский угол (энергия)',
    prompt:
      'Dutch angle for music video, tilted dynamic composition, energetic style, beautiful blue eyes, creative cinematography',
    cameraSettings: 'angle:dutch_angle',
  },

  // === ПРОФИЛЬНЫЕ ПЛАНЫ ===
  {
    id: 'profile_left_artistic',
    name: '👤 Левый профиль (артистичный)',
    prompt:
      'Left profile shot for music video, elegant side angle, artistic silhouette, beautiful blue eyes, creative composition',
    cameraSettings: 'angle:profile_shot',
  },
  {
    id: 'profile_right_dramatic',
    name: '👤 Правый профиль (драматичный)',
    prompt:
      'Right profile shot for music video, dramatic side angle portrait, beautiful blue eyes, professional cinematography',
    cameraSettings: 'angle:profile_shot',
  },
  {
    id: 'three_quarter_left_depth',
    name: '📐 3/4 влево (глубина)',
    prompt:
      '3/4 left angle for music video, dimensional depth, professional portrait style, beautiful blue eyes',
    cameraSettings: 'angle:three_quarter',
  },
  {
    id: 'three_quarter_right_dynamic',
    name: '📐 3/4 вправо (динамика)',
    prompt:
      '3/4 right angle for music video, dimensional perspective, beautiful blue eyes, professional cinematography',
    cameraSettings: 'angle:three_quarter',
  },

  // === СПЕЦИАЛЬНЫЕ КЛИПОВЫЕ ПЛАНЫ ===
  {
    id: 'over_shoulder_conversation',
    name: '🏔️ Через плечо (диалог)',
    prompt:
      'Over-the-shoulder shot for music video, depth perspective, conversation angle, beautiful blue eyes, cinematic composition',
    cameraSettings: 'angle:over_shoulder',
  },
  {
    id: 'back_shot_mystery',
    name: '🔄 Съемка сзади (тайна)',
    prompt:
      'Back shot for music video, mysterious rear angle, artistic composition, beautiful blue eyes, creative perspective',
    cameraSettings: 'angle:back_shot',
  },
  {
    id: 'wide_shot_stage',
    name: '🌐 Общий план (сцена)',
    prompt:
      'Wide shot for music video, full scene overview, stage performance, beautiful blue eyes, establishing shot',
    cameraSettings: 'angle:wide_shot',
  },

  // === КРЕАТИВНЫЕ УГЛЫ ===
  {
    id: 'birds_eye_creative',
    name: '🦅 Вид сверху (креатив)',
    prompt:
      'Birds eye view for music video, creative top-down perspective, artistic angle, beautiful blue eyes, overhead shot',
    cameraSettings: 'angle:birds_eye',
  },
  {
    id: 'worms_eye_dramatic',
    name: '🐛 Вид снизу (драма)',
    prompt:
      'Worms eye view for music video, extreme low angle, dramatic upward perspective, beautiful blue eyes, powerful composition',
    cameraSettings: 'angle:worms_eye',
  },
  {
    id: 'macro_beauty_detail',
    name: '💎 Макро красота (детали)',
    prompt:
      'Macro beauty shot for music video, extreme close-up of facial features, intricate details, beautiful blue eyes, artistic focus',
    cameraSettings: 'angle:macro_beauty',
  },

  // === ДОПОЛНИТЕЛЬНЫЕ КЛИПОВЫЕ ВАРИАЦИИ (БЕЗ КОВБОЙСКОГО!) ===
  {
    id: 'eye_level_connection',
    name: '👁️ На уровне глаз (связь)',
    prompt:
      'Eye level shot for music video, natural perspective, direct connection with audience, beautiful blue eyes, professional framing',
    cameraSettings: 'angle:eye_level',
  },

  // === НОВЫЕ КЛИПОВЫЕ ТЕМПЛЕЙТЫ ===
  {
    id: 'extreme_wide_landscape',
    name: '🌄 Сверх широкий план (ландшафт)',
    prompt:
      'Extreme wide shot for music video, cinematic landscape, epic scale, environmental context, beautiful blue eyes',
    cameraSettings: 'angle:wide_shot',
  },
  {
    id: 'tracking_shot_movement',
    name: '🎯 Следящий план (движение)',
    prompt:
      'Tracking shot style for music video, dynamic movement, flowing composition, cinematic motion, beautiful blue eyes',
    cameraSettings: 'angle:medium_shot',
  },
  {
    id: 'insert_shot_hands',
    name: '✋ Детальный план (руки)',
    prompt:
      'Insert shot of hands for music video, detailed gesture, expressive movement, artistic focus, beautiful blue eyes',
    cameraSettings: 'angle:extreme_closeup',
  },
  {
    id: 'reaction_shot_emotion',
    name: '😮 Реакционный план (эмоция)',
    prompt:
      'Reaction shot for music video, emotional response, dramatic expression, beautiful blue eyes, professional framing',
    cameraSettings: 'angle:close_up',
  },
  {
    id: 'establishing_shot_location',
    name: '🏛️ Установочный план (локация)',
    prompt:
      'Establishing shot for music video, location context, environmental setting, beautiful blue eyes, cinematic composition',
    cameraSettings: 'angle:wide_shot',
  },
  {
    id: 'cutaway_shot_detail',
    name: '📋 Перебивочный план (деталь)',
    prompt:
      'Cutaway shot for music video, environmental detail, contextual element, beautiful blue eyes, artistic composition',
    cameraSettings: 'angle:close_up',
  },
]

// Мок контекста
const createMockContext = () => ({
  telegram: {
    sendMessage: async (chatId, text, options) => {
      console.log(`📱 [${chatId}] ${text}`)
      return { message_id: Date.now() }
    },
    sendPhoto: async (chatId, photo, options) => {
      console.log(
        `📸 [${chatId}] Photo sent: ${options?.caption || 'No caption'}`
      )
      return { message_id: Date.now() }
    },
  },
  session: {},
  botInfo: { username: 'ai_koshey_bot' },
})

// Функция генерации одного кадра
async function generateClipTemplateFrame(shot, index) {
  console.log(
    `\n🎬 [${index + 1}/${CLIP_TEMPLATES_SHOTS.length}] Generating: ${shot.name}`
  )
  console.log(`📝 Prompt: ${shot.prompt}`)
  console.log(`🎯 Camera: ${shot.cameraSettings}`)

  try {
    const params = {
      prompt: shot.prompt,
      mode: 'single',
      imageA: sourceImageDataURI,
      modelType: 'max',
      telegram_id: CONFIG.telegram_id,
      username: CONFIG.username,
      is_ru: true,
      ctx: createMockContext(),
      cameraSettings: shot.cameraSettings,
    }

    const result = await generateAdvancedFluxKontext(params)

    if (result && result.prompt_id) {
      console.log(
        `✅ [${index + 1}/${CLIP_TEMPLATES_SHOTS.length}] Generated successfully! Prompt ID: ${result.prompt_id}`
      )

      // Копируем файл в нашу папку с понятным именем
      const targetFileName = `${String(index + 1).padStart(2, '0')}_${shot.id}.jpg`
      const targetPath = path.join(CONFIG.outputDir, targetFileName)

      // Находим последний созданный файл
      const uploadsDir = path.join(
        process.cwd(),
        'src/uploads',
        CONFIG.telegram_id,
        'flux-kontext-single'
      )
      if (fs.existsSync(uploadsDir)) {
        const files = fs
          .readdirSync(uploadsDir)
          .filter(f => f.endsWith('.jpeg') || f.endsWith('.jpg'))
          .sort((a, b) => {
            const statA = fs.statSync(path.join(uploadsDir, a))
            const statB = fs.statSync(path.join(uploadsDir, b))
            return statB.mtime - statA.mtime
          })

        if (files.length > 0) {
          const latestFile = path.join(uploadsDir, files[0])
          fs.copyFileSync(latestFile, targetPath)
          console.log(`📁 Saved as: ${targetFileName}`)
        }
      }

      return true
    } else {
      console.log(
        `❌ [${index + 1}/${CLIP_TEMPLATES_SHOTS.length}] Generation failed - no result`
      )
      return false
    }
  } catch (error) {
    console.error(
      `❌ [${index + 1}/${CLIP_TEMPLATES_SHOTS.length}] Error:`,
      error.message
    )
    return false
  }
}

// Главная функция генерации клиповых темплейтов
async function generateClipTemplatesStoryboard() {
  console.log(`\n🚀 GENERATING COMPLETE CLIP TEMPLATES STORYBOARD!`)
  console.log(`🎬 Total templates: ${CLIP_TEMPLATES_SHOTS.length}`)
  console.log('='.repeat(60))

  let successCount = 0

  for (let i = 0; i < CLIP_TEMPLATES_SHOTS.length; i++) {
    const shot = CLIP_TEMPLATES_SHOTS[i]
    const success = await generateClipTemplateFrame(shot, i)

    if (success) {
      successCount++
    }

    // Пауза между генерациями
    if (i < CLIP_TEMPLATES_SHOTS.length - 1) {
      console.log('⏳ Waiting 3 seconds before next template...')
      await new Promise(resolve => setTimeout(resolve, 3000))
    }
  }

  console.log(`\n🎉 CLIP TEMPLATES STORYBOARD COMPLETE!`)
  console.log('='.repeat(60))
  console.log(`✅ Successful: ${successCount}/${CLIP_TEMPLATES_SHOTS.length}`)
  console.log(`📁 Check your clip templates in: ${CONFIG.outputDir}`)

  // Показываем созданные файлы
  if (fs.existsSync(CONFIG.outputDir)) {
    const files = fs
      .readdirSync(CONFIG.outputDir)
      .filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg'))
      .sort()

    console.log(`\n🎬 Generated clip template frames (${files.length} total):`)
    files.forEach(file => {
      const filePath = path.join(CONFIG.outputDir, file)
      const stats = fs.statSync(filePath)
      console.log(`  📸 ${file} (${Math.round(stats.size / 1024)}KB)`)
    })

    console.log(
      `\n🎯 ГОТОВО! У тебя есть полная коллекция клиповых темплейтов!`
    )
    console.log(`💫 Теперь можешь создать функцию-темплейт для бота!`)
    console.log(`🚀 Фото + Темплейт = Раскадровка для клипа!`)
  }
}

// Запускаем генерацию clip templates
generateClipTemplatesStoryboard().catch(error => {
  console.error('💥 FATAL ERROR:', error)
  process.exit(1)
})
