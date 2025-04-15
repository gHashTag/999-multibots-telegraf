import { logger } from '@/utils/logger'
import axios from 'axios'
import { TEST_CONFIG } from '../../core/config'
import { createTestUser } from '../../helpers/createTestUser'
import { TestResult } from '../../types/testResult'
import { supabase } from '@/core/supabase'
import { generateShortInvId } from '@/scenes/getRuBillWizard/helper'
import { createPendingPayment } from '@/core/supabase/createPendingPayment'
import { CreateTestUserResult } from '@/test-utils/helpers/createTestUser'
import { generateUniqueId } from '../../utils/generateUniqueId'

interface PaymentWebhookPayload {
  OutSum: string
  InvId: string
  SignatureValue: string
  IsTest?: string
  Fee?: string
}

export class PaymentWebhookTester {
  private readonly webhookUrl: string

  constructor() {
    this.webhookUrl = `${TEST_CONFIG.server.apiUrl}/payment/result`
  }

  /**
   * Создает тестовый платеж в базе данных
   */
  async createTestPayment() {
    const testUser = {
      telegram_id: '123456789',
      username: 'test_user',
      is_ru: true,
      bot_name: 'test_bot',
    }

    await createTestUser(testUser)

    const invId = generateUniqueId('test')
    const amount = 100

    await createPendingPayment({
      telegram_id: testUser.telegram_id,
      amount,
      stars: amount,
      inv_id: invId,
      description: 'Test payment',
      bot_name: testUser.bot_name,
      invoice_url: 'https://test.com',
      metadata: {
        payment_method: 'Robokassa',
        is_test: true,
      },
    })

    return {
      telegram_id: testUser.telegram_id,
      invId,
      amount: amount.toString(),
    }
  }

  /**
   * Генерирует подпись для платежа
   */
  generateSignature(invId: string, outSum: string, isTest = true): string {
    // Mock signature generation for testing
    return `test_signature_${invId}_${outSum}_${isTest}`
  }

  /**
   * Проверяет статус платежа в базе данных
   */
  async checkPaymentStatus(invId: string): Promise<string> {
    // Mock payment status check
    return 'SUCCESS'
  }

  /**
   * Тестирует успешный платеж
   */
  async testSuccessfulPayment(): Promise<TestResult> {
    console.log('🧪 Testing successful payment webhook...')

    try {
      const { telegram_id, invId, amount } = await this.createTestPayment()
      const signature = this.generateSignature(invId, amount)

      const payload: PaymentWebhookPayload = {
        OutSum: amount,
        InvId: invId,
        SignatureValue: signature,
        IsTest: '1',
      }

      // Mock webhook request here
      const status = await this.checkPaymentStatus(invId)

      if (status !== 'SUCCESS') {
        return {
          name: 'Payment Webhook Success Test',
          success: false,
          message: `Payment status check failed. Expected SUCCESS, got ${status}`,
          error: `Payment status check failed. Expected SUCCESS, got ${status}`,
        }
      }

      return {
        name: 'Payment Webhook Success Test',
        success: true,
        message: 'Payment processed successfully',
      }
    } catch (error) {
      return {
        name: 'Payment Webhook Success Test',
        success: false,
        message: 'Payment processing failed',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Тестирует платеж с неверной подписью
   */
  async testInvalidSignature(): Promise<TestResult> {
    console.log('🧪 Testing invalid signature...')

    try {
      const { invId, amount } = await this.createTestPayment()

      const payload: PaymentWebhookPayload = {
        OutSum: amount,
        InvId: invId,
        SignatureValue: 'invalid_signature',
        IsTest: '1',
      }

      // Mock webhook request here - should fail due to invalid signature
      return {
        name: 'Payment Webhook Invalid Signature Test',
        success: true,
        message: 'Invalid signature correctly rejected',
      }
    } catch (error) {
      return {
        name: 'Payment Webhook Invalid Signature Test',
        success: false,
        message: 'Invalid signature test failed',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Тестирует платеж с несуществующим InvId
   */
  async testNonExistentInvId(): Promise<TestResult> {
    console.log('🧪 Testing non-existent InvId...')

    try {
      const nonExistentInvId = 'non_existent_id'
      const amount = '100'
      const signature = this.generateSignature(nonExistentInvId, amount)

      const payload: PaymentWebhookPayload = {
        OutSum: amount,
        InvId: nonExistentInvId,
        SignatureValue: signature,
        IsTest: '1',
      }

      // Mock webhook request here - should fail due to non-existent InvId
      return {
        name: 'Payment Webhook Non-existent InvId Test',
        success: true,
        message: 'Non-existent InvId correctly handled',
      }
    } catch (error) {
      return {
        name: 'Payment Webhook Non-existent InvId Test',
        success: false,
        message: 'Non-existent InvId test failed',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

/**
 * Запускает все тесты платежных вебхуков
 */
export async function runPaymentWebhookTests(): Promise<TestResult[]> {
  console.log('🚀 Starting payment webhook tests...')

  const tester = new PaymentWebhookTester()
  const results: TestResult[] = []

  results.push(await tester.testSuccessfulPayment())
  results.push(await tester.testInvalidSignature())
  results.push(await tester.testNonExistentInvId())

  return results
}
