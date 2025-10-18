import * as dotenv from 'dotenv'
import md5 from 'md5'

dotenv.config()

async function testRobokassaTestMode() {
  console.log('=== ROBOKASSA ТЕСТОВЫЙ РЕЖИМ ===\n')

  const merchantLogin = 'neuroblogger'
  const testInvId = Date.now() % 2147483647
  const testAmount = 500
  const testDescription = 'Тестовое пополнение'

  // ИСПОЛЬЗУЕМ ТЕСТОВЫЕ ПАРОЛИ из .env
  const testPassword1 = process.env.TEST_PASSWORD1 || 'Uw2c9CgfPXYx7KLmNp'
  const testPassword2 = process.env.TEST_PASSWORD2 || 'Uw2c9CgfPXYx7KLmNp'

  console.log('📋 ТЕСТОВЫЕ ДАННЫЕ:')
  console.log(`MerchantLogin: ${merchantLogin}`)
  console.log(`OutSum: ${testAmount}`)
  console.log(`InvId: ${testInvId}`)
  console.log(`TEST_PASSWORD1: ${testPassword1}`)
  console.log()

  // Формула: MerchantLogin:OutSum:InvId:TEST_PASSWORD1
  const signatureString = `${merchantLogin}:${testAmount}:${testInvId}:${testPassword1}`
  const signatureValue = md5(signatureString).toUpperCase()

  console.log(`Строка для подписи: ${signatureString}`)
  console.log(`SignatureValue: ${signatureValue}`)
  console.log()

  // Вариант 1: Тестовый режим через IsTest=1
  const urlTestMode = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${testAmount}&InvId=${testInvId}&Description=${encodeURIComponent(
    testDescription
  )}&SignatureValue=${signatureValue}&IsTest=1`

  console.log('=== ТЕСТОВЫЙ РЕЖИМ (IsTest=1) ===')
  console.log(urlTestMode)
  console.log()

  // Вариант 2: Демо-магазин Robokassa (всегда работает)
  const demoMerchant = 'demo'
  const demoPassword = 'password_1'
  const demoInvId = Date.now() % 2147483647
  const demoSignatureString = `${demoMerchant}:${testAmount}:${demoInvId}:${demoPassword}`
  const demoSignature = md5(demoSignatureString).toUpperCase()

  const urlDemo = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${demoMerchant}&OutSum=${testAmount}&InvId=${demoInvId}&Description=${encodeURIComponent(
    testDescription
  )}&SignatureValue=${demoSignature}&IsTest=1`

  console.log('=== ДЕМО-МАГАЗИН ROBOKASSA (для сравнения) ===')
  console.log(`MerchantLogin: demo`)
  console.log(`Password: password_1`)
  console.log(`Строка: ${demoSignatureString}`)
  console.log(`Signature: ${demoSignature}`)
  console.log()
  console.log(urlDemo)
  console.log()

  console.log('=== ИНСТРУКЦИЯ ===')
  console.log('1. Сначала проверьте ДЕМО-магазин (должен работать)')
  console.log('2. Если демо работает, но neuroblogger нет - проблема в настройках магазина')
  console.log('3. Нужно проверить личный кабинет Robokassa:')
  console.log('   - Магазин активирован?')
  console.log('   - Тестовые пароли совпадают?')
  console.log('   - Разрешены тестовые платежи?')
}

testRobokassaTestMode().catch(console.error)
