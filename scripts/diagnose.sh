#!/bin/bash

# 🧠 NeuroBlogger - Скрипт диагностики системы ботов
# Создан: 17 апреля 2025

# Цветовые коды для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функция для вывода заголовка
print_header() {
  echo -e "\n${BLUE}===== $1 =====${NC}\n"
}

# Функция для проверки успешности
check_status() {
  if [ $1 -eq 0 ]; then
    echo -e "${GREEN}✅ $2${NC}"
  else
    echo -e "${RED}❌ $3${NC}"
  fi
}

# Функция для вывода предупреждения
print_warning() {
  echo -e "${YELLOW}⚠️ $1${NC}"
}

# Главный заголовок
echo -e "${BLUE}=================================================${NC}"
echo -e "${BLUE}🧠 NeuroBlogger - Диагностика системы ботов${NC}"
echo -e "${BLUE}=================================================${NC}"
echo "Дата запуска: $(date)"

# Проверка переменных окружения
print_header "Проверка переменных окружения"

# Проверка наличия .env файла
if [ -f .env ]; then
  echo -e "${GREEN}✅ Файл .env найден${NC}"
  
  # Проверка основных переменных
  source .env
  
  # Проверка режима работы
  if [ -n "$MODE" ]; then
    echo -e "${GREEN}✅ MODE=$MODE${NC}"
  else
    echo -e "${RED}❌ Переменная MODE не установлена${NC}"
  fi
  
  # Проверка токенов ботов
  BOT_COUNT=0
  for i in {1..7}; do
    var_name="BOT_TOKEN_$i"
    if [ -n "${!var_name}" ]; then
      BOT_COUNT=$((BOT_COUNT+1))
      echo -e "${GREEN}✅ $var_name установлен${NC}"
    else
      echo -e "${YELLOW}⚠️ $var_name не установлен${NC}"
    fi
  done
  
  echo -e "${BLUE}Найдено активных токенов: $BOT_COUNT${NC}"
  
  # Проверка Supabase
  if [ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_SERVICE_KEY" ]; then
    echo -e "${GREEN}✅ Переменные Supabase установлены${NC}"
  else
    echo -e "${RED}❌ Переменные Supabase не установлены${NC}"
  fi
  
else
  echo -e "${RED}❌ Файл .env не найден${NC}"
fi

# Проверка NODE_ENV
if [ -n "$NODE_ENV" ]; then
  echo -e "${GREEN}✅ NODE_ENV=$NODE_ENV${NC}"
else
  print_warning "NODE_ENV не установлена, используется значение по умолчанию"
fi

# Проверка наличия необходимых пакетов
print_header "Проверка зависимостей"

# Проверка наличия package.json
if [ -f package.json ]; then
  echo -e "${GREEN}✅ Файл package.json найден${NC}"
  
  # Проверка наличия pnpm
  if command -v pnpm &> /dev/null; then
    echo -e "${GREEN}✅ pnpm установлен${NC}"
  else
    echo -e "${RED}❌ pnpm не установлен${NC}"
  fi
  
  # Проверка наличия node_modules
  if [ -d node_modules ]; then
    echo -e "${GREEN}✅ node_modules найден${NC}"
  else
    echo -e "${RED}❌ node_modules не найден. Выполните 'pnpm install'${NC}"
  fi
  
else
  echo -e "${RED}❌ Файл package.json не найден${NC}"
fi

# Проверка Docker
print_header "Проверка Docker"

# Проверка наличия Docker
if command -v docker &> /dev/null; then
  echo -e "${GREEN}✅ Docker установлен${NC}"
  
  # Проверка docker-compose файлов
  for file in docker-compose.yml docker-compose.dev.yml docker-compose.longpolling.yml; do
    if [ -f $file ]; then
      echo -e "${GREEN}✅ Файл $file найден${NC}"
    else
      echo -e "${RED}❌ Файл $file не найден${NC}"
    fi
  done
  
  # Проверка запущенных контейнеров
  CONTAINERS=$(docker ps --format "{{.Names}}" | grep -E 'app|longpolling-bot' || echo "")
  
  if [ -n "$CONTAINERS" ]; then
    echo -e "${GREEN}✅ Найдены запущенные контейнеры:${NC}"
    for container in $CONTAINERS; do
      echo "   - $container"
    done
    
    # Проверка портов для первого контейнера
    FIRST_CONTAINER=$(echo "$CONTAINERS" | head -n 1)
    PORTS=$(docker port $FIRST_CONTAINER | grep -E '2999|3000|3001' || echo "")
    
    if [ -n "$PORTS" ]; then
      echo -e "${GREEN}✅ Порты настроены корректно:${NC}"
      echo "$PORTS"
    else
      echo -e "${RED}❌ Не найдены нужные порты (2999, 3000, 3001)${NC}"
    fi
    
  else
    echo -e "${YELLOW}⚠️ Не найдены запущенные контейнеры ботов${NC}"
  fi
  
else
  echo -e "${RED}❌ Docker не установлен${NC}"
fi

# Проверка файлов и структуры проекта
print_header "Проверка структуры проекта"

# Проверка основных директорий
for dir in src node_modules logs scripts; do
  if [ -d $dir ]; then
    echo -e "${GREEN}✅ Директория $dir найдена${NC}"
  else
    echo -e "${RED}❌ Директория $dir не найдена${NC}"
  fi
done

# Проверка основных файлов
for file in src/multi.ts src/index.ts src/utils/launch.ts src/scenes/subscriptionCheckScene.ts; do
  if [ -f $file ]; then
    echo -e "${GREEN}✅ Файл $file найден${NC}"
  else
    echo -e "${RED}❌ Файл $file не найден${NC}"
  fi
done

# Проверка nginx.conf если используется webhook
if [ "$MODE" = "webhook" ] && [ -f nginx.conf ]; then
  echo -e "${GREEN}✅ Файл nginx.conf найден (необходим для webhook)${NC}"
  
  # Проверка настроек Nginx
  if grep -q "proxy_pass.*app:2999" nginx.conf; then
    echo -e "${GREEN}✅ Настройка proxy_pass в nginx.conf корректна${NC}"
  else
    echo -e "${RED}❌ Не найдена корректная настройка proxy_pass в nginx.conf${NC}"
  fi
  
elif [ "$MODE" = "webhook" ]; then
  echo -e "${RED}❌ Файл nginx.conf не найден (необходим для webhook)${NC}"
fi

# Проверка логов
print_header "Анализ лог-файлов"

if [ -d logs ]; then
  # Проверка наличия логов
  LOG_FILES=$(find logs -type f -name "*.log" | wc -l)
  
  if [ $LOG_FILES -gt 0 ]; then
    echo -e "${GREEN}✅ Найдено $LOG_FILES лог-файлов${NC}"
    
    # Проверка ошибок в логах
    ERROR_COUNT=$(grep -i error logs/*.log 2>/dev/null | wc -l)
    if [ $ERROR_COUNT -gt 0 ]; then
      echo -e "${RED}❌ Найдено $ERROR_COUNT ошибок в логах${NC}"
      
      # Показать последние 5 ошибок
      echo -e "${YELLOW}Последние ошибки:${NC}"
      grep -i error logs/*.log 2>/dev/null | tail -n 5
    else
      echo -e "${GREEN}✅ Ошибки в логах не найдены${NC}"
    fi
    
    # Анализ инициализации ботов
    BOT_INIT=$(grep -i "инициализация ботов завершена" logs/*.log 2>/dev/null | tail -n 1)
    if [ -n "$BOT_INIT" ]; then
      echo -e "${GREEN}✅ Найдены записи об инициализации ботов:${NC}"
      echo "   $BOT_INIT"
    else
      echo -e "${YELLOW}⚠️ Не найдены записи об инициализации ботов${NC}"
    fi
    
  else
    echo -e "${YELLOW}⚠️ Лог-файлы не найдены${NC}"
  fi
else
  echo -e "${YELLOW}⚠️ Директория logs не найдена${NC}"
fi

# Тестирование соединения с Telegram API
print_header "Тестирование Telegram API"

if command -v curl &> /dev/null; then
  # Проверяем доступность API Telegram
  TELEGRAM_API="https://api.telegram.org"
  curl -s -o /dev/null -w "%{http_code}" $TELEGRAM_API > /tmp/telegram_status
  TELEGRAM_STATUS=$(cat /tmp/telegram_status)
  
  if [ "$TELEGRAM_STATUS" = "200" ]; then
    echo -e "${GREEN}✅ Telegram API доступен${NC}"
  else
    echo -e "${RED}❌ Telegram API недоступен (код $TELEGRAM_STATUS)${NC}"
  fi
  
  # Если есть токены, проверяем их
  if [ $BOT_COUNT -gt 0 ] && [ -f .env ]; then
    for i in {1..7}; do
      var_name="BOT_TOKEN_$i"
      if [ -n "${!var_name}" ]; then
        # Маскируем токен для вывода
        TOKEN_MASKED="${!var_name:0:5}...${!var_name: -5}"
        echo -e "${BLUE}Проверка бота с токеном $TOKEN_MASKED${NC}"
        
        # Проверка валидности токена
        curl -s "https://api.telegram.org/bot${!var_name}/getMe" > /tmp/bot_status
        if grep -q "\"ok\":true" /tmp/bot_status; then
          BOT_USERNAME=$(grep -o '"username":"[^"]*"' /tmp/bot_status | cut -d '"' -f 4)
          echo -e "${GREEN}✅ Токен действителен для бота @$BOT_USERNAME${NC}"
        else
          echo -e "${RED}❌ Токен недействителен или ошибка запроса${NC}"
        fi
      fi
    done
  fi
else
  echo -e "${YELLOW}⚠️ curl не установлен, невозможно проверить API${NC}"
fi

# Проверка Supabase соединения
print_header "Проверка соединения с Supabase"

if [ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_SERVICE_KEY" ] && command -v curl &> /dev/null; then
  echo -e "${BLUE}Проверка соединения с Supabase...${NC}"
  
  # Маскируем ключ для вывода
  KEY_MASKED="${SUPABASE_SERVICE_KEY:0:5}...${SUPABASE_SERVICE_KEY: -5}"
  echo -e "${BLUE}URL: $SUPABASE_URL${NC}"
  echo -e "${BLUE}Key: $KEY_MASKED${NC}"
  
  # Проверка соединения с Supabase
  SUPABASE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$SUPABASE_URL/rest/v1/" -H "apikey: $SUPABASE_SERVICE_KEY")
  
  if [ "$SUPABASE_STATUS" = "200" ]; then
    echo -e "${GREEN}✅ Соединение с Supabase установлено успешно${NC}"
  else
    echo -e "${RED}❌ Ошибка соединения с Supabase (код $SUPABASE_STATUS)${NC}"
  fi
else
  echo -e "${YELLOW}⚠️ Невозможно проверить соединение с Supabase - отсутствуют данные или curl${NC}"
fi

# Проверка webhook URLs если используется webhook
if [ "$MODE" = "webhook" ]; then
  print_header "Проверка webhook URLs"
  
  if [ -n "$WEBHOOK_DOMAIN" ]; then
    echo -e "${BLUE}Домен webhook: $WEBHOOK_DOMAIN${NC}"
    
    # Проверка доступности домена
    if command -v curl &> /dev/null; then
      DOMAIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" $WEBHOOK_DOMAIN)
      
      if [ "$DOMAIN_STATUS" = "200" ] || [ "$DOMAIN_STATUS" = "404" ]; then
        echo -e "${GREEN}✅ Домен webhook доступен (код $DOMAIN_STATUS)${NC}"
      else
        echo -e "${RED}❌ Домен webhook недоступен (код $DOMAIN_STATUS)${NC}"
      fi
    else
      echo -e "${YELLOW}⚠️ curl не установлен, невозможно проверить домен${NC}"
    fi
    
    # Проверка SSL если используется https
    if [[ "$WEBHOOK_DOMAIN" == https://* ]]; then
      if command -v openssl &> /dev/null; then
        DOMAIN=$(echo $WEBHOOK_DOMAIN | sed 's|https://||')
        SSL_VALID=$(echo | openssl s_client -servername $DOMAIN -connect $DOMAIN:443 2>/dev/null | openssl x509 -noout -dates | grep "notAfter" | cut -d= -f2)
        
        if [ -n "$SSL_VALID" ]; then
          echo -e "${GREEN}✅ SSL сертификат действителен до: $SSL_VALID${NC}"
        else
          echo -e "${RED}❌ Проблема с SSL сертификатом${NC}"
        fi
      else
        echo -e "${YELLOW}⚠️ openssl не установлен, невозможно проверить SSL${NC}"
      fi
    fi
    
  else
    echo -e "${RED}❌ Переменная WEBHOOK_DOMAIN не установлена${NC}"
  fi
fi

# Итоговый вывод
print_header "Итог диагностики"

# Создаем текстовый отчет
cat <<EOT > diagnostic_report.txt
======= Отчет диагностики NeuroBlogger =======
Дата: $(date)
Режим: ${MODE:-"Не указан"}
Найдено токенов ботов: $BOT_COUNT
Проверено контейнеров: $(echo "$CONTAINERS" | wc -l)
----------------------------------------------
Проблемы и рекомендации:
EOT

# Добавляем основные проблемы в отчет
if [ $BOT_COUNT -eq 0 ]; then
  echo "❌ Не найдены токены ботов в переменных окружения" >> diagnostic_report.txt
fi

if [ -z "$CONTAINERS" ]; then
  echo "❌ Нет запущенных контейнеров Docker" >> diagnostic_report.txt
fi

if [ "$MODE" = "webhook" ] && [ ! -f nginx.conf ]; then
  echo "❌ Отсутствует конфигурация Nginx для webhook" >> diagnostic_report.txt
fi

if [ -n "$ERROR_COUNT" ] && [ $ERROR_COUNT -gt 0 ]; then
  echo "❌ Найдены ошибки в логах ($ERROR_COUNT)" >> diagnostic_report.txt
fi

if [ -z "$MODE" ]; then
  echo "⚠️ Не указан режим работы (MODE)" >> diagnostic_report.txt
fi

echo -e "Отчет сохранен в файл: ${BLUE}diagnostic_report.txt${NC}"
echo -e "${GREEN}Диагностика завершена!${NC}"
echo

# Предлагаем команды для исправления частых проблем
print_header "Рекомендуемые действия"

if [ -z "$CONTAINERS" ]; then
  echo -e "${YELLOW}Для запуска ботов выполните:${NC}"
  echo -e "   ${BLUE}docker compose up -d --build${NC}"
fi

if [ ! -d node_modules ]; then
  echo -e "${YELLOW}Для установки зависимостей выполните:${NC}"
  echo -e "   ${BLUE}pnpm install${NC}"
fi

if [ $ERROR_COUNT -gt 0 ]; then
  echo -e "${YELLOW}Для анализа ошибок в логах выполните:${NC}"
  echo -e "   ${BLUE}grep -i error logs/*.log | tail -n 20${NC}"
fi

echo -e "${YELLOW}Для проверки переменных окружения:${NC}"
echo -e "   ${BLUE}cat .env | grep -v \"^#\" | grep -v \"^$\"${NC}"

echo -e "${YELLOW}Для перезапуска системы выполните:${NC}"
echo -e "   ${BLUE}docker compose down && docker compose up -d --build${NC}" 