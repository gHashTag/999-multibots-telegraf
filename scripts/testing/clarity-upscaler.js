#!/usr/bin/env node

/**
 * 💎 CLARITY UPSCALER BATCH PROCESSOR
 * Повышение качества всех фото из bible_vibecoder в 2 раза
 * Модель: philz1337x/clarity-upscaler (как в боте)
 */

const fs = require('fs')
const path = require('path')
const Replicate = require('replicate')

console.log('💎 CLARITY UPSCALER BATCH PROCESSOR')
console.log('===================================')

// Инициализация Replicate
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

// Конфигурация
const CONFIG = {
  sourceDir: '/Users/playra/999-multibots-telegraf/assets/bible_vibecoder',
  outputDir:
    '/Users/playra/999-multibots-telegraf/assets/bible_vibecoder_upscaled',
  model:
    'philz1337x/clarity-upscaler:dfad41707589d68ecdccd1dfa600d55a208f9310748e44bfe35b4a6291453d5e',
  telegram_id: '144022504',
}

// Создаем папку для результатов
if (!fs.existsSync(CONFIG.outputDir)) {
  fs.mkdirSync(CONFIG.outputDir, { recursive: true })
  console.log('✅ Created output directory:', CONFIG.outputDir)
} else {
  console.log('📁 Output directory already exists:', CONFIG.outputDir)
}

// Получаем все .jpg файлы из исходной папки
function getImageFiles() {
  const files = fs
    .readdirSync(CONFIG.sourceDir)
    .filter(file => file.toLowerCase().endsWith('.jpg') && file !== '.DS_Store')
    .sort()

  console.log(`\n📸 Found ${files.length} images to upscale:`)
  files.forEach((file, index) => {
    console.log(`  ${index + 1}. ${file}`)
  })

  return files
}

// Конвертируем изображение в data URI для Replicate API
function imageToDataURI(imagePath) {
  try {
    const imageBuffer = fs.readFileSync(imagePath)
    const mimeType = 'image/jpeg'
    const base64 = imageBuffer.toString('base64')
    return `data:${mimeType};base64,${base64}`
  } catch (error) {
    console.error('❌ Error converting image to base64:', error.message)
    return null
  }
}

// Скачиваем результат upscale
async function downloadUpscaledImage(imageUrl, outputPath) {
  try {
    const response = await fetch(imageUrl)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const buffer = await response.arrayBuffer()
    fs.writeFileSync(outputPath, Buffer.from(buffer))

    const stats = fs.statSync(outputPath)
    console.log(
      `📁 Saved: ${path.basename(outputPath)} (${Math.round(stats.size / 1024)}KB)`
    )
    return true
  } catch (error) {
    console.error('❌ Download error:', error.message)
    return false
  }
}

// Upscale одного изображения
async function upscaleImage(filename, index, total) {
  const sourcePath = path.join(CONFIG.sourceDir, filename)
  const outputPath = path.join(CONFIG.outputDir, filename)

  console.log(`\n💎 [${index + 1}/${total}] Upscaling: ${filename}`)

  try {
    // Конвертируем в data URI
    const imageDataURI = imageToDataURI(sourcePath)
    if (!imageDataURI) {
      console.log(`❌ [${index + 1}/${total}] Failed to convert to data URI`)
      return false
    }

    console.log(`🔄 [${index + 1}/${total}] Sending to Clarity Upscaler...`)

    // Параметры для Clarity Upscaler (как в боте)
    const inputParams = {
      image: imageDataURI,
      creativity: 0.1, // Минимальная креативность для максимального сохранения оригинала
    }

    // Вызываем Clarity Upscaler
    const output = await replicate.run(CONFIG.model, {
      input: inputParams,
    })

    if (output && typeof output === 'string') {
      // output - это URL upscaled изображения
      console.log(
        `✨ [${index + 1}/${total}] Upscale completed! Downloading...`
      )

      const success = await downloadUpscaledImage(output, outputPath)
      if (success) {
        console.log(
          `✅ [${index + 1}/${total}] Successfully upscaled: ${filename}`
        )
        return true
      } else {
        console.log(`❌ [${index + 1}/${total}] Download failed: ${filename}`)
        return false
      }
    } else if (Array.isArray(output) && output.length > 0) {
      // Иногда Replicate возвращает array с URL
      const imageUrl = output[0]
      console.log(
        `✨ [${index + 1}/${total}] Upscale completed! Downloading...`
      )

      const success = await downloadUpscaledImage(imageUrl, outputPath)
      if (success) {
        console.log(
          `✅ [${index + 1}/${total}] Successfully upscaled: ${filename}`
        )
        return true
      } else {
        console.log(`❌ [${index + 1}/${total}] Download failed: ${filename}`)
        return false
      }
    } else {
      console.log(
        `❌ [${index + 1}/${total}] Unexpected output format:`,
        typeof output
      )
      return false
    }
  } catch (error) {
    console.error(
      `❌ [${index + 1}/${total}] Error upscaling ${filename}:`,
      error.message
    )
    return false
  }
}

// Главная функция
async function upscaleAllImages() {
  console.log('\n🚀 STARTING BATCH UPSCALE PROCESS!')
  console.log('='.repeat(50))

  const imageFiles = getImageFiles()

  if (imageFiles.length === 0) {
    console.log('❌ No images found to upscale!')
    return
  }

  let successCount = 0
  let failCount = 0

  for (let i = 0; i < imageFiles.length; i++) {
    const filename = imageFiles[i]
    const success = await upscaleImage(filename, i, imageFiles.length)

    if (success) {
      successCount++
    } else {
      failCount++
    }

    // Пауза между обработкой (чтобы не перегружать API)
    if (i < imageFiles.length - 1) {
      console.log('⏳ Waiting 3 seconds before next upscale...')
      await new Promise(resolve => setTimeout(resolve, 3000))
    }
  }

  console.log('\n🎉 BATCH UPSCALE COMPLETE!')
  console.log('='.repeat(50))
  console.log(`✅ Successfully upscaled: ${successCount}/${imageFiles.length}`)
  console.log(`❌ Failed: ${failCount}/${imageFiles.length}`)
  console.log(`📁 Results saved in: ${CONFIG.outputDir}`)

  // Показываем результаты
  if (fs.existsSync(CONFIG.outputDir)) {
    const upscaledFiles = fs
      .readdirSync(CONFIG.outputDir)
      .filter(f => f.toLowerCase().endsWith('.jpg'))
      .sort()

    console.log(`\n💎 Upscaled files (${upscaledFiles.length} total):`)
    upscaledFiles.forEach(file => {
      const filePath = path.join(CONFIG.outputDir, file)
      const stats = fs.statSync(filePath)
      console.log(`  📸 ${file} (${Math.round(stats.size / 1024)}KB)`)
    })
  }

  console.log('\n🎯 ГОТОВО! Все отобранные фото повышены в качестве в 2 раза!')
  console.log('💎 Используй их для финального клипа!')
}

// Проверяем наличие API токена
if (!process.env.REPLICATE_API_TOKEN) {
  console.error('❌ REPLICATE_API_TOKEN not found in environment variables!')
  console.error('Please set REPLICATE_API_TOKEN in your .env file')
  process.exit(1)
}

// Запускаем upscale
upscaleAllImages().catch(error => {
  console.error('💥 FATAL ERROR:', error)
  process.exit(1)
})
