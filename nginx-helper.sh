#!/bin/bash

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функция для вывода с эмодзи
log() {
  local emoji=$1
  local message=$2
  echo -e "${emoji} ${message}"
}

# Функция для проверки статуса вебхуков
check_webhooks() {
  log "🔍" "Проверяем статус вебхуков..."
  
  # Получаем все токены ботов из .env
  BOT_TOKENS=($(grep -E "BOT_TOKEN_[0-9]+" .env | cut -d '=' -f2))
  
  if [ ${#BOT_TOKENS[@]} -eq 0 ]; then
    log "⚠️" "Не удалось получить токены ботов из .env"
    return 1
  fi
  
  for token in "${BOT_TOKENS[@]}"; do
    if [ -n "$token" ]; then
      log "🤖" "Проверяем вебхук для бота с токеном ${token:0:5}****"
      curl -s "https://api.telegram.org/bot$token/getWebhookInfo" | grep -v token | jq .
    fi
  done
}

# Функция для отображения меню
show_menu() {
  echo -e "\n${BLUE}=== Nginx Helper - Управление конфигурацией Nginx ===${NC}"
  echo -e "${YELLOW}1${NC}. Проверить IP-адреса контейнеров"
  echo -e "${YELLOW}2${NC}. Проверить статус вебхуков"
  echo -e "${YELLOW}3${NC}. Обновить конфигурацию Nginx"
  echo -e "${YELLOW}4${NC}. Перезапустить контейнеры"
  echo -e "${YELLOW}5${NC}. Проверить порты в контейнере с ботами"
  echo -e "${YELLOW}6${NC}. Проверить логи Nginx"
  echo -e "${YELLOW}7${NC}. Проверить логи ботов"
  echo -e "${YELLOW}0${NC}. Выход"
  echo -e "\nВыберите опцию: "
}

# Обработка выбора пользователя
handle_option() {
  local option=$1
  case $option in
    1)
      log "🔎" "Проверяем IP-адреса контейнеров..."
      docker inspect -f '{{.Name}} - {{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 999-multibots bot-proxy
      ;;
    2)
      check_webhooks
      ;;
    3)
      log "🔄" "Обновляем конфигурацию Nginx..."
      ./update-nginx-config.sh
      ;;
    4)
      log "🔄" "Перезапускаем контейнеры..."
      ./update-docker.sh
      ;;
    5)
      log "🔎" "Проверяем порты в контейнере с ботами..."
      docker exec 999-multibots netstat -tulpn | grep LISTEN
      ;;
    6)
      log "📜" "Проверяем логи Nginx (последние 20 строк)..."
      docker logs bot-proxy --tail 20
      ;;
    7)
      log "📜" "Проверяем логи ботов (последние 20 строк)..."
      docker logs 999-multibots --tail 20
      ;;
    0)
      log "👋" "Выход из программы"
      exit 0
      ;;
    *)
      log "❌" "Неверная опция"
      ;;
  esac
}

# Основной цикл программы
while true; do
  show_menu
  read -p "> " option
  handle_option $option
  echo -e "\nНажмите Enter для продолжения..."
  read
done 