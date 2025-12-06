#!/bin/bash
# 🚨 БЫСТРОЕ ВОССТАНОВЛЕНИЕ WEBHOOK (Если что-то сломалось)

set -e

echo "🔧 WEBHOOK QUICK FIX TOOL"
echo "=========================="
echo ""

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Проверка, что скрипт запущен на сервере
if [ ! -d "/root/bot-farm" ]; then
    echo -e "${RED}❌ Этот скрипт нужно запускать на production сервере!${NC}"
    echo "Запустите: ssh root@212.86.115.30"
    exit 1
fi

echo "Выберите действие:"
echo "1) Быстрая проверка всех компонентов"
echo "2) Восстановить из последнего snapshot"
echo "3) Восстановить nginx с SSL"
echo "4) Откатиться к стабильной версии (git tag)"
echo "5) Проверить SSL сертификаты"
echo "6) Показать последние логи webhook"
echo ""
read -p "Ваш выбор (1-6): " choice

case $choice in
    1)
        echo -e "${GREEN}📊 Проверка компонентов...${NC}"
        echo ""

        # Проверка контейнеров
        echo "🐳 Docker containers:"
        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        echo ""

        # Проверка SSL
        echo "🔐 SSL certificates:"
        /root/bot-farm/check-ssl.sh || echo -e "${RED}❌ SSL check failed${NC}"
        echo ""

        # Проверка nginx
        echo "🌐 Nginx status:"
        curl -I https://three-head-dragon.shop/api/video-callback 2>&1 | head -5
        echo ""

        # Последние логи
        echo "📝 Recent webhook logs:"
        docker logs 999-multibots --tail 10 | grep -E '(VIDEO CALLBACK|File size|sent successfully)' || echo "No webhook activity"
        ;;

    2)
        SNAPSHOT="working-webhook-20251110-213839"
        echo -e "${YELLOW}🔄 Восстановление из snapshot: $SNAPSHOT${NC}"

        if [ ! -f "/root/docker-snapshot-${SNAPSHOT}.tar.gz" ]; then
            echo -e "${RED}❌ Snapshot не найден!${NC}"
            echo "Доступные snapshots:"
            ls -lh /root/*snapshot*.tar.gz 2>/dev/null || echo "Нет доступных snapshots"
            exit 1
        fi

        echo "Останавливаем контейнеры..."
        cd /root/bot-farm
        docker compose down

        echo "Загружаем Docker images..."
        docker load < /root/docker-snapshot-${SNAPSHOT}.tar.gz

        echo "Восстанавливаем конфиги..."
        tar -xzf /root/config-snapshot-${SNAPSHOT}.tar.gz -C /

        echo "Запускаем контейнеры..."
        docker compose up -d

        # Восстановить nginx вручную с правильными volumes
        sleep 5
        docker rm -f bot-proxy 2>/dev/null || true
        docker run -d \
          --name bot-proxy \
          --network bot-farm_app-network \
          -p 80:80 -p 443:443 \
          -v /root/bot-farm/nginx-config:/etc/nginx/conf.d:ro \
          -v /root/bot-farm/ssl:/etc/nginx/ssl:ro \
          --restart unless-stopped \
          nginx:latest

        echo -e "${GREEN}✅ Восстановление завершено!${NC}"
        echo "Проверьте: curl https://three-head-dragon.shop/api/video-callback"
        ;;

    3)
        echo -e "${YELLOW}🌐 Восстановление nginx с SSL...${NC}"

        # Проверить SSL файлы
        if [ ! -f "/root/bot-farm/ssl/cert.crt" ] || [ ! -f "/root/bot-farm/ssl/key.pem" ]; then
            echo -e "${RED}❌ SSL файлы не найдены!${NC}"
            echo "Проверьте /root/bot-farm/ssl/"
            exit 1
        fi

        # Удалить старый nginx
        docker rm -f bot-proxy 2>/dev/null || true

        # Запустить с правильными volumes
        docker run -d \
          --name bot-proxy \
          --network bot-farm_app-network \
          -p 80:80 -p 443:443 \
          -v /root/bot-farm/nginx-config:/etc/nginx/conf.d:ro \
          -v /root/bot-farm/ssl:/etc/nginx/ssl:ro \
          --restart unless-stopped \
          nginx:latest

        sleep 2

        # Проверить
        if docker ps | grep -q bot-proxy; then
            echo -e "${GREEN}✅ Nginx запущен!${NC}"
            curl -I https://three-head-dragon.shop/api/video-callback 2>&1 | head -3
        else
            echo -e "${RED}❌ Nginx не запустился. Проверьте логи:${NC}"
            docker logs bot-proxy --tail 20
        fi
        ;;

    4)
        echo -e "${YELLOW}🔄 Откат к стабильной версии (git tag)...${NC}"

        cd /root/bot-farm

        # Бэкап .env
        cp .env .env.backup-$(date +%s) 2>/dev/null || true

        # Откат к тегу
        git fetch --tags
        git checkout webhook-stable-20251110

        # Восстановить .env
        if [ -f .env.backup-* ]; then
            latest_backup=$(ls -t .env.backup-* | head -1)
            cp "$latest_backup" .env
        fi

        # Rebuild
        echo "Rebuilding..."
        docker compose build --pull app
        docker compose up -d

        echo -e "${GREEN}✅ Откат завершен!${NC}"
        ;;

    5)
        echo -e "${YELLOW}🔐 Проверка SSL сертификатов...${NC}"
        /root/bot-farm/check-ssl.sh
        echo ""
        echo "Детали сертификата:"
        openssl x509 -in /root/bot-farm/ssl/cert.crt -noout -subject -issuer -dates
        ;;

    6)
        echo -e "${YELLOW}📝 Последние логи webhook...${NC}"
        docker logs 999-multibots --tail 100 | grep -E '(VIDEO CALLBACK|download_url|File size|large|sent successfully|Error)' -A 2 || echo "Нет активности webhook"
        ;;

    *)
        echo -e "${RED}❌ Неверный выбор${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}Готово!${NC}"
