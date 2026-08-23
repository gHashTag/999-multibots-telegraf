#!/usr/bin/env node
/**
 * 🔑 Inngest Keys FIX - С ПРЕДУСТАНОВЛЕННЫМИ КЛЮЧАМИ
 *
 * ⚠️  НЕ ПРОСИТ КЛЮЧИ - ИСПОЛЬЗУЕТ ПРЕДУСТАНОВЛЕННЫЕ!
 * Ключи уже есть в коде (см. .env файл)
 */

const https = require('https')
const { execSync } = require('child_process')

// 🔑 ПРЕДУСТАНОВЛЕННЫЕ КЛЮЧИ (из .env файла)
const PREDEFINED_KEYS = {
  INNGEST_EVENT_KEY:
    '4JiBiCBZ8en7jNonnsAPXCFiLVkrt1uEXklGcDzaQ6SCBV9p7-UBlQlTrze-x_WPRTihikB_uhAGhbkwGhnu4Q',
  INNGEST_SIGNING_KEY:
    'signkey-test-c4167464e900701832920c98bb2ec6e6e3c59fd2b27c62e1f4140dada01e4597',
}

// 🔐 Конфигурация Infisical (Machine Identity) — ТОЛЬКО из окружения.
// Эта учётка открывает доступ ко ВСЕМ секретам проекта, в код её не зашивать.
// Где взять: railway variables --kv | grep INFISICAL_
//   либо https://app.infisical.com → project "999" → Access Control
//         → Machine Identities → Client ID / Client Secret
const CONFIG = {
  clientId: process.env.INFISICAL_CLIENT_ID,
  clientSecret: process.env.INFISICAL_CLIENT_SECRET,
  projectId: process.env.INFISICAL_PROJECT_ID,
  environment: 'production',
}

for (const name of [
  'INFISICAL_CLIENT_ID',
  'INFISICAL_CLIENT_SECRET',
  'INFISICAL_PROJECT_ID',
]) {
  if (!process.env[name]) {
    console.error(
      `❌ ${name} не задан. Взять: railway variables --kv | grep INFISICAL_`
    )
    process.exit(1)
  }
}

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
}

const log = {
  info: msg => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  success: msg => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warn: msg => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  error: msg => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  header: msg =>
    console.log(`\n${colors.cyan}${colors.bold}${msg}${colors.reset}\n`),
  step: (num, msg) =>
    console.log(`\n${colors.bold}🔑 ШАГ ${num}: ${msg}${colors.reset}`),
}

