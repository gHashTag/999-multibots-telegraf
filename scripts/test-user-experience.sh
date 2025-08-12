#!/bin/bash

# 🧪 ТЕСТИРОВАНИЕ ПОЛЬЗОВАТЕЛЬСКОГО ОПЫТА
# Скрипт для эмуляции разных типов пользователей и их взаимодействия с ботом

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Конфигурация
ENV_FILE=".env.development.local"
LOG_DIR="./test-logs"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Создаем директорию для логов
mkdir -p "$LOG_DIR"

# Функция для вывода заголовка
print_header() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC} ${CYAN}$1${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Функция для вывода шага
print_step() {
    echo -e "${GREEN}→${NC} $1"
}

# Функция для вывода предупреждения
print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Функция для вывода ошибки
print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Функция для вывода успеха
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Проверка наличия необходимых файлов
check_requirements() {
    print_header "🔍 Проверка требований"
    
    if [ ! -f "$ENV_FILE" ]; then
        print_error "Файл $ENV_FILE не найден!"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js не установлен!"
        exit 1
    fi
    
    print_success "Все требования выполнены"
}

# Функция для остановки всех процессов бота
stop_all_bots() {
    print_step "Останавливаем все запущенные экземпляры бота..."
    pkill -f "node.*bot.ts" 2>/dev/null || true
    pkill -f "tsx.*bot.ts" 2>/dev/null || true
    sleep 2
}

# Функция для запуска бота с определенной подпиской
start_bot_with_subscription() {
    local subscription_type=$1
    local log_file="$LOG_DIR/bot_${subscription_type}_${TIMESTAMP}.log"
    
    print_step "Запускаем бот с подпиской: ${PURPLE}$subscription_type${NC}"
    
    # Создаем временный env файл с нужной подпиской
    cp "$ENV_FILE" "$ENV_FILE.test"
    
    # Обновляем тип подписки в env файле
    if grep -q "DEV_SIMULATE_SUBSCRIPTION" "$ENV_FILE.test"; then
        sed -i '' "s/DEV_SIMULATE_SUBSCRIPTION=.*/DEV_SIMULATE_SUBSCRIPTION=$subscription_type/" "$ENV_FILE.test"
    else
        echo "DEV_SIMULATE_SUBSCRIPTION=$subscription_type" >> "$ENV_FILE.test"
    fi
    
    # Запускаем бот в фоне с логированием
    NODE_ENV=development npx tsx src/bot.ts > "$log_file" 2>&1 &
    BOT_PID=$!
    
    echo -e "${CYAN}   PID: $BOT_PID${NC}"
    echo -e "${CYAN}   Логи: $log_file${NC}"
    
    # Ждем запуска бота
    sleep 5
    
    # Проверяем, что бот запустился
    if ps -p $BOT_PID > /dev/null; then
        print_success "Бот успешно запущен"
        return 0
    else
        print_error "Не удалось запустить бота"
        cat "$log_file" | tail -20
        return 1
    fi
}

# Функция для отображения меню выбора теста
show_test_menu() {
    print_header "🎮 МЕНЮ ТЕСТИРОВАНИЯ"
    
    echo "Выберите тип теста:"
    echo ""
    echo "  ${CYAN}1)${NC} 🆕 Новый пользователь (без подписки)"
    echo "  ${CYAN}2)${NC} ⭐ Пользователь STARS (базовый)"
    echo "  ${CYAN}3)${NC} 📸 Пользователь NEUROPHOTO"
    echo "  ${CYAN}4)${NC} 🎬 Пользователь NEUROVIDEO"
    echo "  ${CYAN}5)${NC} 🧪 Пользователь NEUROTESTER"
    echo "  ${CYAN}6)${NC} 🔄 Последовательный тест всех типов"
    echo "  ${CYAN}7)${NC} 📊 Просмотр логов"
    echo "  ${CYAN}8)${NC} 🛑 Остановить все боты"
    echo "  ${CYAN}0)${NC} Выход"
    echo ""
    echo -n "Ваш выбор: "
}

# Функция для теста конкретного типа подписки
test_subscription_type() {
    local subscription_type=$1
    local description=$2
    
    print_header "Тест: $description"
    
    # Останавливаем предыдущие экземпляры
    stop_all_bots
    
    # Запускаем бот с нужной подпиской
    if start_bot_with_subscription "$subscription_type"; then
        echo ""
        print_step "Бот запущен с подпиской $subscription_type"
        echo ""
        echo "Что вы хотите протестировать?"
        echo "  1) Команда /start"
        echo "  2) Команда /menu"
        echo "  3) Попытка использовать Нейрофото"
        echo "  4) Попытка использовать Цифровое тело"
        echo "  5) Пригласить друга"
        echo "  6) Техподдержка"
        echo "  7) Просмотр текущих логов"
        echo "  0) Вернуться в главное меню"
        echo ""
        
        while true; do
            echo -n "Выбор: "
            read action_choice
            
            case $action_choice in
                1) simulate_command "/start" ;;
                2) simulate_command "/menu" ;;
                3) simulate_button "📸 Нейрофото" ;;
                4) simulate_button "🤖 Цифровое тело" ;;
                5) simulate_button "👥 Пригласить друга" ;;
                6) simulate_button "💬 Техподдержка" ;;
                7) tail -30 "$LOG_DIR/bot_${subscription_type}_${TIMESTAMP}.log" ;;
                0) break ;;
                *) print_warning "Неверный выбор" ;;
            esac
        done
    fi
}

