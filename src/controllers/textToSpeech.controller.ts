import { Request, Response, NextFunction } from 'express'
import { inngest } from '@/inngest-functions/clients'
import { v4 as uuidv4 } from 'uuid'
export class TextToSpeechController {
  public textToSpeech = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { text, voice_id, telegram_id, is_ru, bot_name } = req.body

      // Валидация входных данных
      if (!text) {
        res.status(400).json({ message: 'Text is required' })
        return
      }
      if (!voice_id) {
        res.status(400).json({ message: 'Voice_id is required' })
        return
      }
      if (!telegram_id) {
        res.status(400).json({ message: 'Telegram_id is required' })
        return
      }
      if (is_ru === undefined) {
        res.status(400).json({ message: 'Is_ru is required' })
        return
      }
      if (!bot_name) {
        res.status(400).json({ message: 'Bot_name is required' })
        return
      }

      // Отправляем событие в Inngest
      await inngest.send({
        id: `tts-${telegram_id}-${Date.now()}-${uuidv4().substring(0, 8)}`,
        name: 'text-to-speech.requested',
        data: {
          text,
          voice_id,
          telegram_id,
          is_ru,
          bot_name,
          username: req.body.username,
        },
      })

      res.status(200).json({ message: 'Processing started' })
    } catch (error) {
      next(error)
    }
  }
}
