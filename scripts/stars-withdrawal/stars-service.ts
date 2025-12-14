/**
 * Сервис для работы с Telegram Stars
 *
 * Проверяет балансы всех ботов и инициирует вывод
 */

import { TelegramMTProtoClient } from './mtproto-client'
import { BOTS, MIN_WITHDRAWAL_AMOUNT, WITHDRAWAL_DELAY_MS, type BotConfig } from './config'

// Динамический импорт open (ESM модуль)
const openBrowser = async (url: string) => {
  const open = (await import('open')).default
  await open(url)
}

interface BotBalance {
  username: string
  description: string
  total: number
  withdrawable: number
  canWithdraw: boolean
  readyToWithdraw: boolean
  usdValue?: number
  error?: string
}

interface WithdrawalResult {
  username: string
  success: boolean
  url?: string
  error?: string
}

export class StarsWithdrawalService {
  constructor(private client: TelegramMTProtoClient) {}

  /**
   * Проверить балансы всех ботов
   */
  async checkAllBalances(): Promise<BotBalance[]> {
    console.log('\n' + '='.repeat(60))
    console.log('          ПРОВЕРКА БАЛАНСА STARS ВСЕХ БОТОВ')
    console.log('='.repeat(60) + '\n')

    const results: BotBalance[] = []

    for (const bot of BOTS) {
      try {
        const balance = await this.client.getStarsBalance(bot.username)

        const readyToWithdraw =
          balance.withdrawable >= MIN_WITHDRAWAL_AMOUNT && balance.canWithdraw

        const result: BotBalance = {
          username: bot.username,
          description: bot.description,
          total: balance.total,
          withdrawable: balance.withdrawable,
          canWithdraw: balance.canWithdraw,
          readyToWithdraw,
          usdValue: balance.usdValue,
        }

        results.push(result)

        // Форматированный вывод
        this.printBotBalance(result)

        // Небольшая задержка между запросами
        await this.delay(500)
      } catch (error: any) {
        const result: BotBalance = {
          username: bot.username,
          description: bot.description,
          total: 0,
          withdrawable: 0,
          canWithdraw: false,
          readyToWithdraw: false,
          error: error.message,
        }
        results.push(result)

        console.log(`❌ @${bot.username}: ${error.message}`)
      }
    }

    // Итоговая статистика
    this.printSummary(results)

    return results
  }

  /**
   * Вывести Stars со всех готовых ботов
   */
  async withdrawFromAllBots(password: string): Promise<WithdrawalResult[]> {
    // Сначала проверяем балансы
    const balances = await this.checkAllBalances()
    const ready = balances.filter((b) => b.readyToWithdraw)

    if (ready.length === 0) {
      console.log('\n⚠️  Нет ботов готовых к выводу')
      console.log('   Требуется минимум 1000 Stars, доступных более 21 дня')
      return []
    }

    console.log('\n' + '='.repeat(60))
    console.log(`          ВЫВОД STARS С ${ready.length} БОТОВ`)
    console.log('='.repeat(60) + '\n')

    const results: WithdrawalResult[] = []

    for (const bot of ready) {
      try {
        console.log(`\n🔄 Инициирую вывод с @${bot.username}...`)
        console.log(`   Сумма: ${bot.withdrawable} Stars`)

        const url = await this.client.withdrawStars(bot.username, bot.withdrawable, password)

        console.log(`✅ Получена ссылка на Fragment`)
        console.log(`   URL: ${url}`)

        // Открыть URL в браузере
        try {
          await openBrowser(url)
          console.log(`🌐 Открыто в браузере`)
        } catch (e) {
          console.log(`⚠️  Не удалось открыть браузер. Откройте ссылку вручную.`)
        }

        results.push({
          username: bot.username,
          success: true,
          url,
        })

        // Задержка между выводами
        console.log(`⏳ Ожидание ${WITHDRAWAL_DELAY_MS / 1000} сек...`)
        await this.delay(WITHDRAWAL_DELAY_MS)
      } catch (error: any) {
        console.log(`❌ Ошибка вывода с @${bot.username}: ${error.message}`)

        results.push({
          username: bot.username,
          success: false,
          error: error.message,
        })
      }
    }

    // Итоги вывода
    this.printWithdrawalSummary(results)

    return results
  }

