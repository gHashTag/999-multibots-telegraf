const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')

// Правильные URL-ы из логов терминала
const assetUrls = [
  // Изображение из AI Reels
  'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/images/ai-reels/144022504/1761213029431.jpg',
  
  // Аудио из AI Reels
  'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/images/ai-reels-generated-audio/144022504/1761213041375.mp3',
  
  // Дополнительные файлы из логов
  'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/images/ai-reels-images/144022504/1',
  'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/images/lipsync-images/144022504/1760511204459.jpg',
  'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/images/lipsync-audio/144022504/1760514547939.mp3',
]

// Создаем папку для ассетов
const assetsDir = './downloaded-assets'
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true })
}

console.log('🎬 Начинаем скачивание правильных ассетов...')
console.log(`📁 Папка для сохранения: ${assetsDir}`)

// Функция для скачивания файла
function downloadFile(url, filename) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http
    
    console.log(`🔍 Пытаемся скачать: ${url}`)
    
    protocol.get(url, (response) => {
      if (response.statusCode === 200) {
        const filePath = path.join(assetsDir, filename)
        const fileStream = fs.createWriteStream(filePath)
        
        response.pipe(fileStream)
        
        fileStream.on('finish', () => {
          fileStream.close()
          console.log(`✅ Скачан: ${filename} (${response.headers['content-length'] || 'unknown'} bytes)`)
          resolve(filePath)
        })
        
        fileStream.on('error', (err) => {
          console.error(`❌ Ошибка записи файла ${filename}:`, err.message)
          reject(err)
        })
      } else {
        console.error(`❌ Ошибка скачивания ${filename}: HTTP ${response.statusCode}`)
        console.error(`   URL: ${url}`)
        reject(new Error(`HTTP ${response.statusCode}`))
      }
    }).on('error', (err) => {
      console.error(`❌ Ошибка запроса ${filename}:`, err.message)
      reject(err)
    })
  })
}

// Скачиваем все файлы
async function downloadAll() {
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
    const files = fs.readdirSync(assetsDir)
    console.log('\n📋 Скачанные файлы:')
    files.forEach(file => {
      const filePath = path.join(assetsDir, file)
      const stats = fs.statSync(filePath)
      console.log(`  - ${file} (${stats.size} bytes)`)
    })
  } catch (error) {
    console.error('❌ Ошибка чтения папки:', error.message)
  }
}

downloadAll()
