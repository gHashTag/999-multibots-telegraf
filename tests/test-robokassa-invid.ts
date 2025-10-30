import * as dotenv from 'dotenv'
import { generateRobokassaUrl } from '../src/scenes/getRuBillWizard/helper'
import { MERCHANT_LOGIN, ROBOKASSA_PASSWORD_1 } from '../src/config'

dotenv.config()

async function testRobokassaInvId() {
  console.log('=== ТЕСТ ГЕНЕРАЦИИ ROBOKASSA INV_ID ===\n')

  // Генерируем несколько InvId подряд
  const invIds: number[] = []
  for (let i = 0; i < 5; i++) {
    const invId = Date.now() % 2147483647
    invIds.push(invId)
    console.log(`InvId ${i + 1}: ${invId}`)

    // Небольшая задержка для разных timestamp
    await new Promise(resolve => setTimeout(resolve, 100))
  }

console.log('\n=== ПРОВЕРКА УНИКАЛЬНОСТИ ===')
const unique = new Set(invIds)
console.log(`Всего InvId: ${invIds.length}`)
console.log(`Уникальных: ${unique.size}`)
console.log(`✅ Все уникальные: ${invIds.length === unique.size ? 'ДА' : 'НЕТ'}`)

console.log('\n=== ПРОВЕРКА ВОЗРАСТАНИЯ ===')
let isAscending = true
for (let i = 1; i < invIds.length; i++) {
  if (invIds[i] <= invIds[i - 1]) {
    isAscending = false
    console.log(`❌ InvId ${i + 1} (${invIds[i]}) <= InvId ${i} (${invIds[i - 1]})`)
  }
}
console.log(`✅ Все возрастают: ${isAscending ? 'ДА' : 'НЕТ'}`)

console.log('\n=== ГЕНЕРАЦИЯ ССЫЛКИ ROBOKASSA ===')
const testInvId = Date.now() % 2147483647
const testAmount = 100
const testDescription = 'Тестовое пополнение баланса на 43 звезды'

const url = generateRobokassaUrl(
  MERCHANT_LOGIN || 'neuroblogger',
  testAmount,
  testInvId,
  testDescription,
  ROBOKASSA_PASSWORD_1 || ''
)

console.log(`\nInvId: ${testInvId}`)
console.log(`Сумма: ${testAmount} RUB`)
console.log(`Описание: ${testDescription}`)
console.log(`\n📋 Ссылка для проверки:`)
console.log(url)
console.log('\n✅ Скопируйте ссылку и откройте в браузере для проверки')

// Проверяем параметры в URL
const urlObj = new URL(url)
console.log('\n=== ПАРАМЕТРЫ ССЫЛКИ ===')
console.log(`MerchantLogin: ${urlObj.searchParams.get('MerchantLogin')}`)
console.log(`OutSum: ${urlObj.searchParams.get('OutSum')}`)
console.log(`InvId: ${urlObj.searchParams.get('InvId')}`)
console.log(`Description: ${decodeURIComponent(urlObj.searchParams.get('Description') || '')}`)
console.log(`SignatureValue: ${urlObj.searchParams.get('SignatureValue')}`)
console.log(`ResultURL: ${decodeURIComponent(urlObj.searchParams.get('ResultURL') || '')}`)
}

testRobokassaInvId().catch(console.error)
