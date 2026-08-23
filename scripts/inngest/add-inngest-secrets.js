#!/usr/bin/env node
/**
 * 🔑 Добавляет Inngest ключи в Infisical используя SDK
 * Правильный паттерн с @infisical/sdk
 */

const { InfisicalSDK } = require('@infisical/sdk')

// Ключи
const KEYS = {
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
  siteUrl: process.env.INFISICAL_SITE_URL || 'https://app.infisical.com',
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
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
}

const log = {
  info: msg => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  success: msg => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warn: msg => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  error: msg => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  header: msg => console.log(`\n${colors.cyan}${msg}${colors.reset}\n`),
}

// Добавление секрета через SDK
async function addSecret(infisicalClient, key, value) {
  log.info(`Добавляем ${key}...`)

  try {
    const result = await infisicalClient.secrets().createSecret({
      projectId: CONFIG.projectId,
      environment: CONFIG.environment,
      secretPath: '/',
      secretName: key,
      secretValue: value,
      type: 'shared',
    })

    log.success(`${key} добавлен`)
    return result
  } catch (err) {
    log.error(`Ошибка добавления ${key}: ${err.message}`)
    throw err
  }
}

// Главная функция
async function main() {
  log.header('🔑 Добавление Inngest секретов в Infisical')

  let infisicalClient

  try {
    // 1. Создаем клиент
    log.info('Создаем Infisical SDK клиент...')
    infisicalClient = new InfisicalSDK({
      siteUrl: CONFIG.siteUrl,
    })
    log.success('Клиент создан')

    // 2. Авторизация
    log.info('Авторизация через Universal Auth...')
    await infisicalClient.auth().universalAuth.login({
      clientId: CONFIG.clientId,
      clientSecret: CONFIG.clientSecret,
    })
    log.success('Авторизация успешна')

    // 3. Добавляем INNGEST_EVENT_KEY
    log.info('')
    await addSecret(
      infisicalClient,
      'INNGEST_EVENT_KEY',
      KEYS.INNGEST_EVENT_KEY
    )

    // 4. Добавляем INNGEST_SIGNING_KEY
    await addSecret(
      infisicalClient,
      'INNGEST_SIGNING_KEY',
      KEYS.INNGEST_SIGNING_KEY
    )

    // 5. Успех!
    console.log('')
    log.success('=======================================')
    log.success('   КЛЮЧИ ДОБАВЛЕНЫ В INFISICAL!')
    log.success('=======================================')
    console.log('')
    log.success('Секреты добавлены в production окружение')
    console.log('')

    // 6. Спрашиваем про перезапуск
    const readline = require('readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    rl.question('Перезапустить контейнер? (y/n): ', async answer => {
      rl.close()

      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        log.info('Перезапускаем 999-multibots...')
        const { execSync } = require('child_process')

        try {
          execSync('ssh prod999 "docker restart 999-multibots"', {
            stdio: 'inherit',
          })
          log.success('✅ Контейнер перезапущен!')

          console.log('')
          log.info('⏳ Ждём 10 секунд для загрузки...')
          await new Promise(resolve => setTimeout(resolve, 10000))

          // Проверяем логи
          log.info('🔍 Проверяем логи контейнера...')
          const logs = execSync(
            'ssh prod999 "docker logs 999-multibots --tail 40"',
            { encoding: 'utf8', timeout: 10000 }
          )

          console.log('')

          if (logs.includes('INNGEST_EVENT_KEY')) {
            log.success('INNGEST_EVENT_KEY загружен в контейнер')
          } else {
            log.warn('INNGEST_EVENT_KEY не найден в логах')
          }

          if (logs.includes('INNGEST_SIGNING_KEY')) {
            log.success('INNGEST_SIGNING_KEY загружен в контейнер')
          } else {
            log.warn('INNGEST_SIGNING_KEY не найден в логах')
          }

          if (!logs.includes('Failed to create Inngest functions')) {
            log.success('Ошибки создания Inngest функций исправлены!')
          } else {
            log.warn('Всё ещё есть ошибки - проверьте ключи')
          }

          console.log('')
          log.success('🎉 ГОТОВО!')
          console.log('')
          console.log('📋 Теперь вы можете:')
          console.log('1. Открыть Inngest Dashboard:')
          console.log('   https://app.inngest.com/env/production/functions')
          console.log('')
          console.log('2. Нажать "Resync app" - должно сработать!')
          console.log('')
          console.log('🔗 Для проверки:')
          console.log('   node scripts/check-inngest-status.js')
          console.log('')
        } catch (err) {
          log.error('Ошибка перезапуска: ' + err.message)
        }
      } else {
        log.info('Пропускаем перезапуск. Выполните вручную:')
        console.log('  ssh prod999 "docker restart 999-multibots"')
      }
    })
  } catch (err) {
    console.log('')
    log.error('Критическая ошибка: ' + err.message)
    console.log('')
    log.info('Альтернативный способ:')
    console.log('1. Откройте: https://app.infisical.com/')
    console.log(`2. Проект: ${CONFIG.projectId}`)
    console.log('3. Среда: production')
    console.log('4. Добавьте вручную:')
    console.log(
      `   - INNGEST_EVENT_KEY: ${KEYS.INNGEST_EVENT_KEY.substring(0, 30)}...`
    )
    console.log(
      `   - INNGEST_SIGNING_KEY: ${KEYS.INNGEST_SIGNING_KEY.substring(0, 30)}...`
    )
    console.log('')
    process.exit(1)
  }
}

// Запуск
main()
