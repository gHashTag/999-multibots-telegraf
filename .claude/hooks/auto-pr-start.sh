#!/bin/bash

# Автоматическое создание PR в начале задачи
echo "🎯 Автоматический Git Flow - Создание PR"

# Получаем информацию о текущей ветке
BRANCH=$(git branch --show-current)
USER_PROMPT="$1"

# Проверяем, что мы не на main/master
if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
    echo "⚠️  Нельзя создавать PR из главной ветки"
    exit 0
fi

# Проверяем, есть ли уже PR для этой ветки
EXISTING_PR=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number' 2>/dev/null)

if [[ "$EXISTING_PR" != "null" && "$EXISTING_PR" != "" ]]; then
    echo "✅ PR уже существует: #$EXISTING_PR"
    echo "🔗 $(gh pr view "$EXISTING_PR" --json url --jq '.url')"
    exit 0
fi

# Создаем умный заголовок PR на основе названия ветки
PR_TITLE=$(echo "$BRANCH" | sed 's/-/ /g' | sed 's/_/ /g' | sed 's/\b\w/\U&/g')

# Если есть пользовательский промпт, используем его как описание
if [[ -n "$USER_PROMPT" ]]; then
    PR_BODY="## Задача

$USER_PROMPT

## Изменения

- Автоматически созданный PR для отслеживания задачи
- Изменения будут добавлены по мере выполнения

## Статус

⏳ В процессе выполнения

---
🤖 Автоматически создано системой Claude Code Git Flow"
else
    PR_BODY="## Изменения

- Автоматически созданный PR для ветки $BRANCH
- Изменения будут добавлены по мере выполнения

## Статус

⏳ В процессе выполнения

---
🤖 Автоматически создано системой Claude Code Git Flow"
fi

# Убеждаемся что есть хотя бы один коммит
if [[ -z "$(git log --oneline -1 2>/dev/null)" ]]; then
    echo "📝 Создаю начальный коммит..."
    git add .
    git commit -m "feat: initial commit for $BRANCH" --allow-empty
fi

# Пушим ветку в origin
echo "📤 Отправляю ветку в origin..."
git push -u origin "$BRANCH" 2>/dev/null || {
    echo "⚠️  Ошибка при отправке ветки. Возможно, remote не настроен."
    exit 1
}

# Создаем PR
echo "🚀 Создаю Pull Request..."
PR_URL=$(gh pr create \
    --title "$PR_TITLE" \
    --body "$PR_BODY" \
    --draft 2>/dev/null)

if [[ $? -eq 0 ]]; then
    echo "✅ PR успешно создан!"
    echo "🔗 $PR_URL"
    
    # Сохраняем ссылку на PR для дальнейшего использования
    echo "$PR_URL" > .claude/current-pr-url.txt
    
    echo "📋 Заголовок: $PR_TITLE"
    echo "🌿 Ветка: $BRANCH"
else
    echo "❌ Ошибка при создании PR"
    echo "💡 Возможные причины:"
    echo "   - GitHub CLI не настроен (gh auth login)"
    echo "   - Нет прав на создание PR"
    echo "   - Ветка уже имеет открытый PR"
fi

echo "🎉 Автоматический Git Flow активирован!"