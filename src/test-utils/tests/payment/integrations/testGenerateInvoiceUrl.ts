import { TestResult } from '@/test-utils/types'
import { testGenerateInvoiceUrl } from '@/scenes/getRuBillWizard/helper'
import { logger } from '@/utils/logger'

export async function runTestGenerateInvoiceUrl(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста генерации URL для Robokassa...', {
      description: 'Starting Robokassa URL generation test',
    })

    // Тестовая сумма
    const testAmount = 100

    // Генерируем URL
    const url = await testGenerateInvoiceUrl(testAmount)

    // Проверяем, что URL содержит test.robokassa.ru (для тестового режима)
    if (!url.includes('test.robokassa.ru')) {
      throw new Error('URL does not contain test.robokassa.ru domain')
    }

    // Проверяем, что URL содержит все необходимые параметры
    const urlParams = new URL(url).searchParams
    if (
      !urlParams.get('MerchantLogin') ||
      !urlParams.get('OutSum') ||
      !urlParams.get('InvId') ||
      !urlParams.get('Description') ||
      !urlParams.get('SignatureValue')
    ) {
      throw new Error('URL is missing required parameters')
    }

    logger.info('✅ Тест генерации URL успешно пройден', {
      description: 'URL generation test passed successfully',
      url,
    })

    return {
      success: true,
      message: 'URL generation test passed successfully',
      name: 'Test Generate Invoice URL',
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred'
    logger.error('❌ Ошибка при тестировании генерации URL', {
      description: 'Error during URL generation test',
      error: errorMessage,
    })

    return {
      success: false,
      message: `URL generation test failed: ${errorMessage}`,
      name: 'Test Generate Invoice URL',
    }
  }
}
