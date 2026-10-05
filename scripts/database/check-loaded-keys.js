// Проверка загруженных ключей в production
console.log('🔍 ПРОВЕРКА ЗАГРУЖЕННЫХ КЛЮЧЕЙ')
console.log('='.repeat(60))

const eventKey = process.env.INNGEST_EVENT_KEY
const signingKey = process.env.INNGEST_SIGNING_KEY

console.log('\n📊 ТЕКУЩИЕ ЗАГРУЖЕННЫЕ КЛЮЧИ:')
console.log(
  `EVENT_KEY:    ${eventKey ? eventKey.substring(0, 20) + '...' : 'N/A'}`
)
console.log(
  `SIGNING_KEY:  ${signingKey ? signingKey.substring(0, 20) + '...' : 'N/A'}`
)

console.log('\n🔑 СРАВНЕНИЕ С РАБОЧИМИ КЛЮЧАМИ:')
const WORKING_EVENT_KEY = process.env.EXPECTED_INNGEST_EVENT_KEY
const WORKING_SIGNING_KEY = process.env.EXPECTED_INNGEST_SIGNING_KEY

console.log(
  `\nEvent Key Match:  ${eventKey === WORKING_EVENT_KEY ? '✅ СОВПАДАЕТ' : '❌ НЕ СОВПАДАЕТ'}`
)
console.log(
  `Signing Key Match: ${signingKey === WORKING_SIGNING_KEY ? '✅ СОВПАДАЕТ' : '❌ НЕ СОВПАДАЕТ'}`
)

console.log('\n📋 ВЫВОДЫ:')
if (eventKey === WORKING_EVENT_KEY && signingKey === WORKING_SIGNING_KEY) {
  console.log('✅ ВСЕ КЛЮЧИ ЗАГРУЖЕНЫ ПРАВИЛЬНО!')
  console.log('Проблема должна быть решена.')
} else {
  console.log('❌ КЛЮЧИ НЕ СОВПАДАЮТ!')
  console.log('Нужно обновить в Infisical production environment:')
  console.log('')
  console.log(`INNGEST_EVENT_KEY=${WORKING_EVENT_KEY}`)
  console.log(`INNGEST_SIGNING_KEY=${WORKING_SIGNING_KEY}`)
}
