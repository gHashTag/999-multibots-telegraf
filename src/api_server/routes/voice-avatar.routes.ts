import { Router } from 'express'
import { generateVoiceAvatar } from '@/services/generateVoiceAvatar'

const router = Router()

router.post('/generate/voice-avatar', async (req, res) => {
  try {
    const {
      imageUrl,
      prompt,
      telegram_id,
      is_ru = false,
      bot_name
    } = req.body

    // Создаем минимальный контекст для API роута
    const mockCtx = {
      from: { username: 'api_user' },
      chat: { id: telegram_id },
      telegram: {
        sendChatAction: async () => {},
      },
      reply: async () => {},
    } as any

    const result = await generateVoiceAvatar(
      imageUrl,
      prompt,
      telegram_id,
      mockCtx,
      is_ru,
      bot_name
    )

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('Voice avatar error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
})

export default router
