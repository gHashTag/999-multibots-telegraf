// Тест проверки доступности реального платежного URL Robokassa
const https = require('https')
const { URL } = require('url')

const testUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=neuroblogger&OutSum=100&InvId=1426830655&Description=%D0%9F%D0%BE%D0%BF%D0%BE%D0%BB%D0%BD%D0%B5%D0%BD%D0%B8%D0%B5%20%D0%B1%D0%B0%D0%BB%D0%B0%D0%BD%D1%81%D0%B0%20%D0%BD%D0%B0%20110%20%D0%B7%D0%B2%D0%B5%D0%B7%D0%B4&SignatureValue=A3B3516FC4E0E93CE5111AB0BF72B871&ResultURL=https%3A%2F%2Fthree-head-dragon.shop%2Fpayment-success'

console.log('🔍 Проверяем доступность Robokassa URL...')
console.log('URL:', testUrl)
console.log('')

const urlObj = new URL(testUrl)

const options = {
  hostname: urlObj.hostname,
  port: 443,
  path: urlObj.pathname + urlObj.search,
  method: 'GET',
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; Test-Bot/1.0)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  },
  timeout: 10000
}

const req = https.request(options, (res) => {
  console.log(`✅ Статус ответа: ${res.statusCode}`)
  console.log(`📋 Заголовки:`)
  console.log(`   Content-Type: ${res.headers['content-type']}`)
  console.log(`   Server: ${res.headers['server']}`)
  console.log(`   Content-Length: ${res.headers['content-length']}`)
  console.log('')

  let data = ''
  res.on('data', (chunk) => {
    data += chunk
  })

  res.on('end', () => {
    console.log(`📄 Размер ответа: ${data.length} байт`)

    if (res.statusCode === 200) {
      console.log('✅ Страница загружается успешно!')

      // Проверяем содержимое на ошибки
      if (data.includes('Error') || data.includes('error')) {
        console.log('⚠️  В содержимом найдены сообщения об ошибках')
        console.log('Первые 500 символов:', data.substring(0, 500))
      } else if (data.includes('MerchantLogin') || data.includes('robokassa')) {
        console.log('✅ Содержимое выглядит как корректная страница Robokassa')
      }

      // Ищем конкретные ошибки
      const errorPatterns = [
        'No payment methods available',
        'Invalid signature',
        'Merchant not found',
        'Access denied'
      ]

      let foundErrors = []
      for (const pattern of errorPatterns) {
        if (data.includes(pattern)) {
          foundErrors.push(pattern)
        }
      }

      if (foundErrors.length > 0) {
        console.log('❌ Найдены ошибки:', foundErrors)
      } else {
        console.log('✅ Ошибок не найдено')
      }
    } else if (res.statusCode === 302 || res.statusCode === 301) {
      console.log(`🔄 Редирект на: ${res.headers.location}`)
    } else if (res.statusCode === 404) {
      console.log('❌ Страница не найдена (404)')
    } else if (res.statusCode === 403) {
      console.log('❌ Доступ запрещен (403)')
    } else {
      console.log(`⚠️  Неожиданный статус: ${res.statusCode}`)
    }

    console.log('')
    console.log('📝 Первые 1000 символов ответа:')
    console.log(data.substring(0, 1000))
  })
})

req.on('error', (error) => {
  console.log('❌ Ошибка запроса:', error.message)
  console.log('Детали:', error)
})

req.on('timeout', () => {
  console.log('⏱️  Таймаут запроса (10 секунд)')
  req.destroy()
})

req.end()
