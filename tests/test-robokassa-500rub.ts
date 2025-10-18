import * as dotenv from 'dotenv'
import { generateRobokassaUrl } from '../src/scenes/getRuBillWizard/helper'
import { MERCHANT_LOGIN, ROBOKASSA_PASSWORD_1 } from '../src/config'

dotenv.config()

async function testRobokassa500() {
  console.log('=== ТЕСТ ROBOKASSA С 500 РУБЛЯМИ ===\n')

  const testInvId = Date.now() % 2147483647
  const testAmount = 500 // Пробуем 500 рублей вместо 100
  const testDescription = 'Пополнение баланса на 217 звезд'

  const url = generateRobokassaUrl(
    MERCHANT_LOGIN || 'neuroblogger',
    testAmount,
    testInvId,
    testDescription,
    ROBOKASSA_PASSWORD_1 || ''
  )

  console.log(`InvId: ${testInvId}`)
  console.log(`Сумма: ${testAmount} RUB`)
  console.log(`Описание: ${testDescription}`)
  console.log(`\n📋 Ссылка для проверки (500 RUB):`)
  console.log(url)
  console.log('\n✅ Скопируйте и откройте в браузере')

  // Также проверим с 1000 рублями
  console.log('\n=== ТЕСТ С 1000 РУБЛЯМИ ===\n')

  const testInvId2 = (Date.now() + 1000) % 2147483647
  const testAmount2 = 1000
  const testDescription2 = 'Пополнение баланса на 434 звезды'

  const url2 = generateRobokassaUrl(
    MERCHANT_LOGIN || 'neuroblogger',
    testAmount2,
    testInvId2,
    testDescription2,
    ROBOKASSA_PASSWORD_1 || ''
  )

  console.log(`InvId: ${testInvId2}`)
  console.log(`Сумма: ${testAmount2} RUB`)
  console.log(`Описание: ${testDescription2}`)
  console.log(`\n📋 Ссылка для проверки (1000 RUB):`)
  console.log(url2)
  console.log('\n✅ Скопируйте и откройте в браузере')
}

testRobokassa500().catch(console.error)
