#!/usr/bin/env node

/**
 * 🎵 AUTOMATIC MUSIC VIDEO FRAME GENERATOR
 * Полностью автоматическая генерация всех кадров для музыкального клипа
 * БЕЗ ручного взаимодействия с ботом!
 */

const fs = require('fs')
const path = require('path')
const https = require('https')
require('dotenv').config()

// Конфигурация
const CONFIG = {
  sourceImage:
    '/Users/playra/999-multibots-telegraf/assets/bible_vibecoder/lyps-sync.jpg',
  outputDir: '/Users/playra/999-multibots-telegraf/assets/music_video_frames',
  replicateToken: process.env.REPLICATE_API_TOKEN,
  model: 'black-forest-labs/flux-kontext-max',
}

// Музыкальные ракурсы
const MUSIC_VIDEO_ANGLES = [
  {
    id: 'close_up',
    name: '🔍 Крупный план',
    prompt:
      'Emotional close-up shot for music video, intense facial expression, dramatic lighting, professional portrait photography',
    filename: '01_closeup_emotion.jpg',
    priority: 'HIGH',
  },
  {
    id: 'medium_shot',
    name: '📷 Средний план',
    prompt:
      'Medium shot for music video, perfect for lip sync and performance, balanced composition, professional framing',
    filename: '02_medium_performance.jpg',
    priority: 'HIGH',
  },
  {
    id: 'american_shot',
    name: '🇺🇸 Американский план',
    prompt:
      'American shot for music video, cinematic 3/4 framing, dynamic pose, classic cinematography',
    filename: '03_american_cinematic.jpg',
    priority: 'HIGH',
  },
  {
    id: 'low_angle',
    name: '📐 Нижний ракурс',
    prompt:
      'Low angle shot for music video, powerful upward perspective, commanding presence, star power composition',
    filename: '04_lowangle_power.jpg',
    priority: 'HIGH',
  },
  {
    id: 'cowboy_shot',
    name: '🤠 Ковбойский план',
    prompt:
      'Cowboy shot for music video, hip level framing, energetic pose, dynamic composition',
    filename: '05_cowboy_dance.jpg',
    priority: 'ARTISTIC',
  },
  {
    id: 'dutch_angle',
    name: '🎭 Голландский угол',
    prompt:
      'Dutch angle shot for music video, tilted dramatic composition, artistic tension, cinematic drama',
    filename: '06_dutch_dramatic.jpg',
    priority: 'ARTISTIC',
  },
  {
    id: 'profile_shot',
    name: '👤 Профиль',
    prompt:
      'Profile shot for music video, elegant side angle, artistic silhouette, stylish composition',
    filename: '07_profile_artistic.jpg',
    priority: 'ARTISTIC',
  },
  {
    id: 'wide_shot',
    name: '🌐 Общий план',
    prompt:
      'Wide establishing shot for music video, full scene context, environmental composition',
    filename: '08_wide_location.jpg',
    priority: 'ARTISTIC',
  },
]

console.log('🎵 AUTOMATIC MUSIC VIDEO FRAME GENERATOR')
console.log('========================================')
console.log(`📸 Source: ${CONFIG.sourceImage}`)
console.log(`📁 Output: ${CONFIG.outputDir}`)
console.log(`🔵 Model: ${CONFIG.model}`)
console.log(`🎬 Angles: ${MUSIC_VIDEO_ANGLES.length}`)
console.log('')

// Функция для загрузки файла в base64
async function imageToBase64(imagePath) {
  try {
    const imageBuffer = fs.readFileSync(imagePath)
    const base64 = imageBuffer.toString('base64')
    return `data:image/jpeg;base64,${base64}`
  } catch (error) {
    throw new Error(`Failed to load image: ${error.message}`)
  }
}

// Функция для скачивания изображения
async function downloadImage(url, filename) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filename)
    https
      .get(url, response => {
        response.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve(filename)
        })
      })
      .on('error', err => {
        fs.unlink(filename, () => {}) // Удаляем частично загруженный файл
        reject(err)
      })
  })
}

// Функция для вызова Replicate API
async function generateWithReplicate(prompt, inputImage) {
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Token ${CONFIG.replicateToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CONFIG.model,
      input: {
        prompt: prompt,
        input_image: inputImage,
        aspect_ratio: '9:16',
        num_inference_steps: 50,
        guidance_scale: 3.5,
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `Replicate API error: ${response.statusText} - ${errorText}`
    )
  }

  const prediction = await response.json()

  // Ждем завершения генерации
  let result = prediction
  while (result.status === 'starting' || result.status === 'processing') {
    await new Promise(resolve => setTimeout(resolve, 2000)) // Ждем 2 секунды

    const statusResponse = await fetch(
      `https://api.replicate.com/v1/predictions/${result.id}`,
      {
        headers: {
          Authorization: `Token ${CONFIG.replicateToken}`,
        },
      }
    )

    result = await statusResponse.json()
    console.log(`   ⏳ Status: ${result.status}...`)
  }

  if (result.status === 'succeeded') {
    return result.output
  } else {
    throw new Error(`Generation failed: ${result.error || 'Unknown error'}`)
  }
}

