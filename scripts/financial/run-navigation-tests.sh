#!/bin/bash

# 🧪 СКРИПТ ДЛЯ ЗАПУСКА ВСЕХ ТЕСТОВ НАВИГАЦИИ
# Использование: ./run-navigation-tests.sh

echo "=========================================="
echo "🧪 КОМПЛЕКСНОЕ ТЕСТИРОВАНИЕ НАВИГАЦИИ"
echo "=========================================="
echo ""

# Проверка типов
echo "1️⃣ ПРОВЕРКА TYPESCRIPT..."
npm run typecheck
if [ $? -ne 0 ]; then
    echo "❌ TypeScript проверка провалена!"
    exit 1
fi
echo "✅ TypeScript проверка пройдена!"
echo ""

# Тест навигации
echo "2️⃣ ТЕСТЫ НАВИГАЦИИ..."
npm test -- navigation-complete.test.ts
if [ $? -ne 0 ]; then
    echo "❌ Тесты навигации провалены!"
    exit 1
fi
echo "✅ Тесты навигации пройдены!"
echo ""

# Тест обработчиков
echo "3️⃣ ТЕСТЫ ОБРАБОТЧИКОВ..."
npm test -- scene-handlers-complete.test.ts
if [ $? -ne 0 ]; then
    echo "❌ Тесты обработчиков провалены!"
    exit 1
fi
echo "✅ Тесты обработчиков пройдены!"
echo ""

echo "=========================================="
echo "✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!"
echo "=========================================="
echo ""
echo "📊 Отчет сохранен в: NAVIGATION_TESTS_COMPLETE_REPORT.md"
echo ""
echo "🎯 Следующие шаги:"
echo "   - Ручное тестирование в Telegram"
echo "   - Проверка всех 24 кнопок меню"
echo "   - Проверка выхода из сцен"
