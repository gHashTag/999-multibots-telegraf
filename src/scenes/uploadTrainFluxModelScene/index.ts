import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { createImagesZip } from '../../helpers/images/createImagesZip'
import { ensureSupabaseAuth } from '@/core/supabase'
import { generateModelTraining } from '@/modules/digitalAvatarBody/generateModelTraining'
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

    // Альтернативный путь для сохранения, если основной не работает
    const alternativeFilesDir = '/app/public/files/'
    const alternativeTargetFilePath = path.join(
      alternativeFilesDir,
      zipFileName
    )
    console.log(
      'Alternative server file path for ZIP:',
      alternativeTargetFilePath
    )

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

    // Пробуем также создать альтернативную директорию
    try {
      if (!fs.existsSync(alternativeFilesDir)) {
        console.log(
          'Creating alternative server files directory:',
          alternativeFilesDir
        )
        fs.mkdirSync(alternativeFilesDir, { recursive: true })
      }
      // Проверяем права доступа к альтернативной директории
      fs.access(alternativeFilesDir, fs.constants.W_OK, err => {
        if (err) {
          console.error(
            'No write access to alternative directory:',
            alternativeFilesDir,
            'Error:',
            err
          )
        } else {
          console.log(
            'Write access confirmed for alternative directory:',
            alternativeFilesDir
          )
        }
      })
    } catch (error) {
      console.error('Error creating alternative server files directory:', error)
    }

    // Копируем ZIP-файл в целевую директорию на сервере
    try {
      console.log('Copying ZIP file to server directory...')
      fs.copyFileSync(zipPath, targetFilePath)
      console.log('ZIP file copied to server directory:', targetFilePath)
    } catch (error) {
      console.error('Error copying ZIP file to server directory:', error)
      throw new Error(`Failed to copy ZIP file to server: ${error.message}`)
    }

    // Пробуем также создать в альтернативную директорию
    try {
      console.log('Copying ZIP file to alternative server directory...')
      fs.copyFileSync(zipPath, alternativeTargetFilePath)
      console.log(
        'ZIP file copied to alternative server directory:',
        alternativeTargetFilePath
      )
    } catch (error) {
      console.error(
        'Error copying ZIP file to alternative server directory:',
        error
      )
    }

    // Проверяем, существует ли файл в целевой директории
    if (!fs.existsSync(targetFilePath)) {
      console.error('ZIP file not found in server directory:', targetFilePath)
      throw new Error('ZIP file was not copied to server directory')
    }

    // Проверяем, существует ли файл в альтернативной директории
    if (!fs.existsSync(alternativeTargetFilePath)) {
      console.error(
        'ZIP file not found in alternative server directory:',
        alternativeTargetFilePath
      )
    } else {
      console.log(
        'ZIP file confirmed in alternative server directory:',
        alternativeTargetFilePath
      )
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

    await generateModelTraining(
      zipUrl,
      triggerWord,
      ctx.session.modelName || 'defaultModelName',
      ctx.session.steps || 1000,
      ctx.from.id,
      isRussian(ctx),
      ctx as any,
      ctx.botInfo?.username || 'botName',
      ctx.session.gender || 'male'
    )

    // Закомментировано, так как файл уже удаляется в createModelTraining.js
    // await deleteFile(zipPath)
  } catch (error) {
    console.error('Error in uploadTrainFluxModelScene:', error)
    //await sendGenericErrorMessage(ctx, isRu, error)
  } finally {
    await ctx.scene.leave()
  }
})

export default uploadTrainFluxModelScene
