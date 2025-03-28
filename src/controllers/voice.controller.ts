import { Request, Response, NextFunction } from 'express'
import { getBotByName } from '@/core/bot'
import { createVoiceAvatar } from '@/helpers'
import { inngest } from '@/core/inngest/clients'
import { validateUserParams } from '@/middlewares'

export class VoiceController {
  public createAvatarVoice = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { fileUrl, telegram_id, username, is_ru, bot_name } = req.body

      if (!fileUrl) {
        res.status(400).json({ message: 'fileUrl is required' })
        return
      }

      validateUserParams(req)

      // Отправляем событие в Inngest
      await inngest.send({
        name: 'voice-avatar.requested',
        data: {
          fileUrl,
          telegram_id,
          username,
          is_ru,
          bot_name,
        },
      })

      res.status(200).json({ message: 'Voice creation started' })
    } catch (error) {
      next(error)
    }
  }

  // Для обратной совместимости - прямой вызов без Inngest
  public createAvatarVoiceDirect = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { fileUrl, telegram_id, username, is_ru, bot_name } = req.body

      if (!fileUrl) {
        res.status(400).json({ message: 'fileUrl is required' })
        return
      }

      validateUserParams(req)

      res.status(200).json({ message: 'Voice creation started' })

      const { bot } = getBotByName(bot_name)
      createVoiceAvatar(fileUrl, telegram_id, username, is_ru, bot)
    } catch (error) {
      next(error)
    }
  }
}
