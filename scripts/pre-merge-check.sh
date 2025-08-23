#!/bin/bash
# 🛡️ PRE-MERGE BUILD CHECKER
# Автоматически запускается перед merge для проверки билда

set -e

echo "🛡️ [PRE-MERGE CHECK] Проверка перед слиянием..."
echo "🎯 Цель: Предотвратить поломку билда в продакшн"

# Получить информацию о merge
CURRENT_BRANCH=$(git branch --show-current)
TARGET_BRANCH=${1:-"main"}

echo "📍 Текущая ветка: $CURRENT_BRANCH"
echo "🎯 Целевая ветка: $TARGET_BRANCH"

# Создать временную ветку для тестирования
TEMP_BRANCH="temp-merge-check-$(date +%s)"
echo "🔄 Создание временной ветки: $TEMP_BRANCH"

git checkout -b "$TEMP_BRANCH" > /dev/null 2>&1

# Попытаться слить изменения
echo "🔀 Тестовое слияние с $TARGET_BRANCH..."
if git merge "$TARGET_BRANCH" --no-commit --no-ff > /dev/null 2>&1; then
    echo "✅ Merge конфликтов нет"
else
    echo "❌ Есть merge конфликты!"
    echo "🔧 Разрешите конфликты перед продолжением:"
    git status --porcelain | grep "^UU"
    
    # Откатиться
    git merge --abort > /dev/null 2>&1
    git checkout "$CURRENT_BRANCH" > /dev/null 2>&1
    git branch -D "$TEMP_BRANCH" > /dev/null 2>&1
    
    exit 1
fi

# Запустить проверку билда
echo "🔨 Запуск проверки билда на merged коде..."
if ./scripts/check-build-health.sh; then
    echo "✅ Билд после merge работает!"
else
    echo "❌ Билд после merge сломан!"
    
    # Откатиться
    git reset --hard HEAD > /dev/null 2>&1
    git checkout "$CURRENT_BRANCH" > /dev/null 2>&1
    git branch -D "$TEMP_BRANCH" > /dev/null 2>&1
    
    exit 1
fi

# Очистка
echo "🧹 Очистка временной ветки..."
git reset --hard HEAD > /dev/null 2>&1
git checkout "$CURRENT_BRANCH" > /dev/null 2>&1
git branch -D "$TEMP_BRANCH" > /dev/null 2>&1

echo "🎉 [SUCCESS] Merge безопасен! Билд работает после слияния."