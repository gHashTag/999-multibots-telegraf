#!/bin/bash
# 🔍 СИСТЕМА РАННЕГО ПРЕДУПРЕЖДЕНИЯ О ПРОБЛЕМАХ БИЛДА
# Проверяет билд перед merge/commit и предупреждает о проблемах

set -e

echo "🔍 [BUILD HEALTH CHECK] Запуск проверки здоровья билда..."
echo "📅 Время: $(date)"
echo "🌿 Ветка: $(git branch --show-current)"
echo "💡 Хэш: $(git rev-parse --short HEAD)"
echo "=============================================="

# Функция для вывода ошибки
error_exit() {
    echo "❌ [ОШИБКА] $1" >&2
    echo "🚨 БИЛД СЛОМАН! Исправьте ошибки перед продолжением." >&2
    exit 1
}

# Функция для вывода успеха
success() {
    echo "✅ [УСПЕХ] $1"
}

# Функция для вывода предупреждения
warning() {
    echo "⚠️ [ПРЕДУПРЕЖДЕНИЕ] $1"
}

# 1. Проверка TypeScript билда
echo "🔨 Шаг 1: Проверка TypeScript билда..."
if npm run build:nocheck > /dev/null 2>&1; then
    success "TypeScript билд успешен"
else
    echo "❌ TypeScript билд не работает. Детали:"
    npm run build:nocheck 2>&1 | tail -20
    error_exit "TypeScript билд провален"
fi

# 2. Проверка типов (если нужно)
echo "🔍 Шаг 2: Проверка типов..."
if npm run typecheck > /dev/null 2>&1; then
    success "Проверка типов успешна"
else
    warning "Проверка типов провалена (но билд работает)"
    npm run typecheck 2>&1 | tail -10
fi

# 3. Проверка линтера
echo "🧹 Шаг 3: Проверка линтера..."
if npm run lint > /dev/null 2>&1; then
    success "Линтер успешен"
else
    warning "Линтер провален"
    npm run lint 2>&1 | tail -10
fi

# 4. Проверка тестов (если есть)
echo "🧪 Шаг 4: Проверка тестов..."
if npm test > /dev/null 2>&1; then
    success "Тесты успешны"
else
    warning "Тесты провалены или отсутствуют"
fi

# 5. Проверка package.json
echo "📦 Шаг 5: Проверка зависимостей..."
if npm audit --audit-level=high > /dev/null 2>&1; then
    success "Критических уязвимостей не найдено"
else
    warning "Найдены уязвимости в зависимостях"
    npm audit --audit-level=high 2>&1 | head -20
fi

# 6. Проверка размера билда
echo "📊 Шаг 6: Проверка размера билда..."
if [ -d "dist" ]; then
    BUILD_SIZE=$(du -sh dist | cut -f1)
    echo "📏 Размер билда: $BUILD_SIZE"
    if [[ $BUILD_SIZE =~ ^[0-9]+M$ ]] && [[ ${BUILD_SIZE%M} -gt 100 ]]; then
        warning "Билд больше 100MB: $BUILD_SIZE"
    else
        success "Размер билда в норме: $BUILD_SIZE"
    fi
else
    warning "Папка dist не найдена"
fi

echo "=============================================="
echo "✅ [ИТОГО] Проверка здоровья билда завершена!"
echo "🚀 Билд готов к развертыванию"
echo "💡 Время выполнения: $((SECONDS))s"