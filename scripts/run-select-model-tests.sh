#!/bin/bash

# Установка переменных среды для тестов
export NODE_ENV=test

# Создание временной метки для логов
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Создание директории для логов, если она не существует
mkdir -p logs

echo -e "🚀 Запуск тестов интеграции SelectModelWizard с платежной системой..."

# Запуск тестов и сохранение вывода в лог-файл
npm run test:select-model 2>&1 | tee logs/select-model-tests-${TIMESTAMP}.log

# Проверка результата выполнения (PIPESTATUS сохраняет статус последней команды в пайпе)
RESULT=${PIPESTATUS[0]}

if [ $RESULT -eq 0 ]; then
  echo -e "✅ Тесты SelectModelWizard успешно выполнены!"
else
  echo -e "❌ Тесты SelectModelWizard завершились с ошибкой (код $RESULT)"
fi

exit $RESULT 