// Основная функция генерации
async function generateMusicVideoFrames() {
  // Проверяем наличие токена
  if (!CONFIG.replicateToken) {
    console.error('❌ REPLICATE_API_TOKEN not found in environment variables!')
    console.log('💡 Add your token to .env file:')
    console.log('   REPLICATE_API_TOKEN=r8_...')
    process.exit(1)
  }

  // Проверяем исходное изображение
  if (!fs.existsSync(CONFIG.sourceImage)) {
    console.error(`❌ Source image not found: ${CONFIG.sourceImage}`)
    process.exit(1)
  }

  // Создаем выходную папку
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true })
    console.log(`✅ Created output directory: ${CONFIG.outputDir}`)
  }

  console.log('🎬 STARTING AUTOMATIC GENERATION...')
  console.log('==================================')

  // Конвертируем изображение в base64
  console.log('📸 Loading source image...')
  const inputImageBase64 = await imageToBase64(CONFIG.sourceImage)
  console.log('✅ Image loaded and encoded')
  console.log('')

  const results = []
  let successCount = 0
  let errorCount = 0

  // Генерируем каждый ракурс
  for (let i = 0; i < MUSIC_VIDEO_ANGLES.length; i++) {
    const angle = MUSIC_VIDEO_ANGLES[i]
    const startTime = Date.now()

    console.log(
      `🎬 GENERATING ${i + 1}/${MUSIC_VIDEO_ANGLES.length}: ${angle.name}`
    )
    console.log(`   🎯 Priority: ${angle.priority}`)
    console.log(`   📝 Prompt: ${angle.prompt.substring(0, 60)}...`)

    try {
      // Генерируем изображение
      const output = await generateWithReplicate(angle.prompt, inputImageBase64)

      if (output && output.length > 0) {
        const imageUrl = Array.isArray(output) ? output[0] : output
        const outputPath = path.join(CONFIG.outputDir, angle.filename)

        // Скачиваем результат
        console.log('   💾 Downloading result...')
        await downloadImage(imageUrl, outputPath)

        const duration = ((Date.now() - startTime) / 1000).toFixed(1)
        console.log(`   ✅ SUCCESS! Saved: ${angle.filename} (${duration}s)`)

        results.push({
          angle: angle.name,
          filename: angle.filename,
          status: 'SUCCESS',
          duration: duration,
          priority: angle.priority,
        })
        successCount++
      } else {
        throw new Error('No output received from API')
      }
    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(`   ❌ FAILED: ${error.message} (${duration}s)`)

      results.push({
        angle: angle.name,
        filename: angle.filename,
        status: 'FAILED',
        error: error.message,
        duration: duration,
        priority: angle.priority,
      })
      errorCount++
    }

    console.log('')

    // Небольшая пауза между запросами
    if (i < MUSIC_VIDEO_ANGLES.length - 1) {
      console.log('   ⏸️ Pause 3s before next generation...')
      await new Promise(resolve => setTimeout(resolve, 3000))
    }
  }

  // Генерируем отчет
  console.log('📊 GENERATION COMPLETE!')
  console.log('=======================')
  console.log(`✅ Success: ${successCount}/${MUSIC_VIDEO_ANGLES.length}`)
  console.log(`❌ Errors: ${errorCount}/${MUSIC_VIDEO_ANGLES.length}`)
  console.log('')

  // Сохраняем отчет
  const report = {
    timestamp: new Date().toISOString(),
    sourceImage: CONFIG.sourceImage,
    model: CONFIG.model,
    totalAngles: MUSIC_VIDEO_ANGLES.length,
    successCount,
    errorCount,
    results,
  }

  const reportPath = path.join(CONFIG.outputDir, 'generation_report.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`📋 Report saved: ${reportPath}`)

  // Показываем успешные результаты
  const successful = results.filter(r => r.status === 'SUCCESS')
  if (successful.length > 0) {
    console.log('')
    console.log('🏆 SUCCESSFUL GENERATIONS:')
    console.log('===========================')
    successful.forEach(result => {
      console.log(`${result.priority === 'HIGH' ? '⭐' : '🎨'} ${result.angle}`)
      console.log(`   💾 ${result.filename}`)
      console.log(`   ⏱️ ${result.duration}s`)
    })
  }

  // Показываем ошибки
  const failed = results.filter(r => r.status === 'FAILED')
  if (failed.length > 0) {
    console.log('')
    console.log('❌ FAILED GENERATIONS:')
    console.log('=======================')
    failed.forEach(result => {
      console.log(`❌ ${result.angle}`)
      console.log(`   🚫 ${result.error}`)
    })
  }

  console.log('')
  console.log('🎵 MUSIC VIDEO FRAMES GENERATION COMPLETE!')
  console.log(`📁 Check results in: ${CONFIG.outputDir}`)

  if (successCount > 0) {
    console.log('🎬 Ready to create your music video masterpiece! ✨')
  }
}

// Запускаем генерацию
if (require.main === module) {
  generateMusicVideoFrames().catch(error => {
    console.error('💥 FATAL ERROR:', error)
    process.exit(1)
  })
}
