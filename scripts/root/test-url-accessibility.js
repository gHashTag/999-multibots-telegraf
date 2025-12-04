const https = require('https')
const fs = require('fs')

// Загружаем URL из файла
const testUrl = fs.readFileSync('test-robokassa-url.txt', 'utf8').trim()
const realUrl = fs.readFileSync('real-robokassa-url.txt', 'utf8').trim()

console.log('=' .repeat(70))
console.log('🧪 ПРОВЕРКА ДОСТУПНОСТИ URL')
console.log('=' .repeat(70))
console.log('')

// Функция проверки URL
function checkUrl(url, name) {
  return new Promise((resolve) => {
    const urlObj = new URL(url)
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Test-Bot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: 10000
    }

    console.log(`🔍 Проверяем ${name}...`)
    console.log(`   URL: ${url.substring(0, 100)}...`)
    console.log('')

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        console.log(`✅ Статус: ${res.statusCode}`)

        // Проверяем на ошибки
        if (data.includes('Error') || data.includes('error') || data.includes('ErrorCode')) {
          console.log('⚠️  Найдены ошибки в ответе')

          // Ищем код ошибки
          const errorMatch = data.match(/"code":(\d+)/)
          if (errorMatch) {
            console.log(`   Код ошибки: ${errorMatch[1]}`)
          }

          // Проверяем на "No payment methods"
          if (data.includes('No payment methods available')) {
            console.log('   ❌ Ошибка: No payment methods available')
            console.log('   💡 Проблема: Мерчант не настроен в кабинете Robokassa')
          }
        } else {
          console.log('✅ Ошибок не найдено!')
        }

        console.log(`   Размер ответа: ${data.length} байт`)
        console.log('')
        resolve({ status: res.statusCode, data, hasError: data.includes('error') })
      })
    })

    req.on('error', (error) => {
      console.log(`❌ Ошибка запроса: ${error.message}`)
      console.log('')
      resolve({ status: 'ERROR', data: '', hasError: true })
    })

    req.on('timeout', () => {
      console.log('⏱️  Таймаут (10 секунд)')
      console.log('')
      req.destroy()
      resolve({ status: 'TIMEOUT', data: '', hasError: true })
    })

    req.end()
  })
}

// Проверяем оба URL
async function runTests() {
  console.log('1️⃣ ТЕСТОВЫЙ URL (merchant: test)')
  console.log('=' .repeat(70))
  const testResult = await checkUrl(testUrl, 'ТЕСТОВЫЙ URL')

  console.log('')
  console.log('2️⃣ РЕАЛЬНЫЙ URL (merchant: neuroblogger)')
  console.log('=' .repeat(70))
  const realResult = await checkUrl(realUrl, 'РЕАЛЬНЫЙ URL')

  console.log('')
  console.log('=' .repeat(70))
  console.log('📊 ИТОГОВЫЙ РЕЗУЛЬТАТ')
  console.log('=' .repeat(70))
  console.log('')
  console.log(`Тестовый URL: ${testResult.status} ${testResult.hasError ? '❌' : '✅'}`)
  console.log(`Реальный URL: ${realResult.status} ${realResult.hasError ? '❌' : '✅'}`)
  console.log('')

  if (!testResult.hasError && !realResult.hasError) {
    console.log('🎉 ОБА URL РАБОТАЮТ!')
  } else if (!testResult.hasError) {
    console.log('⚠️  Только тестовый URL работает')
    console.log('💡 Проблема с настройкой реального мерчанта')
  } else if (!realResult.hasError) {
    console.log('⚠️  Только реальный URL работает')
  } else {
    console.log('❌ Оба URL не работают')
  }
}

runTests()
