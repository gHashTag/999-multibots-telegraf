import { Router } from 'express'
import { generateNeuroPhotoHybrid } from '@/services/generateNeuroPhotoHybrid'

const router = Router()

router.post('/generate/neuro-photo-sync', async (req, res) => {
  try {
    const {
      prompt,
      model_url,
      num_images = 1,
      telegram_id,
      bot_name,
      aspect_ratio
    } = req.body

    // Создаем минимальный контекст для API роута
    const mockCtx = {
      session: {
        prompt,
        userModel: model_url,
      },
      from: { username: 'api_user' },
      chat: { id: telegram_id },
      telegram: {
        sendChatAction: async () => {},
        sendPhoto: async () => {},
      },
      reply: async () => {},
      scene: { leave: async () => {} },
    } as any

    const result = await generateNeuroPhotoHybrid(
      prompt,
      model_url,
      num_images,
      telegram_id,
      mockCtx,
      bot_name,
      aspect_ratio
    )

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('Neuro photo error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
})

export default router
