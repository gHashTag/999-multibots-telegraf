import { Router } from 'express'
import { generateNeuroPhotoHybrid } from '@/services/generateNeuroPhotoHybrid'

const router = Router()

router.post('/generate/neuro-photo-sync', async (req, res) => {
  try {
    const { prompt, telegram_id, bot_name } = req.body

    const result = await generateNeuroPhotoHybrid({
      prompt,
      telegram_id,
      bot_name
    })

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
