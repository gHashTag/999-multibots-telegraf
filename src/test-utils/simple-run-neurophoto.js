/**
 * Простой скрипт для запуска тестов selectNeuroPhotoScene
 * Можно запустить с помощью: node simple-run-neurophoto.js
 */

// Импортируем собственную систему моков
const mockApi = require('./core/mock').default;

// Мок для логгера
global.logger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  debug: (...args) => console.debug('[DEBUG]', ...args)
};

// Мок для базы данных
global.database = {
  getUserBalance: () => Promise.resolve(100),
  getUserBalanceNotificationSettings: () => Promise.resolve({ enabled: true, threshold: 50 }),
  updateUserBalanceNotificationSettings: () => Promise.resolve({ success: true })
};

// Основная функция запуска тестов
async function runTests() {
  try {
    console.log('🖼 Запуск тестов для selectNeuroPhotoScene...');
    
    // Импортируем код тестов напрямую из компилированного JavaScript
    const { runSelectNeuroPhotoSceneTests } = require('./tests/scenes/selectNeuroPhotoScene.test');
    
    if (typeof runSelectNeuroPhotoSceneTests !== 'function') {
      console.error('❌ Функция runSelectNeuroPhotoSceneTests не найдена');
      process.exit(1);
    }
    
    // Запускаем тесты
    const results = await runSelectNeuroPhotoSceneTests();
    
    // Выводим результаты
    console.log('\n📊 Результаты тестов:');
    let passed = 0;
    let failed = 0;
    
    results.forEach(result => {
      if (result.success) {
        console.log(`✅ ${result.name}: УСПЕХ`);
        passed++;
      } else {
        console.log(`❌ ${result.name}: ОШИБКА`);
        console.log(`   Сообщение: ${result.message}`);
        failed++;
      }
    });
    
    console.log(`\n📈 Итого: успешно - ${passed}, с ошибками - ${failed}`);
    
    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Произошла ошибка при запуске тестов:', error);
    process.exit(1);
  }
}

// Запускаем тесты
runTests(); 