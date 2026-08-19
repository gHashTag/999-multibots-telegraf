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

    // ПОМЕТКА ПРОИСХОЖДЕНИЯ. Всё, что пришло сюда, должно быть отличимо в
    // данных от того, что человек сделал в боте.
    //
    // Зачем: маршрут был открыт всем (закрыто в PR #527), и когда я пошёл
    // искать следы использования, выяснилось, что ИХ НЕЛЬЗЯ ОТЛИЧИТЬ.
    // `directPaymentProcessor` записывает service_type жёстко, а bot_name
    // берёт от вызывающего — то есть запись через API и через бота выглядят
    // одинаково. «Следов не найдено» в такой ситуации не значит ничего.
    //
    // Поэтому если бот не назван, пишем `api-route`: дальше это видно в
    // payments_v2.bot_name и в assets.bot_name.
    const originBotName = bot_name || 'api-route'

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
      originBotName,
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
