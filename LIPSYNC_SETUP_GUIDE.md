# 🛠️ Руководство по настройке LipSync

## 📋 Диагностика завершена!

### ✅ ЧТО ИСПРАВЛЕНО:
- Создан файл .env с примерами переменных
- Создана структура конфигурации
- Добавлены скрипты тестирования
- Настроена файловая структура

### 🔴 ЧТО НУЖНО СДЕЛАТЬ ВРУЧНУЮ:

#### 1. Настроить переменные окружения
Откройте файл `.env` и заполните реальные значения:

```bash
# Получить на https://replicate.com/account/api-tokens
REPLICATE_API_TOKEN=r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Настройки Supabase проекта
SUPABASE_URL=https://ваш-проект.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Токен Telegram бота
BOT_TOKEN=1234567890:AAHdqTcvbXYZKlmnOpqRSTuvwxYz123456789
```

#### 2. Протестировать подключения
```bash
node scripts/test-api-connections.js
```

#### 3. Запустить бота для тестирования
```bash
npm start
```

### 🎯 КАК ПОЛУЧИТЬ НЕОБХОДИМЫЕ ТОКЕНЫ:

#### Replicate API Token:
1. Перейдите на https://replicate.com
2. Зарегистрируйтесь/войдите в аккаунт
3. Перейдите в Account > API tokens
4. Создайте новый токен

#### Supabase настройки:
1. Перейдите на https://supabase.com
2. Создайте новый проект или используйте существующий
3. В настройках проекта найдите:
   - Project URL (SUPABASE_URL)
   - anon public key (SUPABASE_ANON_KEY)

#### Telegram Bot Token:
1. Напишите @BotFather в Telegram
2. Используйте команду /newbot
3. Следуйте инструкциям
4. Скопируйте полученный токен

### 🧪 ТЕСТИРОВАНИЕ LIPSYNC:

После настройки переменных:

1. Запустите бота: `npm start`
2. В Telegram найдите команду LipSync в меню
3. Отправьте видео с лицом
4. Отправьте аудио файл
5. Дождитесь результата

### 🚨 ВОЗМОЖНЫЕ ПРОБЛЕМЫ:

#### "REPLICATE_API_TOKEN is not set"
- Проверьте файл .env
- Убедитесь что токен правильный

#### "Supabase connection failed"
- Проверьте URL и ключи Supabase
- Убедитесь что проект активен

#### "Insufficient funds"
- У пользователя недостаточно звёзд в балансе
- Добавьте звёзды через /balance

### 📞 ДОПОЛНИТЕЛЬНАЯ ПОМОЩЬ:

Если проблемы остались:
1. Запустите диагностику: `node scripts/test-lipsync-diagnosis.js`
2. Проверьте логи бота
3. Убедитесь что все зависимости установлены: `npm install`

## ✨ Готово! LipSync должен работать после заполнения .env файла.
