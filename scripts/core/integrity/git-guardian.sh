#!/bin/bash

# 🎨 Цвета для эмоционального вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# 📁 Пути
PROJECT_ROOT="/Users/playra/999-multibots-telegraf"
MEMORY_BANK_DIR="$PROJECT_ROOT/src/core/mcp/agent/memory-bank/NeuroBlogger"

# 🎭 Функция эмоционального вывода
emotional_echo() {
    local emotion=$1
    local message=$2
    case $emotion in
        "happy") echo -e "${GREEN}😊 $message${NC}" ;;
        "sad") echo -e "${RED}😢 $message${NC}" ;;
        "excited") echo -e "${BLUE}🎉 $message${NC}" ;;
        "working") echo -e "${YELLOW}⚡ $message${NC}" ;;
        "thinking") echo -e "${PURPLE}🤔 $message${NC}" ;;
        "done") echo -e "${CYAN}✨ $message${NC}" ;;
    esac
}

# 📝 Проверка наличия изменений
check_changes() {
    emotional_echo "working" "Проверяю изменения в репозитории..."
    
    git status --porcelain
    if [ -z "$(git status --porcelain)" ]; then
        emotional_echo "happy" "Изменений нет, все актуально! 🌟"
        return 1
    else
        emotional_echo "thinking" "Обнаружены изменения:"
        git status
        return 0
    fi
}

# 📊 Анализ изменений
analyze_changes() {
    emotional_echo "working" "Анализирую изменения..."
    
    # Получаем список измененных файлов
    local changed_files=$(git diff --name-only)
    
    # Создаем структурированное сообщение коммита
    echo "✨ Task completed:" > /tmp/commit_msg
    echo "" >> /tmp/commit_msg
    echo "Changed files:" >> /tmp/commit_msg
    
    for file in $changed_files; do
        echo "- $file" >> /tmp/commit_msg
    done
    
    # Добавляем эмоциональное описание
    echo "" >> /tmp/commit_msg
    echo "🌟 Improvements:" >> /tmp/commit_msg
    
    # Проверяем обновление ROADMAP
    if [[ $changed_files == *"ROADMAP.md"* ]]; then
        echo "- Updated development roadmap" >> /tmp/commit_msg
    fi
    
    emotional_echo "done" "Анализ изменений завершен"
}

# 🚀 Создание коммита
create_commit() {
    emotional_echo "working" "Создаю коммит..."
    
    # Добавляем все изменения
    git add .
    
    # Получаем сообщение коммита
    local commit_msg=$(cat /tmp/commit_msg)
    
    # Создаем коммит
    git commit -m "$commit_msg"
    
    emotional_echo "happy" "Коммит успешно создан! 🎉"
}

# 🔄 Обновление удаленного репозитория
update_remote() {
    emotional_echo "working" "Отправляю изменения в удаленный репозиторий..."
    
    git push
    
    if [ $? -eq 0 ]; then
        emotional_echo "happy" "Изменения успешно отправлены! 🚀"
    else
        emotional_echo "sad" "Ошибка при отправке изменений 😢"
        return 1
    fi
}

# 📋 Обновление ROADMAP
update_roadmap() {
    emotional_echo "working" "Обновляю ROADMAP..."
    
    local roadmap="$MEMORY_BANK_DIR/ROADMAP.md"
    if [ -f "$roadmap" ]; then
        # Добавляем запись о коммите
        echo "- $(date '+%d.%m.%Y'): Выполнен коммит изменений в репозиторий" >> "$roadmap"
        emotional_echo "done" "ROADMAP обновлен"
    else
        emotional_echo "sad" "ROADMAP не найден 😢"
    fi
}

# 🎯 Основная функция
main() {
    emotional_echo "excited" "Начинаю процесс контроля Git... 🚀"
    
    # Проверяем изменения
    check_changes
    if [ $? -eq 1 ]; then
        return 0
    fi
    
    # Анализируем изменения
    analyze_changes
    
    # Создаем коммит
    create_commit
    
    # Обновляем удаленный репозиторий
    update_remote
    if [ $? -eq 1 ]; then
        return 1
    fi
    
    # Обновляем ROADMAP
    update_roadmap
    
    emotional_echo "happy" "Процесс успешно завершен! 🌟"
}

# Запускаем основную функцию
main 