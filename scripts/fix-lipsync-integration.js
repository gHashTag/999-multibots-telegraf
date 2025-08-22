#!/usr/bin/env node

/**
 * Скрипт исправления интеграции Lipsync
 * Исправляет найденные проблемы и настраивает рабочую среду
 */

const fs = require('fs')
const path = require('path')

console.log('🛠️ === ИСПРАВЛЕНИЕ ИНТЕГРАЦИИ LIPSYNC ===\n')

// 1. Создание .env файла с примерами
console.log('1️⃣ Создание файла .env с примерами...')

const envTemplate = `# === ОСНОВНЫЕ НАСТРОЙКИ ПРИЛОЖЕНИЯ ===
NODE_ENV=development

# === TELEGRAM BOT TOKENS ===
# Основной токен бота (обязательно)
BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN_HERE

# Дополнительные токены ботов (через запятую, опционально)
BOT_TOKENS=

# === REPLICATE API (КРИТИЧНО ДЛЯ LIPSYNC) ===
# Получить токен на https://replicate.com/account/api-tokens
REPLICATE_API_TOKEN=YOUR_REPLICATE_API_TOKEN_HERE

# === SUPABASE НАСТРОЙКИ (КРИТИЧНО ДЛЯ БАЗЫ ДАННЫХ) ===
# URL вашего Supabase проекта
SUPABASE_URL=https://your-project.supabase.co

# Anon ключ Supabase
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY_HERE

# Service Role ключ (для админских операций)
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE

# === ДОПОЛНИТЕЛЬНЫЕ API КЛЮЧИ ===
# OpenAI API ключ
OPENAI_API_KEY=YOUR_OPENAI_API_KEY_HERE

# ElevenLabs API ключ (для голосов)
ELEVENLABS_API_KEY=YOUR_ELEVENLABS_API_KEY_HERE

# === WEBHOOK НАСТРОЙКИ ===
WEBHOOK_ENABLED=false
WEBHOOK_DOMAIN=
WEBHOOK_PATH=/webhook
WEBHOOK_PORT=3000

# === НАСТРОЙКИ БЕЗОПАСНОСТИ ===
SECRET_KEY=your-secret-key-here

# === ЛОГИРОВАНИЕ ===
LOG_LEVEL=info
`

const envPath = path.join(process.cwd(), '.env')
const envExamplePath = path.join(process.cwd(), '.env.example')

try {
  // Создаем .env.example в любом случае
  fs.writeFileSync(envExamplePath, envTemplate)
  console.log('   ✅ Создан файл .env.example')

  // Создаем .env только если он не существует
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, envTemplate)
    console.log('   ✅ Создан файл .env')
    console.log('   ⚠️ ВАЖНО: Заполните реальные значения в .env файле')
  } else {
    console.log('   ✅ Файл .env уже существует (не перезаписан)')
  }
} catch (error) {
  console.log(`   ❌ Ошибка создания .env файлов: ${error.message}`)
}

// 2. Проверка и создание папки config
console.log('\n2️⃣ Проверка структуры конфигурации...')

const configDir = path.join(process.cwd(), 'config')
if (!fs.existsSync(configDir)) {
  try {
    fs.mkdirSync(configDir, { recursive: true })
    console.log('   ✅ Создана папка config/')
  } catch (error) {
    console.log(`   ❌ Ошибка создания папки config: ${error.message}`)
  }
} else {
  console.log('   ✅ Папка config/ существует')
}

// 3. Создание конфигурации для ботов
console.log('\n3️⃣ Создание конфигурации ботов...')

const botsConfig = {
  "bots": [
    {
      "name": "main_bot",
      "description": "Основной бот с LipSync функциональностью",
      "enabled": true,
      "features": [
        "lipsync",
        "image_generation",
        "video_generation",
        "voice_generation"
      ]
    }
  ],
  "lipsync": {
    "enabled": true,
    "models": [
      {
        "id": "kling",
        "name": "Kling LipSync",
        "provider": "replicate",
        "modelId": "kwaivgi/kling-lip-sync",
        "isDefault": true
      },
      {
        "id": "sync_v2",
        "name": "Sync LipSync-2", 
        "provider": "sync",
        "modelId": "sync/lipsync-2",
        "isDefault": false
      }
    ]
  }
}

const botsConfigPath = path.join(configDir, 'bots.json')
try {
  if (!fs.existsSync(botsConfigPath)) {
    fs.writeFileSync(botsConfigPath, JSON.stringify(botsConfig, null, 2))
    console.log('   ✅ Создан файл config/bots.json')
  } else {
    console.log('   ✅ Файл config/bots.json уже существует')
  }
} catch (error) {
  console.log(`   ❌ Ошибка создания config/bots.json: ${error.message}`)
}

// 4. Создание скрипта для тестирования API
console.log('\n4️⃣ Создание скрипта тестирования API...')

