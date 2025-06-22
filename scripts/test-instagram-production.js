#!/usr/bin/env node

const axios = require('axios')
const fs = require('fs')
const path = require('path')

async function testInstagramProductionDownload() {
  const testUrl =
    process.argv[2] ||
    'https://www.instagram.com/reel/DJ0mMppPV6N/?igsh=amQxZHE1bmVjdmY='
  const outputDir = path.join(__dirname, '../tmp/test-production')

  // Создаем директорию если её нет
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  console.log('🚀 Тестируем альтернативные API сервисы для Instagram...')
  console.log('URL:', testUrl)

  const apis = [
    {
      name: 'SaveGram API (имитация)',
      endpoint: 'https://httpbin.org/post', // Тестовый endpoint
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Origin: 'https://savegram.app',
        Referer: 'https://savegram.app/',
      },
      bodyTemplate: { url: testUrl },
    },
    {
      name: 'Instagram Info API (проверка доступности)',
      endpoint: `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(testUrl)}`,
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      },
    },
  ]

  for (const api of apis) {
    try {
      console.log(`\n🔍 Тестируем ${api.name}...`)

      const requestConfig = {
        method: api.method,
        url: api.endpoint,
        headers: api.headers,
        timeout: 10000,
      }

      if (api.method === 'POST' && api.bodyTemplate) {
        requestConfig.data = api.bodyTemplate
      }

      const response = await axios(requestConfig)

      console.log(`✅ ${api.name} ответил:`)
      console.log('Status:', response.status)
      console.log('Headers:', Object.keys(response.headers).join(', '))

      if (api.name.includes('Instagram Info')) {
        console.log('Response data:', JSON.stringify(response.data, null, 2))
      } else {
        console.log(
          'Response size:',
          JSON.stringify(response.data).length,
          'bytes'
        )
      }
    } catch (error) {
      console.error(`❌ ${api.name} failed:`)
      if (error.response) {
        console.error('Status:', error.response.status)
        console.error('Error:', error.response.data)
      } else {
        console.error('Error:', error.message)
      }
    }
  }

  console.log('\n🔧 Проверяем переменные окружения...')
  console.log('NODE_ENV:', process.env.NODE_ENV || 'не установлено')
  console.log(
    'DOCKER_ENVIRONMENT:',
    process.env.DOCKER_ENVIRONMENT || 'не установлено'
  )
  console.log(
    'APIFY_TOKEN:',
    process.env.APIFY_TOKEN ? '✅ установлен' : '❌ не установлен'
  )

  console.log('\n🌐 Проверяем сетевое подключение...')
  try {
    const response = await axios.get('https://www.instagram.com', {
      timeout: 5000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
    })
    console.log('✅ Instagram доступен, статус:', response.status)
    console.log(
      '🔒 Content-Security-Policy:',
      response.headers['content-security-policy']
        ? 'присутствует'
        : 'отсутствует'
    )
  } catch (error) {
    console.error('❌ Instagram недоступен:', error.message)
  }

  console.log('\n📊 Результат:')
  console.log(
    'Тест показывает доступность различных методов загрузки Instagram контента'
  )
  console.log('В продакшене будет использоваться каскадный подход:')
  console.log('1. Apify (если токен действителен)')
  console.log('2. yt-dlp с различными стратегиями')
  console.log('3. Альтернативные API сервисы')
  console.log('4. Fallback сообщения для пользователей')
}

if (require.main === module) {
  testInstagramProductionDownload().catch(console.error)
}

module.exports = { testInstagramProductionDownload }
