import { supabase, supabaseAdmin } from './client'
import { logger } from '@/utils/logger'
import { Payment, PaymentStatus } from '@/interfaces' // Предполагаем, что есть интерфейс Payment
import { PostgrestError } from '@supabase/supabase-js'

/**
 * Находит платеж по InvId со статусом PENDING.
 * @param invId ID инвойса Robokassa
 */
export const getPendingPayment = async (
  invId: string
): Promise<{ data: Payment | null; error: any }> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('payments_v2') // Убедитесь, что таблица называется 'payments'
      .select('*')
      .eq('InvId', invId)
      .eq('status', 'PENDING')
      .single() // Ожидаем один или ноль результатов

    if (error && error.code !== 'PGRST116') {
      // Игнорируем ошибку "ноль строк"
      throw error
    }
    return { data: data as Payment | null, error: null }
  } catch (error: any) {
    logger.error(`Error in getPendingPayment for InvId ${invId}:`, {
      error: error.message,
    })
    return { data: null, error }
  }
}

/**
 * Находит любой платеж по InvId (независимо от статуса).
 * Используется для проверки, был ли платеж уже обработан.
 * @param invId ID инвойса Robokassa
 */
export const getPaymentByInvId = async (
  invId: string
): Promise<{ data: Payment | null; error: any }> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('payments_v2')
      .select('*')
      .eq('InvId', invId)
      .maybeSingle() // Может быть один или ноль

    if (error && error.code !== 'PGRST116') {
      // Игнорируем ошибку "ноль строк"
      throw error
    }
    return { data: data as Payment | null, error: null }
  } catch (error: any) {
    logger.error(`Error in getPaymentByInvId for InvId ${invId}:`, {
      error: error.message,
    })
    return { data: null, error }
  }
}

/**
 * Обновляет статус платежа по InvId.
 * @param invId ID инвойса
 * @param newStatus Новый статус ('SUCCESS', 'FAILED', etc.)
 */
export const updatePaymentStatus = async (
  invId: string,
  newStatus: 'SUCCESS' | 'FAILED' | string // Типизируем для ясности
): Promise<{ data: any; error: any }> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('payments_v2')
      .update({ status: newStatus, updated_at: new Date() })
      .eq('InvId', invId)
      .select() // Возвращаем обновленные данные для логгирования/проверки

    if (error) {
      throw error
    }
    // Проверяем, был ли найден и обновлен платеж
    if (!data || data.length === 0) {
      logger.warn(
        `[updatePaymentStatus] Payment with InvId ${invId} not found for update.`
      )
      // Можно вернуть специфическую ошибку или null
      return {
        data: null,
        error: { message: `Payment with InvId ${invId} not found.` },
      }
    }
    return { data, error: null }
  } catch (error: any) {
    logger.error(
      `Error in updatePaymentStatus for InvId ${invId} to status ${newStatus}:`,
      { error: error.message }
    )
    return { data: null, error }
  }
}
