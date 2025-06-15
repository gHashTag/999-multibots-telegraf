#!/bin/bash

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚂 Подготовка проекта для деплоя на Railway${NC}"
echo ""

# Проверка наличия необходимых файлов
echo -e "${YELLOW}📋 Проверка файлов...${NC}"

if [ ! -f "railway.json" ]; then
    echo -e "${RED}❌ Файл railway.json не найден${NC}"
    exit 1
fi

if [ ! -f "Dockerfile.railway" ]; then
    echo -e "${RED}❌ Файл Dockerfile.railway не найден${NC}"
    exit 1
fi

if [ ! -f "src/bot.railway.ts" ]; then
    echo -e "${RED}❌ Файл src/bot.railway.ts не найден${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Все необходимые файлы найдены${NC}"
echo ""

# Создание примера .env.railway если его нет
if [ ! -f ".env.railway" ]; then
    echo -e "${YELLOW}📝 Создаю пример .env.railway...${NC}"
    cat > .env.railway << 'EOF'
# Railway Environment Variables
# Заполните эти значения перед деплоем!

# Основной токен бота (используйте только один для Railway)
BOT_TOKEN=your_bot_token_here

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Admin
ADMIN_IDS=your_admin_telegram_id
SECRET_KEY=your_secret_key

# API ключи
OPENAI_API_KEY=your_openai_key
REPLICATE_API_TOKEN=your_replicate_token
ELEVENLABS_API_KEY=your_elevenlabs_key

# Inngest (опционально)
INNGEST_EVENT_KEY=your_inngest_event_key
INNGEST_SIGNING_KEY=your_inngest_signing_key
EOF
    echo -e "${GREEN}✅ Создан пример .env.railway${NC}"
    echo -e "${RED}⚠️  Не забудьте заполнить переменные в .env.railway!${NC}"
else
    echo -e "${GREEN}✅ Файл .env.railway уже существует${NC}"
fi

echo ""
echo -e "${BLUE}📝 Следующие шаги:${NC}"
echo "1. Заполните переменные в .env.railway"
echo "2. Создайте проект на railway.app"
echo "3. Подключите GitHub репозиторий"
echo "4. Скопируйте переменные из .env.railway в Railway"
echo "5. Railway автоматически начнет деплой"
echo ""
echo -e "${GREEN}Подробная инструкция в файле RAILWAY_DEPLOYMENT_GUIDE.md${NC}"
echo ""
echo -e "${YELLOW}💡 Совет: Добавьте .env.railway в .gitignore!${NC}"