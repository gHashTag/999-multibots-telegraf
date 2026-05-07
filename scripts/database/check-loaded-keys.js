// Проверка загруженных ключей в production
console.log('🔍 ПРОВЕРКА ЗАГРУЖЕННЫХ КЛЮЧЕЙ');
console.log('='.repeat(60));

const eventKey = process.env.INNGEST_EVENT_KEY;
const signingKey = process.env.INNGEST_SIGNING_KEY;

console.log('\n📊 ТЕКУЩИЕ ЗАГРУЖЕННЫЕ КЛЮЧИ:');
console.log(`EVENT_KEY:    ${eventKey ? eventKey.substring(0, 20) + '...' : 'N/A'}`);
console.log(`SIGNING_KEY:  ${signingKey ? signingKey.substring(0, 20) + '...' : 'N/A'}`);

console.log('\n🔑 СРАВНЕНИЕ С РАБОЧИМИ КЛЮЧАМИ:');
const WORKING_EVENT_KEY = '4JiBiCBZ8en7jNonnsAPXCFiLVkrt1uEXklGcDzaQ6SCBV9p7-UBlQlTrze-x_WPRTihikB_uhAGhbkwGhnu4Q';
const WORKING_SIGNING_KEY = 'signkey-test-c4167464e900701832920c98bb2ec6e6e3c59fd2b27c62e1f4140dada01e4597';

console.log(`\nEvent Key Match:  ${eventKey === WORKING_EVENT_KEY ? '✅ СОВПАДАЕТ' : '❌ НЕ СОВПАДАЕТ'}`);
console.log(`Signing Key Match: ${signingKey === WORKING_SIGNING_KEY ? '✅ СОВПАДАЕТ' : '❌ НЕ СОВПАДАЕТ'}`);

console.log('\n📋 ВЫВОДЫ:');
if (eventKey === WORKING_EVENT_KEY && signingKey === WORKING_SIGNING_KEY) {
  console.log('✅ ВСЕ КЛЮЧИ ЗАГРУЖЕНЫ ПРАВИЛЬНО!');
  console.log('Проблема должна быть решена.');
} else {
  console.log('❌ КЛЮЧИ НЕ СОВПАДАЮТ!');
  console.log('Нужно обновить в Infisical production environment:');
  console.log('');
  console.log(`INNGEST_EVENT_KEY=${WORKING_EVENT_KEY}`);
  console.log(`INNGEST_SIGNING_KEY=${WORKING_SIGNING_KEY}`);
}
