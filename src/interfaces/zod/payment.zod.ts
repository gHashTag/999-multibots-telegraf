import { z } from 'zod'

// Enum для статуса платежа
export const PaymentStatusEnum = z.enum(['PENDING', 'COMPLETED', 'FAILED'])
export type PaymentStatus = z.infer<typeof PaymentStatusEnum>

// Enum для типа операции
export const OperationTypeEnum = z.enum([
  'MONEY_INCOME',
  'MONEY_OUTCOME',
  'BONUS',
  'REFUND',
  'SUBSCRIPTION_PURCHASE',
  'SUBSCRIPTION_RENEWAL',
  'REFERRAL',
  'SYSTEM',
])
export type OperationType = z.infer<typeof OperationTypeEnum>

// Основная схема для payments_v2
export const PaymentV2Schema = z.object({
  id: z.number(),
  telegram_id: z.number(),
  payment_date: z.string().datetime(),
  amount: z.number(),
  description: z.string().nullable(),
  metadata: z.record(z.any()).default({}),
  stars: z.number(),
  currency: z.string().default('STARS'),
  inv_id: z.string().nullable(),
  invoice_url: z.string().nullable(),
  status: PaymentStatusEnum,
  type: OperationTypeEnum,
  service_type: z.string().nullable(),
  model_name: z.string().nullable(), // Название модели (kling_video, haiper_video, neuro_photo и т.д.)
  operation_id: z.string().nullable(),
  bot_name: z.string(),
  language: z.string().default('ru'),
  payment_method: z.string().nullable(),
  subscription_type: z.string().nullable(),
  is_system_payment: z.boolean().default(false),
  created_at: z.string().datetime(),
  cost: z.number().nullable(), // Себестоимость операции в звездах
})

export type PaymentV2 = z.infer<typeof PaymentV2Schema>

// Схема для создания нового платежа
export const CreatePaymentV2Schema = PaymentV2Schema.omit({
  id: true,
  created_at: true,
  payment_date: true,
}).partial({
  amount: true,
  metadata: true,
  stars: true,
  currency: true,
  inv_id: true,
  invoice_url: true,
  operation_id: true,
  language: true,
  payment_method: true,
  subscription_type: true,
  is_system_payment: true,
  cost: true,
})

export type CreatePaymentV2 = z.infer<typeof CreatePaymentV2Schema>

// Схема для обновления платежа
export const UpdatePaymentV2Schema = PaymentV2Schema.partial().omit({
  id: true,
  telegram_id: true,
  created_at: true,
})

export type UpdatePaymentV2 = z.infer<typeof UpdatePaymentV2Schema>

// Схема для фильтрации платежей
export const PaymentFilterSchema = z.object({
  telegram_id: z.number().optional(),
  bot_name: z.string().optional(),
  type: OperationTypeEnum.optional(),
  status: PaymentStatusEnum.optional(),
  service_type: z.string().optional(),
  model_name: z.string().optional(), // Фильтр по модели
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  limit: z.number().min(1).max(1000).default(100),
  offset: z.number().min(0).default(0),
})

export type PaymentFilter = z.infer<typeof PaymentFilterSchema>

// Схема для статистики платежей
export const PaymentStatsSchema = z.object({
  total_income: z.number(),
  total_outcome: z.number(),
  total_cost: z.number(), // Общая себестоимость
  net_profit: z.number(), // Чистая прибыль (income - outcome - cost)
  profit_margin: z.number(), // Маржинальность в процентах
  transaction_count: z.number(),
  unique_users: z.number(),
  avg_transaction_value: z.number(),
  cost_percentage: z.number(), // Процент себестоимости от оборота
})

export type PaymentStats = z.infer<typeof PaymentStatsSchema>

// Схема для статистики по сервисам с учетом себестоимости
export const ServiceStatsSchema = z.object({
  service_type: z.string(),
  model_name: z.string().nullable(), // Модель в рамках сервиса
  transaction_count: z.number(),
  total_revenue: z.number(),
  total_cost: z.number(),
  profit: z.number(),
  profit_margin: z.number(), // Маржинальность сервиса в процентах
  cost_percentage: z.number(), // Процент себестоимости
  avg_transaction_value: z.number(),
})

export type ServiceStats = z.infer<typeof ServiceStatsSchema>
