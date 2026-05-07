/**
 * MTProto клиент для работы с Telegram Stars
 *
 * Использует @mtproto/core для вызова низкоуровневых API методов
 * включая payments.getStarsRevenueWithdrawalUrl для вывода Stars
 */

import MTProto from '@mtproto/core'
import * as readline from 'readline'

interface MTProtoConfig {
  api_id: number
  api_hash: string
}

interface StarsBalance {
  total: number
  withdrawable: number
  canWithdraw: boolean
  usdValue?: number
}

interface SRPParams {
  srp_id: string
  A: Buffer
  M1: Buffer
}

export class TelegramMTProtoClient {
  private api: MTProto
  private isAuthorized = false

  constructor(config: MTProtoConfig) {
    this.api = new MTProto({
      api_id: config.api_id,
      api_hash: config.api_hash,
      storageOptions: {
        path: './scripts/stars-withdrawal/session.json',
      },
    })
  }

  /**
   * Авторизация в Telegram через MTProto
   * @param phone Номер телефона в международном формате
   * @param password 2FA пароль (если включен)
   */
  async authorize(phone: string, password: string): Promise<void> {
    // Проверяем, есть ли уже активная сессия
    try {
      const user = await this.api.call('users.getFullUser', {
        id: { _: 'inputUserSelf' },
      })
      console.log(`Уже авторизован как: ${user.users[0].first_name}`)
      this.isAuthorized = true
      return
    } catch (e: any) {
      // Сессии нет, нужна авторизация
      console.log('Сессия не найдена, начинаем авторизацию...')
    }

    console.log('Отправляем код авторизации...')

    try {
      // 1. Отправить код
      const sendCodeResult = await this.api.call('auth.sendCode', {
        phone_number: phone,
        settings: {
          _: 'codeSettings',
          allow_flashcall: false,
          current_number: true,
          allow_app_hash: true,
        },
      })

      console.log('Код отправлен!')
      const phoneCodeHash = sendCodeResult.phone_code_hash

      // 2. Запросить код у пользователя
      const code = await this.promptInput('Введите код из Telegram: ')

      try {
        // 3. Попытка входа с кодом
        const signInResult = await this.api.call('auth.signIn', {
          phone_number: phone,
          phone_code_hash: phoneCodeHash,
          phone_code: code,
        })

        console.log(`Авторизован как: ${signInResult.user.first_name}`)
        this.isAuthorized = true
      } catch (error: any) {
        if (error.error_message === 'SESSION_PASSWORD_NEEDED') {
          // 4. Требуется 2FA
          console.log('Требуется 2FA, проверяем пароль...')
          await this.handle2FA(password)
          this.isAuthorized = true
        } else {
          console.error('Ошибка signIn:', error.error_message || error)
          throw error
        }
      }
    } catch (error: any) {
      console.error('Ошибка sendCode:', error.error_message || error.message || error)
      throw new Error(error.error_message || error.message || 'Ошибка авторизации')
    }
  }

  /**
   * Обработка 2FA авторизации с SRP
   */
  private async handle2FA(password: string): Promise<void> {
    // Получить параметры пароля
    const passwordInfo = await this.api.call('account.getPassword', {})

    const { srp_id, current_algo, srp_B } = passwordInfo
    const { g, p, salt1, salt2 } = current_algo

    // Вычислить SRP параметры
    const { A, M1 } = await this.api.crypto.getSRPParams({
      g,
      p,
      salt1,
      salt2,
      gB: srp_B,
      password,
    })

    // Проверить пароль
    const result = await this.api.call('auth.checkPassword', {
      password: {
        _: 'inputCheckPasswordSRP',
        srp_id,
        A,
        M1,
      },
    })

    console.log(`2FA пройден. Авторизован как: ${result.user.first_name}`)
  }

  /**
   * Получить SRP параметры для защищенных операций
   */
  private async getSRPParams(password: string): Promise<SRPParams> {
    const passwordInfo = await this.api.call('account.getPassword', {})

    const { srp_id, current_algo, srp_B } = passwordInfo
    const { g, p, salt1, salt2 } = current_algo

    const { A, M1 } = await this.api.crypto.getSRPParams({
      g,
      p,
      salt1,
      salt2,
      gB: srp_B,
      password,
    })

    return { srp_id, A, M1 }
  }

  /**
   * Получить баланс Stars для бота
   * @param botUsername Username бота (с @ или без)
   */
  async getStarsBalance(botUsername: string): Promise<StarsBalance> {
    const peer = await this.resolveBotPeer(botUsername)

    try {
      const stats = await this.api.call('payments.getStarsRevenueStats', {
        peer,
        dark: false,
      })

      return {
        total: Number(stats.status?.current_balance || 0),
        withdrawable: Number(stats.status?.available_balance || 0),
        canWithdraw: stats.status?.withdrawal_enabled ?? false,
        usdValue: stats.usd_rate ? Number(stats.status?.available_balance || 0) * stats.usd_rate : undefined,
      }
    } catch (error: any) {
      if (error.error_message === 'PEER_ID_INVALID') {
        throw new Error(`Бот ${botUsername} не найден или у вас нет прав`)
      }
      throw error
    }
  }

  /**
   * Инициировать вывод Stars с бота
   * @param botUsername Username бота
   * @param amount Количество Stars для вывода
   * @param password 2FA пароль
   * @returns URL на Fragment для завершения вывода
   */
  async withdrawStars(botUsername: string, amount: number, password: string): Promise<string> {
    const peer = await this.resolveBotPeer(botUsername)
    const srpParams = await this.getSRPParams(password)

    const result = await this.api.call('payments.getStarsRevenueWithdrawalUrl', {
      peer,
      stars: amount,
      password: {
        _: 'inputCheckPasswordSRP',
        srp_id: srpParams.srp_id,
        A: srpParams.A,
        M1: srpParams.M1,
      },
    })

    return result.url
  }

  /**
   * Получить информацию о боте через MTProto
   */
  async getBotInfo(botUsername: string): Promise<any> {
    const resolved = await this.api.call('contacts.resolveUsername', {
      username: botUsername.replace('@', ''),
    })

    return resolved.users?.[0]
  }

  /**
   * Resolve bot username to InputPeer
   */
  private async resolveBotPeer(botUsername: string): Promise<any> {
    const resolved = await this.api.call('contacts.resolveUsername', {
      username: botUsername.replace('@', ''),
    })

    const user = resolved.users?.[0]
    if (!user) {
      throw new Error(`Бот ${botUsername} не найден`)
    }

    return {
      _: 'inputPeerUser',
      user_id: user.id,
      access_hash: user.access_hash,
    }
  }

  /**
   * Интерактивный ввод с консоли
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

  /**
   * Проверить авторизован ли клиент
   */
  get authorized(): boolean {
    return this.isAuthorized
  }
}
