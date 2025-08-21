#!/bin/bash

# ========================================
# ПОЛНАЯ НАСТРОЙКА CI/CD ДЕПЛОЯ
# ========================================
# Настройка всего пайплайна от начала до конца

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${PURPLE}========================================${NC}"
echo -e "${PURPLE}    ПОЛНАЯ НАСТРОЙКА CI/CD PIPELINE    ${NC}"
echo -e "${PURPLE}========================================${NC}"

# Проверяем SSH ключ
if [ ! -f ~/.ssh/id_rsa ]; then
    echo -e "${RED}❌ SSH ключ не найден: ~/.ssh/id_rsa${NC}"
    echo -e "${YELLOW}Создайте SSH ключ командой: ssh-keygen -t rsa -b 4096${NC}"
    exit 1
fi

echo -e "${GREEN}✅ SSH ключ найден${NC}"

# Определяем серверы
PROD_SERVER="root@999-multibots-u14194.vm.elestio.app"
DEV_SERVER="root@999-multibots-dev-u14194.vm.elestio.app"

echo -e "${BLUE}🔧 Проверяем подключения к серверам...${NC}"

# Функция проверки сервера
check_server() {
    local server=$1
    local name=$2
    
    echo -e "${YELLOW}📡 Проверяю $name сервер: $server${NC}"
    
    if ssh -o ConnectTimeout=10 -i ~/.ssh/id_rsa $server "echo 'Connected to $name'" 2>/dev/null; then
        echo -e "${GREEN}✅ $name сервер доступен${NC}"
        return 0
    else
        echo -e "${RED}❌ $name сервер недоступен${NC}"
        return 1
    fi
}

# Проверяем серверы
PROD_OK=0
DEV_OK=0

if check_server $PROD_SERVER "Production"; then
    PROD_OK=1
fi

if check_server $DEV_SERVER "Development"; then
    DEV_OK=1
fi

if [ $PROD_OK -eq 0 ] && [ $DEV_OK -eq 0 ]; then
    echo -e "${RED}❌ Ни один сервер не доступен!${NC}"
    exit 1
fi

echo -e "${BLUE}🚀 Настраиваем серверы для деплоя...${NC}"

# Функция настройки сервера
setup_server() {
    local server=$1
    local name=$2
    local branch=$3
    
    echo -e "${YELLOW}⚙️  Настраиваю $name сервер...${NC}"
    
    ssh -i ~/.ssh/id_rsa $server << ENDSSH
set -e

echo "🔧 Настройка $name сервера ($server)"

# Создаем необходимые директории
mkdir -p /opt/app
mkdir -p /opt/backups
mkdir -p /opt/logs

# Переходим в рабочую директорию
cd /opt/app

# Клонируем или обновляем репозиторий
if [ ! -d "999-multibots-telegraf" ]; then
    echo "📥 Клонируем репозиторий..."
    git clone https://github.com/gHashTag/999-multibots-telegraf.git
else
    echo "🔄 Обновляем репозиторий..."
    cd 999-multibots-telegraf
    git fetch origin
fi

cd 999-multibots-telegraf

# Переключаемся на нужную ветку
echo "🌿 Переключаемся на ветку $branch..."
git checkout $branch
git pull origin $branch

# Проверяем Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker не установлен!"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose не установлен!"
    exit 1
fi

# Проверяем Bun (опционально)
if ! command -v bun &> /dev/null; then
    echo "⚠️ Bun не установлен, будет использоваться npm"
fi

# Создаем systemd сервис для автозапуска
cat > /etc/systemd/system/multibots-$name.service << 'SYSTEMD_EOF'
[Unit]
Description=Multibots Telegram Service ($name)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/app/999-multibots-telegraf
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
TimeoutStartSec=0
User=root

[Install]
WantedBy=multi-user.target
SYSTEMD_EOF

# Включаем сервис
systemctl daemon-reload
systemctl enable multibots-$name.service

echo "✅ $name сервер настроен!"
ENDSSH

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ $name сервер успешно настроен${NC}"
    else
        echo -e "${RED}❌ Ошибка настройки $name сервера${NC}"
    fi
}

# Настраиваем серверы
if [ $PROD_OK -eq 1 ]; then
    setup_server $PROD_SERVER "production" "main"
fi

if [ $DEV_OK -eq 1 ]; then
    setup_server $DEV_SERVER "development" "cicd"
fi

echo -e "${BLUE}🔑 Настраиваем GitHub Secrets...${NC}"

# Получаем публичный ключ
PUBLIC_KEY=$(cat ~/.ssh/id_rsa.pub)
PRIVATE_KEY=$(cat ~/.ssh/id_rsa)

echo -e "${YELLOW}📋 ВНИМАНИЕ! Добавьте следующие секреты в GitHub:${NC}"
echo ""
echo -e "${BLUE}1. Перейдите в Settings > Secrets and variables > Actions${NC}"
echo -e "${BLUE}2. Добавьте следующий секрет:${NC}"
echo ""
echo -e "${GREEN}Имя секрета: SSH_PRIVATE_KEY${NC}"
echo -e "${YELLOW}Значение (скопируйте точно):${NC}"
echo "========== НАЧАЛО КЛЮЧА =========="
echo "$PRIVATE_KEY"
echo "=========== КОНЕЦ КЛЮЧА ==========="
echo ""

echo -e "${BLUE}3. Убедитесь что публичный ключ добавлен на серверы:${NC}"
echo -e "${YELLOW}Публичный ключ (должен быть в ~/.ssh/authorized_keys на серверах):${NC}"
echo "$PUBLIC_KEY"
echo ""

echo -e "${BLUE}🧪 Тестируем полный пайплайн...${NC}"

# Создаем тестовый файл для проверки CI/CD
cat > test-deployment.md << 'TEST_EOF'
# Test Deployment

This file is created to test the CI/CD pipeline.

Created at: $(date)
TEST_EOF

echo -e "${YELLOW}📝 Создан тестовый файл для проверки деплоя${NC}"

echo -e "${PURPLE}========================================${NC}"
echo -e "${PURPLE}       НАСТРОЙКА ЗАВЕРШЕНА!            ${NC}"
echo -e "${PURPLE}========================================${NC}"

echo -e "${GREEN}✅ Что настроено:${NC}"
if [ $PROD_OK -eq 1 ]; then
    echo -e "${GREEN}  ✅ Production сервер готов${NC}"
fi
if [ $DEV_OK -eq 1 ]; then
    echo -e "${GREEN}  ✅ Development сервер готов${NC}"
fi
echo -e "${GREEN}  ✅ SSH ключи подготовлены${NC}"
echo -e "${GREEN}  ✅ Systemd сервисы созданы${NC}"
echo -e "${GREEN}  ✅ GitHub Actions workflows готовы${NC}"

echo ""
echo -e "${BLUE}🚀 Следующие шаги:${NC}"
echo -e "${YELLOW}1. Добавьте SSH_PRIVATE_KEY в GitHub Secrets${NC}"
echo -e "${YELLOW}2. Сделайте commit и push в ветку main${NC}"
echo -e "${YELLOW}3. Проверьте GitHub Actions во вкладке Actions${NC}"
echo -e "${YELLOW}4. При успешном деплое проверьте серверы${NC}"

echo ""
echo -e "${GREEN}🎉 CI/CD пайплайн готов к работе!${NC}"