#!/bin/bash
# Запуск тестов в изолированном Docker-окружении
# Это гарантирует, что никакие тесты не будут обращаться к реальной базе данных

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${BOLD}${CYAN}🐋 ЗАПУСК ТЕСТОВ В DOCKER-КОНТЕЙНЕРЕ${NC}\n"
echo -e "${BLUE}Это обеспечит полную изоляцию тестов от реального окружения${NC}"

# Функция для проверки, установлен ли Docker
check_docker() {
  if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker не установлен на этой системе!${NC}"
    echo -e "${YELLOW}Пожалуйста, установите Docker и Docker Compose перед запуском этого скрипта.${NC}"
    exit 1
  fi
  
  if ! docker info &> /dev/null; then
    echo -e "${RED}❌ Docker демон не запущен или у вас нет прав для его использования!${NC}"
    echo -e "${YELLOW}Пожалуйста, запустите Docker и убедитесь, что у вас есть права для его использования.${NC}"
    exit 1
  fi
  
  echo -e "${GREEN}✅ Docker установлен и готов к использованию.${NC}"
}

# Функция для сборки тестового образа
build_test_image() {
  echo -e "\n${CYAN}🔨 Сборка тестового образа...${NC}"
  
  if [ -f "Dockerfile.test" ]; then
    docker build -t neuro-blogger-test -f Dockerfile.test .
    if [ $? -eq 0 ]; then
      echo -e "${GREEN}✅ Тестовый образ успешно собран.${NC}"
    else
      echo -e "${RED}❌ Ошибка при сборке тестового образа!${NC}"
      exit 1
    fi
  else
    echo -e "${YELLOW}⚠️ Dockerfile.test не найден. Создаю временный Dockerfile для тестов...${NC}"
    cat > Dockerfile.test << EOF
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_ENV=test
ENV TEST=true
ENV RUNNING_IN_TEST_ENV=true
ENV SUPABASE_MOCK_ENABLED=true
ENV DATABASE_MOCK=true

CMD ["npm", "run", "test"]
EOF
    
    docker build -t neuro-blogger-test -f Dockerfile.test .
    if [ $? -eq 0 ]; then
      echo -e "${GREEN}✅ Тестовый образ успешно собран с временным Dockerfile.${NC}"
    else
      echo -e "${RED}❌ Ошибка при сборке тестового образа!${NC}"
      exit 1
    fi
  fi
}

# Функция для запуска тестов в Docker
run_docker_tests() {
  test_type=$1
  
  echo -e "\n${CYAN}🚀 Запуск тестов '${test_type}' в Docker-контейнере...${NC}"
  
  # Создаем временный том для тестов
  docker volume create neuro-blogger-test-volume
  
  # Запускаем тесты в контейнере
  case "$test_type" in
    "neurophoto")
      docker run --rm \
        -v neuro-blogger-test-volume:/app/test-results \
        -e NODE_ENV=test \
        -e TEST=true \
        -e RUNNING_IN_TEST_ENV=true \
        -e SUPABASE_MOCK_ENABLED=true \
        -e DATABASE_MOCK=true \
        neuro-blogger-test \
        sh -c "cd /app/src/test-utils && node simplest-test.js"
      ;;
    "neurophoto-v2")
      docker run --rm \
        -v neuro-blogger-test-volume:/app/test-results \
        -e NODE_ENV=test \
        -e TEST=true \
        -e RUNNING_IN_TEST_ENV=true \
        -e SUPABASE_MOCK_ENABLED=true \
        -e DATABASE_MOCK=true \
        neuro-blogger-test \
        sh -c "cd /app/src/test-utils && node simplest-test-neurophoto-v2.js"
      ;;
    "all-neurophoto")
      docker run --rm \
        -v neuro-blogger-test-volume:/app/test-results \
        -e NODE_ENV=test \
        -e TEST=true \
        -e RUNNING_IN_TEST_ENV=true \
        -e SUPABASE_MOCK_ENABLED=true \
        -e DATABASE_MOCK=true \
        neuro-blogger-test \
        sh -c "cd /app && ./run-all-neurophoto-tests.sh"
      ;;
    *)
      echo -e "${RED}❌ Неизвестный тип тестов: ${test_type}${NC}"
      echo -e "${YELLOW}Доступные типы: neurophoto, neurophoto-v2, all-neurophoto${NC}"
      exit 1
      ;;
  esac
  
  # Проверяем результат выполнения тестов
  if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}✅ Тесты '${test_type}' успешно выполнены в Docker-контейнере!${NC}"
  else
    echo -e "\n${RED}❌ Тесты '${test_type}' завершились с ошибками в Docker-контейнере!${NC}"
    exit 1
  fi
}

# Функция для запуска через docker-compose
run_docker_compose_tests() {
  echo -e "\n${CYAN}🚀 Запуск тестов через docker-compose...${NC}"
  
  if [ -f "docker-compose.test.yml" ]; then
    # Останавливаем существующие контейнеры, если они есть
    docker-compose -f docker-compose.test.yml down
    
    # Запускаем контейнеры из docker-compose.test.yml
    docker-compose -f docker-compose.test.yml up --build -d
    
    # Запускаем скрипт для тестирования нейрофото
    docker-compose -f docker-compose.test.yml exec neuro-blogger-telegram-bot-test sh -c "cd /app && ./run-all-neurophoto-tests.sh"
    
    # Проверяем результат
    if [ $? -eq 0 ]; then
      echo -e "\n${GREEN}✅ Тесты успешно выполнены через docker-compose!${NC}"
    else
      echo -e "\n${RED}❌ Тесты завершились с ошибками через docker-compose!${NC}"
      # Останавливаем контейнеры
      docker-compose -f docker-compose.test.yml down
      exit 1
    fi
    
    # Останавливаем контейнеры
    docker-compose -f docker-compose.test.yml down
  else
    echo -e "${YELLOW}⚠️ Файл docker-compose.test.yml не найден!${NC}"
    echo -e "${YELLOW}Запускаю тесты в обычном Docker-контейнере...${NC}"
    run_docker_tests "all-neurophoto"
  fi
}

# Проверяем аргументы
check_docker

if [ "$1" = "--compose" ] || [ "$1" = "-c" ]; then
  run_docker_compose_tests
else
  # Собираем образ
  build_test_image
  
  # Запускаем нужные тесты
  if [ -z "$1" ]; then
    # По умолчанию запускаем все тесты
    run_docker_tests "all-neurophoto"
  else
    run_docker_tests "$1"
  fi
fi

echo -e "\n${BOLD}${GREEN}🎉 Все тесты в Docker успешно завершены!${NC}" 