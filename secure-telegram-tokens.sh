#!/bin/bash

# ⚠️ ВНИМАНИЕ: Этот скрипт содержит конфиденциальную информацию и НЕ должен быть добавлен в Git!
# Скрипт для безопасного хранения токенов Telegram
# Создает защищенный файл .env и добавляет шаблоны в .gitignore

# Цвета для вывода сообщений
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Утилита безопасного хранения токенов Telegram ===${NC}"

# Директория для хранения токенов (недоступна в Git)
TOKEN_DIR="/root/.telegram_tokens"
ENV_FILE="${TOKEN_DIR}/.env"
GITIGNORE_FILE="/opt/app/999-multibots-telegraf/.gitignore"

# Проверка и создание директории для токенов
if [ ! -d "$TOKEN_DIR" ]; then
  echo -e "${YELLOW}🔄 Создание защищенной директории для токенов: ${TOKEN_DIR}${NC}"
  mkdir -p "$TOKEN_DIR"
  chmod 700 "$TOKEN_DIR"  # Только владелец имеет доступ
  echo -e "${GREEN}✅ Директория создана с безопасными правами доступа${NC}"
else
  echo -e "${GREEN}✅ Директория для токенов уже существует: ${TOKEN_DIR}${NC}"
fi

# Функция для безопасного ввода токенов
read_token() {
  local prompt="$1"
  local var_name="$2"
  local current_value="$3"
  local new_value=""
  
  # Если значение уже существует, покажем часть для подтверждения
  if [ -n "$current_value" ]; then
    local masked_value="${current_value:0:4}...${current_value: -4}"
    read -p "${prompt} [текущее: ${masked_value}, нажмите Enter чтобы оставить]: " new_value
    if [ -z "$new_value" ]; then
      new_value="$current_value"
    fi
  else
    # Если значения нет, запрашиваем новое
    while [ -z "$new_value" ]; do
      read -p "${prompt}: " new_value
      if [ -z "$new_value" ]; then
        echo -e "${RED}⚠️ Значение не может быть пустым${NC}"
      fi
    done
  fi
  
  # Возвращаем значение
  echo "$new_value"
}

# Загрузка существующих токенов, если они есть
declare -A tokens
if [ -f "$ENV_FILE" ]; then
  echo -e "${YELLOW}🔄 Загрузка существующих токенов из ${ENV_FILE}${NC}"
  source "$ENV_FILE"
  tokens["TELEGRAM_BOT_TOKEN"]="$TELEGRAM_BOT_TOKEN"
  tokens["TELEGRAM_ADMIN_CHAT_ID"]="$TELEGRAM_ADMIN_CHAT_ID"
  tokens["TELEGRAM_PULSE_CHAT_ID"]="$TELEGRAM_PULSE_CHAT_ID"
else
  echo -e "${YELLOW}ℹ️ Файл с токенами не найден, будет создан новый: ${ENV_FILE}${NC}"
fi

# Запрос токенов у пользователя
echo -e "${YELLOW}🔄 Настройка токенов Telegram${NC}"
echo -e "${BLUE}ℹ️ Токены будут сохранены в защищенном файле ${ENV_FILE}${NC}"

tokens["TELEGRAM_BOT_TOKEN"]=$(read_token "Введите токен бота Telegram (из @BotFather)" "TELEGRAM_BOT_TOKEN" "${tokens["TELEGRAM_BOT_TOKEN"]}")
tokens["TELEGRAM_ADMIN_CHAT_ID"]=$(read_token "Введите ID чата администратора (для уведомлений)" "TELEGRAM_ADMIN_CHAT_ID" "${tokens["TELEGRAM_ADMIN_CHAT_ID"]}")
tokens["TELEGRAM_PULSE_CHAT_ID"]=$(read_token "Введите ID чата/канала @neuro_blogger_pulse" "TELEGRAM_PULSE_CHAT_ID" "${tokens["TELEGRAM_PULSE_CHAT_ID"]}")

# Сохранение токенов в защищенный файл
echo -e "${YELLOW}🔄 Сохранение токенов в ${ENV_FILE}${NC}"

# Создаем файл заново
cat > "$ENV_FILE" << EOT
# Токены Telegram - НЕ ДОБАВЛЯТЬ В GIT!
# Создано скриптом secure-telegram-tokens.sh: $(date)

