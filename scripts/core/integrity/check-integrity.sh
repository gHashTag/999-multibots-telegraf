#!/bin/bash

# Цвета для эмоционального вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Функции для эмоционального вывода
emotional_echo() {
    local emotion=$1
    local message=$2
    local color

    case $emotion in
        "happy")
            color=$GREEN
            message="😊 $message"
            ;;
        "sad")
            color=$RED
            message="😢 $message"
            ;;
        "worried")
            color=$YELLOW
            message="😰 $message"
            ;;
        "excited")
            color=$BLUE
            message="🎉 $message"
            ;;
        "working")
            color=$YELLOW
            message="🔧 $message"
            ;;
        *)
            color=$NC
            ;;
    esac

    echo -e "${color}${message}${NC}"
}

# Функция проверки целостности файла
check_file_integrity() {
    local file=$1
    if [ ! -f "$file" ]; then
        emotional_echo "sad" "Файл $file не существует!"
        return 1
    fi
    
    if [ ! -r "$file" ]; then
        emotional_echo "worried" "Файл $file недоступен для чтения!"
        return 1
    }

    # Проверка контрольной суммы
    local current_sum=$(md5sum "$file" | cut -d' ' -f1)
    local stored_sum=""
    
    if [ -f "${file}.md5" ]; then
        stored_sum=$(cat "${file}.md5")
        if [ "$current_sum" != "$stored_sum" ]; then
            emotional_echo "worried" "Контрольная сумма файла $file изменилась!"
            return 1
        fi
    else
        echo "$current_sum" > "${file}.md5"
        emotional_echo "excited" "Создана новая контрольная сумма для $file"
    fi
    
    return 0
}

# Функция проверки целостности директории
check_directory_integrity() {
    local dir=$1
    if [ ! -d "$dir" ]; then
        emotional_echo "sad" "Директория $dir не существует!"
        return 1
    }
    
    if [ ! -r "$dir" ]; then
        emotional_echo "worried" "Директория $dir недоступна для чтения!"
        return 1
    }
    
    return 0
}

# Основная функция проверки целостности
main() {
    emotional_echo "excited" "🚀 Начинаю проверку целостности системы..."
    
    local error_count=0
    
    # Проверка критических директорий
    local directories=("src" "scripts" "config" "logs" "history")
    for dir in "${directories[@]}"; do
        emotional_echo "working" "Проверяю директорию $dir..."
        if ! check_directory_integrity "$dir"; then
            ((error_count++))
        fi
    done
    
    # Проверка критических файлов
    local files=("MAIN.md" "ROADMAP.md" "SELF_DIAGNOSIS.md")
    for file in "${files[@]}"; do
        emotional_echo "working" "Проверяю файл $file..."
        if ! check_file_integrity "$file"; then
            ((error_count++))
        fi
    done
    
    # Вывод итогового статуса
    if [ $error_count -eq 0 ]; then
        emotional_echo "happy" "✨ Проверка целостности успешно завершена! Система в отличном состоянии!"
    else
        emotional_echo "sad" "❌ При проверке целостности обнаружено $error_count проблем."
        emotional_echo "worried" "Пожалуйста, проверьте логи и исправьте найденные проблемы."
    fi
}

# Запуск основной функции
main
