#!/bin/bash

# Создаем резервную копию директории src
BACKUP_DIR="backup_src_type_imports_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
echo "Создание резервной копии в директории $BACKUP_DIR..."
cp -r src "$BACKUP_DIR/"
cp -r __tests__ "$BACKUP_DIR/"
echo "Резервная копия создана успешно!"

# Функция для замены импортов типов на type imports
fix_type_imports() {
  echo "Обрабатываю $1..."
  
  # Замена импортов из telegraf
  sed -i '' -E 's/import \{ (.*)(Context|Markup|Composer|Telegraf|Scene|Update|Message|User|Chat)([^}]*) \} from '\''telegraf'\''/import type { \1\2\3 } from '\''telegraf'\''/g' "$1"
  
  # Замена импортов из @telegraf/types
  sed -i '' -E 's/import \{ (.*)(Message|User|Update|UserFromGetMe|Chat)([^}]*) \} from '\''@telegraf\/types'\''/import type { \1\2\3 } from '\''@telegraf\/types'\''/g' "$1"
  
  # Замена импортов интерфейсных типов
  sed -i '' -E 's/import \{ (.*)(MyContext|User|CreateUserData|TelegramId|Subscription|Payment|PaymentType|SubscriptionType|ModelTraining|UserType|CostDetails|CostCalculationParams|CostCalculationResult|BalanceOperationResult)([^}]*) \} from '\''@\/interfaces([^'\'']*)'\''/import type { \1\2\3 } from '\''@\/interfaces\4'\''/g' "$1"
  
  # Замена импорта Mocked из vitest
  sed -i '' -E 's/import \{ (.*)(Mocked)([^}]*) \} from '\''vitest'\''/import { \1 } from '\''vitest'\''\nimport type { Mocked } from '\''vitest'\''/g' "$1"
  
  # Замена импортов типов из axios
  sed -i '' -E 's/import axios, \{ (.*)(AxiosRequestConfig|AxiosResponse)([^}]*) \} from '\''axios'\''/import axios\nimport type { \1\2\3 } from '\''axios'\''/g' "$1"
  
  # Замена импортов InlineKeyboardButton, ReplyKeyboardMarkup, InlineKeyboardMarkup
  sed -i '' -E 's/import \{ (.*)(InlineKeyboardButton|ReplyKeyboardMarkup|InlineKeyboardMarkup)([^}]*) \} from '\''telegraf\/types'\''/import type { \1\2\3 } from '\''telegraf\/types'\''/g' "$1"
  
  # Исправление импорта Telegraf из type в value
  sed -i '' -E 's/import type \{ (.*)(Composer|Telegraf)([^}]*) \} from '\''telegraf'\''/import { \1\2\3 } from '\''telegraf'\''/g' "$1"
  
  # Специальные исправления для src/store/index.ts
  if [[ "$1" == "src/store/index.ts" ]]; then
    # Заменить импорт SubscriptionType
    sed -i '' 's/import { SubscriptionType } from '\''@\/interfaces'\''/import { SubscriptionType } from '\''@\/interfaces\/subscription.interface'\''/g' "$1"
  fi
  
  # Исправление для src/bot.ts
  if [[ "$1" == "src/bot.ts" ]]; then
    # Заменить импорт Telegraf и Composer
    sed -i '' 's/import type { Composer, Telegraf, Scenes, Context } from '\''telegraf'\''/import { Composer, Telegraf } from '\''telegraf'\''\nimport type { Scenes, Context } from '\''telegraf'\''/g' "$1"
  fi
}

# Обработка всех TypeScript файлов в src и __tests__
find src __tests__ -type f -name "*.ts" | while read file; do
  fix_type_imports "$file"
done

echo "Импорты типов исправлены!"
echo "Чтобы проверить изменения, выполните: pnpm typecheck"
echo "В случае проблем вы можете восстановить резервную копию из директории $BACKUP_DIR" 