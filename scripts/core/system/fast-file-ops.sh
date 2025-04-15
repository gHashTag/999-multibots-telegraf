#!/bin/bash

# 🎨 Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 📁 Пути
PROJECT_ROOT="/Users/playra/999-multibots-telegraf"

# 📖 Быстрое чтение
fast_read() {
    local file="$1"
    local start="${2:-1}"
    local end="${3:-}"
    
    if [ ! -f "$file" ]; then
        echo -e "${RED}❌ Файл не найден: $file${NC}"
        return 1
    fi
    
    if [ -n "$end" ]; then
        sed -n "${start},${end}p" "$file"
    else
        cat "$file"
    fi
}

# 📝 Быстрое добавление
fast_append() {
    local file="$1"
    local content="$2"
    echo "$content" >> "$file"
    echo -e "${GREEN}✅ Добавлено в файл: $file${NC}"
}

# 🔄 Быстрое обновление
fast_update() {
    local file="$1"
    local old="$2"
    local new="$3"
    sed -i "" "s|$old|$new|g" "$file"
    echo -e "${GREEN}✅ Обновлен файл: $file${NC}"
}

# 📊 Быстрая вставка в определенную позицию
fast_insert() {
    local file_path="$1"
    local line_number="$2"
    local content="$3"
    
    echo -e "${YELLOW}📥 Вставляю в файл: $file_path${NC}"
    sed -i '' "${line_number}i\\
${content}" "$file_path"
    echo -e "${GREEN}✅ Контент успешно вставлен${NC}"
}

# 🚀 Основная функция
main() {
    case "$1" in
        "read")
            if [ -z "$2" ]; then
                echo -e "${RED}❌ Укажите путь к файлу${NC}"
                exit 1
            fi
            fast_read "$2" "$3" "$4"
            ;;
        "append")
            if [ -z "$2" ] || [ -z "$3" ]; then
                echo -e "${RED}❌ Укажите путь к файлу и контент${NC}"
                exit 1
            fi
            fast_append "$2" "$3"
            ;;
        "update")
            if [ -z "$2" ] || [ -z "$3" ] || [ -z "$4" ]; then
                echo -e "${RED}❌ Укажите путь к файлу, что искать и на что заменить${NC}"
                exit 1
            fi
            fast_update "$2" "$3" "$4"
            ;;
        "insert")
            if [ -z "$2" ] || [ -z "$3" ] || [ -z "$4" ]; then
                echo -e "${RED}❌ Укажите путь к файлу, номер строки и контент${NC}"
                exit 1
            fi
            fast_insert "$2" "$3" "$4"
            ;;
        *)
            echo -e "${BLUE}ℹ️ Использование:${NC}"
            echo "  $0 read <путь> [начальная_строка] [конечная_строка]"
            echo "  $0 append <путь> <контент>"
            echo "  $0 update <путь> <поиск> <замена>"
            echo "  $0 insert <путь> <номер_строки> <контент>"
            exit 1
            ;;
    esac
}

# Запускаем основную функцию
main "$@" 