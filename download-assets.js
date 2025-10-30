import fs from 'fs/promises'
import path from 'path'
import https from 'https'
import http from 'http'

// URL-ы файлов из логов
const assetUrls = [
  // Из последних логов AI Reels
  'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/images/ai-reels-images/144022504/1',
  
  // Из логов KIE Provider
  'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/images/lipsync-images/144022504/1760511204459.jpg',
  'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/images/lipsync-audio/144022504/1760514547939.mp3',
  
  // Из логов AI Reels (из терминала)
  'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/images/ai-reels/144022504/17612130',
  'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/images/ai-reels-generated-audio/14',
]

// Создаем папку для ассетов
const assetsDir = './downloaded-assets'
await fs.mkdir(assetsDir, { recursive: true })

console.log('🎬 Начинаем скачивание ассетов...')
console.log(`📁 Папка для сохранения: ${assetsDir}`)

// Функция для скачивания файла
async function downloadFile(url, filename) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http
    
    protocol.get(url, (response) => {
      if (response.statusCode === 200) {
        const filePath = path.join(assetsDir, filename)
        const fileStream = (await import('fs')).createWriteStream(filePath)
        
        response.pipe(fileStream)
        
        fileStream.on('finish', () => {
          fileStream.close()
          console.log(`✅ Скачан: ${filename}`)
          resolve(filePath)
        })
        
        fileStream.on('error', (err) => {
          console.error(`❌ Ошибка записи файла ${filename}:`, err.message)
          reject(err)
        })
      } else {
        console.error(`❌ Ошибка скачивания ${filename}: HTTP ${response.statusCode}`)
        reject(new Error(`HTTP ${response.statusCode}`))
      }
    }).on('error', (err) => {
      console.error(`❌ Ошибка запроса ${filename}:`, err.message)
      reject(err)
    })
  })
}

// Скачиваем все файлы
for (let i = 0; i < assetUrls.length; i++) {
  const url = assetUrls[i]
  const urlParts = url.split('/')
  const filename = urlParts[urlParts.length - 1] || `asset_${i + 1}`
  
  try {
    await downloadFile(url, filename)
  } catch (error) {
    console.error(`❌ Не удалось скачать ${url}:`, error.message)
  }
}

console.log('🎉 Скачивание завершено!')
console.log(`📁 Все файлы сохранены в: ${path.resolve(assetsDir)}`)

// Показываем содержимое папки
try {
  const files = await fs.readdir(assetsDir)
  console.log('\n📋 Скачанные файлы:')
  files.forEach(file => {
    console.log(`  - ${file}`)
  })
} catch (error) {
  console.error('❌ Ошибка чтения папки:', error.message)
}
