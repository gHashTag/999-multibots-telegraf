#!/bin/bash

echo "=== Настройка безопасного хранения токенов Telegram бота ==="

# Создаем директорию для хранения токенов, если ее нет
TOKENS_DIR="/root/.telegram_tokens"
mkdir -p "$TOKENS_DIR"

# Создаем .env файл для хранения токенов
ENV_FILE="$TOKENS_DIR/.env"

# Запрашиваем токены, если файл еще не существует
if [ ! -f "$ENV_FILE" ]; then
  echo "🔑 Создаем новый файл с токенами..."
  
  # Используем текущие значения или запрашиваем новые
  read -p "Введите токен Telegram бота: " TELEGRAM_BOT_TOKEN
  read -p "Введите ID чата администратора: " TELEGRAM_ADMIN_CHAT_ID
  read -p "Введите ID чата для пульса (@neuro_blogger_pulse): " TELEGRAM_PULSE_CHAT_ID
  
  # Записываем токены в .env файл
  cat > "$ENV_FILE" << EOF
# Токены для Telegram бота
# Создано: $(date "+%Y-%m-%d %H:%M:%S")
# НЕ ДОБАВЛЯЙТЕ ЭТОТ ФАЙЛ В GIT!

export TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN"
export TELEGRAM_ADMIN_CHAT_ID="$TELEGRAM_ADMIN_CHAT_ID"
export TELEGRAM_PULSE_CHAT_ID="$TELEGRAM_PULSE_CHAT_ID"
EOF

else
  echo "🔄 Файл токенов уже существует в $ENV_FILE"
fi

# Устанавливаем правильные разрешения для файла с токенами
chmod 600 "$ENV_FILE"
echo "🔒 Установлены безопасные разрешения для файла с токенами"

# Обновляем все скрипты, чтобы они использовали .env файл
update_script() {
  local script_path="$1"
  local script_name=$(basename "$script_path")
  
  echo "📝 Обновление скрипта $script_name..."
  
  # Удаляем строки, где токены жестко закодированы
  sed -i '/TELEGRAM_BOT_TOKEN=/d' "$script_path"
  sed -i '/TELEGRAM_ADMIN_CHAT_ID=/d' "$script_path"
  sed -i '/TELEGRAM_PULSE_CHAT_ID=/d' "$script_path"
  
  # Добавляем строку для загрузки переменных из .env файла в начало скрипта после shebang
  sed -i '2i # Загружаем токены из безопасного хранилища\nsource /root/.telegram_tokens/.env\n' "$script_path"
}

# Обновляем все скрипты
update_script "/root/test-pulse-messages.sh"
update_script "/root/admin-pulse-notify.sh"
update_script "/root/fix-test-logs.sh"

echo
echo "✅ Завершено! Все скрипты теперь загружают токены из безопасного хранилища"
echo "⚠️ Убедитесь, что файл $ENV_FILE добавлен в .gitignore" 