/**
 * @fileoverview Типы данных для работы с Supabase
 * @description Определяет типы таблиц и сущностей базы данных
 *
 * Основные таблицы:
 * - users: Пользователи системы
 * - payments_v2: Платежные операции
 * - subscriptions: Подписки пользователей
 * - referrals: Реферальная система
 * - assets: Медиа-ресурсы
 *
 * @example
 * // Пример использования типов для платежа
 * const payment: Tables['payments_v2']['Row'] = {
 *   telegram_id: '123456789',
 *   amount: 100,
 *   type: 'money_income',
 *   status: 'COMPLETED'
 *   // ...остальные поля
 * }
 */

import type { SupabaseSchema } from './database.types'

// Экспортируем основные типы из схемы
export type Tables = SupabaseSchema['public']['Tables']
export type Enums = SupabaseSchema['public']['Enums']

/**
 * Интерфейс пользователя системы
 * @interface User
 * @property {string} id - Уникальный идентификатор
 * @property {string} telegram_id - ID пользователя в Telegram
 * @property {string} [username] - Имя пользователя в Telegram
 * @property {number} balance - Баланс пользователя
 * @property {boolean} [is_admin] - Флаг администратора
 */
export interface User {
  id: string
  telegram_id: string
  username?: string
  first_name?: string
  last_name?: string
  language_code?: string
  balance: number
  created_at: string
  updated_at: string
  bot_name: string
  is_blocked?: boolean
  is_admin?: boolean
}

/**
 * Интерфейс платежной операции
 * @interface Payment
 * @property {string} payment_id - Уникальный идентификатор платежа
 * @property {string} telegram_id - ID пользователя
 * @property {number} amount - Сумма операции (всегда положительная)
 * @property {string} type - Тип операции (money_income|money_expense|etc)
 * @property {string} status - Статус операции
 */
export interface Payment {
  payment_id: string
  telegram_id: string
  amount: number
  stars?: number
  type: string
  description: string
  status: string
  created_at: string
  updated_at: string
  bot_name: string
  payment_method: string
  service_type: string
  inv_id?: string
  operation_id?: string
}

/**
 * Конфигурация бота
 * @interface BotConfig
 * @property {string} id - Уникальный идентификатор бота
 * @property {string} name - Имя бота
 * @property {string} token - Токен бота от BotFather
 * @property {string} webhook_url - URL для вебхуков
 */
export interface BotConfig {
  id: string
  name: string
  token: string
  webhook_url: string
  created_at: string
  updated_at: string
}

/**
 * Тип для JSON-данных в Supabase
 * @typedef {(string|number|boolean|null|object|array)} Json
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Экспортируем типы таблиц
export type { SupabaseSchema }
