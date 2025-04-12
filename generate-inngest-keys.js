const crypto = require('crypto')
const fs = require('fs')

// Генерируем новые ключи для Inngest
const generateKey = (prefix, length = 64) => {
  const randomBytes = crypto.randomBytes(length)
  const base64 = randomBytes.toString('base64')
  // Заменяем символы, которые могут вызвать проблемы в URL
  const urlSafe = base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `${prefix}_${urlSafe}`
}

// Генерируем ключи
const eventKey = generateKey('key')
const signingKey = generateKey('signkey-prod')

// Выводим сгенерированные ключи
console.log('Новые ключи для Inngest:')
console.log(`INNGEST_EVENT_KEY=${eventKey}`)
console.log(`INNGEST_SIGNING_KEY=${signingKey}`)

// Создаем/обновляем файл .env.new с новыми ключами
const updateEnvFile = (filePath, newKeys) => {
  try {
    // Проверяем существование файла
    if (!fs.existsSync(filePath)) {
      // Если файл не существует, создаем новый с базовыми настройками
      const baseConfig = `
# Inngest configuration
INNGEST_EVENT_KEY=${newKeys.eventKey}
INNGEST_SIGNING_KEY=${newKeys.signingKey}
INNGEST_URL=https://api.inngest.com
INNGEST_BASE_URL=https://api.inngest.com
INNGEST_DEV=0
`
      fs.writeFileSync(filePath, baseConfig.trim())
      console.log(`✅ Создан новый файл ${filePath} с настройками Inngest`)
      return
    }

    // Если файл существует, читаем его содержимое
    let envContent = fs.readFileSync(filePath, 'utf8')

    // Заменяем или добавляем ключи
    if (envContent.includes('INNGEST_EVENT_KEY=')) {
      // Заменяем существующий ключ
      envContent = envContent.replace(
        /INNGEST_EVENT_KEY=.*$/m,
        `INNGEST_EVENT_KEY=${newKeys.eventKey}`
      )
    } else {
      // Добавляем новый ключ
      envContent += `\nINNGEST_EVENT_KEY=${newKeys.eventKey}`
    }

    if (envContent.includes('INNGEST_SIGNING_KEY=')) {
      // Заменяем существующий ключ
      envContent = envContent.replace(
        /INNGEST_SIGNING_KEY=.*$/m,
        `INNGEST_SIGNING_KEY=${newKeys.signingKey}`
      )
    } else {
      // Добавляем новый ключ
      envContent += `\nINNGEST_SIGNING_KEY=${newKeys.signingKey}`
    }

    // Убеждаемся, что режим разработки отключен
    if (envContent.includes('INNGEST_DEV=')) {
      envContent = envContent.replace(/INNGEST_DEV=.*$/m, 'INNGEST_DEV=0')
    } else {
      envContent += '\nINNGEST_DEV=0'
    }

    // Убеждаемся, что URL настроен правильно
    if (envContent.includes('INNGEST_URL=')) {
      envContent = envContent.replace(
        /INNGEST_URL=.*$/m,
        'INNGEST_URL=https://api.inngest.com'
      )
    } else {
      envContent += '\nINNGEST_URL=https://api.inngest.com'
    }

    if (envContent.includes('INNGEST_BASE_URL=')) {
      envContent = envContent.replace(
        /INNGEST_BASE_URL=.*$/m,
        'INNGEST_BASE_URL=https://api.inngest.com'
      )
    } else {
      envContent += '\nINNGEST_BASE_URL=https://api.inngest.com'
    }

    // Записываем обновленное содержимое в новый файл
    fs.writeFileSync(filePath, envContent)
    console.log(`✅ Файл ${filePath} обновлен с новыми ключами Inngest`)
  } catch (error) {
    console.error(`❌ Ошибка при обновлении файла ${filePath}:`, error.message)
  }
}

// Обновляем .env.new с новыми ключами
updateEnvFile('.env.new', { eventKey, signingKey })

console.log('\n⚠️ Важно:')
console.log(
  '1. Теперь вам нужно зарегистрировать эти ключи в Inngest Dashboard'
)
console.log('2. Создайте новое приложение и используйте эти ключи')
console.log(
  '3. После подтверждения работоспособности замените .env файл на .env.new'
)
console.log(
  '4. Перезапустите сервис: docker-compose down && docker-compose up -d'
)
