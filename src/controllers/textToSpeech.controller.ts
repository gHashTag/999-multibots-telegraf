import { Request, Response, NextFunction } from 'express'
import { inngest } from '@/core/inngest/clients'

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
