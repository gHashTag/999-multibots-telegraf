#!/bin/bash

# ========================================
# Настройка DEV окружения
# ========================================
# Безопасная изоляция dev от продакшн

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${RED}⚠️  КРИТИЧЕСКИ ВАЖНО! ⚠️${NC}"
echo -e "${RED}========================================${NC}"
echo -e "${YELLOW}Dev сервер использует ПРОДАКШН токены!${NC}"
echo -e "${YELLOW}Это может сломать продакшн ботов!${NC}"
echo -e "${RED}========================================${NC}"
echo ""

DEV_SERVER="root@999-multibots-dev-u14194.vm.elestio.app"

echo -e "${BLUE}🛠️  Настройка безопасного dev окружения...${NC}"

# Проверяем SSH подключение
if ! ssh -o ConnectTimeout=10 -i ~/.ssh/id_rsa $DEV_SERVER "echo 'SSH OK'"; then
    echo -e "${RED}❌ Не удается подключиться к dev серверу${NC}"
    exit 1
fi

echo -e "${GREEN}✅ SSH подключение работает${NC}"

# Останавливаем текущие контейнеры
echo -e "${YELLOW}🛑 Останавливаю текущие контейнеры...${NC}"
ssh -i ~/.ssh/id_rsa $DEV_SERVER << 'ENDSSH'
cd /opt/app/999-multibots-telegraf
docker-compose -f docker-compose.dev.yml down --remove-orphans
ENDSSH

echo -e "${GREEN}✅ Контейнеры остановлены${NC}"

# Создаем безопасный .env.dev
echo -e "${YELLOW}📝 Создаю шаблон dev конфигурации...${NC}"

# Копируем шаблон на сервер
scp -i ~/.ssh/id_rsa .env.dev.template $DEV_SERVER:/opt/app/999-multibots-telegraf/.env.dev.template

ssh -i ~/.ssh/id_rsa $DEV_SERVER << 'ENDSSH'
cd /opt/app/999-multibots-telegraf

# Создаем безопасный .env.dev если его нет
if [ ! -f .env.dev.safe ]; then
    cp .env.dev.template .env.dev.safe
    echo "✅ Создан .env.dev.safe - заполните его dev токенами!"
fi

# Показываем статус
echo ""
echo "📋 СЛЕДУЮЩИЕ ШАГИ:"
echo "1. Создайте dev ботов через @BotFather"  
echo "2. Создайте dev проект в Supabase"
echo "3. Заполните .env.dev.safe правильными токенами"
echo "4. Запустите: docker-compose -f docker-compose.dev.yml up -d"
echo ""
echo "⚠️  НЕ ИСПОЛЬЗУЙТЕ ПРОДАКШН ТОКЕНЫ В DEV!"
ENDSSH

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Dev окружение подготовлено!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}📋 ЧТО ДЕЛАТЬ ДАЛЬШЕ:${NC}"
echo ""
echo -e "${BLUE}1. Создайте dev ботов:${NC}"
echo "   - Откройте @BotFather в Telegram"
echo "   - Создайте копии ваших ботов с суффиксом _dev"
echo "   - Например: neuro_blogger_dev_bot"
echo ""
echo -e "${BLUE}2. Создайте dev базу данных:${NC}"
echo "   - Создайте новый проект в Supabase"
echo "   - Скопируйте схему из продакшн базы"
echo ""
echo -e "${BLUE}3. Заполните конфигурацию:${NC}"
echo "   ssh -i ~/.ssh/id_rsa $DEV_SERVER"
echo "   cd /opt/app/999-multibots-telegraf"
echo "   nano .env.dev.safe"
echo ""
echo -e "${BLUE}4. Запустите dev окружение:${NC}"
echo "   cp .env.dev.safe .env"
echo "   docker-compose -f docker-compose.dev.yml up -d"
echo ""
echo -e "${RED}⚠️  ПОМНИТЕ: Никогда не используйте продакшн токены в dev!${NC}"