  /**
   * Проверить баланс конкретного бота
   */
  async checkBotBalance(username: string): Promise<BotBalance> {
    const bot = BOTS.find((b) => b.username === username || `@${b.username}` === username)

    if (!bot) {
      throw new Error(`Бот ${username} не найден в конфигурации`)
    }

    const balance = await this.client.getStarsBalance(bot.username)

    const result: BotBalance = {
      username: bot.username,
      description: bot.description,
      total: balance.total,
      withdrawable: balance.withdrawable,
      canWithdraw: balance.canWithdraw,
      readyToWithdraw: balance.withdrawable >= MIN_WITHDRAWAL_AMOUNT && balance.canWithdraw,
      usdValue: balance.usdValue,
    }

    this.printBotBalance(result)

    return result
  }

  /**
   * Вывести с конкретного бота
   */
  async withdrawFromBot(username: string, password: string): Promise<WithdrawalResult> {
    const balance = await this.checkBotBalance(username)

    if (!balance.readyToWithdraw) {
      return {
        username,
        success: false,
        error: `Бот не готов к выводу. Доступно: ${balance.withdrawable} Stars`,
      }
    }

    const url = await this.client.withdrawStars(username, balance.withdrawable, password)

    try {
      await openBrowser(url)
    } catch (e) {
      console.log(`⚠️  Откройте ссылку вручную: ${url}`)
    }

    return {
      username,
      success: true,
      url,
    }
  }

  // ============ Вспомогательные методы ============

  private printBotBalance(bot: BotBalance): void {
    const status = bot.readyToWithdraw ? '✅' : bot.canWithdraw ? '⏳' : '❌'

    console.log(`${status} @${bot.username}`)
    console.log(`   ${bot.description}`)
    console.log(`   Всего: ${bot.total.toLocaleString()} Stars`)
    console.log(`   Доступно: ${bot.withdrawable.toLocaleString()} Stars`)

    if (bot.usdValue) {
      console.log(`   ~$${bot.usdValue.toFixed(2)} USD`)
    }

    if (bot.readyToWithdraw) {
      console.log(`   🚀 ГОТОВ К ВЫВОДУ!`)
    } else if (!bot.canWithdraw) {
      console.log(`   ⏳ Ожидание 21 дня`)
    } else if (bot.withdrawable < MIN_WITHDRAWAL_AMOUNT) {
      console.log(`   ⚠️  Нужно ещё ${MIN_WITHDRAWAL_AMOUNT - bot.withdrawable} Stars`)
    }

    console.log('')
  }

  private printSummary(results: BotBalance[]): void {
    const totalStars = results.reduce((sum, b) => sum + b.total, 0)
    const withdrawableStars = results.reduce((sum, b) => sum + b.withdrawable, 0)
    const readyCount = results.filter((b) => b.readyToWithdraw).length
    const errorCount = results.filter((b) => b.error).length

    console.log('\n' + '='.repeat(60))
    console.log('                      ИТОГО')
    console.log('='.repeat(60))
    console.log(`📊 Всего ботов: ${results.length}`)
    console.log(`✅ Готово к выводу: ${readyCount}`)
    console.log(`❌ Ошибок: ${errorCount}`)
    console.log('')
    console.log(`⭐ Всего Stars: ${totalStars.toLocaleString()}`)
    console.log(`💰 Доступно к выводу: ${withdrawableStars.toLocaleString()}`)
    console.log(`💵 ~$${(withdrawableStars * 0.013).toFixed(2)} USD`)
    console.log('='.repeat(60) + '\n')
  }

  private printWithdrawalSummary(results: WithdrawalResult[]): void {
    const successful = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success).length

    console.log('\n' + '='.repeat(60))
    console.log('                ИТОГИ ВЫВОДА')
    console.log('='.repeat(60))
    console.log(`✅ Успешно: ${successful}`)
    console.log(`❌ Ошибок: ${failed}`)
    console.log('')

    if (successful > 0) {
      console.log('📝 Завершите вывод на Fragment.com')
      console.log('   1. Подключите TON кошелек')
      console.log('   2. Подтвердите вывод для каждого бота')
    }

    console.log('='.repeat(60) + '\n')
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
