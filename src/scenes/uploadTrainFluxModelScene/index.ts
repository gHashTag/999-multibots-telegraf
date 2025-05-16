import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { createImagesZip } from '../../helpers/images/createImagesZip'
import { ensureSupabaseAuth } from '@/core/supabase'
import { createModelTraining } from '@/services/createModelTraining'
import { isRussian } from '@/helpers/language'
import { deleteFile } from '@/helpers'
import { sendGenericErrorMessage } from '@/menu'
import { supabase } from '@/core/supabase'
import fetch from 'node-fetch'
const fs = require('fs')
const path = require('path')

export const uploadTrainFluxModelScene = new Scenes.BaseScene<MyContext>(
  'uploadTrainFluxModelScene'
)

uploadTrainFluxModelScene.enter(async ctx => {
  const isRu = isRussian(ctx)
  console.log('Scene: ZIP')
  try {
    await ctx.reply(isRu ? '⏳ Создаю архив...' : '⏳ Creating archive...')
    const zipPath = await createImagesZip(ctx.session.images)
    console.log('ZIP created at:', zipPath)

    // Формируем URL для ZIP-файла, предполагая, что сервер обслуживает файлы из директории
    // Используем предоставленный URL сервера
    const baseServerUrl =
      'https://999-multibots-telegraf-u14194.vm.elestio.app/files/'
    const zipFileName = zipPath.split('/').pop() || `training_${Date.now()}.zip`
    const zipUrl = `${baseServerUrl}${zipFileName}`
    console.log('Generated ZIP URL for training:', zipUrl)

    // Определяем целевую директорию на сервере, которая соответствует /etc/nginx/html/files/
    // Предполагаем, что в контейнере Docker эта директория доступна
    const serverFilesDir = '/etc/nginx/html/files/'
    const targetFilePath = path.join(serverFilesDir, zipFileName)
    console.log('Target server file path for ZIP:', targetFilePath)

    // Проверяем, существует ли директория, и создаем её, если нет
    try {
      if (!fs.existsSync(serverFilesDir)) {
        console.log('Creating server files directory:', serverFilesDir)
        fs.mkdirSync(serverFilesDir, { recursive: true })
      }
      // Проверяем права доступа к директории
      fs.access(serverFilesDir, fs.constants.W_OK, err => {
        if (err) {
          console.error(
            'No write access to directory:',
            serverFilesDir,
            'Error:',
            err
          )
        } else {
          console.log('Write access confirmed for directory:', serverFilesDir)
        }
      })
    } catch (error) {
      console.error('Error creating server files directory:', error)
      throw new Error(`Failed to create server directory: ${error.message}`)
    }

    // Копируем ZIP-файл в целевую директорию на сервере
    try {
      console.log('Copying ZIP file to server directory...')
      fs.copyFileSync(zipPath, targetFilePath)
      console.log('ZIP file copied to server directory:', targetFilePath)

      // Дополнительное логирование прав файла
      try {
        const stats = fs.statSync(targetFilePath)
        console.log('File stats after copy:', JSON.stringify(stats, null, 2))
        console.log(
          `File permissions after copy (octal): ${stats.mode.toString(8)}`
        )
      } catch (statError) {
        console.error('Error getting file stats after copy:', statError)
      }
    } catch (error) {
      console.error('Error copying ZIP file to server directory:', error)
      throw new Error(`Failed to copy ZIP file to server: ${error.message}`)
    }

    // Проверяем, существует ли файл в целевой директории
    if (!fs.existsSync(targetFilePath)) {
      console.error('ZIP file not found in server directory:', targetFilePath)
      throw new Error('ZIP file was not copied to server directory')
    }

    // Функция для проверки доступности URL
    const checkUrlAccessibility = async url => {
      try {
        const response = await fetch(url, { method: 'HEAD' })
        if (response.ok) {
          console.log('ZIP URL is accessible:', url)
          return true
        } else {
          console.error(
            'ZIP URL is not accessible:',
            url,
            'Status:',
            response.status
          )
          return false
        }
      } catch (error) {
        console.error('Error checking ZIP URL accessibility:', error)
        return false
      }
    }

    // Проверяем доступность серверного URL
    const isUrlAccessible = await checkUrlAccessibility(zipUrl)
    if (!isUrlAccessible) {
      console.error('Server ZIP URL is not accessible:', zipUrl)
      throw new Error('Failed to access ZIP URL from server')
    }

    await ensureSupabaseAuth()

    // Получаем gender из состояния сцены или сессии
    const sceneState = ctx.scene.state as { gender?: string }
    const gender = sceneState?.gender || ctx.session.gender

    if (!gender) {
      console.error(
        'Error in uploadTrainFluxModelScene: Gender not found in session or scene state.'
      )
      await ctx.reply(
        isRu
          ? '❌ Ошибка: пол не определен. Попробуйте начать заново.'
          : '❌ Error: Gender not specified. Please try starting over.'
      )
      return ctx.scene.leave()
    }
    console.log(`[uploadTrainFluxModelScene] Using gender: ${gender}`)

    await ctx.reply(isRu ? '⏳ Загружаю архив...' : '⏳ Uploading archive...')

    const triggerWord = `${ctx.session.username?.toLocaleUpperCase()}`
    if (!triggerWord) {
      await ctx.reply(
        isRu ? '❌ Некорректный trigger word' : '❌ Invalid trigger word'
      )
      return ctx.scene.leave()
    }

    await ctx.reply(
      isRu
        ? `⏳ Начинаю обучение модели...\n\nВаша модель будет натренирована через 1-2 часа. После завершения вы сможете проверить её работу, используя раздел "Модели" в Нейрофото.`
        : `⏳ Starting model training...\n\nYour model will be trained in 1-2 hours. Once completed, you can check its performance using the "Models" section in Neurophoto.`
    )

    await createModelTraining(
      {
        filePath: zipPath,
        triggerWord,
        modelName: ctx.session.modelName,
        steps: ctx.session.steps,
        telegram_id: ctx.session.targetUserId.toString(),
        is_ru: isRu,
        botName: ctx.botInfo?.username,
        gender: gender,
      },
      ctx
    )

    // Закомментировано, так как файл уже удаляется в createModelTraining.js
    await deleteFile(zipPath)
  } catch (error) {
    console.error('Error in uploadTrainFluxModelScene:', error)
    //await sendGenericErrorMessage(ctx, isRu, error)
  } finally {
    await ctx.scene.leave()
  }
})

export default uploadTrainFluxModelScene
