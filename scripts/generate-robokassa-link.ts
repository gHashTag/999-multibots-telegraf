#!/usr/bin/env ts-node

import { config } from 'dotenv'
import crypto from 'crypto'

// Загружаем переменные окружения
config()

const MERCHANT_LOGIN = process.env.MERCHANT_LOGIN || 'neuroblogger'
const ROBOKASSA_PASSWORD_1 = process.env.ROBOKASSA_PASSWORD_1

if (!ROBOKASSA_PASSWORD_1) {
  console.error('❌ ROBOKASSA_PASSWORD_1 не установлен в .env')
  process.exit(1)
}

// Параметры тестового платежа
const testInvId = Math.floor(Math.random() * 1000000)
const testAmount = 100 // 100 рублей для теста
const testDescription = 'Тестовый платеж для проверки'

// Формируем подпись согласно документации Robokassa
// Формат для подписи: MerchantLogin:OutSum:InvId:Password1
const signatureValue = crypto
  .createHash('md5')
  .update(
    `${MERCHANT_LOGIN}:${testAmount}:${testInvId}:${ROBOKASSA_PASSWORD_1}`
  )
  .digest('hex')
  .toUpperCase()

// Формируем URL
const baseUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx'
const params = new URLSearchParams({
  MerchantLogin: MERCHANT_LOGIN,
  OutSum: testAmount.toString(),
  InvId: testInvId.toString(),
  Description: testDescription,
  SignatureValue: signatureValue,
  // Дополнительные параметры для улучшения UX
  Culture: 'ru', // Язык интерфейса
  IsTest: '1', // Тестовый режим (если нужно)
})

// Если нужен ResultURL (куда отправлять webhook)
const resultUrl = 'https://ai-server-u14194.vm.elestio.app/payment-success'
params.append('ResultURL', resultUrl)

const fullUrl = `${baseUrl}?${params.toString()}`

console.log('='.repeat(60))
console.log('🔗 ССЫЛКА ДЛЯ ОПЛАТЫ ЧЕРЕЗ ROBOKASSA')
console.log('='.repeat(60))
console.log('\n📋 Параметры платежа:')
console.log(`   MerchantLogin: ${MERCHANT_LOGIN}`)
console.log(`   Сумма: ${testAmount} руб.`)
console.log(`   InvId: ${testInvId}`)
console.log(`   Описание: ${testDescription}`)
console.log(`   Подпись: ${signatureValue}`)
console.log(`   ResultURL: ${resultUrl}`)
console.log('\n🌐 Откройте эту ссылку в браузере:\n')
console.log(fullUrl)
console.log('\n' + '='.repeat(60))
console.log('💡 Подсказки:')
console.log('1. Если ссылка не работает, проверьте MERCHANT_LOGIN и PASSWORD1')
console.log('2. Для тестовых платежей можно использовать параметр IsTest=1')
console.log('3. ResultURL должен быть доступен из интернета для webhook')
console.log('='.repeat(60))
