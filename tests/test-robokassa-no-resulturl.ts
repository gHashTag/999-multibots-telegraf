import * as dotenv from 'dotenv'
import md5 from 'md5'
import { MERCHANT_LOGIN, ROBOKASSA_PASSWORD_1 } from '../src/config'

dotenv.config()

async function testRobokassaNoResultURL() {
  console.log('=== ТЕСТ БЕЗ ResultURL ===\n')

  const merchantLogin = MERCHANT_LOGIN || 'neuroblogger'
  const testInvId = Date.now() % 2147483647
  const testAmount = 500
  const testDescription = 'Тестовое пополнение баланса на 217 звезд'
  const password1 = ROBOKASSA_PASSWORD_1 || ''

  // Формула подписи БЕЗ ResultURL
  const signatureValue = md5(
    `${merchantLogin}:${testAmount}:${testInvId}:${password1}`
  ).toUpperCase()

  // URL БЕЗ ResultURL параметра
  const urlNoResult = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${testAmount}&InvId=${testInvId}&Description=${encodeURIComponent(
    testDescription
  )}&SignatureValue=${signatureValue}`

  console.log(`InvId: ${testInvId}`)
  console.log(`Сумма: ${testAmount} RUB`)
  console.log(`Описание: ${testDescription}`)
  console.log(`\n📋 Ссылка БЕЗ ResultURL:`)
  console.log(urlNoResult)
  console.log('\n===================================\n')

  // Также попробуем с ТЕСТОВЫМИ паролями
  console.log('=== ТЕСТ С ТЕСТОВЫМ ПАРОЛЕМ ===\n')

  const testPassword1 = process.env.TEST_PASSWORD1 || 'Uw2c9CgfPXYx7KLmNp'
  const testInvId2 = (Date.now() + 1000) % 2147483647

  const testSignature = md5(
    `${merchantLogin}:${testAmount}:${testInvId2}:${testPassword1}`
  ).toUpperCase()

  const testUrl = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${testAmount}&InvId=${testInvId2}&Description=${encodeURIComponent(
    testDescription
  )}&SignatureValue=${testSignature}&IsTest=1`

  console.log(`InvId: ${testInvId2}`)
  console.log(`Используем TEST_PASSWORD1: ${testPassword1}`)
  console.log(`\n📋 Тестовая ссылка (IsTest=1):`)
  console.log(testUrl)
}

testRobokassaNoResultURL().catch(console.error)
