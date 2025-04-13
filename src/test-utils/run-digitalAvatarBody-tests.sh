#!/bin/bash
# Запуск тестов сцен цифрового тела (DigitalAvatarBody v1 и v2)

echo "🧪 Запуск комплексного тестирования сцен цифрового тела"
echo "======================================================"

# Устанавливаем тестовое окружение
export TEST=true
export NODE_ENV=test

# Создаем временный файл для запуска тестов
cat > /Users/playom/999-multibots-telegraf/src/test-utils/digitalBodyTests.js << 'EOF'
/**
 * Запуск тестов сцен цифрового тела (DigitalAvatarBody)
 */

const digitalAvatarBodyTests = require('./tests/scenes/digitalAvatarBodyWizard.test');
const digitalAvatarBodyV2Tests = require('./tests/scenes/digitalAvatarBodyWizardV2.test');
const trainFluxModelTests = require('./tests/scenes/trainFluxModelWizard.test');

async function runAllTests() {
  console.log('🤖 Запуск тестов для сцен цифрового тела (DigitalAvatarBody)');
  
  // Счетчики для общей статистики
  let totalTestSuites = 0;
  let passedTestSuites = 0;
  let totalTests = 0;
  let passedTests = 0;

  try {
    // 1. Тесты для DigitalAvatarBody (v1)
    console.log('\n🧪 Запуск тестов для цифрового тела версия 1 (DigitalAvatarBody)...');
    const digitalAvatarBodyResults = await digitalAvatarBodyTests.runDigitalAvatarBodyWizardTests();
    
    totalTestSuites++;
    totalTests += digitalAvatarBodyResults.length;
    passedTests += digitalAvatarBodyResults.filter(r => r.success).length;
    
    if (digitalAvatarBodyResults.every(r => r.success)) {
      passedTestSuites++;
      console.log('✅ Все тесты цифрового тела v1 успешно пройдены!');
    } else {
      console.log('❌ Некоторые тесты цифрового тела v1 не пройдены!');
    }
    
    // 2. Тесты для DigitalAvatarBody V2
    console.log('\n🧪 Запуск тестов для цифрового тела версия 2 (DigitalAvatarBodyV2)...');
    const digitalAvatarBodyV2Results = await digitalAvatarBodyV2Tests.runDigitalAvatarBodyWizardV2Tests();
    
    totalTestSuites++;
    totalTests += digitalAvatarBodyV2Results.length;
    passedTests += digitalAvatarBodyV2Results.filter(r => r.success).length;
    
    if (digitalAvatarBodyV2Results.every(r => r.success)) {
      passedTestSuites++;
      console.log('✅ Все тесты цифрового тела v2 успешно пройдены!');
    } else {
      console.log('❌ Некоторые тесты цифрового тела v2 не пройдены!');
    }
    
    // 3. Тесты для процесса загрузки фотографий
    console.log('\n🧪 Запуск тестов для загрузки фотографий (trainFluxModelWizard)...');
    const trainFluxModelResults = await trainFluxModelTests.runTrainFluxModelWizardTests();
    
    totalTestSuites++;
    totalTests += trainFluxModelResults.length;
    passedTests += trainFluxModelResults.filter(r => r.success).length;
    
    if (trainFluxModelResults.every(r => r.success)) {
      passedTestSuites++;
      console.log('✅ Все тесты загрузки фотографий успешно пройдены!');
    } else {
      console.log('❌ Некоторые тесты загрузки фотографий не пройдены!');
    }
    
    // Выводим общую статистику
    console.log('\n📊 Общие результаты тестирования:');
    console.log(`Наборов тестов: ${passedTestSuites}/${totalTestSuites} успешно`);
    console.log(`Тестов: ${passedTests}/${totalTests} успешно`);
    
    // Выводим сравнение версий
    console.log('\n🔍 Сравнение версий цифрового тела:');
    console.log('1️⃣ DigitalAvatarBody (v1):');
    console.log('   - Базовая версия для создания цифрового тела');
    console.log('   - Поддерживает от 1000 до 6000 шагов обучения');
    console.log('   - Стоимость: 0.1$ за шаг обучения');
    
    console.log('2️⃣ DigitalAvatarBodyV2 (v2 - Flux Pro):');
    console.log('   - Расширенная версия для создания цифрового тела');
    console.log('   - Поддерживает от 1000 до 6000 шагов обучения');
    console.log('   - Стоимость: 0.2$ за шаг обучения (вдвое дороже)');
    console.log('   - Более высокое качество генерации');
    console.log('   - Дополнительные возможности настройки');
    
    // Выход с соответствующим статусом
    if (passedTestSuites === totalTestSuites) {
      console.log('\n✅ Все тесты успешно пройдены!');
      process.exit(0);
    } else {
      console.log('\n❌ Некоторые тесты не пройдены!');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Произошла ошибка при выполнении тестов:', error);
    process.exit(1);
  }
}

runAllTests().catch(error => {
  console.error('❌ Критическая ошибка:', error);
  process.exit(1);
});
EOF

# Запускаем тесты
cd /Users/playom/999-multibots-telegraf/src/test-utils
node digitalBodyTests.js

# Проверяем код выхода
if [ $? -eq 0 ]; then
  echo "✅ Тесты цифрового тела успешно выполнены"
  exit 0
else
  echo "❌ Тесты цифрового тела завершились с ошибками"
  exit 1
fi 