const testApiScript = `#!/usr/bin/env node

/**
 * Тест API подключений для LipSync
 */

require('dotenv').config()

async function testReplicateConnection() {
  console.log('🔍 Тестирование Replicate API...')
  
  if (!process.env.REPLICATE_API_TOKEN) {
    console.log('❌ REPLICATE_API_TOKEN не установлен')
    return false
  }
  
  try {
    const response = await fetch('https://api.replicate.com/v1/models', {
      headers: {
        'Authorization': \`Token \${process.env.REPLICATE_API_TOKEN}\`,
        'Content-Type': 'application/json'
      }
    })
    
    if (response.ok) {
      console.log('✅ Replicate API подключение успешно')
      return true
    } else {
      console.log(\`❌ Replicate API ошибка: \${response.status} - \${response.statusText}\`)
      return false
    }
  } catch (error) {
    console.log(\`❌ Ошибка подключения к Replicate: \${error.message}\`)
    return false
  }
}

async function testSupabaseConnection() {
  console.log('🔍 Тестирование Supabase подключения...')
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.log('❌ SUPABASE_URL или SUPABASE_ANON_KEY не установлены')
    return false
  }
  
  try {
    const response = await fetch(\`\${process.env.SUPABASE_URL}/rest/v1/\`, {
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': \`Bearer \${process.env.SUPABASE_ANON_KEY}\`
      }
    })
    
    if (response.ok || response.status === 200) {
      console.log('✅ Supabase подключение успешно')
      return true
    } else {
      console.log(\`❌ Supabase ошибка: \${response.status} - \${response.statusText}\`)
      return false
    }
  } catch (error) {
    console.log(\`❌ Ошибка подключения к Supabase: \${error.message}\`)
    return false
  }
}

async function runTests() {
  console.log('🧪 === ТЕСТИРОВАНИЕ API ПОДКЛЮЧЕНИЙ ===\\n')
  
  const replicateOk = await testReplicateConnection()
  const supabaseOk = await testSupabaseConnection()
  
  console.log('\\n📋 === РЕЗУЛЬТАТЫ ===')
  
  if (replicateOk && supabaseOk) {
    console.log('🟢 ВСЕ API ПОДКЛЮЧЕНИЯ РАБОТАЮТ')
    console.log('✅ LipSync готов к использованию!')
  } else {
    console.log('🔴 НЕКОТОРЫЕ API НЕ РАБОТАЮТ')
    if (!replicateOk) {
      console.log('❌ Проверьте REPLICATE_API_TOKEN')
    }
    if (!supabaseOk) {
      console.log('❌ Проверьте SUPABASE_URL и SUPABASE_ANON_KEY')
    }
  }
}

runTests().catch(console.error)
`

const testApiPath = path.join(process.cwd(), 'scripts', 'test-api-connections.js')
try {
  fs.writeFileSync(testApiPath, testApiScript)
  fs.chmodSync(testApiPath, '755') // Делаем исполняемым
  console.log('   ✅ Создан скрипт scripts/test-api-connections.js')
} catch (error) {
  console.log(`   ❌ Ошибка создания test-api-connections.js: ${error.message}`)
}

// 5. Создание инструкции по настройке
console.log('\n5️⃣ Создание инструкции по настройке...')

const setupGuide = `# 🛠️ Руководство по настройке LipSync

## 📋 Диагностика завершена!

### ✅ ЧТО ИСПРАВЛЕНО:
- Создан файл .env с примерами переменных
- Создана структура конфигурации
- Добавлены скрипты тестирования
- Настроена файловая структура

### 🔴 ЧТО НУЖНО СДЕЛАТЬ ВРУЧНУЮ:

#### 1. Настроить переменные окружения
Откройте файл \`.env\` и заполните реальные значения:

\`\`\`bash
# Получить на https://replicate.com/account/api-tokens
REPLICATE_API_TOKEN=r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Настройки Supabase проекта
SUPABASE_URL=https://ваш-проект.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Токен Telegram бота
BOT_TOKEN=1234567890:AAHdqTcvbXYZKlmnOpqRSTuvwxYz123456789
\`\`\`

#### 2. Протестировать подключения
\`\`\`bash
node scripts/test-api-connections.js
\`\`\`

#### 3. Запустить бота для тестирования
\`\`\`bash
npm start
\`\`\`

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

1. Запустите бота: \`npm start\`
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
1. Запустите диагностику: \`node scripts/test-lipsync-diagnosis.js\`
2. Проверьте логи бота
3. Убедитесь что все зависимости установлены: \`npm install\`

## ✨ Готово! LipSync должен работать после заполнения .env файла.
`

const guideePath = path.join(process.cwd(), 'LIPSYNC_SETUP_GUIDE.md')
try {
  fs.writeFileSync(guideePath, setupGuide)
  console.log('   ✅ Создано руководство LIPSYNC_SETUP_GUIDE.md')
} catch (error) {
  console.log(`   ❌ Ошибка создания руководства: ${error.message}`)
}

// 6. Финальная проверка
console.log('\n6️⃣ Финальная проверка...')

const checkFiles = [
  '.env',
  '.env.example', 
  'config/bots.json',
  'scripts/test-api-connections.js',
  'LIPSYNC_SETUP_GUIDE.md'
]

checkFiles.forEach(file => {
  const filePath = path.join(process.cwd(), file)
  if (fs.existsSync(filePath)) {
    console.log(`   ✅ ${file}`)
  } else {
    console.log(`   ❌ ${file}`)
  }
})

// Итоговый отчет
console.log('\n📋 === ИТОГОВЫЙ ОТЧЁТ ===')
console.log('🟢 ИСПРАВЛЕНИЕ ЗАВЕРШЕНО!')
console.log('')
console.log('📝 ЧТО СДЕЛАНО:')
console.log('   ✅ Создана структура конфигурации')
console.log('   ✅ Добавлены файлы переменных окружения')
console.log('   ✅ Созданы скрипты тестирования')
console.log('   ✅ Создано подробное руководство')
console.log('')
console.log('🎯 СЛЕДУЮЩИЕ ШАГИ:')
console.log('   1. Откройте файл .env')
console.log('   2. Заполните реальные API токены')
console.log('   3. Запустите: node scripts/test-api-connections.js')
console.log('   4. Запустите бота: npm start')
console.log('')
console.log('📖 Подробные инструкции в файле: LIPSYNC_SETUP_GUIDE.md')
console.log('')
console.log('✨ LipSync готов к работе после настройки токенов!')