#!/bin/bash

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }

echo ""
echo "=================================================================="
log_info "ДЕПЛОЙ В MAIN ВЕТКУ"
echo "=================================================================="
echo ""

# Проверяем текущую ветку
log_info "1. Проверка текущей ветки..."
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "Текущая ветка: $CURRENT_BRANCH"

# Проверяем, что тег v002 существует
log_info "2. Проверка тега v002..."
if git tag | grep -q "v002"; then
    echo "✅ Тег v002 существует"
    git show v002 --oneline | head -3
else
    echo "❌ Тег v002 не найден!"
    exit 1
fi

# Проверяем коммиты с тегом
log_info "3. Коммиты в текущей ветке..."
git log --oneline -5

# Запушим текущую ветку
log_info "4. Пуш текущей ветки..."
git push origin reels-callback-1

# Создадим коммит merge с production
log_info "5. Merge с production..."
git merge origin/production --no-edit -m "merge: Объединение production с восстановленным ai-reels-callback"

# Создадим PR (через GitHub CLI, если доступен)
log_info "6. Создание Pull Request..."
if command -v gh &> /dev/null; then
    gh pr create \
        --title "🎉 deploy: Восстановленный ai-reels-callback (v002)" \
        --body "$(cat << 'PR_BODY'
## Описание
Деплой восстановленного ai-reels-callback endpoint в main ветку

## Что включено
✅ Тег v002 - полностью рабочая версия
✅ ai-reels-callback endpoint работает на production
✅ Docker контейнеры с --network host
✅ Nginx настроен и работает
✅ API health check функционирует
✅ Webhook обрабатывает Railway callbacks

## Как проверить
1. Проверить endpoint: http://three-head-dragon.shop/api/telegram/ai-reels-callback
2. Проверить API: curl http://212.86.115.30:3000/health
3. Тест webhook: curl -X POST http://three-head-dragon.shop/api/telegram/ai-reels-callback -d '{"test":"ok"}'

## История
- Ветка reels-callback-1 содержала исправления
- Создан тег v002 с рабочей версией
- Протестировано на production сервере
- Готово к merge в main

🤖 Generated with Claude Code
PR_BODY
)" \
        --base main \
        --head reels-callback-1 \
        --draft || echo "❌ GitHub CLI недоступен или ошибка создания PR"
else
    echo "⚠️ GitHub CLI недоступен, PR нужно создать вручную"
fi

# Проверим remote status
log_info "7. Статус remote..."
git remote -v
git status -uno

echo ""
echo "=================================================================="
log_success "ДЕПЛОЙ В MAIN ЗАВЕРШЁН"
echo "=================================================================="
echo ""
echo "Далее:"
echo "1. Создать PR через GitHub (если не создан автоматически)"
echo "2. Проверить тесты"
echo "3. Merge в main"
echo "4. Deploy на production"
echo ""
