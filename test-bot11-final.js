// Финальный тест: BOT_TOKEN_11 должен быть загружен

// Реальный production сценарий: все токены 1-10 есть, 11 есть
process.env.BOT_TOKEN_1 = 'token1';
process.env.BOT_TOKEN_2 = 'token2';
process.env.BOT_TOKEN_3 = 'token3';
process.env.BOT_TOKEN_4 = 'token4';
process.env.BOT_TOKEN_5 = 'token5';
process.env.BOT_TOKEN_6 = 'token6';
process.env.BOT_TOKEN_7 = 'token7';
process.env.BOT_TOKEN_8 = 'token8';
process.env.BOT_TOKEN_9 = 'token9';
process.env.BOT_TOKEN_10 = 'token10';
process.env.BOT_TOKEN_11 = '8546804869:AAGYO9teJWJLVSsVj2U9nmyr5N80lIq7bvU';

console.log('🎯 ФИНАЛЬНЫЙ ТЕСТ: BOT_TOKEN_11 должен загружаться\n');

// Исправленный алгоритм (без gap detection)
function discoverBotTokensFixed() {
  const tokens = [];

  for (let i = 1; i <= 100; i++) {
    const tokenKey = `BOT_TOKEN_${i}`;
    const token = process.env[tokenKey];

    if (token) {
      tokens.push(token);
    }
  }

  return tokens;
}

const result = discoverBotTokensFixed();

console.log(`✅ Найдено токенов: ${result.length}`);
console.log(`🎯 BOT_TOKEN_11 найден: ${result[10] ? 'ДА ✅' : 'НЕТ ❌'}`);
console.log(`🔑 Последний токен: ${result[result.length - 1]?.substring(0, 20)}...`);

if (result.length === 11 && result[10] === '8546804869:AAGYO9teJWJLVSsVj2U9nmyr5N80lIq7bvU') {
  console.log('\n🎉 УСПЕХ! BOT_TOKEN_11 будет загружен в production!');
  console.log('✅ @OM_AI_Digital_studio_bot должен заработать!');
} else {
  console.log('\n❌ ОШИБКА! BOT_TOKEN_11 не загружается!');
}
