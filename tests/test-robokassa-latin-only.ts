import * as dotenv from 'dotenv'
import md5 from 'md5'
import { MERCHANT_LOGIN, ROBOKASSA_PASSWORD_1 } from '../src/config'

dotenv.config()

async function testLatinOnly() {
  console.log('=== ROBOKASSA С ЛАТИНИЦЕЙ (БЕЗ КИРИЛЛИЦЫ) ===\n')

  const merchantLogin = MERCHANT_LOGIN || 'neuroblogger'
  const testInvId = Date.now() % 2147483647
  const testAmount = 500
  const password1 = ROBOKASSA_PASSWORD_1 || ''

  // Формула подписи (БЕЗ Description!)
  const signatureString = `${merchantLogin}:${testAmount}:${testInvId}:${password1}`
  const signatureValue = md5(signatureString).toUpperCase()

  console.log('Параметры:')
  console.log(`MerchantLogin: ${merchantLogin}`)
  console.log(`OutSum: ${testAmount}`)
  console.log(`InvId: ${testInvId}`)
  console.log(`Строка подписи: ${signatureString}`)
  console.log(`SignatureValue: ${signatureValue}`)
  console.log()

  // Вариант 1: Латинский Description
  const latinDesc = 'Balance top-up 217 stars'
  const urlLatin = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${testAmount}&InvId=${testInvId}&Description=${encodeURIComponent(
    latinDesc
  )}&SignatureValue=${signatureValue}`

  console.log('=== ВАРИАНТ 1: С латинским Description ===')
  console.log(`Description: ${latinDesc}`)
  console.log(`📋 Ссылка:`)
  console.log(urlLatin)
  console.log()

  // Вариант 2: БЕЗ Description вообще
  const urlNoDesc = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${testAmount}&InvId=${testInvId}&SignatureValue=${signatureValue}`

  console.log('=== ВАРИАНТ 2: БЕЗ Description (минимальный набор) ===')
  console.log(`📋 Ссылка:`)
  console.log(urlNoDesc)
  console.log()

  // Вариант 3: Только цифры в Description
  const numericDesc = '217'
  const urlNumeric = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${testAmount}&InvId=${testInvId}&Description=${numericDesc}&SignatureValue=${signatureValue}`

  console.log('=== ВАРИАНТ 3: Только цифры в Description ===')
  console.log(`Description: ${numericDesc}`)
  console.log(`📋 Ссылка:`)
  console.log(urlNumeric)
  console.log()

  // Вариант 4: Тестовый режим с латиницей
  const testPassword1 = process.env.TEST_PASSWORD1 || 'Uw2c9CgfPXYx7KLmNp'
  const testSignature = md5(
    `${merchantLogin}:${testAmount}:${testInvId}:${testPassword1}`
  ).toUpperCase()
  const urlTest = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${testAmount}&InvId=${testInvId}&Description=Test+payment&SignatureValue=${testSignature}&IsTest=1`

  console.log('=== ВАРИАНТ 4: Тестовый режим с латиницей ===')
  console.log(`Description: Test payment`)
  console.log(`TEST_PASSWORD1: ${testPassword1}`)
  console.log(`SignatureValue: ${testSignature}`)
  console.log(`📋 Ссылка:`)
  console.log(urlTest)
  console.log()

  console.log('=== ПРОВЕРЬТЕ ВСЕ 4 ВАРИАНТА ===')
  console.log('Если хотя бы один заработает - проблема была в кириллице!')
}

testLatinOnly().catch(console.error)
