import { z } from 'zod'
import {
  Currency,
  PaymentStatus,
  PaymentType,
} from '@/interfaces/payments.interface' // Предполагаем, что эти enums уже есть
import { SubscriptionType } from '@/interfaces/subscription.interface' // Enum для типов подписок
import { ModeEnum } from '@/interfaces/modes' // Enum для service_type

// Базовая схема для payments_v2
export const PaymentV2Schema = z.object({
  id: z.string().uuid().readonly(), // Генерируется БД, только для чтения при выборке
  inv_id: z.string().min(1),
  telegram_id: z.string().min(1),
  bot_name: z.string().optional(),
  amount: z.number().positive(),
  stars: z.number().int().positive(),
  currency: z.nativeEnum(Currency),
  status: z.nativeEnum(PaymentStatus),
  type: z.enum([PaymentType.MONEY_INCOME, PaymentType.MONEY_OUTCOME]), // Строго согласно правилу
  payment_method: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(), // Используем z.record(z.unknown()) для большей гибкости jsonb
  created_at: z.string().datetime().optional(), // Обычно устанавливается БД
  updated_at: z.string().datetime().optional(), // Обычно обновляется БД
  subscription_type: z.string().nullable().optional(),
  service_type: z.string().nullable().optional(),
  payment_date: z.string().datetime().nullable().optional(),
  invoice_url: z.string().url().nullable().optional(),
  cost: z.number().nullable().optional(), // Добавляем cost, опциональный и может быть null
})

// Тип, выведенный из схемы, для использования в TypeScript
export type PaymentV2 = z.infer<typeof PaymentV2Schema>

// Схема для создания новой записи в payments_v2
// Убираем readonly поля и делаем некоторые опциональными, если они генерируются БД или не обязательны при создании
export const CreatePaymentV2Schema = z.object({
  inv_id: z.string(),
  telegram_id: z.string(),
  amount: z.number(),
  stars: z.number(),
  currency: z.nativeEnum(Currency),
  status: z.nativeEnum(PaymentStatus),
  type: z.nativeEnum(PaymentType),
  payment_method: z.string().optional(),
  description: z.string().optional(),
  metadata: z.any().optional(), // jsonb, можно уточнить схему позже
  bot_name: z.string().optional(),
  subscription_type: z.string().nullable().optional(),
  service_type: z.string().nullable().optional(),
  payment_date: z.string().datetime().nullable().optional(),
  invoice_url: z.string().url().nullable().optional(),
  cost: z.number().nullable().optional(), // Добавляем cost, опциональный и может быть null
})

// Тип для создания новой записи
export type CreatePaymentV2 = z.infer<typeof CreatePaymentV2Schema>
