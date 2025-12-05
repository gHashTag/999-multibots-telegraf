#!/usr/bin/env ts-node

/**
 * Альтернативный скрипт для управления пользователями через Supabase MCP
 * Использует прямые SQL запросы и функции Supabase
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

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ID целевых пользователей
const TARGET_USERS = [
  { telegram_id: '1036512726', name: 'Пользователь 1' },
  { telegram_id: '752224685', name: 'Пользователь 2' },
  { telegram_id: '289259562', name: 'Пользователь 3' }
]

class SupabaseUserOperations {
  
  /**
   * Выполнение SQL запроса для проверки пользователя
   */
  async checkUser(telegramId: string): Promise<any> {
    const query = `
      SELECT 
        id,
        telegram_id,
        username,
        first_name,
        last_name,
        subscription,
        created_at
      FROM users 
      WHERE telegram_id = '${telegramId}';
    `
    
    const { data, error } = await supabase.rpc('execute_sql', { query })
    
    if (error) {
      console.error(`❌ Ошибка проверки пользователя ${telegramId}:`, error)
      return null
    }
    
    return data?.[0] || null
  }

  /**
   * Создание пользователя через SQL
   */
  async createUser(telegramId: string): Promise<boolean> {
    const query = `
      INSERT INTO users (
        telegram_id,
        username,
        first_name,
        last_name,
        subscription,
        is_bot,
        language_code,
        photo_url,
        chat_id,
        mode,
        model,
        count,
        aspect_ratio,
        bot_name
      ) VALUES (
        '${telegramId}',
        'user_${telegramId}',
        'Admin',
        'User ${telegramId}',
        'NEUROVIDEO',
        false,
        'ru',
        '',
        ${parseInt(telegramId)},
        'default',
        'default',
        0,
        '1:1',
        'neuro-video-bot'
      )
      ON CONFLICT (telegram_id) 
      DO UPDATE SET 
        subscription = EXCLUDED.subscription,
        updated_at = NOW();
    `
    
    const { error } = await supabase.rpc('execute_sql', { query })
    
    if (error) {
      console.error(`❌ Ошибка создания пользователя ${telegramId}:`, error)
      return false
    }
    
    console.log(`✅ Пользователь ${telegramId} создан/обновлен`)
    return true
  }

  /**
   * Получение баланса через SQL
   */
  async getUserBalance(telegramId: string): Promise<number> {
    const query = `
      SELECT COALESCE(
        SUM(
          CASE 
            WHEN type = 'money_income' THEN stars 
            WHEN type = 'money_outcome' THEN -stars 
            ELSE 0 
          END
        ), 
        0
      ) as balance
      FROM payments_v2 
      WHERE telegram_id = ${parseInt(telegramId)} 
      AND status = 'completed';
    `
    
    const { data, error } = await supabase.rpc('execute_sql', { query })
    
    if (error) {
      console.error(`❌ Ошибка получения баланса ${telegramId}:`, error)
      return 0
    }
    
    return data?.[0]?.balance || 0
  }

  /**
   * Добавление записи в payments_v2
   */
  async addPaymentRecord(telegramId: string, amount: number): Promise<boolean> {
    const invId = `admin-${Date.now()}-${telegramId}`
    const paymentDate = new Date().toISOString()
    
    const query = `
      INSERT INTO payments_v2 (
        telegram_id,
        amount,
        stars,
        currency,
        status,
        type,
        payment_method,
        description,
        bot_name,
        subscription_type,
        payment_date,
        inv_id,
        category,
        cost,
        created_at
      ) VALUES (
        ${parseInt(telegramId)},
        ${amount},
        ${amount},
        'XTR',
        'completed',
        'money_income',
        'Admin Action',
        'Административное пополнение баланса на ${amount} звезд',
        'neuro-video-bot',
        'NEUROVIDEO',
        '${paymentDate}',
        '${invId}',
        'BONUS',
        0,
        '${paymentDate}'
      );
    `
    
    const { error } = await supabase.rpc('execute_sql', { query })
    
    if (error) {
      console.error(`❌ Ошибка добавления платежа ${telegramId}:`, error)
      return false
    }
    
    console.log(`✅ Добавлена запись о пополнении ${amount} звезд для ${telegramId}`)
    return true
  }

  /**
   * Обновление подписки пользователя
   */
  async updateSubscription(telegramId: string, subscription: string): Promise<boolean> {
    const query = `
      UPDATE users 
      SET subscription = '${subscription}', updated_at = NOW()
      WHERE telegram_id = '${telegramId}';
    `
    
    const { error } = await supabase.rpc('execute_sql', { query })
    
    if (error) {
      console.error(`❌ Ошибка обновления подписки ${telegramId}:`, error)
      return false
    }
    
    console.log(`✅ Подписка пользователя ${telegramId} обновлена на ${subscription}`)
    return true
  }

  /**
   * Обработка одного пользователя
   */
  async processUser(userInfo: { telegram_id: string; name: string }): Promise<any> {
    const { telegram_id, name } = userInfo
    const report = {
      telegram_id,
      name,
      success: true,
      actions: [] as string[],
      errors: [] as string[],
      balance_before: 0,
      balance_after: 0,
      user_existed: false
    }

    try {
      console.log(`\n🔄 Обработка ${name} (${telegram_id})...`)

      // 1. Проверяем текущий баланс
      report.balance_before = await this.getUserBalance(telegram_id)
      report.actions.push(`Баланс до операций: ${report.balance_before} звезд`)

      // 2. Проверяем существование пользователя
      const existingUser = await this.checkUser(telegram_id)
      report.user_existed = !!existingUser

      if (existingUser) {
        console.log(`✅ Пользователь ${telegram_id} найден`)
        report.actions.push('Пользователь найден в системе')
      } else {
        console.log(`➕ Пользователь ${telegram_id} не найден, создаем...`)
      }

      // 3. Создаем/обновляем пользователя с подпиской NEUROVIDEO
      const userCreated = await this.createUser(telegram_id)
      if (!userCreated) {
        throw new Error('Не удалось создать/обновить пользователя')
      }
      report.actions.push(existingUser ? 'Пользователь обновлен' : 'Пользователь создан')

      // 4. Обновляем подписку
      const subscriptionUpdated = await this.updateSubscription(telegram_id, 'NEUROVIDEO')
      if (!subscriptionUpdated) {
        throw new Error('Не удалось обновить подписку')
      }
      report.actions.push('Подписка установлена: NEUROVIDEO')

      // 5. Добавляем 10,000 звезд
      const paymentAdded = await this.addPaymentRecord(telegram_id, 10000)
      if (!paymentAdded) {
        throw new Error('Не удалось добавить платеж')
      }
      report.actions.push('Добавлено 10,000 звезд')

      // 6. Проверяем финальный баланс
      report.balance_after = await this.getUserBalance(telegram_id)
      report.actions.push(`Баланс после операций: ${report.balance_after} звезд`)

      const balanceIncrease = report.balance_after - report.balance_before
      console.log(`✅ ${name} обработан успешно. Прирост баланса: +${balanceIncrease} звезд`)

    } catch (error) {
      console.error(`❌ Ошибка обработки ${name}:`, error)
      report.success = false
      report.errors.push(error instanceof Error ? error.message : String(error))
    }

    return report
  }

  /**
   * Основная функция
   */
  async processAllUsers(): Promise<void> {
    console.log('🚀 ЗАПУСК ОБРАБОТКИ ПОЛЬЗОВАТЕЛЕЙ ЧЕРЕЗ SUPABASE SQL')
    console.log('='*60)
    
    const reports = []

    // Обрабатываем каждого пользователя
    for (const user of TARGET_USERS) {
      const report = await this.processUser(user)
      reports.push(report)
      
      // Пауза между операциями
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    // Генерируем итоговый отчет
    console.log('\n' + '='*80)
    console.log('📋 ИТОГОВЫЙ ОТЧЕТ')
    console.log('='*80)

    reports.forEach((report, index) => {
      console.log(`\n${index + 1}. ${report.name} (${report.telegram_id})`)
      console.log(`   Статус: ${report.success ? '✅ УСПЕШНО' : '❌ ОШИБКА'}`)
      console.log(`   Пользователь существовал: ${report.user_existed ? 'Да' : 'Нет'}`)
      console.log(`   Баланс ДО: ${report.balance_before} звезд`)
      console.log(`   Баланс ПОСЛЕ: ${report.balance_after} звезд`)
      console.log(`   ПРИРОСТ: +${report.balance_after - report.balance_before} звезд`)

      if (report.actions.length > 0) {
        console.log('   Выполненные действия:')
        report.actions.forEach(action => console.log(`     • ${action}`))
      }

      if (report.errors.length > 0) {
        console.log('   Ошибки:')
        report.errors.forEach(error => console.log(`     ❌ ${error}`))
      }
    })

    // Общая статистика
    const successful = reports.filter(r => r.success).length
    const failed = reports.filter(r => !r.success).length
    const totalStarsAdded = reports.reduce((sum, r) => sum + (r.balance_after - r.balance_before), 0)

    console.log('\n' + '='*80)
    console.log('📊 ОБЩАЯ СТАТИСТИКА')
    console.log('='*80)
    console.log(`Всего пользователей: ${reports.length}`)
    console.log(`Успешно обработано: ${successful}`)
    console.log(`Ошибок: ${failed}`)
    console.log(`Всего добавлено звезд: ${totalStarsAdded}`)
    console.log(`Всем установлена подписка: NEUROVIDEO`)

    if (successful === reports.length) {
      console.log('\n🎉 ВСЕ ОПЕРАЦИИ ЗАВЕРШЕНЫ УСПЕШНО!')
    } else {
      console.log(`\n⚠️ ВНИМАНИЕ: ${failed} операций завершились с ошибками`)
    }
  }
}

// Запуск
async function main() {
  try {
    console.log('🔗 Инициализация подключения к Supabase...')
    console.log(`📡 URL: ${SUPABASE_URL}`)
    console.log(`🔑 Ключ: ${SUPABASE_SERVICE_KEY ? '***УСТАНОВЛЕН***' : 'НЕ НАЙДЕН'}`)

    const operations = new SupabaseUserOperations()
    await operations.processAllUsers()

  } catch (error) {
    console.error('💥 КРИТИЧЕСКАЯ ОШИБКА:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main().catch(console.error)
}

export { SupabaseUserOperations }