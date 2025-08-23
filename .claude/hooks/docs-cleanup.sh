#!/bin/bash

# Очистка избыточной документации
echo "📚 Очистка документации от избыточных файлов"

# Переход в корень репозитория
cd "$(git rev-parse --show-toplevel)"

# Функция для безопасного удаления файлов
safe_remove() {
    local file="$1"
    if [ -f "$file" ]; then
        echo "  📄 Удаляю документ: $file"
        rm "$file"
    fi
}

# Массив временных документационных файлов
DOC_FILES_TO_REMOVE=(
    "TEMP_ANALYSIS.md"
    "DEBUG_REPORT.md" 
    "TASK_PROGRESS.md"
    "ANALYSIS_RESULTS.md"
    "IMPLEMENTATION_LOG.md"
    "CHANGES_LOG.md"
    "TODO_PROGRESS.md"
)

# Удаление временных документов
for file in "${DOC_FILES_TO_REMOVE[@]}"; do
    safe_remove "$file"
done

# Поиск и удаление временных документов по маскам
find . -maxdepth 2 \( \
    -name "*_TEMP.md" -o \
    -name "*_DEBUG.md" -o \
    -name "*_ANALYSIS.md" -o \
    -name "*_LOG.md" -o \
    -name "*_REPORT_*.md" -o \
    -name "temp_*.md" -o \
    -name "debug_*.md" -o \
    -name "test_*.md" \
\) -delete 2>/dev/null

# Очистка временных директорий с документацией
DOC_DIRS_TO_REMOVE=(
    "docs/temp"
    "docs/debug"
    "docs/analysis"
    "temp_docs"
    "debug_docs"
)

for dir in "${DOC_DIRS_TO_REMOVE[@]}"; do
    if [ -d "$dir" ]; then
        echo "  📂 Удаляю директорию: $dir"
        rm -rf "$dir"
    fi
done

# Проверяем наличие основных документов (создаем если нужно)
ESSENTIAL_DOCS=(
    "README.md:# Project Title\n\nProject description here."
    "CLAUDE.md:# Claude Code Instructions\n\nInstructions for Claude Code."
)

for doc_entry in "${ESSENTIAL_DOCS[@]}"; do
    file="${doc_entry%%:*}"
    content="${doc_entry#*:}"
    
    if [ ! -f "$file" ]; then
        echo "  ➕ Создаю базовый документ: $file"
        echo -e "$content" > "$file"
    fi
done

# Проверяем изменения
CHANGED_FILES=$(git status --porcelain | grep -E '\.(md|txt|rst)$' | wc -l)

if [[ "$CHANGED_FILES" -gt 0 ]]; then
    echo "✨ Очищены документационные файлы"
else
    echo "✅ Документация уже в порядке"
fi

echo "📖 Очистка документации завершена!"