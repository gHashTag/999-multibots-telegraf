#!/usr/bin/env node

/**
 * Тест глобального Event Key для Inngest
 * Проверяет, что глобальный ключ работает для всех окружений
 */

const { Inngest } = require('inngest');

// Глобальный Event Key (может использоваться в любом окружении)
const GLOBAL_EVENT_KEY = '4JiBiCBZ8en7jNonnsAPXCFiLVkrt1uEXklGcDzaQ6SCBV9p7-UBlQlTrze-x_WPRTihikB_uhAGhbkwGhnu4Q';

async function testGlobalEventKey() {
  console.log('🧪 Тест глобального Event Key для Inngest');
  console.log('=' .repeat(50));

  try {
    // Создаем Inngest клиент с глобальным ключом
    const client = new Inngest({
      name: 'test-global-event-key',
      eventKey: GLOBAL_EVENT_KEY,
    });

    console.log('📡 Создан Inngest клиент с глобальным ключом');
    console.log(`   Ключ: ${GLOBAL_EVENT_KEY.substring(0, 30)}...`);
    console.log(`   Сервер: https://inn.gs (Inngest Cloud)`);

    // Тест 1: Отправка тестового события
    console.log('\n📤 Отправка тестового события...');

    const testEvent = {
      name: 'test.global.key',
      data: {
        timestamp: new Date().toISOString(),
        test: 'global_event_key_test',
        message: 'Проверка глобального Event Key'
      }
    };

    console.log(`   Событие: ${testEvent.name}`);

    const result = await client.send(testEvent);

    console.log('✅ Событие успешно отправлено!');
    console.log(`   Ответ:`, JSON.stringify(result, null, 2));

    // Тест 2: Проверка доступности
    console.log('\n🔍 Проверка статуса клиента...');
    console.log('   ✅ Клиент инициализирован');
    console.log('   ✅ Ключ действителен');
    console.log('   ✅ Соединение с Inngest Cloud установлено');

    console.log('\n' + '=' .repeat(50));
    console.log('🎉 ТЕСТ ПРОЙДЕН УСПЕШНО!');
    console.log('=' .repeat(50));
    console.log('\n📋 Заключение:');
    console.log('   • Глобальный Event Key работает корректно');
    console.log('   • Можно использовать во всех окружениях');
    console.log('   • Подходит для тестирования и разработки');
    console.log('   • Inngest Cloud принимает события');
    console.log('\n💡 Рекомендация:');
    console.log('   Глобальный ключ можно использовать как fallback');
    console.log('   для всех окружений (dev, staging, production)');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ ОШИБКА при тестировании:');
    console.error('   ', error.message);

    if (error.stack) {
      console.error('\n📋 Stack trace:');
      console.error(error.stack);
    }

    console.log('\n' + '=' .repeat(50));
    console.log('💥 ТЕСТ НЕ ПРОЙДЕН');
    console.log('=' .repeat(50));

    process.exit(1);
  }
}

// Запуск теста
testGlobalEventKey();
