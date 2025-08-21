#!/bin/bash

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Параметры сервера
SSH_KEY=~/.ssh/id_rsa
SERVER=root@999-multibots-u14194.vm.elestio.app
PROJECT_PATH=/opt/app/999-multibots-telegraf

# Функция для форматированного вывода сообщений
print_message() {
    local type=$1
    local message=$2
    case $type in
        "info")
            echo -e "${BLUE}[INFO]${NC} $message"
            ;;
        "success")
            echo -e "${GREEN}[SUCCESS]${NC} $message"
            ;;
        "error")
            echo -e "${RED}[ERROR]${NC} $message"
            ;;
        "header")
            echo -e "\n${BLUE}=== $message ===${NC}\n"
            ;;
    esac
}

# Проверка наличия SSH ключа
if [ ! -f "$SSH_KEY" ]; then
    print_message "error" "SSH key not found at $SSH_KEY"
    exit 1
fi

print_message "header" "Starting NeuroBlogger Deployment using Docker"

# Создаем временный скрипт для выполнения на сервере
cat << 'EOF' > /tmp/deploy.sh
#!/bin/bash

cd /opt/app/999-multibots-telegraf

# Проверка и установка Docker
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    systemctl start docker
    systemctl enable docker
fi

# Проверка и установка Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "Installing Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/download/v2.15.1/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# Git операции
echo "Performing git operations..."
git add .
git commit -m "🚀 Auto-commit before deployment $(date +%Y-%m-%d_%H-%M-%S)"
git pull origin main

# Остановка старых контейнеров
echo "Stopping old containers..."
docker-compose down

# Сборка и запуск новых контейнеров
echo "Building and starting new containers..."
docker-compose up --build -d

# Проверка статуса
echo "Checking container status..."
docker-compose ps
docker-compose logs --tail=100

# Настройка tmux для мониторинга
if ! command -v tmux &> /dev/null; then
    apt-get update && apt-get install -y tmux
fi

# Убиваем существующую сессию, если она есть
tmux kill-session -t neuroblogger 2>/dev/null || true

# Создаем новую tmux сессию
tmux new-session -d -s neuroblogger

# Разделяем окно на панели и запускаем команды
tmux split-window -h
tmux select-pane -t 0
tmux send-keys "docker-compose logs -f" C-m
tmux select-pane -t 1
tmux send-keys "docker stats" C-m

echo "Deployment completed! Use 'tmux attach -t neuroblogger' to monitor the application"
EOF

# Делаем скрипт исполняемым и копируем на сервер
chmod +x /tmp/deploy.sh
scp -i $SSH_KEY /tmp/deploy.sh $SERVER:/tmp/deploy.sh

# Выполняем скрипт на сервере
print_message "info" "Executing deployment script on server..."
ssh -i $SSH_KEY $SERVER "bash /tmp/deploy.sh"

# Удаляем временный скрипт
rm /tmp/deploy.sh
ssh -i $SSH_KEY $SERVER "rm /tmp/deploy.sh"

print_message "success" "Deployment completed!"
print_message "info" "You can monitor the deployment using these commands:"
echo "Connect to tmux session:"
echo "ssh -i $SSH_KEY $SERVER 'tmux attach -t neuroblogger'"
echo "Check Docker status:"
echo "ssh -i $SSH_KEY $SERVER 'docker-compose ps'"
echo "View logs:"
echo "ssh -i $SSH_KEY $SERVER 'docker-compose logs -f'"
echo "Check Docker stats:"
echo "ssh -i $SSH_KEY $SERVER 'docker stats'"