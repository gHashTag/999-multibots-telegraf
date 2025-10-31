const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')
const { promisify } = require('util')

const execAsync = promisify(exec)

// Пути к файлам
const assetsDir = './downloaded-assets'
const outputDir = './final-video'

console.log('🎬 Исправляем создание видео...')

// Создаем видео с правильными параметрами
async function createFixedVideo() {
  const imageFile = path.join(assetsDir, '1761213029431.jpg')
  const audioFile = path.join(assetsDir, '1761213041375.mp3')
  const outputFile = path.join(outputDir, 'ai-reels-fixed.mp4')
  
  console.log('🎬 Создаем исправленное видео...')
  console.log(`   Изображение: ${imageFile}`)
  console.log(`   Аудио: ${audioFile}`)
  console.log(`   Результат: ${outputFile}`)
  
  // Команда FFmpeg с исправленными параметрами
  const command = `ffmpeg -loop 1 -i "${imageFile}" -i "${audioFile}" -c:v libx264 -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p -vf "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2" -shortest -y "${outputFile}"`
  
  try {
    console.log('⏳ Обрабатываем видео с исправленными параметрами...')
    const { stdout, stderr } = await execAsync(command)
    
    if (fs.existsSync(outputFile)) {
      const stats = fs.statSync(outputFile)
      console.log(`✅ Видео создано: ${outputFile}`)
      console.log(`   Размер: ${(stats.size / 1024 / 1024).toFixed(2)} MB`)
    } else {
      console.error('❌ Видео не было создано')
    }
  } catch (error) {
    console.error('❌ Ошибка создания видео:', error.message)
  }
}

// Создаем простое видео без сложных фильтров
async function createSimpleVideo() {
  const imageFile = path.join(assetsDir, '1761213029431.jpg')
  const audioFile = path.join(assetsDir, '1761213041375.mp3')
  const outputFile = path.join(outputDir, 'ai-reels-simple.mp4')
  
  console.log('🎬 Создаем простое видео...')
  
  // Простая команда FFmpeg
  const command = `ffmpeg -loop 1 -i "${imageFile}" -i "${audioFile}" -c:v libx264 -c:a aac -shortest -y "${outputFile}"`
  
  try {
    console.log('⏳ Создаем простое видео...')
    const { stdout, stderr } = await execAsync(command)
    
    if (fs.existsSync(outputFile)) {
      const stats = fs.statSync(outputFile)
      console.log(`✅ Простое видео создано: ${outputFile}`)
      console.log(`   Размер: ${(stats.size / 1024 / 1024).toFixed(2)} MB`)
    } else {
      console.error('❌ Простое видео не было создано')
    }
  } catch (error) {
    console.error('❌ Ошибка создания простого видео:', error.message)
  }
}

// Создаем видео с изменением размера изображения
async function createResizedVideo() {
  const imageFile = path.join(assetsDir, '1761213029431.jpg')
  const audioFile = path.join(assetsDir, '1761213041375.mp3')
  const outputFile = path.join(outputDir, 'ai-reels-resized.mp4')
  
  console.log('🎬 Создаем видео с изменением размера...')
  
  // Команда с изменением размера на четные числа
  const command = `ffmpeg -loop 1 -i "${imageFile}" -i "${audioFile}" -c:v libx264 -c:a aac -vf "scale=720:1280" -shortest -y "${outputFile}"`
  
  try {
    console.log('⏳ Создаем видео с изменением размера...')
    const { stdout, stderr } = await execAsync(command)
    
    if (fs.existsSync(outputFile)) {
      const stats = fs.statSync(outputFile)
      console.log(`✅ Видео с изменением размера создано: ${outputFile}`)
      console.log(`   Размер: ${(stats.size / 1024 / 1024).toFixed(2)} MB`)
    } else {
      console.error('❌ Видео с изменением размера не было создано')
    }
  } catch (error) {
    console.error('❌ Ошибка создания видео с изменением размера:', error.message)
  }
}

// Основная функция
async function main() {
  console.log('🚀 Исправляем создание видео...')
  
  // Пробуем разные подходы
  await createSimpleVideo()
  await createResizedVideo()
  await createFixedVideo()
  
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
