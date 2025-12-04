// Тест исправления gap detection для BOT_TOKEN_11

// Симулируем process.env С GAP (как в реальной production среде)
// Создаем GAP: пропускаем BOT_TOKEN_5
process.env.BOT_TOKEN_1 = 'token1';
process.env.BOT_TOKEN_2 = 'token2';
process.env.BOT_TOKEN_3 = 'token3';
process.env.BOT_TOKEN_4 = 'token4';
// ❌ BOT_TOKEN_5 пропущен - GAP!
// Продолжаем с BOT_TOKEN_6
process.env.BOT_TOKEN_6 = 'token6';
process.env.BOT_TOKEN_7 = 'token7';
process.env.BOT_TOKEN_8 = 'token8';
process.env.BOT_TOKEN_9 = 'token9';
process.env.BOT_TOKEN_10 = 'token10';
process.env.BOT_TOKEN_11 = '8546804869:AAGYO9teJWJLVSsVj2U9nmyr5N80lIq7bvU';

console.log('🧪 Тестирование gap detection алгоритма...\n');

// Исправленный алгоритм (без gap detection)
function discoverBotTokensFixed() {
  const tokens = [];

  for (let i = 1; i <= 100; i++) {
    const tokenKey = `BOT_TOKEN_${i}`;
    const token = process.env[tokenKey];

    if (token) {
      tokens.push(token);
    }
    // ✅ ИСПРАВЛЕНИЕ: Убираем gap detection
  }

  return tokens;
}

// Старый алгоритм (с gap detection)
function discoverBotTokensOld() {
  const tokens = [];

  for (let i = 1; i <= 100; i++) {
    const tokenKey = `BOT_TOKEN_${i}`;
    const token = process.env[tokenKey];

    if (token) {
      tokens.push(token);
    } else if (i > 1 && tokens.length === i - 1) {
      // ❌ Старый код с gap detection
      break;
    }
  }

  return tokens;
}

const fixedResult = discoverBotTokensFixed();
const oldResult = discoverBotTokensOld();

console.log('✅ ИСПРАВЛЕННЫЙ алгоритм (без gap detection):');
console.log(`   Найдено токенов: ${fixedResult.length}`);
console.log(`   BOT_TOKEN_11 найден: ${fixedResult.includes('8546804869:AAGYO9teJWJLVSsVj2U9nmyr5N80lIq7bvU') ? 'ДА ✅' : 'НЕТ ❌'}`);

console.log('\n❌ СТАРЫЙ алгоритм (с gap detection):');
console.log(`   Найдено токенов: ${oldResult.length}`);
console.log(`   BOT_TOKEN_11 найден: ${oldResult.includes('8546804869:AAGYO9teJWJLVSsVj2U9nmyr5N80lIq7bvU') ? 'ДА ✅' : 'НЕТ ❌'}`);

console.log('\n🎯 Результат:');
if (fixedResult.length === 11 && oldResult.length === 10) {
  console.log('   ✅ ИСПРАВЛЕНИЕ РАБОТАЕТ! BOT_TOKEN_11 будет загружен!');
} else {
  console.log('   ❌ ОШИБКА в алгоритме!');
}
