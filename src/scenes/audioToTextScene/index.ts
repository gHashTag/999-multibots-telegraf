/**
 * Сцена Audio-to-Text для преобразования аудио и видео в текст
 */

import { Scenes } from 'telegraf'
import { SCENE_ID } from './constants'
import {
  entryHandler,
  fileProcessingHandler,
  transcriptionHandler,
} from './handlers'
import { MyContext } from '@/interfaces'

/**
 * Создает сцену Audio-to-Text
 * @returns Сцена Wizard для преобразования аудио в текст
 */
export const audioToTextScene = (): Scenes.WizardScene<MyContext> => {
  const scene = new Scenes.WizardScene<MyContext>(
    SCENE_ID,
    entryHandler,
    fileProcessingHandler,
    transcriptionHandler
  )

  // Добавляем обработчик начала сцены для инициализации данных
  scene.enter(async ctx => {
    // Если сессия не инициализирована, создаем ее
    if (!ctx.session.audioToText) {
      ctx.session.audioToText = {
        audioFileId: '',
        audioFileUrl: '',
        transcription: '',
      }
    }

    // Запускаем первый шаг
    await entryHandler(ctx)
  })

  return scene
}

export default audioToTextScene()
