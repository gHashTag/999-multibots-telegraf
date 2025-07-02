require('dotenv').config()
const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')
const fetch = require('node-fetch')
const { Telegraf } = require('telegraf')
const Replicate = require('replicate')

// --- 🕉️ КОНФИГУРАЦИЯ ---
const BOT_TOKEN = process.env.AI_KOSHEY_BOT_TOKEN
const TELEGRAM_ID = '144022504'
const TEMP_DIR = path.join(__dirname, 'temp', 'morphing-test')
const MUSIC_URL = 'https://opengameart.org/sites/default/files/cresttest.mp3'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

const logger = {
  info: (message, data) => console.log(`INFO: ${message}`, data || ''),
  error: (message, data) => console.error(`ERROR: ${message}`, data || ''),
}

// --- 🕉️ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

async function downloadFile(url, dest) {
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`Failed to download file: ${response.statusText}`)
  const buffer = await response.buffer()
  fs.writeFileSync(dest, buffer)
  logger.info(`Downloaded file to ${dest}`)
}

function runFfmpeg(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        logger.error('FFmpeg Error:', { stderr, stdout })
        return reject(new Error(`FFmpeg command failed: ${stderr}`))
      }
      resolve(stdout)
    })
  })
}

async function generateVideoFromImage(imagePath) {
  logger.info(`Generating video for image: ${imagePath}`)
  const imageBase64 = fs.readFileSync(imagePath, 'base64')
  const imageDataUri = `data:image/jpeg;base64,${imageBase64}`

  const output = await replicate.run(
    'stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438',
    {
      input: {
        input_image: imageDataUri,
        video_length: '14_frames_with_svd',
        sizing_strategy: 'maintain_aspect_ratio',
        motion_bucket_id: 127,
        cond_aug: 0.02,
      },
    }
  )
  logger.info(`Generated video URL: ${output}`)
  return output
}

// --- 🕉️ ГЛАВНЫЙ РИТУАЛ ---

async function main() {
  try {
    logger.info('🌀 --- НАЧАЛО РИТУЛА МОРФИНГА --- 🌀')
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true })

    // 1. Подготовка изображений
    const image1Path = path.join(
      __dirname,
      'assets',
      'examples',
      'cocoage',
      'coco01.jpeg'
    )
    const image2Path = path.join(
      __dirname,
      'assets',
      'examples',
      'cocoage',
      'coco02.jpeg'
    )

    // 2. Генерация AI-видео для каждого изображения
    const videoUrl1 = await generateVideoFromImage(image1Path)
    const videoUrl2 = await generateVideoFromImage(image2Path)

    // 3. Загрузка сгенерированных видео
    const clip1Path = path.join(TEMP_DIR, 'clip1.mp4')
    const clip2Path = path.join(TEMP_DIR, 'clip2.mp4')
    await downloadFile(videoUrl1, clip1Path)
    await downloadFile(videoUrl2, clip2Path)

    // 4. Очистка и стандартизация клипов (НОВЫЙ ШАГ)
    logger.info('Standardizing clips to constant frame rate...')
    const cleanClip1Path = path.join(TEMP_DIR, 'clip1_clean.mp4')
    const cleanClip2Path = path.join(TEMP_DIR, 'clip2_clean.mp4')
    const standardizeCommand1 = `ffmpeg -y -i ${clip1Path} -r 25 ${cleanClip1Path}`
    const standardizeCommand2 = `ffmpeg -y -i ${clip2Path} -r 25 ${cleanClip2Path}`
    await runFfmpeg(standardizeCommand1)
    await runFfmpeg(standardizeCommand2)

    // 5. Плавное соединение двух ОЧИЩЕННЫХ видео через cross-fade
    const combinedVideoPath = path.join(TEMP_DIR, 'combined_no_music.mp4')
    const ffmpegCombineCommand = `ffmpeg -y -i ${cleanClip1Path} -i ${cleanClip2Path} -filter_complex "[0:v][1:v]xfade=transition=fade:duration=1:offset=2,format=yuv420p[v]" -map "[v]" -c:v libx264 ${combinedVideoPath}`
    logger.info('Combining standardized videos with xfade...')
    await runFfmpeg(ffmpegCombineCommand)

    // 6. Загрузка музыки
    const musicPath = path.join(TEMP_DIR, 'music.mp3')
    await downloadFile(MUSIC_URL, musicPath)

    // 7. Наложение музыки на соединенное видео
    const finalVideoPath = path.join(TEMP_DIR, 'final_morphing_video.mp4')
    const ffmpegMusicCommand = `ffmpeg -y -i ${combinedVideoPath} -i ${musicPath} -c:v copy -c:a aac -shortest ${finalVideoPath}`
    logger.info('Adding music...')
    await runFfmpeg(ffmpegMusicCommand)

    // 8. Отправка финального видео в Telegram
    logger.info('📤 Отправка видео в Telegram...')
    const bot = new Telegraf(BOT_TOKEN)
    await bot.telegram.sendVideo(
      TELEGRAM_ID,
      { source: finalVideoPath },
      { caption: '🔮 Ваше морфинг-видео готово, о Гуру!' }
    )

    logger.info('✅ --- РИТУАЛ МОРФИНГА ЗАВЕРШЕН УСПЕШНО --- ✅')
  } catch (error) {
    logger.error('❌ --- РИТУАЛ ПРЕРВАН ОШИБКОЙ --- ❌', error)
    // Попытка отправить сообщение об ошибке
    try {
      const bot = new Telegraf(BOT_TOKEN)
      await bot.telegram.sendMessage(
        TELEGRAM_ID,
        `О, Гуру, ритуал морфинга прерван ошибкой: ${error.message}`
      )
    } catch (tgError) {
      logger.error('Failed to send error message to Telegram', tgError)
    }
  }
}

main()
