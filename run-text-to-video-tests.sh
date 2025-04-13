#!/bin/bash

echo "🎬 Начинаем тестирование сцены Text to Video..."
echo "📋 Запуск текста в видео..."

# Устанавливаем переменные окружения для тестов
export TEST=true
export NODE_ENV=test
export JEST_WORKER_ID=1

# Переходим в директорию проекта
cd /Users/playom/999-multibots-telegraf/src/test-utils

# Создаем временный файл для запуска с поддержкой Jest
cat > jest-setup.js << 'EOF'
// Настройка глобального объекта jest
global.jest = {
  fn: () => {
    const mockFn = (...args) => {
      mockFn.mock.calls.push(args);
      return mockFn.mockImplementation ? mockFn.mockImplementation(...args) : undefined;
    };
    mockFn.mock = { calls: [] };
    mockFn.mockReturnValue = (val) => {
      mockFn.mockImplementation = () => val;
      return mockFn;
    };
    mockFn.mockResolvedValue = (val) => {
      mockFn.mockImplementation = () => Promise.resolve(val);
      return mockFn;
    };
    return mockFn;
  }
};

// Установка некоторых mock функций из jest в глобальный объект
global.jest.mock = (moduleName, factory) => {
  // Здесь можно добавить логику мокирования модулей
  console.log(`🔧 Мокируем модуль: ${moduleName}`);
};
EOF

# Запускаем тест с поддержкой Jest
node -r ./jest-setup.js simplest-test-text-to-video.js

# Проверяем код завершения
EXIT_CODE=$?

# Удаляем временный файл
rm jest-setup.js

# Выводим результат
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Тесты успешно пройдены!"
    exit 0
else
    echo "❌ Тесты завершились с ошибками."
    exit 1
fi 