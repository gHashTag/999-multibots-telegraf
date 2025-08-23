#!/bin/bash

# Отчет о статусе PR в конце задачи
echo "📊 Отчет о Pull Request"

BRANCH=$(git branch --show-current)

# Проверяем, что мы не на main/master
if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
    echo "ℹ️  Находимся на главной ветке, PR не требуется"
    exit 0
fi

# Получаем информацию о PR
PR_INFO=$(gh pr list --head "$BRANCH" --json number,title,url,state,mergeable,reviewDecision 2>/dev/null)

if [[ "$PR_INFO" == "[]" || "$PR_INFO" == "" ]]; then
    echo "⚠️  PR не найден для ветки $BRANCH"
    echo "💡 Создайте PR командой: ./.claude/hooks/auto-pr-start.sh"
    exit 0
fi

# Парсим JSON ответ
PR_NUMBER=$(echo "$PR_INFO" | jq -r '.[0].number')
PR_TITLE=$(echo "$PR_INFO" | jq -r '.[0].title')
PR_URL=$(echo "$PR_INFO" | jq -r '.[0].url')
PR_STATE=$(echo "$PR_INFO" | jq -r '.[0].state')
PR_MERGEABLE=$(echo "$PR_INFO" | jq -r '.[0].mergeable')
PR_REVIEW=$(echo "$PR_INFO" | jq -r '.[0].reviewDecision // "PENDING"')

echo "🎯 РЕЗУЛЬТАТ ТЕКУЩЕЙ ЗАДАЧИ:"
echo "🔗 ССЫЛКА НА PR: $PR_URL"
echo ""
echo "📊 СТАТУС:"
echo ""

# Определяем статус PR
case "$PR_STATE" in
    "OPEN")
        if [[ "$PR_MERGEABLE" == "MERGEABLE" ]]; then
            if [[ "$PR_REVIEW" == "APPROVED" ]]; then
                echo "✅ Готов к слиянию"
                echo "🎉 PR прошел ревью и готов к мерджу"
            else
                echo "⏳ Ожидает ревью"
                echo "👥 Требуется проверка от коллег"
            fi
        else
            echo "⚠️  Есть конфликты"
            echo "🔧 Необходимо разрешить конфликты перед слиянием"
        fi
        ;;
    "MERGED")
        echo "✅ Уже слито в main"
        echo "🎊 Изменения применены в основную ветку"
        ;;
    "CLOSED")
        echo "❌ Закрыт без слияния"
        echo "📝 PR был закрыт без применения изменений"
        ;;
esac

echo "🌿 Ветка: $BRANCH"
echo "🔢 Номер: #$PR_NUMBER"
echo "📋 Заголовок: $PR_TITLE"
echo ""

# Показываем коммиты в PR
COMMITS_COUNT=$(gh pr view "$PR_NUMBER" --json commits --jq '.commits | length')
echo "📝 Коммитов в PR: $COMMITS_COUNT"

if [[ "$COMMITS_COUNT" -gt 0 ]]; then
    echo "📚 Последние изменения:"
    gh pr view "$PR_NUMBER" --json commits --jq '.commits[-3:] | .[] | "   • " + .messageHeadline' 2>/dev/null
fi

echo ""
echo "💻 РУЧНОЕ УПРАВЛЕНИЕ:"
echo ""
echo "# Просмотр PR"
echo "gh pr view $PR_NUMBER"
echo ""
echo "# Слить PR (если готов)"
echo "gh pr merge $PR_NUMBER --squash"
echo ""
echo "# Закрыть PR без слияния"
echo "gh pr close $PR_NUMBER"
echo ""

# Проверяем статус CI/CD
CHECKS_STATUS=$(gh pr checks "$PR_NUMBER" --json state --jq '.[] | select(.state != "SUCCESS") | .state' 2>/dev/null | head -1)

if [[ -n "$CHECKS_STATUS" ]]; then
    case "$CHECKS_STATUS" in
        "PENDING"|"IN_PROGRESS")
            echo "⏳ CI/CD проверки выполняются..."
            ;;
        "FAILURE"|"ERROR")
            echo "❌ CI/CD проверки не пройдены"
            echo "🔍 Проверьте логи: gh pr checks $PR_NUMBER"
            ;;
    esac
fi

echo "🎯 Задача завершена! PR отслеживает все изменения."