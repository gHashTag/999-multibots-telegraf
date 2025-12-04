/**
 * Тест webhook исправления для ошибок контент-политики
 * Проверяет, что ошибки доходят до пользователя в direct mode
 */

const fetch = require('node-fetch');

// Симуляция webhook с telegramId и ошибкой контент-политики
async function testContentPolicyError() {
  console.log('🧪 [ТЕСТ] Проверяем webhook fix для ошибок контент-политики...\n');

  const testPayload = {
    taskId: 'test-task-12345',
    successFlag: 3, // Content policy violation
    errorMessage: 'OpenAI currently do not support uploads of images containing photorealistic people',
    errorCode: 400,
    code: 400
  };

  const telegramId = '123456789'; // Тестовый ID

  try {
    console.log('📤 Отправляем webhook с telegramId в URL...');
    console.log('   URL: /api/video-callback/' + telegramId);
    console.log('   Payload:', JSON.stringify(testPayload, null, 2));

    const response = await fetch(`http://localhost:3000/api/video-callback/${telegramId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testPayload)
    });

    console.log('\n✅ Webhook принят!');
    console.log('   Status:', response.status);
    console.log('   Response:', await response.json());

    console.log('\n📋 [РЕЗУЛЬТАТ]');
    console.log('   Если исправление работает, пользователь получит:');
    console.log('   "🚫 Контент отклонен политикой безопасности."');
    console.log('   ');
    console.log('   С оригинальным багом: ошибка НЕ доходила до пользователя');
    console.log('   После исправления: ошибка ДОЛЖНА дойти до пользователя');

  } catch (error) {
    console.error('❌ Ошибка теста:', error.message);
    console.log('\n💡 Убедитесь что сервер запущен: npm run dev');
  }
}

// Тест ошибки генерации (successFlag=2)
async function testGenerationError() {
  console.log('\n🧪 [ТЕСТ] Проверяем webhook fix для ошибок генерации...\n');

  const testPayload = {
    taskId: 'test-task-67890',
    successFlag: 2, // Generation failed
    errorMessage: 'Generation timeout exceeded',
    errorCode: 500,
    code: 500
  };

  const telegramId = '987654321';

  try {
    console.log('📤 Отправляем webhook с telegramId в URL...');
    console.log('   URL: /api/video-callback/' + telegramId);
    console.log('   Payload:', JSON.stringify(testPayload, null, 2));

    const response = await fetch(`http://localhost:3000/api/video-callback/${telegramId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testPayload)
    });

    console.log('\n✅ Webhook принят!');
    console.log('   Status:', response.status);
    console.log('   Response:', await response.json());

    console.log('\n📋 [РЕЗУЛЬТАТ]');
    console.log('   Если исправление работает, пользователь получит:');
    console.log('   "❌ Ошибка генерации видео."');

  } catch (error) {
    console.error('❌ Ошибка теста:', error.message);
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🧪 ТЕСТ WEBHOOK FIX ДЛЯ ОШИБОК КОНТЕНТ-ПОЛИТИКИ');
  console.log('═══════════════════════════════════════════════════════════\n');

  await testContentPolicyError();
  await testGenerationError();

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  ✅ ТЕСТЫ ЗАВЕРШЕНЫ');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('📝 Что проверить в логах:');
  console.log('   1. Поиск строки "Direct content policy notification sent"');
  console.log('   2. Поиск строки "Direct failure notification sent"');
  console.log('   3. Отсутствие строк "No task context and no telegramId"');
}

main();
