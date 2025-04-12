#!/bin/bash

# Директория с логами
LOGS_DIR="/root/logs"

# Проверяем, существует ли директория с логами
if [ ! -d "$LOGS_DIR" ]; then
  echo "Директория с логами не найдена: $LOGS_DIR"
  exit 1
fi

# Функция для отображения меню
show_menu() {
  echo "=== УПРАВЛЕНИЕ ЛОГАМИ ==="
  echo "1. Посмотреть последние логи"
  echo "2. Список всех сохраненных логов"
  echo "3. Посмотреть конкретный файл логов"
  echo "4. Поиск по всем логам"
  echo "5. Сохранить текущие логи"
  echo "6. Очистить старые логи (оставить 10 последних)"
  echo "7. Выход"
  echo "=========================="
  echo -n "Выберите опцию (1-7): "
}

# Функция для просмотра последних логов
view_latest_logs() {
  if [ -L "$LOGS_DIR/latest-logs.txt" ]; then
    less "$LOGS_DIR/latest-logs.txt"
  else
    echo "Файл с последними логами не найден"
  fi
}

# Функция для показа списка всех логов
list_all_logs() {
  echo "Список всех сохраненных логов:"
  ls -lt "$LOGS_DIR" | grep "docker-logs_" | awk '{print NR". " $9 " - " $6 " " $7 " " $8}' | head -20
}

# Функция для просмотра конкретного файла логов
view_specific_log() {
  # Получаем список файлов
  files=($(ls -t "$LOGS_DIR" | grep "docker-logs_"))
  
  if [ ${#files[@]} -eq 0 ]; then
    echo "Файлы логов не найдены"
    return
  fi
  
  echo "Доступные файлы логов:"
  for i in "${!files[@]}"; do
    echo "$((i+1)). ${files[$i]}"
  done
  
  echo -n "Выберите номер файла (1-${#files[@]}): "
  read choice
  
  if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "${#files[@]}" ]; then
    less "$LOGS_DIR/${files[$((choice-1))]}"
  else
    echo "Неверный выбор"
  fi
}

# Функция для поиска по всем логам
search_in_logs() {
  echo -n "Введите строку для поиска: "
  read search_term
  
  if [ -z "$search_term" ]; then
    echo "Поисковый запрос не может быть пустым"
    return
  fi
  
  echo "Результаты поиска '$search_term':"
  grep -r "$search_term" $LOGS_DIR/*.txt
}

# Функция для сохранения текущих логов
save_current_logs() {
  bash /root/save-logs.sh
}

# Функция для очистки старых логов
clean_old_logs() {
  log_count=$(ls -t "$LOGS_DIR" | grep "docker-logs_" | wc -l)
  
  if [ "$log_count" -le 10 ]; then
    echo "Всего $log_count файлов логов, очистка не требуется"
    return
  fi
  
  files_to_delete=$(($log_count - 10))
  echo "Удаление $files_to_delete старых файлов логов..."
  
  ls -t "$LOGS_DIR" | grep "docker-logs_" | tail -$files_to_delete | xargs -I {} rm "$LOGS_DIR/{}"
  
  echo "Старые логи удалены, оставлено 10 последних файлов"
}

# Основной цикл меню
while true; do
  clear
  show_menu
  read choice
  
  case $choice in
    1) view_latest_logs ;;
    2) list_all_logs ;;
    3) view_specific_log ;;
    4) search_in_logs ;;
    5) save_current_logs ;;
    6) clean_old_logs ;;
    7) echo "Выход из программы"; exit 0 ;;
    *) echo "Неверный выбор, попробуйте снова"
  esac
  
  echo
  echo -n "Нажмите Enter для продолжения..."
  read
done 