# Токен бота
TELEGRAM_BOT_TOKEN="${tokens["TELEGRAM_BOT_TOKEN"]}"

# ID чата администратора для уведомлений
TELEGRAM_ADMIN_CHAT_ID="${tokens["TELEGRAM_ADMIN_CHAT_ID"]}"

# ID канала @neuro_blogger_pulse
TELEGRAM_PULSE_CHAT_ID="${tokens["TELEGRAM_PULSE_CHAT_ID"]}"
EOT

# Устанавливаем безопасные разрешения на файл
chmod 600 "$ENV_FILE"  # Только владелец имеет доступ на чтение/запись
echo -e "${GREEN}✅ Токены успешно сохранены в ${ENV_FILE} с безопасными правами доступа${NC}"

# Проверяем и обновляем .gitignore
echo -e "${YELLOW}🔄 Проверка и обновление .gitignore...${NC}"

# Шаблоны для добавления в .gitignore
gitignore_patterns=(
  "# Конфиденциальные данные"
  ".env"
  ".env.*"
  "secure-telegram-tokens.sh"
  "fix-telegram-format.sh"
)

if [ -f "$GITIGNORE_FILE" ]; then
  # Проверяем каждый шаблон и добавляем, если его нет
  for pattern in "${gitignore_patterns[@]}"; do
    if ! grep -q "^$pattern$" "$GITIGNORE_FILE"; then
      echo "$pattern" >> "$GITIGNORE_FILE"
      echo -e "${GREEN}✅ Добавлен шаблон в .gitignore: ${pattern}${NC}"
    fi
  done
else
  echo -e "${YELLOW}ℹ️ Файл .gitignore не найден, создаем новый${NC}"
  for pattern in "${gitignore_patterns[@]}"; do
    echo "$pattern" >> "$GITIGNORE_FILE"
  done
  echo -e "${GREEN}✅ Создан новый файл .gitignore с необходимыми шаблонами${NC}"
fi

# Отправляем тестовое сообщение для проверки токенов
echo -e "${YELLOW}🔄 Отправка тестового сообщения администратору для проверки токенов...${NC}"

# Формируем сообщение
BOT_TOKEN="${tokens["TELEGRAM_BOT_TOKEN"]}"
ADMIN_CHAT_ID="${tokens["TELEGRAM_ADMIN_CHAT_ID"]}"

test_message="<b>🔐 Безопасное хранение токенов настроено!</b>

<i>Сервер:</i> <code>$(hostname)</code>
<i>Дата:</i> <code>$(date)</code>

Токены сохранены в: <code>${ENV_FILE}</code>
Права доступа: <code>$(stat -c '%a' ${ENV_FILE})</code>

<b>✅ Если вы видите это сообщение, настройка прошла успешно!</b>

<i>Защищенные файлы:</i>
• <code>${ENV_FILE}</code>
• <code>secure-telegram-tokens.sh</code>
• <code>fix-telegram-format.sh</code>

<b>⚠️ Эти файлы добавлены в .gitignore и не будут отправлены в Git.</b>"

# Отправляем сообщение используя curl с HTML-форматированием
response=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
     -H "Content-Type: application/json" \
     -d "{\"chat_id\":\"${ADMIN_CHAT_ID}\",\"text\":\"${test_message}\",\"parse_mode\":\"HTML\"}")

# Проверяем, что сообщение отправилось успешно
if echo "$response" | grep -q '"ok":true'; then
  echo -e "${GREEN}✅ Тестовое сообщение успешно отправлено администратору${NC}"
  echo -e "${BLUE}ℹ️ Настройка безопасного хранения токенов Telegram завершена успешно!${NC}"
else
  echo -e "${RED}❌ Ошибка при отправке тестового сообщения: ${response}${NC}"
  echo -e "${YELLOW}ℹ️ Проверьте правильность введенных токенов${NC}"
fi

echo
echo -e "${GREEN}✅ Скрипт завершил работу${NC}"
echo -e "${YELLOW}ℹ️ Для использования токенов в скриптах:${NC}"
echo -e "${BLUE}source \"${ENV_FILE}\"${NC}"
echo
echo -e "${RED}⚠️ ВАЖНО: Никогда не добавляйте этот скрипт и файл ${ENV_FILE} в Git!${NC}" 