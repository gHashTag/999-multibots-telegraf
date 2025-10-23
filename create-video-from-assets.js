const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')
const { promisify } = require('util')

const execAsync = promisify(exec)

// Пути к файлам
const assetsDir = './downloaded-assets'
const outputDir = './final-video'

// Создаем папку для результата
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

console.log('🎬 Создаем видео из ассетов...')
console.log(`📁 Исходные файлы: ${assetsDir}`)
console.log(`📁 Результат: ${outputDir}`)

// Проверяем наличие FFmpeg
async function checkFFmpeg() {
  try {
    await execAsync('ffmpeg -version')
    console.log('✅ FFmpeg найден')
    return true
  } catch (error) {
    console.error('❌ FFmpeg не найден. Установите FFmpeg для создания видео.')
    console.error('   macOS: brew install ffmpeg')
    console.error('   Ubuntu: sudo apt install ffmpeg')
    return false
  }
}

// Создаем видео из изображения и аудио
async function createVideo() {
  const imageFile = path.join(assetsDir, '1761213029431.jpg')
  const audioFile = path.join(assetsDir, '1761213041375.mp3')
  const outputFile = path.join(outputDir, 'ai-reels-final.mp4')
  
  console.log('🎬 Создаем видео из изображения и аудио...')
  console.log(`   Изображение: ${imageFile}`)
  console.log(`   Аудио: ${audioFile}`)
  console.log(`   Результат: ${outputFile}`)
  
  // Команда FFmpeg для создания видео
  const command = `ffmpeg -loop 1 -i "${imageFile}" -i "${audioFile}" -c:v libx264 -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p -shortest -y "${outputFile}"`
  
  try {
    console.log('⏳ Обрабатываем видео...')
    const { stdout, stderr } = await execAsync(command)
    
    if (fs.existsSync(outputFile)) {
      const stats = fs.statSync(outputFile)
      console.log(`✅ Видео создано: ${outputFile}`)
      console.log(`   Размер: ${stats.size} bytes`)
      console.log(`   Размер: ${(stats.size / 1024 / 1024).toFixed(2)} MB`)
    } else {
      console.error('❌ Видео не было создано')
    }
  } catch (error) {
    console.error('❌ Ошибка создания видео:', error.message)
  }
}

// Создаем аудио-коллаж из всех аудио файлов
async function createAudioCollage() {
  const audioFiles = [
    path.join(assetsDir, '1761213041375.mp3'),
    path.join(assetsDir, '1760514547939.mp3')
  ]
  
  const outputFile = path.join(outputDir, 'audio-collage.mp3')
  
  console.log('🎵 Создаем аудио-коллаж...')
  
  // Команда FFmpeg для склеивания аудио
  const command = `ffmpeg -i "${audioFiles[0]}" -i "${audioFiles[1]}" -filter_complex "[0:a][1:a]concat=n=2:v=0:a=1[out]" -map "[out]" -y "${outputFile}"`
  
  try {
    console.log('⏳ Склеиваем аудио...')
    const { stdout, stderr } = await execAsync(command)
    
    if (fs.existsSync(outputFile)) {
      const stats = fs.statSync(outputFile)
      console.log(`✅ Аудио-коллаж создан: ${outputFile}`)
      console.log(`   Размер: ${stats.size} bytes`)
    } else {
      console.error('❌ Аудио-коллаж не был создан')
    }
  } catch (error) {
    console.error('❌ Ошибка создания аудио-коллажа:', error.message)
  }
}

// Основная функция
async function main() {
  console.log('🚀 Начинаем обработку ассетов...')
  
  // Проверяем FFmpeg
  const hasFFmpeg = await checkFFmpeg()
  if (!hasFFmpeg) {
    return
  }
  
  // Проверяем наличие файлов
  const imageFile = path.join(assetsDir, '1761213029431.jpg')
  const audioFile = path.join(assetsDir, '1761213041375.mp3')
  
  if (!fs.existsSync(imageFile)) {
    console.error(`❌ Изображение не найдено: ${imageFile}`)
    return
  }
  
  if (!fs.existsSync(audioFile)) {
    console.error(`❌ Аудио не найдено: ${audioFile}`)
    return
  }
  
  // Создаем видео
  await createVideo()
  
  // Создаем аудио-коллаж
  await createAudioCollage()
  
  console.log('🎉 Обработка завершена!')
  console.log(`📁 Результаты в папке: ${path.resolve(outputDir)}`)
  
  // Показываем содержимое папки результата
  try {
    const files = fs.readdirSync(outputDir)
    console.log('\n📋 Созданные файлы:')
    files.forEach(file => {
      const filePath = path.join(outputDir, file)
      const stats = fs.statSync(filePath)
      console.log(`  - ${file} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`)
    })
  } catch (error) {
    console.error('❌ Ошибка чтения папки результата:', error.message)
  }
}

main()
