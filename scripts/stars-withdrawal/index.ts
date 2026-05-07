#!/usr/bin/env npx ts-node

/**
 * Telegram Stars Withdrawal Tool
 *
 * Автоматизация вывода Telegram Stars с 11 ботов проекта
 *
 * Использование:
 *   npx ts-node scripts/stars-withdrawal check              - Проверить балансы всех ботов
 *   npx ts-node scripts/stars-withdrawal withdraw           - Вывести со всех готовых ботов
 *   npx ts-node scripts/stars-withdrawal check @bot_name    - Проверить конкретный бот
 *   npx ts-node scripts/stars-withdrawal withdraw @bot_name - Вывести с конкретного бота
 */

import 'dotenv/config'
import { TelegramMTProtoClient } from './mtproto-client'
import { StarsWithdrawalService } from './stars-service'
import { MTPROTO_CONFIG } from './config'

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function printHeader(): void {
  console.log('\n')
  console.log(colors.cyan + '╔════════════════════════════════════════════════════════════╗' + colors.reset)
  console.log(colors.cyan + '║' + colors.bright + '       TELEGRAM STARS WITHDRAWAL TOOL                      ' + colors.cyan + '║' + colors.reset)
  console.log(colors.cyan + '║' + colors.reset + '       Автоматизация вывода Stars с ботов                   ' + colors.cyan + '║' + colors.reset)
  console.log(colors.cyan + '╚════════════════════════════════════════════════════════════╝' + colors.reset)
  console.log('')
}

function printUsage(): void {
  console.log(colors.yellow + 'Использование:' + colors.reset)
  console.log('')
  console.log('  bun run scripts/stars-withdrawal ' + colors.green + 'check' + colors.reset)
  console.log('    Проверить балансы всех 11 ботов')
  console.log('')
  console.log('  bun run scripts/stars-withdrawal ' + colors.green + 'withdraw' + colors.reset)
  console.log('    Вывести Stars со всех готовых ботов')
  console.log('')
  console.log('  bun run scripts/stars-withdrawal ' + colors.green + 'check @bot_name' + colors.reset)
  console.log('    Проверить баланс конкретного бота')
  console.log('')
  console.log('  bun run scripts/stars-withdrawal ' + colors.green + 'withdraw @bot_name' + colors.reset)
  console.log('    Вывести Stars с конкретного бота')
  console.log('')
  console.log(colors.yellow + 'Переменные окружения (добавить в .env):' + colors.reset)
  console.log('  TG_API_ID       - API ID из my.telegram.org')
  console.log('  TG_API_HASH     - API Hash из my.telegram.org')
  console.log('  TG_PHONE        - Номер телефона владельца ботов')
  console.log('  TG_2FA_PASSWORD - 2FA пароль аккаунта')
  console.log('')
}

function validateConfig(): boolean {
  const missing: string[] = []

  if (!MTPROTO_CONFIG.api_id || isNaN(MTPROTO_CONFIG.api_id)) {
    missing.push('TG_API_ID')
  }
  if (!MTPROTO_CONFIG.api_hash) {
    missing.push('TG_API_HASH')
  }
  if (!MTPROTO_CONFIG.phone) {
    missing.push('TG_PHONE')
  }
  if (!MTPROTO_CONFIG.password) {
    missing.push('TG_2FA_PASSWORD')
  }

  if (missing.length > 0) {
    console.log(colors.red + '❌ Отсутствуют переменные окружения:' + colors.reset)
    missing.forEach((v) => console.log(`   - ${v}`))
    console.log('')
    console.log('Добавьте их в .env файл или установите напрямую.')
    console.log('')
    return false
  }

  return true
}

async function main(): Promise<void> {
  printHeader()

  const args = process.argv.slice(2)
  const command = args[0]?.toLowerCase()
  const target = args[1]

  // Показать usage если нет команды
  if (!command) {
    printUsage()
    process.exit(0)
  }

  // Проверить конфигурацию
  if (!validateConfig()) {
    process.exit(1)
  }

  console.log(colors.blue + '🔐 Инициализация MTProto клиента...' + colors.reset)

  // Создать клиент
  const client = new TelegramMTProtoClient({
    api_id: MTPROTO_CONFIG.api_id,
    api_hash: MTPROTO_CONFIG.api_hash,
  })

  // Авторизоваться
  try {
    await client.authorize(MTPROTO_CONFIG.phone, MTPROTO_CONFIG.password)
    console.log(colors.green + '✅ Авторизация успешна' + colors.reset)
  } catch (error: any) {
    console.log(colors.red + '❌ Ошибка авторизации: ' + error.message + colors.reset)
    process.exit(1)
  }

  // Создать сервис
  const service = new StarsWithdrawalService(client)

  // Выполнить команду
  try {
    switch (command) {
      case 'check':
        if (target) {
          await service.checkBotBalance(target)
        } else {
          await service.checkAllBalances()
        }
        break

      case 'withdraw':
        if (target) {
          const result = await service.withdrawFromBot(target, MTPROTO_CONFIG.password)
          if (result.success) {
            console.log(colors.green + `\n✅ Вывод инициирован с @${target}` + colors.reset)
            console.log(`   Завершите на Fragment: ${result.url}`)
          } else {
            console.log(colors.red + `\n❌ Ошибка: ${result.error}` + colors.reset)
          }
        } else {
          await service.withdrawFromAllBots(MTPROTO_CONFIG.password)
        }
        break

      default:
        console.log(colors.red + `❌ Неизвестная команда: ${command}` + colors.reset)
        console.log('')
        printUsage()
        process.exit(1)
    }
  } catch (error: any) {
    console.log(colors.red + `\n❌ Ошибка: ${error.message}` + colors.reset)
    if (error.stack) {
      console.log(colors.yellow + error.stack + colors.reset)
    }
    process.exit(1)
  }

  console.log(colors.green + '\n✨ Готово!\n' + colors.reset)
}

// Запуск
main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
