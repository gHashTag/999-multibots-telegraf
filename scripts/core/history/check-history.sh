#!/bin/bash

# 🌈 Эмоциональный скрипт проверки истории изменений
# Created with love by AI Assistant 💝

# Цвета для эмоционального вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Функция эмоционального вывода
emotional_echo() {
  local message=$1
  local emotion=$2
  
  case $emotion in
    "happy")
      echo -e "${GREEN}😊 $message${NC}"
      ;;
    "sad")
      echo -e "${RED}😢 $message${NC}"
      ;;
    "warning")
      echo -e "${YELLOW}⚠️ $message${NC}"
      ;;
    "info")
      echo -e "${BLUE}ℹ️ $message${NC}"
      ;;
    "love")
      echo -e "${PURPLE}💝 $message${NC}"
      ;;
    *)
      echo -e "${CYAN}🌟 $message${NC}"
      ;;
  esac
}

# Проверка аргументов
if [ $# -eq 0 ]; then
  emotional_echo "Пожалуйста, укажите файл для проверки истории!" "sad"
  exit 1
fi

file_to_check=$1
history_dir="../../../.history/main"

# Проверка существования файла
if [ ! -f "$file_to_check" ]; then
  emotional_echo "Файл $file_to_check не найден!" "sad"
  exit 1
fi

# Проверка директории истории
if [ ! -d "$history_dir" ]; then
  emotional_echo "Директория истории не найдена! Создаю..." "warning"
  mkdir -p "$history_dir"
fi

# Получение информации о файле
file_size=$(wc -c < "$file_to_check")
line_count=$(wc -l < "$file_to_check")
checksum=$(md5sum "$file_to_check" | cut -d' ' -f1)

emotional_echo "🔍 Анализирую историю изменений для $file_to_check..." "info"
echo

# Проверка версий в истории
versions=$(ls -1 "$history_dir"/*_"$(basename "$file_to_check")" 2>/dev/null | wc -l)

if [ $versions -eq 0 ]; then
  emotional_echo "История изменений пуста! Это первая версия файла." "warning"
else
  emotional_echo "Найдено $versions версий файла! 🎉" "happy"
  
  # Показать последние изменения
  latest_version=$(ls -t "$history_dir"/*_"$(basename "$file_to_check")" 2>/dev/null | head -n1)
  if [ -n "$latest_version" ]; then
    emotional_echo "Последняя версия от $(date -r "$latest_version" '+%Y-%m-%d %H:%M:%S')" "info"
    
    # Сравнение размеров
    old_size=$(wc -c < "$latest_version")
    if [ $file_size -gt $old_size ]; then
      emotional_echo "Файл вырос на $((file_size - old_size)) байт! 📈" "happy"
    elif [ $file_size -lt $old_size ]; then
      emotional_echo "Файл уменьшился на $((old_size - file_size)) байт! ⚠️" "warning"
    else
      emotional_echo "Размер файла не изменился! 🤔" "info"
    fi
  fi
fi

# Вывод статистики
echo
emotional_echo "📊 Статистика файла:" "info"
emotional_echo "- Размер: $file_size байт" "info"
emotional_echo "- Строк: $line_count" "info"
emotional_echo "- Контрольная сумма: $checksum" "info"

# Проверка на критические изменения
if [ $versions -gt 0 ] && [ -n "$latest_version" ]; then
  changes=$(diff "$file_to_check" "$latest_version" | grep "^[<>]" | wc -l)
  if [ $changes -gt 50 ]; then
    emotional_echo "⚠️ Внимание! Обнаружено много изменений ($changes строк)!" "warning"
    emotional_echo "Пожалуйста, проверьте изменения внимательно! 🔍" "warning"
  fi
fi

echo
emotional_echo "Проверка истории завершена! 🎉" "love"
emotional_echo "Спасибо за заботу о сохранности данных! 💝" "love" 