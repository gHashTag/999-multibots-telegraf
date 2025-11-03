import express from 'express'
import { Router } from 'express'

const router: Router = express.Router()

/**
 * 🔍 ДИАГНОСТИЧЕСКИЙ ENDPOINT для Template 2
 * GET /api/diagnostic/template2
 */
router.get('/diagnostic/template2', async (req: any, res: any) => {
  const diagnostic = {
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      HAS_DOTENV: !!process.env.RENDER_INNGEST_EVENT_KEY,
    },
    renderInngest: {
      EVENT_KEY_SET: !!process.env.RENDER_INNGEST_EVENT_KEY,
      EVENT_KEY_PREFIX: process.env.RENDER_INNGEST_EVENT_KEY?.substring(0, 20) || 'NOT_SET',
      SIGNING_KEY_SET: !!process.env.RENDER_INNGEST_SIGNING_KEY,
      SIGNING_KEY_PREFIX: process.env.RENDER_INNGEST_SIGNING_KEY?.substring(0, 20) || 'NOT_SET',
      BASE_URL: process.env.RENDER_INNGEST_BASE_URL || 'NOT_SET',
    },
    apiKeys: {
      ELEVENLABS_SET: !!process.env.ELEVENLABS_API_KEY,
      HEDRA_SET: !!process.env.HEDRA_API_KEY,
      HEYGEN_COCOAGE_SET: !!process.env.HEYGEN_COCOAGE_API_KEY,
      HEYGEN_HAIM_SET: !!process.env.HEYGEN_HAIM_API_KEY,
      KIE_AI_SET: !!process.env.KIE_AI_API_KEY,
    },
    botInngest: {
      EVENT_KEY_SET: !!process.env.BOT_INNGEST_EVENT_KEY,
      BASE_URL: process.env.BOT_INNGEST_BASE_URL || 'NOT_SET',
    },
  }

  // Проверяем InngestProvider
  try {
    const { inngestProvider } = await import('@/inngest_app/inngest-provider')
    const renderConfig = inngestProvider.getConfig('RENDER')

    diagnostic.inngestProvider = {
      INITIALIZED: renderConfig !== null,
      RENDER_CONFIG: {
        HAS_EVENT_KEY: !!renderConfig?.eventKey,
        HAS_CLIENT: !!renderConfig?.client,
        HAS_BASE_URL: !!renderConfig?.baseUrl,
      },
    }
  } catch (error) {
    diagnostic.inngestProvider = {
      ERROR: error instanceof Error ? error.message : 'Unknown error',
    }
  }

  res.json(diagnostic)
})

export default router
