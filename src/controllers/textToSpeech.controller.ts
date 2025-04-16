import { Request, Response, NextFunction } from 'express'
import { inngest } from '@/inngest-functions/clients'
import { v4 as uuidv4 } from 'uuid'
import { generateSpeech as planBGenerateSpeech } from '@/services/plan_b/generateSpeech'
import { getBotByName } from '@/core/bot'

export class TextToSpeechController {
  public textToSpeech = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
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

    try {
      // Пробуем Plan A (Inngest)
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
      res.status(200).json({ message: 'Processing started (Plan A)' })
    } catch (error) {
      // Если Plan A не сработал — fallback на Plan B
      console.warn('Plan A (Inngest) failed, switching to Plan B', error)
      try {
        const { bot } = getBotByName(bot_name)
        if (!bot) {
          throw new Error('Telegraf instance (bot) not found for Plan B')
        }
        const result = await planBGenerateSpeech({
          text,
          voice_id,
          telegram_id,
          is_ru,
          bot,
          bot_name,
        })
        res.status(200).json({ message: 'Processing started (Plan B)', ...result })
      } catch (planBError) {
        next(planBError)
      }
    }
  }
}
