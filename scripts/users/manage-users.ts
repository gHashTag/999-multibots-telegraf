#!/usr/bin/env ts-node

/**
 * Скрипт для управления пользователями в Supabase
 * Задачи:
 * 1. Проверка существующих пользователей
 * 2. Создание/обновление пользователей с подпиской NEUROVIDEO  
 * 3. Пополнение баланса звезд на 10,000 каждому
 * 4. Записи в таблицу payments_v2
 * 5. Верификация финального статуса
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import path from 'path'

// Загружаем переменные окружения
config({ path: path.join(process.cwd(), '.env') })

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('🚨 ОШИБКА: Не найдены переменные SUPABASE_URL или SUPABASE_SERVICE_KEY')
  process.exit(1)
}

// Создаем клиент Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ID целевых пользователей
const TARGET_USER_IDS = ['1036512726', '752224685', '289259562']

// Типы для TypeScript
interface User {
  id: string
  telegram_id: string
  username?: string
  first_name?: string
  last_name?: string
  subscription?: string
  created_at?: string
}

interface PaymentV2 {
  id?: string
  telegram_id: number
  amount: number
  stars: number
  currency: string
  status: string
  type: string
  payment_method: string
  description: string
  bot_name: string
  subscription_type?: string
  payment_date?: string
  inv_id: string
  category: string
  cost: number
}

interface UserReport {
  telegram_id: string
  status: 'success' | 'error' | 'warning'
  actions: string[]
  errors: string[]
  balance_before: number
  balance_after: number
  subscription_before?: string
  subscription_after?: string
  user_existed: boolean
}

class UserManager {
  private reports: UserReport[] = []

  /**
   * Получение пользователя по Telegram ID
   */
  private async getUserByTelegramId(telegramId: string): Promise<User | null> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', telegramId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return null // Пользователь не найден
        }
        throw error
      }

      return data
    } catch (error) {
      console.error(`❌ Ошибка получения пользователя ${telegramId}:`, error)
      throw error
    }
  }

  /**
   * Создание нового пользователя
   */
  private async createUser(telegramId: string): Promise<User> {
    try {
      const userData = {
        telegram_id: telegramId,
        username: `user_${telegramId}`,
        first_name: `User`,
        last_name: telegramId,
        subscription: 'NEUROVIDEO',
        is_bot: false,
        language_code: 'ru',
        photo_url: '',
        chat_id: parseInt(telegramId),
        mode: 'default',
        model: 'default',
        count: 0,
        aspect_ratio: '1:1',
        inviter: null,
        bot_name: 'neuro-video-bot'
      }

      const { data, error } = await supabase
        .from('users')
        .insert(userData)
        .select('*')
        .single()

      if (error) {
        throw error
      }

      console.log(`✅ Пользователь ${telegramId} успешно создан`)
      return data
    } catch (error) {
      console.error(`❌ Ошибка создания пользователя ${telegramId}:`, error)
      throw error
    }
  }

  /**
   * Обновление подписки пользователя
   */
  private async updateUserSubscription(telegramId: string, subscription: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('users')
        .update({ subscription })
        .eq('telegram_id', telegramId)

      if (error) {
        throw error
      }

      console.log(`✅ Подписка пользователя ${telegramId} обновлена на ${subscription}`)
    } catch (error) {
      console.error(`❌ Ошибка обновления подписки ${telegramId}:`, error)
      throw error
    }
  }

  /**
   * Получение текущего баланса пользователя из payments_v2
   */
  private async getUserBalance(telegramId: string): Promise<number> {
    try {
      // Используем RPC функцию если она есть
      const { data, error } = await supabase.rpc('get_user_balance', {
        user_telegram_id: telegramId
      })

      if (!error && data !== null) {
        return Number(data) || 0
      }

      // Fallback - вычисляем баланс из транзакций
      const { data: payments, error: paymentsError } = await supabase
        .from('payments_v2')
        .select('stars, type')
        .eq('telegram_id', parseInt(telegramId))
        .eq('status', 'completed')

      if (paymentsError) {
        console.warn(`⚠️ Не удалось получить баланс для ${telegramId}, используем 0`)
        return 0
      }

      const balance = (payments || []).reduce((sum, payment) => {
        if (payment.type === 'money_income') {
          return sum + (payment.stars || 0)
        } else {
          return sum - (payment.stars || 0)
        }
      }, 0)

      return Math.max(0, balance)
    } catch (error) {
      console.error(`❌ Ошибка получения баланса ${telegramId}:`, error)
      return 0
    }
  }

  /**
   * Пополнение баланса пользователя
   */
  private async addBalanceToUser(telegramId: string, amount: number): Promise<void> {
    try {
      const paymentRecord: PaymentV2 = {
        telegram_id: parseInt(telegramId),
        amount: amount,
        stars: amount,
        currency: 'XTR',
        status: 'completed',
        type: 'money_income',
        payment_method: 'Admin Action',
        description: `Пополнение баланса на ${amount} звезд администратором`,
        bot_name: 'neuro-video-bot',
        subscription_type: 'NEUROVIDEO',
        payment_date: new Date().toISOString(),
        inv_id: `admin-${Date.now()}-${telegramId}`,
        category: 'BONUS',
        cost: 0
      }

      const { error } = await supabase
        .from('payments_v2')
        .insert(paymentRecord)

      if (error) {
        throw error
      }

      console.log(`✅ Баланс пользователя ${telegramId} пополнен на ${amount} звезд`)
    } catch (error) {
      console.error(`❌ Ошибка пополнения баланса ${telegramId}:`, error)
      throw error
    }
  }

  /**
   * Проверка подписки пользователя
   */
  private async checkUserSubscription(telegramId: string): Promise<string> {
    try {
      // Сначала проверяем в таблице users
      const user = await this.getUserByTelegramId(telegramId)
      if (user && user.subscription) {
        return user.subscription
      }

      // Затем проверяем последний платеж в payments_v2
      const { data, error } = await supabase
        .from('payments_v2')
        .select('subscription_type, created_at')
        .eq('telegram_id', parseInt(telegramId))
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error || !data) {
        return 'unsubscribed'
      }

      // Проверяем, что платеж был в течение последних 30 дней
      const paymentDate = new Date(data.created_at)
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      if (paymentDate < thirtyDaysAgo) {
        return 'unsubscribed'
      }

      return data.subscription_type || 'unsubscribed'
    } catch (error) {
      console.error(`❌ Ошибка проверки подписки ${telegramId}:`, error)
      return 'unsubscribed'
    }
  }

  /**
   * Обработка одного пользователя
   */
  private async processUser(telegramId: string): Promise<UserReport> {
    const report: UserReport = {
      telegram_id: telegramId,
      status: 'success',
      actions: [],
      errors: [],
      balance_before: 0,
      balance_after: 0,
      user_existed: false
    }

    try {
      console.log(`\n🔄 Обработка пользователя ${telegramId}...`)

      // 1. Проверяем текущий баланс
      report.balance_before = await this.getUserBalance(telegramId)
      report.actions.push(`Текущий баланс: ${report.balance_before} звезд`)

      // 2. Проверяем существование пользователя
      let user = await this.getUserByTelegramId(telegramId)
      report.user_existed = !!user

      if (user) {
        console.log(`✅ Пользователь ${telegramId} найден`)
        report.actions.push('Пользователь найден в системе')
        report.subscription_before = user.subscription || 'none'
      } else {
        console.log(`➕ Создаем пользователя ${telegramId}`)
        user = await this.createUser(telegramId)
        report.actions.push('Пользователь создан')
        report.subscription_before = 'none'
      }

      // 3. Обновляем подписку на NEUROVIDEO
      await this.updateUserSubscription(telegramId, 'NEUROVIDEO')
      report.subscription_after = 'NEUROVIDEO'
      report.actions.push('Подписка обновлена на NEUROVIDEO')

      // 4. Пополняем баланс на 10,000 звезд
      await this.addBalanceToUser(telegramId, 10000)
      report.actions.push('Баланс пополнен на 10,000 звезд')

      // 5. Проверяем финальный баланс
      report.balance_after = await this.getUserBalance(telegramId)
      report.actions.push(`Финальный баланс: ${report.balance_after} звезд`)

      console.log(`✅ Пользователь ${telegramId} успешно обработан`)

    } catch (error) {
      console.error(`❌ Ошибка обработки пользователя ${telegramId}:`, error)
      report.status = 'error'
      report.errors.push(error instanceof Error ? error.message : String(error))
    }

    return report
  }

  /**
   * Основная функция обработки всех пользователей
   */
  async processAllUsers(): Promise<void> {
    console.log('🚀 Начинаем обработку пользователей...')
    console.log(`📋 Целевые пользователи: ${TARGET_USER_IDS.join(', ')}`)

    for (const telegramId of TARGET_USER_IDS) {
      const report = await this.processUser(telegramId)
      this.reports.push(report)
    }

    console.log('\n📊 Генерируем отчет...')
    this.generateReport()
  }

  /**
   * Генерация детального отчета
   */
  private generateReport(): void {
    console.log('\n' + '='.repeat(80))
    console.log('📋 ДЕТАЛЬНЫЙ ОТЧЕТ О ВЫПОЛНЕННЫХ ОПЕРАЦИЯХ')
    console.log('='.repeat(80))

    this.reports.forEach((report, index) => {
      console.log(`\n${index + 1}. ПОЛЬЗОВАТЕЛЬ ${report.telegram_id}`)
      console.log(`   Статус: ${report.status === 'success' ? '✅ УСПЕШНО' : '❌ ОШИБКА'}`)
      console.log(`   Существовал в системе: ${report.user_existed ? 'Да' : 'Нет'}`)
      console.log(`   Подписка до: ${report.subscription_before || 'неизвестно'}`)
      console.log(`   Подписка после: ${report.subscription_after || 'неизвестно'}`)
      console.log(`   Баланс до: ${report.balance_before} звезд`)
      console.log(`   Баланс после: ${report.balance_after} звезд`)
      console.log(`   Прирост баланса: +${report.balance_after - report.balance_before} звезд`)

      if (report.actions.length > 0) {
        console.log('   Выполненные действия:')
        report.actions.forEach(action => {
          console.log(`     • ${action}`)
        })
      }

      if (report.errors.length > 0) {
        console.log('   Ошибки:')
        report.errors.forEach(error => {
          console.log(`     ❌ ${error}`)
        })
      }
    })

    // Сводная статистика
    const successful = this.reports.filter(r => r.status === 'success').length
    const failed = this.reports.filter(r => r.status === 'error').length
    const created = this.reports.filter(r => !r.user_existed).length
    const updated = this.reports.filter(r => r.user_existed).length
    const totalBalanceAdded = this.reports.reduce((sum, r) => sum + (r.balance_after - r.balance_before), 0)

    console.log('\n' + '='.repeat(80))
    console.log('📈 СВОДНАЯ СТАТИСТИКА')
    console.log('='.repeat(80))
    console.log(`Всего пользователей обработано: ${this.reports.length}`)
    console.log(`Успешно: ${successful}`)
    console.log(`С ошибками: ${failed}`)
    console.log(`Создано новых пользователей: ${created}`)
    console.log(`Обновлено существующих: ${updated}`)
    console.log(`Всего звезд добавлено: ${totalBalanceAdded}`)
    console.log(`Все пользователи получили подписку: NEUROVIDEO`)

    if (successful === this.reports.length) {
      console.log('\n🎉 ВСЕ ОПЕРАЦИИ ВЫПОЛНЕНЫ УСПЕШНО!')
    } else {
      console.log(`\n⚠️  ВНИМАНИЕ: ${failed} пользователей обработаны с ошибками`)
    }

    console.log('\n' + '='.repeat(80))
    console.log('✅ ОТЧЕТ ЗАВЕРШЕН')
    console.log('='.repeat(80))
  }
}

// Запуск скрипта
async function main() {
  try {
    console.log('🔗 Подключение к Supabase...')
    console.log(`📡 URL: ${SUPABASE_URL}`)
    console.log(`🔑 Service Key: ${SUPABASE_SERVICE_KEY ? '***УСТАНОВЛЕН***' : 'НЕ НАЙДЕН'}`)

    const manager = new UserManager()
    await manager.processAllUsers()

  } catch (error) {
    console.error('💥 КРИТИЧЕСКАЯ ОШИБКА:', error)
    process.exit(1)
  }
}

// Запускаем только если файл выполняется напрямую
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Необработанная ошибка:', error)
    process.exit(1)
  })
}

export { UserManager }