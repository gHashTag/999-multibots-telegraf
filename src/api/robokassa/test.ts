import {
  Router,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express'
import { testGenerateInvoiceUrl } from '@/scenes/getRuBillWizard/helper'
import { logger } from '@/utils/logger'

interface TestRequest extends ExpressRequest {
  body: {
    amount: number
  }
}

const router = Router()

router.post('/test-url', async (req: TestRequest, res: ExpressResponse) => {
  try {
    const { amount } = req.body

    if (!amount || typeof amount !== 'number') {
      return res.status(400).json({
        status: 'error',
        message: 'Amount is required and must be a number',
      })
    }

    const url = await testGenerateInvoiceUrl(amount)

    logger.info('✅ Тестовый URL чека сгенерирован:', {
      description: 'Test invoice URL generated',
      url,
    })

    return res.json({
      status: 'success',
      url,
    })
  } catch (error) {
    logger.error('❌ Ошибка при генерации тестового URL:', {
      description: 'Error generating test URL',
      error: error instanceof Error ? error.message : String(error),
    })

    return res.status(500).json({
      status: 'error',
      message: 'Failed to generate test URL',
    })
  }
})

export default router
