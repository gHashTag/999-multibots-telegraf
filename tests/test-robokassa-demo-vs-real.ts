import * as dotenv from 'dotenv'
import md5 from 'md5'
import { MERCHANT_LOGIN, ROBOKASSA_PASSWORD_1 } from '../src/config'

dotenv.config()

async function testDemoVsReal() {
  console.log('=== СРАВНЕНИЕ: ДЕМО vs РЕАЛЬНЫЙ МАГАЗИН ===\n')

  const testInvId = Date.now() % 2147483647
  const testAmount = 100

  // ============= ДЕМО МАГАЗИН (должен работать 100%) =============
  console.log('🎯 ДЕМО-МАГАЗИН ROBOKASSA (эталон - должен работать):')
  console.log('=' .repeat(60))

  const demoLogin = 'demo'
  const demoPassword = 'password_1'
  const demoSignature = md5(
    `${demoLogin}:${testAmount}:${testInvId}:${demoPassword}`
  ).toUpperCase()

  console.log(`MerchantLogin: ${demoLogin}`)
  console.log(`Password: ${demoPassword}`)
  console.log(`OutSum: ${testAmount}`)
  console.log(`InvId: ${testInvId}`)
  console.log(`Строка: ${demoLogin}:${testAmount}:${testInvId}:${demoPassword}`)
  console.log(`Signature: ${demoSignature}`)
  console.log()

  const demoUrl = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${demoLogin}&OutSum=${testAmount}&InvId=${testInvId}&Description=Test&SignatureValue=${demoSignature}&IsTest=1`

  console.log('📋 ДЕМО ССЫЛКА (проверьте ПЕРВОЙ!):')
  console.log(demoUrl)
  console.log()
  console.log()

  // ============= НАШ МАГАЗИН =============
  console.log('🏪 ВАШ МАГАЗИН neuroblogger:')
  console.log('=' .repeat(60))

  const realLogin = MERCHANT_LOGIN || 'neuroblogger'
  const realPassword = ROBOKASSA_PASSWORD_1 || ''
  const realInvId = testInvId + 1
  const realSignature = md5(
    `${realLogin}:${testAmount}:${realInvId}:${realPassword}`
  ).toUpperCase()

  console.log(`MerchantLogin: ${realLogin}`)
  console.log(`Password: ${realPassword}`)
  console.log(`OutSum: ${testAmount}`)
  console.log(`InvId: ${realInvId}`)
  console.log(`Строка: ${realLogin}:${testAmount}:${realInvId}:${realPassword}`)
  console.log(`Signature: ${realSignature}`)
  console.log()

  const realUrl = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${realLogin}&OutSum=${testAmount}&InvId=${realInvId}&Description=Test&SignatureValue=${realSignature}`

  console.log('📋 ВАША ССЫЛКА:')
  console.log(realUrl)
  console.log()
  console.log()

  // ============= ИНСТРУКЦИЯ =============
  console.log('📝 ИНСТРУКЦИЯ ПО ПРОВЕРКЕ:')
  console.log('=' .repeat(60))
  console.log()
  console.log('1️⃣  СНАЧАЛА откройте ДЕМО ссылку:')
  console.log('   → Если ДЕМО работает ✅')
  console.log('      Значит формула подписи правильная')
  console.log('      Значит Robokassa в принципе работает')
  console.log()
  console.log('2️⃣  ЗАТЕМ откройте ВАШУ ссылку:')
  console.log('   → Если ВАШ НЕ работает ❌')
  console.log('      Значит проблема в настройках магазина "neuroblogger"')
  console.log()
  console.log('3️⃣  ПРОВЕРЬТЕ В ЛИЧНОМ КАБИНЕТЕ:')
  console.log('   https://partner.robokassa.ru/')
  console.log()
  console.log('   Магазины → neuroblogger → Проверьте:')
  console.log()
  console.log('   ✓ Статус магазина: должен быть "Активен"')
  console.log('   ✓ Способы оплаты: должны быть подключены')
  console.log('     (Банковские карты, СБП, кошельки)')
  console.log('   ✓ Минимальная сумма: <= 100 RUB')
  console.log('   ✓ Пароли совпадают с нашими')
  console.log()
  console.log('4️⃣  ЕСЛИ ДЕМО ТОЖЕ НЕ РАБОТАЕТ:')
  console.log('   → Проблема на стороне Robokassa или в браузере')
  console.log('   → Попробуйте другой браузер')
  console.log('   → Проверьте не блокирует ли VPN/прокси')
  console.log()
  console.log('=' .repeat(60))
}

testDemoVsReal().catch(console.error)
