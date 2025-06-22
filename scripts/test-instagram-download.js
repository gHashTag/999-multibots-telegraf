#!/usr/bin/env node

const YTDlpWrap = require('yt-dlp-wrap')
const fs = require('fs')
const path = require('path')

async function testInstagramDownload() {
  const testUrl =
    process.argv[2] || 'https://www.instagram.com/reel/DJ0mMppPV6N/'
  const outputDir = path.join(__dirname, '../tmp/test')

  // Создаем директорию если её нет
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const ytDlp = new YTDlpWrap()
  const outputTemplate = path.join(outputDir, 'test_instagram.%(ext)s')

  console.log('🔍 Проверяем версию yt-dlp...')
  try {
    const versionResult = await ytDlp.execPromise(['--version'])
    console.log('✅ Версия yt-dlp:', versionResult)
  } catch (error) {
    console.error('❌ Ошибка получения версии:', error.message)
  }

  console.log('\n🌐 Тестируем скачивание Instagram видео...')
  console.log('URL:', testUrl)
  console.log('Выходной шаблон:', outputTemplate)

  // Базовый тест без cookies
  const basicOptions = [
    '--format',
    'best[height<=720]/best',
    '--output',
    outputTemplate,
    '--no-playlist',
    '--max-filesize',
    '25M',
    '--merge-output-format',
    'mp4',
    '--no-check-certificate',
    '--user-agent',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    '--referer',
    'https://www.instagram.com/',
    '--add-header',
    'Accept-Language:en-US,en;q=0.9',
    '--extractor-args',
    'instagram:api_version=v1',
    '--sleep-interval',
    '3',
    '--max-sleep-interval',
    '8',
    '--retries',
    '3',
    '--verbose', // Включаем подробный вывод для диагностики
    testUrl,
  ]

  try {
    console.log('\n🚀 Запускаем скачивание...')
    const result = await ytDlp.execPromise(basicOptions)
    console.log('✅ Результат выполнения:', result)

    // Проверяем, что файл создался
    const files = fs
      .readdirSync(outputDir)
      .filter(f => f.startsWith('test_instagram'))
    if (files.length > 0) {
      const downloadedFile = path.join(outputDir, files[0])
      const stats = fs.statSync(downloadedFile)
      console.log(
        `✅ Файл успешно скачан: ${files[0]} (${Math.round(stats.size / 1024)}KB)`
      )

      // Удаляем тестовый файл
      fs.unlinkSync(downloadedFile)
      console.log('🧹 Тестовый файл удален')
    } else {
      console.log('⚠️ Файл не найден в выходной директории')
    }
  } catch (error) {
    console.error('❌ Ошибка скачивания:', error.message)
    console.log('\n🔧 Детали ошибки:')
    console.log('Stderr:', error.stderr || 'Не доступно')
    console.log('Stdout:', error.stdout || 'Не доступно')

    // Попробуем получить дополнительную информацию об экстракторах
    try {
      console.log('\n📋 Проверяем доступные экстракторы Instagram...')
      const extractors = await ytDlp.execPromise(['--list-extractors'])
      const instagramExtractors = extractors
        .split('\n')
        .filter(line => line.toLowerCase().includes('instagram'))
      console.log('Instagram экстракторы:', instagramExtractors)
    } catch (extractorError) {
      console.error(
        'Ошибка получения списка экстракторов:',
        extractorError.message
      )
    }
  }
}

if (require.main === module) {
  testInstagramDownload().catch(console.error)
}

module.exports = { testInstagramDownload }
