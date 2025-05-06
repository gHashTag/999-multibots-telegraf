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

    // Проверяем доступность URL перед использованием
    try {
      const response = await fetch(zipUrl, { method: 'HEAD' })
      if (response.ok) {
        console.log('ZIP URL is accessible:', zipUrl)
      } else {
        console.error(
          'ZIP URL is not accessible:',
          zipUrl,
          'Status:',
          response.status
        )
        throw new Error(`ZIP URL is not accessible: ${response.status}`)
      }
    } catch (error) {
      console.error('Error checking ZIP URL accessibility:', error)
      throw new Error(`Failed to access ZIP URL: ${error.message}`)
    }

    // Копируем ZIP-файл в директорию на сервере, которая доступна через указанный URL
    // Предполагаем, что сервер обслуживает файлы из директории, соответствующей /files/
    // Шаг 1: Определите, какая директория на сервере обслуживает файлы для публичного доступа через URL
    // Например, это может быть /var/www/html/files или /app/public/files
    // Шаг 2: Установите путь к этой директории через переменную окружения SERVER_FILES_DIR или напрямую в коде
    const serverFilesDir = process.env.SERVER_FILES_DIR || './public/files/'
    console.log('Using server files directory:', serverFilesDir)
    console.log(
      'Checking if SERVER_FILES_DIR environment variable is set:',
      !!process.env.SERVER_FILES_DIR
    )
    const serverZipPath = path.join(serverFilesDir, zipFileName)
    console.log('Target server path for ZIP file:', serverZipPath)
    if (!fs.existsSync(serverFilesDir)) {
      console.log('Creating server files directory:', serverFilesDir)
      try {
        fs.mkdirSync(serverFilesDir, { recursive: true })
        console.log(
          'Successfully created server files directory:',
          serverFilesDir
        )
      } catch (error) {
        console.error('Error creating server files directory:', error)
        throw new Error(
          `Failed to create server files directory: ${error.message}`
        )
      }
    } else {
      console.log('Server files directory already exists:', serverFilesDir)
    }
    try {
      fs.copyFileSync(zipPath, serverZipPath)
      console.log(
        'ZIP file successfully copied to server directory:',
        serverZipPath
      )
      // Проверяем, существует ли файл в целевой директории после копирования
      if (fs.existsSync(serverZipPath)) {
        console.log('Verified: ZIP file exists at target path:', serverZipPath)
      } else {
        console.error(
          'Error: ZIP file does not exist at target path:',
          serverZipPath
        )
        throw new Error('Failed to verify ZIP file at target path')
      }
    } catch (error) {
      console.error('Error copying ZIP file to server directory:', error)
      throw new Error(
        `Failed to copy ZIP file to server directory: ${error.message}`
      )
    }

    await ensureSupabaseAuth()

    await ctx.reply(isRu ? '⏳ Загружаю архив...' : '⏳ Uploading archive...')

    // Загружаем ZIP-файл в Supabase Storage - закомментировано, так как используем серверный URL
    /*
    const fileName = `training_zips/${Date.now()}_${ctx.from.id}.zip`
    const fileBuffer = await Bun.file(zipPath).arrayBuffer()
    const { data, error } = await supabase.storage
      .from('training-data')
      .upload(fileName, fileBuffer, { contentType: 'application/zip' })
    if (error) {
      console.error('Error uploading ZIP to Supabase Storage:', error)
      throw new Error(`Failed to upload ZIP file to storage: ${error.message}`)
    }
    console.log('ZIP uploaded to Supabase Storage:', data)

    // Получаем публичный URL для загруженного файла
    const { data: publicUrlData } = supabase.storage
      .from('training-data')
      .getPublicUrl(fileName)
    const zipUrlSupabase = publicUrlData.publicUrl
    console.log('Public ZIP URL obtained:', zipUrlSupabase)
    */

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
