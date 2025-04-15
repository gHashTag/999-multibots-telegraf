import { Router } from 'express'
import { CustomRequest, CustomResponse } from '../index'
import { logger } from '@/utils/logger'
import { testGenerateInvoiceUrl } from '@/scenes/getRuBillWizard/helper'

const router = Router()

interface TestRequest extends CustomRequest {
  body: {
    amount: number
    telegram_id: string
  }
}

router.post('/', async (req: TestRequest, res: CustomResponse) => {
  logger.info('🚀 Starting Robokassa form test...')

  try {
    const { amount } = req.body

    // Validate input
    if (!amount) {
      throw new Error('Missing required parameters')
    }

    // Generate test invoice URL
    const invoiceUrl = await testGenerateInvoiceUrl(amount)

    logger.info('✅ Test invoice URL generated:', {
      description: 'Generated test invoice URL',
      url: invoiceUrl,
    })

    return res.status(200).json({
      success: true,
      invoiceUrl,
      message: 'Click the link below to test the payment form:',
      htmlLink: `<a href="${invoiceUrl}" target="_blank">Open payment form</a>`,
    })
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    logger.error('❌ Test error:', errorMessage)
    return res.status(500).json({ error: errorMessage })
  }
})

export default router