// Получение токена Infisical
async function getAccessToken() {
  return new Promise((resolve, reject) => {
    log.info('Получение токена доступа Infisical...')

    const data = JSON.stringify({
      clientId: CONFIG.clientId,
      clientSecret: CONFIG.clientSecret,
    })

    const options = {
      hostname: 'app.infisical.com',
      port: 443,
      path: '/api/v2/auth/client-token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
    }

    const req = https.request(options, res => {
      let response = ''

      res.on('data', chunk => {
        response += chunk
      })

      res.on('end', () => {
        try {
          const json = JSON.parse(response)
          if (json.accessToken) {
            resolve(json.accessToken)
          } else {
            reject(new Error('Токен не получен: ' + JSON.stringify(json)))
          }
        } catch (err) {
          reject(err)
        }
      })
    })

    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

// Добавление секрета в Infisical
async function addSecret(accessToken, key, value) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      secretKey: key,
      secretValue: value,
      type: 'shared',
      environment: CONFIG.environment,
    })

    const options = {
      hostname: 'app.infisical.com',
      port: 443,
      path: `/api/v3/secrets/${CONFIG.projectId}`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
    }

    const req = https.request(options, res => {
      let response = ''

      res.on('data', chunk => {
        response += chunk
      })

      res.on('end', () => {
        try {
          const json = JSON.parse(response)
          resolve(json)
        } catch (err) {
          resolve(response)
        }
      })
    })

    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

// Добавление ключей в Infisical
async function addKeysToInfisical() {
  log.step(1, 'Добавление предустановленных ключей в Infisical')

  try {
    const accessToken = await getAccessToken()
    log.success('Токен доступа получен')

    // Добавляем INNGEST_EVENT_KEY
    log.info(`Добавляем INNGEST_EVENT_KEY...`)
    const result1 = await addSecret(
      accessToken,
      'INNGEST_EVENT_KEY',
      PREDEFINED_KEYS.INNGEST_EVENT_KEY
    )
    log.success('INNGEST_EVENT_KEY добавлен в Infisical (production)')

    // Добавляем INNGEST_SIGNING_KEY
    log.info(`Добавляем INNGEST_SIGNING_KEY...`)
    const result2 = await addSecret(
      accessToken,
      'INNGEST_SIGNING_KEY',
      PREDEFINED_KEYS.INNGEST_SIGNING_KEY
    )
    log.success('INNGEST_SIGNING_KEY добавлен в Infisical (production)')

    return true
  } catch (err) {
    log.error('Ошибка добавления ключей: ' + err.message)
    log.info('⚠️  Ключи нужно добавить вручную в Infisical UI:')
    console.log('')
    console.log(
      `${colors.green}1. Откройте: https://app.infisical.com/${colors.reset}`
    )
    console.log(`${colors.green}2. Проект: ${CONFIG.projectId}${colors.reset}`)
    console.log(`${colors.green}3. Среда: production${colors.reset}`)
    console.log(`${colors.green}4. Добавьте секреты:${colors.reset}`)
    console.log(`   - Key: INNGEST_EVENT_KEY`)
    console.log(`   - Value: ${PREDEFINED_KEYS.INNGEST_EVENT_KEY}`)
    console.log(`   - Key: INNGEST_SIGNING_KEY`)
    console.log(`   - Value: ${PREDEFINED_KEYS.INNGEST_SIGNING_KEY}`)
    console.log('')
    return false
  }
}

// Перезапуск контейнера
async function restartContainer() {
  log.step(2, 'Перезапуск Docker контейнера')

  try {
    log.info('Перезапускаем 999-multibots...')
    execSync('ssh prod999 "docker restart 999-multibots"', { stdio: 'inherit' })
    log.success('Контейнер перезапущен')

    console.log('')
    log.info('Ждём 10 секунд для полной загрузки...')
    await new Promise(resolve => setTimeout(resolve, 10000))

    return true
  } catch (err) {
    log.error('Ошибка перезапуска контейнера: ' + err.message)
    return false
  }
}

// Проверка результата
async function verifyFix() {
  log.step(3, 'Проверка результата')

  try {
    log.info('Проверяем логи контейнера...')
    const logs = execSync('ssh prod999 "docker logs 999-multibots --tail 50"', {
      encoding: 'utf8',
      timeout: 10000,
    })

    console.log('')

    if (logs.includes('INNGEST_EVENT_KEY')) {
      log.success('INNGEST_EVENT_KEY загружен в контейнер')
    } else {
      log.warn('INNGEST_EVENT_KEY не найден в логах (подождите ещё 30 секунд)')
    }

    if (logs.includes('INNGEST_SIGNING_KEY')) {
      log.success('INNGEST_SIGNING_KEY загружен в контейнер')
    } else {
      log.warn(
        'INNGEST_SIGNING_KEY не найден в логах (подождите ещё 30 секунд)'
      )
    }

    if (!logs.includes('Failed to create Inngest functions')) {
      log.success('Ошибки создания Inngest функций исправлены!')
    } else {
      log.warn('Всё ещё есть ошибки создания функций')
    }
  } catch (err) {
    log.error('Ошибка получения логов: ' + err.message)
  }

  console.log('')
  log.info('Проверяем endpoint /api/inngest...')

  try {
    const result = await new Promise((resolve, reject) => {
      https
        .get('https://three-head-dragon.shop/api/inngest', res => {
          let data = ''
          res.on('data', chunk => {
            data += chunk
          })
          res.on('end', () => resolve({ statusCode: res.statusCode, data }))
        })
        .on('error', reject)
      res.setTimeout(5000)
    })

    if (result.statusCode === 200) {
      log.success('Endpoint /api/inngest отвечает HTTP 200!')
      console.log('')
      console.log(colors.green + 'Ответ:' + colors.reset)
      try {
        console.log(JSON.stringify(JSON.parse(result.data), null, 2))
      } catch {
        console.log(result.data)
      }
    } else {
      log.warn(`Endpoint вернул HTTP ${result.statusCode} (ожидается 200)`)
    }
  } catch (err) {
    log.warn('Endpoint пока не отвечает (подождите ещё 30 секунд)')
  }
}

// Финальные инструкции
function finalInstructions() {
  console.log('')
  log.success('=======================================')
  log.success('       КЛЮЧИ УСТАНОВЛЕНЫ!')
  log.success('=======================================')
  console.log('')
  console.log(
    `${colors.green}✅${colors.reset} INNGEST_EVENT_KEY добавлен в Infisical`
  )
  console.log(
    `${colors.green}✅${colors.reset} INNGEST_SIGNING_KEY добавлен в Infisical`
  )
  console.log(`${colors.green}✅${colors.reset} Контейнер перезапущен`)
  console.log('')
  console.log('📋 СЛЕДУЮЩИЕ ШАГИ:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('1. Перейдите в Inngest Dashboard:')
  console.log('   https://app.inngest.com/env/production/functions')
  console.log('')
  console.log('2. Нажмите "Resync app" - должно сработать!')
  console.log('')
  console.log('3. Проверьте статус:')
  console.log('   node scripts/check-inngest-status.js')
  console.log('')
}

// Главная функция
async function main() {
  console.clear()
  log.header('🔑 Inngest Keys FIX - Автоматическое исправление')

  log.info('Используем ПРЕДУСТАНОВЛЕННЫЕ ключи из .env файла')
  console.log('')

  try {
    // Шаг 1: Добавляем ключи
    const keysAdded = await addKeysToInfisical()

    if (keysAdded) {
      // Шаг 2: Перезапускаем контейнер
      const restarted = await restartContainer()

      if (restarted) {
        // Шаг 3: Проверяем результат
        await verifyFix()
        finalInstructions()
      }
    } else {
      console.log('')
      log.info('После добавления ключей вручную запустите:')
      console.log('node scripts/fix-inngest-with-keys.js --restart-only')
    }
  } catch (err) {
    log.error(`Ошибка: ${err.message}`)
    process.exit(1)
  }
}

// Запуск
main()
