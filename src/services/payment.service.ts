import { supabase } from '@/core/supabase'
import { inngest } from '@/inngest-functions/clients'
import { logger } from '@/utils/logger'
import {
  BasePayment,
  Payment,
  PaymentCreateParams,
  PaymentProcessResult,
  PaymentStatus,
  PAYMENT_ERROR_MESSAGES,
  PAYMENT_SUCCESS_MESSAGES,
} from '@/interfaces/payments.interface'

export class PaymentService {
  private readonly tableName = 'payments_v2'

  async createPayment(
    params: PaymentCreateParams
  ): Promise<PaymentProcessResult> {
    try {
      if (!params.amount || params.amount <= 0) {
        logger.error('❌ Invalid payment amount:', params.amount)
        return {
          success: false,
          message: PAYMENT_ERROR_MESSAGES.INVALID_AMOUNT,
        }
      }

      const existingPayment = await this.findExistingPayment(params)
      if (existingPayment) {
        logger.warn('⚠️ Duplicate payment detected:', {
          operation_id: params.operation_id,
          inv_id: params.inv_id,
        })
        return {
          success: false,
          message: PAYMENT_ERROR_MESSAGES.DUPLICATE_PAYMENT,
          payment: existingPayment,
        }
      }

      const payment: BasePayment = {
        telegram_id: params.telegram_id,
        amount: params.amount,
        stars: params.stars,
        type: params.type,
        description: params.description,
        bot_name: params.bot_name,
        service_type: params.service_type,
        payment_method: params.payment_method || 'System',
        operation_id: params.operation_id,
        inv_id: params.inv_id,
        status: PaymentStatus.PENDING,
        metadata: params.metadata,
      }

      const { data, error } = await supabase
        .from(this.tableName)
        .insert(payment)
        .select()
        .single()

      if (error) {
        logger.error('❌ Error creating payment:', error)
        return {
          success: false,
          message: PAYMENT_ERROR_MESSAGES.SYSTEM_ERROR,
          error: error.message,
        }
      }

      logger.info('✅ Payment created successfully:', data)
      return {
        success: true,
        message: PAYMENT_SUCCESS_MESSAGES.PAYMENT_CREATED,
        payment: data,
      }
    } catch (error) {
      logger.error('❌ Error in createPayment:', error)
      return {
        success: false,
        message: PAYMENT_ERROR_MESSAGES.SYSTEM_ERROR,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async updatePaymentStatus(
    paymentId: string,
    status: PaymentStatus
  ): Promise<PaymentProcessResult> {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .update({ status })
        .eq('id', paymentId)
        .select()
        .single()

      if (error) {
        logger.error('❌ Error updating payment status:', error)
        return {
          success: false,
          message: PAYMENT_ERROR_MESSAGES.SYSTEM_ERROR,
          error: error.message,
        }
      }

      logger.info('✅ Payment status updated successfully:', {
        paymentId,
        status,
      })
      return {
        success: true,
        message: PAYMENT_SUCCESS_MESSAGES.PAYMENT_COMPLETED,
        payment: data,
      }
    } catch (error) {
      logger.error('❌ Error in updatePaymentStatus:', error)
      return {
        success: false,
        message: PAYMENT_ERROR_MESSAGES.SYSTEM_ERROR,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  private async findExistingPayment(
    params: PaymentCreateParams
  ): Promise<Payment | null> {
    try {
      let query = supabase.from(this.tableName).select()

      if (params.operation_id) {
        query = query.eq('operation_id', params.operation_id)
      }
      if (params.inv_id) {
        query = query.eq('inv_id', params.inv_id)
      }

      const { data, error } = await query.single()

      if (error) {
        if (error.code === 'PGRST116') {
          return null
        }
        throw error
      }

      return data
    } catch (error) {
      logger.error('❌ Error in findExistingPayment:', error)
      return null
    }
  }

  async sendPaymentProcessEvent(payment: BasePayment): Promise<void> {
    try {
      await inngest.send({
        name: 'payment/process',
        data: {
          telegram_id: payment.telegram_id,
          amount: payment.amount,
          stars: payment.stars,
          type: payment.type,
          description: payment.description,
          bot_name: payment.bot_name,
          service_type: payment.service_type,
        },
      })
      logger.info('✅ Payment process event sent successfully')
    } catch (error) {
      logger.error('❌ Error sending payment process event:', error)
      throw error
    }
  }
}
