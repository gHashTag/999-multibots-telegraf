const crypto = require('crypto')

// Данные тестового мерчанта Robokassa
const testMerchant = {
  merchantLogin: 'test',
  password1: 'test',
  description: 'Test payment - 100 RUB',
  resultURL: 'https://example.com/success',
  isTest: true
}

// Генерируем уникальный ID
const invId = Math.floor(Math.random() * 1000000)
const outSum = 1 // Минимальная сумма для теста

// Формируем подпись БЕЗ ResultURL (согласно документации)
const signatureBase = `${testMerchant.merchantLogin}:${outSum}:${invId}:${testMerchant.password1}`
const signatureValue = crypto.createHash('md5').update(signatureBase).digest('hex').toUpperCase()

// Формируем URL
const url = `https://auth.robokassa.ru/Merchant/Index.aspx?` +
  `MerchantLogin=${testMerchant.merchantLogin}&` +
  `OutSum=${outSum}&` +
  `InvId=${invId}&` +
  `Description=${encodeURIComponent(testMerchant.description)}&` +
  `SignatureValue=${signatureValue}&` +
  `ResultURL=${encodeURIComponent(testMerchant.resultURL)}&` +
  `IsTest=1` // Включаем тестовый режим

console.log('=' .repeat(70))
console.log('🔗 СОЗДАНИЕ ТЕСТОВОГО URL ROBOKASSA')
console.log('=' .repeat(70))
console.log('')
console.log('📋 Параметры:')
console.log(`   MerchantLogin: ${testMerchant.merchantLogin}`)
console.log(`   Password1: ${testMerchant.password1}`)
console.log(`   OutSum: ${outSum}`)
console.log(`   InvId: ${invId}`)
console.log(`   Description: ${testMerchant.description}`)
console.log(`   IsTest: 1 (тестовый режим)`)
console.log('')
console.log('🔐 Подпись MD5:')
console.log(`   Base string: ${signatureBase}`)
console.log(`   Signature: ${signatureValue}`)
console.log('')
console.log('🌐 URL:')
console.log(url)
console.log('')
console.log('=' .repeat(70))
console.log('✅ URL готов для тестирования!')
console.log('=' .repeat(70))

// Сохраняем URL в файл
const fs = require('fs')
fs.writeFileSync('test-robokassa-url.txt', url)
console.log('💾 URL сохранен в файл: test-robokassa-url.txt')
console.log('')

// Дополнительно создаем рабочий URL для реального мерчанта
console.log('')
console.log('=' .repeat(70))
console.log('🔗 СОЗДАНИЕ РАБОЧЕГО URL (РЕАЛЬНЫЙ МЕРЧАНТ)')
console.log('=' .repeat(70))
console.log('')

// Данные реального мерчанта (из логов)
const realMerchant = {
  merchantLogin: 'neuroblogger',
  password1: 'GhfqLJR79Do9Zvans16G',
  description: 'Пополнение баланса на 110 звезд',
  resultURL: 'https://three-head-dragon.shop/payment-success',
  isTest: false
}

const realInvId = Math.floor(Math.random() * 1000000)
const realOutSum = 100

// Формируем подпись
const realSignatureBase = `${realMerchant.merchantLogin}:${realOutSum}:${realInvId}:${realMerchant.password1}`
const realSignatureValue = crypto.createHash('md5').update(realSignatureBase).digest('hex').toUpperCase()

// Формируем URL
const realUrl = `https://auth.robokassa.ru/Merchant/Index.aspx?` +
  `MerchantLogin=${realMerchant.merchantLogin}&` +
  `OutSum=${realOutSum}&` +
  `InvId=${realInvId}&` +
  `Description=${encodeURIComponent(realMerchant.description)}&` +
  `SignatureValue=${realSignatureValue}&` +
  `ResultURL=${encodeURIComponent(realMerchant.resultURL)}`

console.log('📋 Параметры:')
console.log(`   MerchantLogin: ${realMerchant.merchantLogin}`)
console.log(`   Password1: ${realMerchant.password1.substring(0, 10)}...***`)
console.log(`   OutSum: ${realOutSum}`)
console.log(`   InvId: ${realInvId}`)
console.log(`   Description: ${realMerchant.description}`)
console.log('')
console.log('🔐 Подпись MD5:')
console.log(`   Base string: ${realSignatureBase.substring(0, 50)}...`)
console.log(`   Signature: ${realSignatureValue}`)
console.log('')
console.log('🌐 URL:')
console.log(realUrl)
console.log('')
console.log('=' .repeat(70))
console.log('✅ Рабочий URL готов!')
console.log('=' .repeat(70))

// Сохраняем URL в файл
fs.writeFileSync('real-robokassa-url.txt', realUrl)
console.log('💾 URL сохранен в файл: real-robokassa-url.txt')
