// Скрипт для генерации нового ключа Inngest
require('dotenv').config()
const crypto = require('crypto')

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

console.log(`${colors.blue}🔑 Генерация нового ключа Inngest${colors.reset}\n`)

// Проверим текущий ключ
const currentKey = process.env.INNGEST_EVENT_KEY
console.log(
  `${colors.cyan}Текущий ключ:${colors.reset} ${currentKey ? `${currentKey.substring(0, 5)}...${currentKey.substring(currentKey.length - 5)}` : 'не задан'}`
)

// Функция для генерации нового ключа
function generateNewKey() {
  // Генерируем случайную строку длиной 64 символа (как в оригинальном ключе)
  const randomBytes = crypto.randomBytes(32)
  const newKey = randomBytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  return newKey
}

// Генерируем ключ
const newKey = generateNewKey()
console.log(`\n${colors.green}✓ Новый ключ сгенерирован!${colors.reset}`)
console.log(`${colors.cyan}Новый ключ:${colors.reset} ${newKey}`)

// Инструкции
console.log(`\n${colors.yellow}Инструкции по обновлению ключа:${colors.reset}`)
console.log(`1. Посетите панель управления Inngest (https://app.inngest.com)`)
console.log(
  `2. Создайте новый API-ключ в настройках приложения "neuro-blogger-2.0"`
)
console.log(
  `3. Обновите файл .env на сервере, установив новое значение для INNGEST_EVENT_KEY`
)
console.log(`4. Перезапустите контейнер Docker`)

console.log(
  `\n${colors.cyan}Команды для обновления ключа на сервере:${colors.reset}`
)
console.log(`ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app`)
console.log(`cd /opt/app/999-multibots-telegraf`)
console.log(
  `sed -i 's/INNGEST_EVENT_KEY=.*/INNGEST_EVENT_KEY=${newKey}/g' .env`
)
console.log(`docker-compose down`)
console.log(`docker-compose up --build -d`)

// Экспортируем ключ для копирования
console.log(`\n${colors.green}Ключ для копирования:${colors.reset}`)
console.log(newKey)
