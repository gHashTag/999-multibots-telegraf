#!/bin/bash

# 🏭 ЛОКАЛЬНЫЙ ТЕСТ PRODUCTION СБОРКИ
# Этот скрипт воспроизводит точно те же шаги, что и в production Docker

set -e

echo "🔧 === ТЕСТИРОВАНИЕ PRODUCTION СБОРКИ ЛОКАЛЬНО ==="

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'  
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Проверим, что мы в правильной директории
if [ ! -f "package.json" ]; then
    print_error "Запустите скрипт из корня проекта!"
    exit 1
fi

print_step "1. Очистка предыдущих артефактов"
rm -rf dist/ node_modules/ package-lock.json
print_success "Артефакты очищены"

print_step "2. Установка зависимостей через NPM (как в production)"
npm install
print_success "Зависимости установлены"

print_step "3. Создание временной конфигурации сборки (как в Docker)"
cp tsconfig.json tsconfig.build.json

# Исключаем тесты из сборки
cat > tsconfig.build.json << 'EOF'
{
  "extends": "./tsconfig.json",
  "exclude": [
    "**/*.test.ts", 
    "**/*.spec.ts", 
    "**/__tests__/**/*", 
    "src/__tests__/**/*"
  ]
}
EOF

print_success "Конфигурация сборки создана"

print_step "4. Удаление тестов (как в production Docker)"
find src -name "__tests__" -type d -exec rm -rf {} + 2>/dev/null || true
find src -name "*.test.ts" -type f -delete 2>/dev/null || true  
find src -name "*.spec.ts" -type f -delete 2>/dev/null || true
print_warning "Тесты удалены (как в production)"

print_step "5. Сборка TypeScript (точно как в Docker)"
npx tsc --skipLibCheck --skipDefaultLibCheck --project tsconfig.build.json
print_success "TypeScript скомпилирован"

print_step "6. Обработка алиасов путей (tsc-alias)"
npx tsc-alias --project tsconfig.build.json
print_success "Алиасы обработаны"

print_step "7. Проверка результатов сборки"
if [ -d "dist" ] && [ "$(ls -A dist)" ]; then
    print_success "Сборка завершена успешно! Файлы в dist/:"
    ls -la dist/ | head -10
    echo "..."
    print_success "Всего файлов в dist/: $(find dist -type f | wc -l)"
else
    print_error "Сборка провалилась! Директория dist пуста или не существует"
    exit 1
fi

print_step "8. Проверка основных файлов"
required_files=("dist/bot.js" "dist/api_server" "dist/core")
for file in "${required_files[@]}"; do
    if [ -e "$file" ]; then
        print_success "✓ $file найден"
    else
        print_error "✗ $file отсутствует!"
        exit 1
    fi
done

# Очистка временных файлов
rm -f tsconfig.build.json

print_success "🎉 PRODUCTION СБОРКА ПРОШЛА УСПЕШНО!"
echo ""
echo "📋 Что было сделано:"
echo "   - Использован npm вместо bun" 
echo "   - Удалены все тесты"
echo "   - Применена production TypeScript конфигурация"
echo "   - Пропущена проверка типов (--skipLibCheck)"
echo "   - Обработаны алиасы путей"
echo ""
echo "🚀 Теперь ваша локальная сборка идентична production!"