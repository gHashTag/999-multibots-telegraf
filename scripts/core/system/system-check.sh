#!/bin/bash

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
    local emotion=$1
    local message=$2
    local color

    case $emotion in
        "happy") color=$GREEN; message="😊 $message";;
        "sad") color=$RED; message="😢 $message";;
        "excited") color=$YELLOW; message="🎉 $message";;
        "calm") color=$BLUE; message="😌 $message";;
        "love") color=$PURPLE; message="💜 $message";;
        "tech") color=$CYAN; message="🤖 $message";;
        *) color=$NC;;
    esac

    echo -e "${color}${message}${NC}"
}

# Проверка системных ресурсов
check_system_resources() {
    emotional_echo "tech" "Проверяю системные ресурсы..."
    
    # Проверка CPU
    local cpu_usage=$(top -l 1 | grep "CPU usage" | awk '{print $3}' | cut -d'%' -f1)
    if (( $(echo "$cpu_usage < 80" | bc -l) )); then
        emotional_echo "happy" "CPU в норме (${cpu_usage}%)"
    else
        emotional_echo "sad" "Высокая нагрузка на CPU (${cpu_usage}%)"
    fi

    # Проверка памяти
    local memory_free=$(vm_stat | grep "Pages free" | awk '{print $3}' | tr -d '.')
    local memory_total=$(sysctl hw.memsize | awk '{print $2}')
    local memory_free_gb=$(echo "scale=2; $memory_free * 4096 / 1024 / 1024 / 1024" | bc)
    
    if (( $(echo "$memory_free_gb > 2" | bc -l) )); then
        emotional_echo "happy" "Достаточно свободной памяти (${memory_free_gb}GB)"
    else
        emotional_echo "sad" "Мало свободной памяти (${memory_free_gb}GB)"
    fi

    # Проверка диска
    local disk_usage=$(df -h / | tail -1 | awk '{print $5}' | tr -d '%')
    if (( disk_usage < 80 )); then
        emotional_echo "happy" "Достаточно места на диске (${disk_usage}%)"
    else
        emotional_echo "sad" "Мало места на диске (${disk_usage}%)"
    fi
}

# Проверка сетевого подключения
check_network() {
    emotional_echo "tech" "Проверяю сетевое подключение..."
    
    if ping -c 1 google.com &> /dev/null; then
        emotional_echo "happy" "Сетевое подключение работает"
    else
        emotional_echo "sad" "Проблемы с сетевым подключением"
    fi
}

# Проверка статуса сервисов
check_services() {
    emotional_echo "tech" "Проверяю статус сервисов..."
    
    # Проверка Docker
    if command -v docker &> /dev/null; then
        if docker info &> /dev/null; then
            emotional_echo "happy" "Docker работает"
        else
            emotional_echo "sad" "Docker не запущен"
        fi
    else
        emotional_echo "sad" "Docker не установлен"
    fi

    # Проверка Node.js
    if command -v node &> /dev/null; then
        local node_version=$(node --version)
        emotional_echo "happy" "Node.js работает (версия: ${node_version})"
    else
        emotional_echo "sad" "Node.js не установлен"
    fi
}

# Главная функция
main() {
    emotional_echo "excited" "🚀 Начинаю проверку системы..."
    
    check_system_resources
    check_network
    check_services
    
    emotional_echo "love" "💜 Проверка системы завершена!"
}

# Запуск скрипта
main 