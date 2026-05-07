/**
 * GramJS клиент для работы с Telegram Stars
 *
 * Использует session string для авторизации (без FLOOD_WAIT)
 */

import { TelegramClient, Api } from 'telegram'
import { StringSession } from 'telegram/sessions'
import * as readline from 'readline'

interface GramJSConfig {
  apiId: number
  apiHash: string
  sessionString?: string
}

interface StarsBalance {
  total: number
  withdrawable: number
  canWithdraw: boolean
  usdValue?: number
  overallRevenue?: number
}

export class GramJSClient {
  private client: TelegramClient
  private session: StringSession

  constructor(config: GramJSConfig) {
    this.session = new StringSession(config.sessionString || '')

    this.client = new TelegramClient(this.session, config.apiId, config.apiHash, {
      connectionRetries: 5,
    })
  }

  /**
   * Подключение к Telegram
   */
  async connect(): Promise<void> {
    console.log('Подключение к Telegram...')

    await this.client.start({
      phoneNumber: async () => await this.promptInput('Введите номер телефона: '),
      password: async () => await this.promptInput('Введите 2FA пароль: '),
      phoneCode: async () => await this.promptInput('Введите код из Telegram: '),
      onError: (err) => console.error('Ошибка:', err),
    })

    console.log('Подключено!')

    // Сохранить session string для будущего использования
    const newSession = this.client.session.save() as unknown as string
    if (newSession && newSession !== this.session.save()) {
      console.log('\nНовый TELEGRAM_SESSION_STRING:')
      console.log(newSession)
      console.log('\nДобавьте его в .env для использования без повторной авторизации\n')
    }
  }

  /**
   * Получить информацию о текущем пользователе
   */
  async getMe(): Promise<any> {
    return await this.client.getMe()
  }

  /**
   * Получить баланс Stars для бота
   */
  async getStarsBalance(botUsername: string): Promise<StarsBalance> {
    const entity = await this.client.getEntity(botUsername)

    const result = await this.client.invoke(
      new Api.payments.GetStarsRevenueStats({
        peer: entity,
        dark: false,
      })
    )

    // status содержит StarsRevenueStatus
    const status = result.status

    // Баланс хранится в status.currentBalance.amount (string)
    const total = Number(status?.currentBalance?.amount || 0)
    const withdrawable = Number(status?.availableBalance?.amount || 0)
    const overallRevenue = Number(status?.overallRevenue?.amount || 0)

    return {
      total,
      withdrawable,
      canWithdraw: status?.withdrawalEnabled ?? false,
      usdValue: result.usdRate ? withdrawable * result.usdRate : undefined,
      overallRevenue, // Всего заработано за все время
    }
  }

  /**
   * Инициировать вывод Stars
   */
  async withdrawStars(
    botUsername: string,
    amount: number,
    password: string
  ): Promise<string> {
    const entity = await this.client.getEntity(botUsername)

    // Получить параметры пароля
    const passwordInfo = await this.client.invoke(new Api.account.GetPassword())

    // Создать SRP проверку пароля
    const srpPassword = await this.client.computePasswordCheck(passwordInfo, password)

    // Запросить URL для вывода
    const result = await this.client.invoke(
      new Api.payments.GetStarsRevenueWithdrawalUrl({
        peer: entity,
        stars: BigInt(amount),
        password: srpPassword,
      })
    )

    return result.url
  }

  /**
   * Получить информацию о боте
   */
  async getBotInfo(botUsername: string): Promise<any> {
    return await this.client.getEntity(botUsername)
  }

  /**
   * Отключение
   */
  async disconnect(): Promise<void> {
    await this.client.disconnect()
  }

  /**
   * Интерактивный ввод
   */
  private promptInput(question: string): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close()
        resolve(answer.trim())
      })
    })
  }
}
