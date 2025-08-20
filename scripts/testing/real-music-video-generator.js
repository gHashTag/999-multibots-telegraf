#!/usr/bin/env node

/**
 * 🎵 REAL MUSIC VIDEO FRAME GENERATOR
 * РЕАЛЬНАЯ генерация всех кадров для музыкального клипа
 * Напрямую через функции бота!
 */

const fs = require('fs')
const path = require('path')

// Прямые импорты из нашего кода - ИСПРАВЛЯЕМ ПУТЬ
const {
  generateAdvancedFluxKontext,
} = require('../../src/services/generateFluxKontext')

console.log('🎵 REAL MUSIC VIDEO FRAME GENERATOR - STARTING!')
console.log('==============================================')

// Конфигурация
const CONFIG = {
  sourceImage:
    '/Users/playra/999-multibots-telegraf/assets/bible_vibecoder/lyps-sync.jpg',
  outputDir: '/Users/playra/999-multibots-telegraf/assets/music_video_frames',
  telegram_id: '144022504', // Твой ID
  username: 'playra',
}

// Создаем папку если не существует
if (!fs.existsSync(CONFIG.outputDir)) {
  fs.mkdirSync(CONFIG.outputDir, { recursive: true })
  console.log('✅ Created output directory:', CONFIG.outputDir)
}

// Проверяем что исходное изображение существует
if (!fs.existsSync(CONFIG.sourceImage)) {
  console.error('❌ Source image not found:', CONFIG.sourceImage)
  process.exit(1)
}

console.log('✅ Source image found:', CONFIG.sourceImage)

// Конвертируем изображение в base64 data URI
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

console.log(
  '✅ Source image converted to data URI (length:',
  sourceImageDataURI.length,
  'chars)'
)

// 8 ракурсов для музыкального клипа
const MUSIC_VIDEO_ANGLES = [
  {
    id: 'close_up',
    name: '🔍 Крупный план',
    prompt:
      'Emotional close-up shot for music video, intense facial expression, dramatic lighting, professional portrait photography, high fashion style',
    cameraSettings: 'angle:close_up',
  },
  {
    id: 'medium_shot',
    name: '📷 Средний план',
    prompt:
      'Medium shot for music video performance, perfect for lip sync, professional cinematography, dynamic composition, stage lighting',
    cameraSettings: 'angle:medium_shot',
  },
  {
    id: 'american_shot',
    name: '🇺🇸 Американский план',
    prompt:
      'American shot 3/4 length for music video, cinematic framing, professional music video style, dynamic pose, stage presence',
    cameraSettings: 'angle:american_shot',
  },
  {
    id: 'low_angle',
    name: '📐 Нижний ракурс',
    prompt:
      'Low angle shot for music video, powerful perspective, dramatic composition, artist dominance, professional cinematography',
    cameraSettings: 'angle:low_angle',
  },
  {
    id: 'high_angle',
    name: '📐 Верхний ракурс',
    prompt:
      'High angle shot for music video, artistic perspective, dramatic overhead view, cinematic composition, professional lighting',
    cameraSettings: 'angle:high_angle',
  },
  {
    id: 'profile_shot',
    name: '👤 Профиль',
    prompt:
      'Elegant profile shot for music video, side angle portrait, artistic silhouette, dramatic lighting, professional photography',
    cameraSettings: 'angle:profile_shot',
  },
  {
    id: 'extreme_closeup',
    name: '🔬 Экстра крупный план',
    prompt:
      'Extreme close-up for music video, ultra detailed facial features, intense emotion, macro perspective, dramatic intensity',
    cameraSettings: 'angle:extreme_closeup',
  },
  {
    id: 'dutch_angle',
    name: '🎭 Голландский угол',
    prompt:
      'Dutch angle shot for music video, tilted composition, dynamic tension, artistic cinematography, creative perspective',
    cameraSettings: 'angle:dutch_angle',
  },
]

// Мок контекста для генерации
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
async function generateFrame(angle, index) {
  console.log(`\n🎬 [${index + 1}/8] Generating: ${angle.name}`)
  console.log(`📝 Prompt: ${angle.prompt}`)
  console.log(`🎯 Camera: ${angle.cameraSettings}`)

  try {
    const params = {
      prompt: angle.prompt,
      mode: 'single',
      imageA: sourceImageDataURI, // Используем base64 data URI
      modelType: 'max',
      telegram_id: CONFIG.telegram_id,
      username: CONFIG.username,
      is_ru: true,
      ctx: createMockContext(),
      cameraSettings: angle.cameraSettings,
    }

    const result = await generateAdvancedFluxKontext(params)

    if (result && result.prompt_id) {
      console.log(
        `✅ [${index + 1}/8] Generated successfully! Prompt ID: ${result.prompt_id}`
      )

      // Копируем файл в нашу папку с понятным именем
      const sourcePattern = `/uploads/${CONFIG.telegram_id}/flux-kontext-single/`
      const targetFileName = `${String(index + 1).padStart(2, '0')}_${angle.id}.jpg`
      const targetPath = path.join(CONFIG.outputDir, targetFileName)

      // Находим последний созданный файл
      const uploadsDir = path.join(
        process.cwd(),
        'uploads',
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
      console.log(`❌ [${index + 1}/8] Generation failed - no result`)
      return false
    }
  } catch (error) {
    console.error(`❌ [${index + 1}/8] Error:`, error.message)
    return false
  }
}

// Главная функция генерации
async function generateAllFrames() {
  console.log('\n🚀 STARTING REAL GENERATION OF ALL 8 FRAMES!')
  console.log('='.repeat(50))

  let successCount = 0

  for (let i = 0; i < MUSIC_VIDEO_ANGLES.length; i++) {
    const angle = MUSIC_VIDEO_ANGLES[i]
    const success = await generateFrame(angle, i)

    if (success) {
      successCount++
    }

    // Пауза между генерациями
    if (i < MUSIC_VIDEO_ANGLES.length - 1) {
      console.log('⏳ Waiting 5 seconds before next generation...')
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  }

  console.log('\n🎉 GENERATION COMPLETE!')
  console.log('='.repeat(50))
  console.log(`✅ Successful: ${successCount}/${MUSIC_VIDEO_ANGLES.length}`)
  console.log(`📁 Check results in: ${CONFIG.outputDir}`)

  // Показываем созданные файлы
  if (fs.existsSync(CONFIG.outputDir)) {
    const files = fs
      .readdirSync(CONFIG.outputDir)
      .filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg'))
      .sort()

    console.log('\n📸 Generated files:')
    files.forEach(file => {
      const filePath = path.join(CONFIG.outputDir, file)
      const stats = fs.statSync(filePath)
      console.log(`  • ${file} (${Math.round(stats.size / 1024)}KB)`)
    })
  }
}

// Запускаем генерацию
generateAllFrames().catch(error => {
  console.error('💥 FATAL ERROR:', error)
  process.exit(1)
})