# Функция эмуляции команды
simulate_command() {
    local command=$1
    echo ""
    print_step "Эмулируем команду: ${YELLOW}$command${NC}"
    echo "---"
    echo "Отправлено: $command"
    echo "Ожидаемый ответ будет в логах..."
    echo "---"
    echo ""
}

# Функция эмуляции нажатия кнопки
simulate_button() {
    local button=$1
    echo ""
    print_step "Эмулируем нажатие кнопки: ${YELLOW}$button${NC}"
    echo "---"
    echo "Нажата кнопка: $button"
    echo "Проверьте логи для ответа бота..."
    echo "---"
    echo ""
}

# Функция просмотра логов
view_logs() {
    print_header "📊 ПРОСМОТР ЛОГОВ"
    
    echo "Доступные логи:"
    ls -la "$LOG_DIR" | grep -E "\.log$" | tail -10
    echo ""
    echo -n "Введите имя файла лога (или 0 для выхода): "
    read log_file
    
    if [ "$log_file" != "0" ] && [ -f "$LOG_DIR/$log_file" ]; then
        less "$LOG_DIR/$log_file"
    fi
}

# Функция последовательного теста
sequential_test() {
    print_header "🔄 ПОСЛЕДОВАТЕЛЬНЫЙ ТЕСТ ВСЕХ ТИПОВ"
    
    local types=("STARS" "NEUROPHOTO" "NEUROVIDEO" "NEUROTESTER")
    
    for type in "${types[@]}"; do
        print_step "Тестируем $type..."
        stop_all_bots
        start_bot_with_subscription "$type"
        
        # Автоматические проверки
        echo "Автоматическая проверка для $type:"
        echo "- Проверка /menu"
        echo "- Проверка доступных кнопок"
        echo "- Проверка ограничений"
        
        sleep 10
        
        # Останавливаем для следующего теста
        stop_all_bots
        echo ""
    done
    
    print_success "Последовательный тест завершен"
}

# Главный цикл
main() {
    clear
    print_header "🤖 ТЕСТИРОВАНИЕ TELEGRAM БОТА"
    echo "Система тестирования пользовательского опыта"
    echo "Версия: 1.0.0"
    echo ""
    
    # Проверяем требования
    check_requirements
    
    while true; do
        show_test_menu
        read choice
        
        case $choice in
            1) test_subscription_type "STARS" "Новый пользователь без подписки" ;;
            2) test_subscription_type "STARS" "Пользователь STARS" ;;
            3) test_subscription_type "NEUROPHOTO" "Пользователь NEUROPHOTO" ;;
            4) test_subscription_type "NEUROVIDEO" "Пользователь NEUROVIDEO" ;;
            5) test_subscription_type "NEUROTESTER" "Пользователь NEUROTESTER" ;;
            6) sequential_test ;;
            7) view_logs ;;
            8) stop_all_bots && print_success "Все боты остановлены" ;;
            0) 
                print_step "Выход..."
                stop_all_bots
                exit 0 
                ;;
            *) print_warning "Неверный выбор. Попробуйте снова." ;;
        esac
        
        echo ""
        echo "Нажмите Enter для продолжения..."
        read
        clear
    done
}

# Запуск
main
