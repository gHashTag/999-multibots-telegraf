import { Router } from 'express'
import { generateVoiceAvatar } from '@/services/generateVoiceAvatar'

const router = Router()

router.post('/generate/voice-avatar', async (req, res) => {
  try {
    const { text, voice_id, telegram_id } = req.body

    const result = await generateVoiceAvatar({
      text,
      voice_id,
      telegram_id
    })

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
