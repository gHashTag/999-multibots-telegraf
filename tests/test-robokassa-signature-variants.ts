import * as dotenv from 'dotenv'
import md5 from 'md5'
import { MERCHANT_LOGIN, ROBOKASSA_PASSWORD_1 } from '../src/config'

dotenv.config()

async function testSignatureVariants() {
  console.log('=== ТЕСТ ВАРИАНТОВ ПОДПИСИ ROBOKASSA ===\n')

  const merchantLogin = MERCHANT_LOGIN || 'neuroblogger'
  const testInvId = Date.now() % 2147483647
  const testAmount = 500
  const testDescription = 'Тестовое пополнение баланса на 217 звезд'
  const password1 = ROBOKASSA_PASSWORD_1 || ''

  console.log('Параметры:')
  console.log(`MerchantLogin: ${merchantLogin}`)
  console.log(`OutSum: ${testAmount}`)
  console.log(`InvId: ${testInvId}`)
  console.log(`Password1: ${password1}`)
  console.log()

  // Формула: MerchantLogin:OutSum:InvId:Password1
  const signatureString = `${merchantLogin}:${testAmount}:${testInvId}:${password1}`
  console.log(`Строка для подписи: ${signatureString}`)
  console.log()

  // Вариант 1: UPPERCASE (текущий)
  const signatureUppercase = md5(signatureString).toUpperCase()
  const urlUppercase = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${testAmount}&InvId=${testInvId}&Description=${encodeURIComponent(
    testDescription
  )}&SignatureValue=${signatureUppercase}`

  console.log('=== ВАРИАНТ 1: UPPERCASE MD5 (текущий) ===')
  console.log(`SignatureValue: ${signatureUppercase}`)
  console.log(`📋 Ссылка:`)
  console.log(urlUppercase)
  console.log()

  // Вариант 2: lowercase
  const signatureLowercase = md5(signatureString)
  const urlLowercase = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${testAmount}&InvId=${testInvId}&Description=${encodeURIComponent(
    testDescription
  )}&SignatureValue=${signatureLowercase}`

  console.log('=== ВАРИАНТ 2: lowercase MD5 ===')
  console.log(`SignatureValue: ${signatureLowercase}`)
  console.log(`📋 Ссылка:`)
  console.log(urlLowercase)
  console.log()

  // Вариант 3: С InvId=0 (как в примере документации)
  const signatureInvZero = md5(
    `${merchantLogin}:${testAmount}:0:${password1}`
  ).toUpperCase()
  const urlInvZero = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${testAmount}&InvId=0&Description=${encodeURIComponent(
    testDescription
  )}&SignatureValue=${signatureInvZero}`

  console.log('=== ВАРИАНТ 3: InvId=0 (как в примере) ===')
  console.log(`SignatureValue: ${signatureInvZero}`)
  console.log(`📋 Ссылка:`)
  console.log(urlInvZero)
  console.log()

  // Вариант 4: Без Description параметра
  const signatureNoDesc = md5(signatureString).toUpperCase()
  const urlNoDesc = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${testAmount}&InvId=${testInvId}&SignatureValue=${signatureNoDesc}`

  console.log('=== ВАРИАНТ 4: БЕЗ Description ===')
  console.log(`SignatureValue: ${signatureNoDesc}`)
  console.log(`📋 Ссылка:`)
  console.log(urlNoDesc)
  console.log()

  console.log('=== ИТОГО: 4 варианта для проверки ===')
  console.log('Пожалуйста, проверьте каждый вариант в браузере')
}

testSignatureVariants().catch(console.error)
