#!/usr/bin/env node

// Импортируем необходимые модули
require('dotenv').config() // Для загрузки переменных из .env
const crypto = require('crypto') // Для вычисления хешей

console.log('Вычисление хешей токенов ботов для Nginx map...')

const mapping = {}
let port = 3001 // Начальный порт

for (let i = 1; i <= 7; i++) {
  const tokenEnvVar = `BOT_TOKEN_${i}`
  const token = process.env[tokenEnvVar]

  if (token) {
    // Вычисляем SHA256 хеш токена
    const hash = crypto.createHash('sha256').update(token).digest('hex')
    const webhookPath = `/telegraf/${hash}`
    mapping[webhookPath] = port
    console.log(`- Порт ${port} (${tokenEnvVar}): Вебхук ${webhookPath}`)
  } else {
    console.warn(
      `⚠️ Предупреждение: Токен ${tokenEnvVar} не найден в .env файле.`
    )
  }
  port++ // Переходим к следующему порту
}

console.log('\n--- Nginx Map Block ---')
console.log('map $request_uri $target_port {')
for (const path in mapping) {
  console.log(`    ${path}   ${mapping[path]};`)
}
console.log(
  '    default                3001; # Fallback port (можно изменить на 404 или другой)'
)
console.log('}')
console.log('-----------------------')
console.log(
  '\nСкопируйте блок "Nginx Map Block" и вставьте его в ваш nginx.conf (внутри http { ... } блока, но вне server { ... } блока).'
)
console.log(
  'Затем обновите блок location /telegraf/ в server { ... } для использования $target_port.'
)
