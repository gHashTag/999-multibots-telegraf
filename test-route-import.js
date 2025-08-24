const path = require('path');
const Module = require('module');

// Патчим require для поддержки path aliases
const originalRequire = Module.prototype.require;
Module.prototype.require = function(...args) {
  if (args[0].startsWith('@/')) {
    args[0] = args[0].replace('@/', path.join(__dirname, 'src/'));
  }
  return originalRequire.apply(this, args);
};

console.log('🔍 Тестирование импорта маршрутов Dart AI...\n');

try {
  console.log('📦 Импорт TypeScript модулей...');
  require('ts-node/register');
  
  console.log('📄 Попытка импорта интерфейсов Dart AI...');
  const interfaces = require('./src/interfaces/dart-ai.interface.ts');
  console.log('✅ Интерфейсы импортированы успешно');
  
  console.log('📄 Попытка импорта маршрутов Dart AI...');
  const routes = require('./src/api_server/routes/dart-ai.routes.ts');
  console.log('✅ Маршруты импортированы успешно');
  
  console.log('\n✅ Все импорты работают корректно!');
  console.log('🔧 Возможно, нужно перезапустить сервер для обновления маршрутов.');
  
} catch (error) {
  console.log(`❌ Ошибка импорта: ${error.message}`);
  console.log('\n📋 Детали ошибки:');
  console.log(error.stack);
}