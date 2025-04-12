#!/bin/bash

# Скрипт для исправления форматирования сообщений в Telegram
# Этот скрипт помогает отправлять сообщения с правильным форматированием HTML

# Цветовые коды для вывода сообщений
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Путь к файлу с токенами
ENV_FILE="./.env"

# Проверка существования файла с токенами
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Ошибка: Файл $ENV_FILE не найден!${NC}"
    echo -e "Создайте файл с токенами в корне проекта или измените путь в скрипте."
    exit 1
fi

# Загрузка токенов из файла
source "$ENV_FILE"

# Проверка наличия токенов
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    echo -e "${RED}Ошибка: Переменная TELEGRAM_BOT_TOKEN не найдена в $ENV_FILE${NC}"
    exit 1
fi

# Функция для отправки форматированного сообщения
send_formatted_message() {
    local token="$1"
    local chat_id="$2"
    local message="$3"
    
    # Отправка сообщения с HTML форматированием
    curl -s -X POST "https://api.telegram.org/bot$token/sendMessage" \
        -d "chat_id=$chat_id" \
        -d "text=$message" \
        -d "parse_mode=HTML" > /dev/null
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Сообщение успешно отправлено!${NC}"
    else
        echo -e "${RED}Ошибка при отправке сообщения!${NC}"
    fi
}

# Пример использования для уведомления админа
admin_message="<b>Важное уведомление!</b>

Обнаружена <i>ошибка</i> в системе:
<code>Error: Unable to connect to database</code>

Пожалуйста, проверьте журналы для получения дополнительной информации."

# Пример использования для обновления канала
channel_message="<b>Новое обновление системы!</b>

Мы рады сообщить о выпуске новой версии с улучшениями:
• Исправлено форматирование текста
• Добавлена поддержка HTML тегов
• Улучшена производительность

<i>Спасибо за использование нашего сервиса!</i>"

# Функция для обновления существующих скриптов
update_script() {
    local script_path="$1"
    
    if [ ! -f "$script_path" ]; then
        echo -e "${RED}Ошибка: Файл $script_path не найден!${NC}"
        return 1
    fi
    
    # Проверка наличия функции в скрипте
    if ! grep -q "send_formatted_message" "$script_path"; then
        # Добавление функции перед первым вызовом curl
        sed -i '/curl.*sendMessage/i\
# Функция для отправки форматированного сообщения\
send_formatted_message() {\
    local token="$1"\
    local chat_id="$2"\
    local message="$3"\
    \
    # Отправка сообщения с HTML форматированием\
    curl -s -X POST "https://api.telegram.org/bot$token/sendMessage" \\\
        -d "chat_id=$chat_id" \\\
        -d "text=$message" \\\
        -d "parse_mode=HTML" > /dev/null\
}\
' "$script_path"
        
        echo -e "${GREEN}Функция send_formatted_message добавлена в скрипт $script_path${NC}"
    fi
    
    # Замена прямых вызовов API на вызовы функции
    sed -i 's/curl -s -X POST "https:\/\/api.telegram.org\/bot\$\([^\/]*\)\/sendMessage" \\s*-d "chat_id=\([^"]*\)" \\s*-d "text=\([^"]*\)"/send_formatted_message "$\1" "\2" "\3"/g' "$script_path"
    
    echo -e "${GREEN}Скрипт $script_path обновлен для использования форматированных сообщений${NC}"
}

# Примеры использования HTML форматирования в сообщениях:
# <b>Жирный текст</b>
# <i>Курсив</i>
# <code>Моноширинный текст для кода</code>
# <pre>Предварительно отформатированный текст</pre>
# <a href="https://example.com">Ссылка</a>
#
# Важно: для переноса строки используйте символ новой строки в самом тексте,
# а не \n, который будет отображаться как текст

echo -e "${YELLOW}Скрипт настроен и готов к использованию!${NC}"
echo -e "Используйте функцию send_formatted_message для отправки сообщений с правильным форматированием."

# Делаем скрипт исполняемым
chmod +x "$(realpath $0)"

echo -e "${GREEN}Скрипт настроен и готов к использованию!${NC}" 