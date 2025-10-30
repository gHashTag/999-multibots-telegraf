import * as dotenv from 'dotenv'
import md5 from 'md5'
import { MERCHANT_LOGIN, ROBOKASSA_PASSWORD_1 } from '../src/config'

dotenv.config()

async function testWithCorrectPasswords() {
  console.log('=== ROBOKASSA С ПРАВИЛЬНЫМИ ПАРОЛЯМИ ИЗ ЛК ===\n')

  const merchantLogin = MERCHANT_LOGIN || 'neuroblogger'
  const testInvId = Date.now() % 2147483647
  const testAmount = 100 // Начнем с минимума
  const password1 = ROBOKASSA_PASSWORD_1 || ''

  console.log('✅ ПРАВИЛЬНЫЕ ДАННЫЕ ИЗ ЛК:')
  console.log(`MerchantLogin: ${merchantLogin}`)
  console.log(`Password1: ${password1}`)
  console.log(`OutSum: ${testAmount}`)
  console.log(`InvId: ${testInvId}`)
  console.log()

  // Формула подписи: MerchantLogin:OutSum:InvId:Password1
  const signatureString = `${merchantLogin}:${testAmount}:${testInvId}:${password1}`
  const signatureValue = md5(signatureString).toUpperCase()

  console.log(`Строка подписи: ${signatureString}`)
  console.log(`SignatureValue: ${signatureValue}`)
  console.log()

  // Тест 1: С латинским Description
  const latinDesc = 'Balance top-up'
  const url1 = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${testAmount}&InvId=${testInvId}&Description=${encodeURIComponent(
    latinDesc
  )}&SignatureValue=${signatureValue}`

  console.log('=== ТЕСТ 1: Минимальная сумма (100 RUB) с Description ===')
  console.log(url1)
  console.log()

  // Тест 2: БЕЗ Description
  const url2 = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${testAmount}&InvId=${testInvId}&SignatureValue=${signatureValue}`

  console.log('=== ТЕСТ 2: БЕЗ Description (минимальный) ===')
  console.log(url2)
  console.log()

  // Тест 3: 500 RUB
  const testInvId3 = testInvId + 1
  const testAmount3 = 500
  const signature3 = md5(
    `${merchantLogin}:${testAmount3}:${testInvId3}:${password1}`
  ).toUpperCase()
  const url3 = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${testAmount3}&InvId=${testInvId3}&Description=Payment&SignatureValue=${signature3}`

  console.log('=== ТЕСТ 3: Средняя сумма (500 RUB) ===')
  console.log(url3)
  console.log()

  console.log('✅ ПРОВЕРЬТЕ ВСЕ 3 ССЫЛКИ В БРАУЗЕРЕ')
  console.log('Если работают - проблема была в неправильных паролях!')
  console.log()
  console.log('🔧 СЛЕДУЮЩИЙ ШАГ: Обновить пароли на production сервере')
}

testWithCorrectPasswords().catch(console.error)
