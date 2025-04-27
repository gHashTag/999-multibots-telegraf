// import { replicate } from '@/core/replicate'

// import {
//   getUserByTelegramIdString,
//   saveVideoUrlToSupabase,
// } from '@/core/supabase'
// import { downloadFile } from '@/helpers'

// import { processBalanceVideoOperation } from '@/price/helpers'
// import { updateUserLevelPlusOne } from '@/core/supabase'
// import { mkdir, writeFile } from 'fs/promises'
// import path from 'path'
// import { getBotByName } from '@/core/bot'
// import { sendServiceErrorToAdmin } from '@/helpers/error'
// import { VIDEO_MODELS } from '@/interfaces/cost.interface'
// import { VideoModel } from '@/interfaces'

// interface ReplicateResponse {
//   id: string
//   output: string
// }

// export const truncateText = (text: string, maxLength: number): string => {
//   console.log(
//     `✂️ Truncating text from ${text.length} to max ${maxLength} chars`
//   )
//   return text.length > maxLength
//     ? text.substring(0, maxLength - 3) + '...'
//     : text
// }

// export const generateImageToVideo = async (
//   imageUrl: string,
//   prompt: string,
//   videoModel: string,
//   telegram_id: string,
//   username: string,
//   is_ru: boolean,
//   bot_name: string
// ): Promise<{ videoUrl?: string; prediction_id?: string } | string> => {
//   const { bot } = getBotByName(bot_name)
//   if (!bot) {
//     console.error(`Bot instance not found for name: ${bot_name}`)
//     throw new Error('Bot instance not found')
//   }

//   try {
//     console.log('Start generateImageToVideo', {
//       imageUrl,
//       prompt,
//       videoModel,
//       telegram_id,
//       username,
//       is_ru,
//       bot_name,
//     })
//     if (!imageUrl) throw new Error('Image is required')
//     if (!prompt) throw new Error('Prompt is required')
//     if (!videoModel) throw new Error('Video model is required')
//     if (!telegram_id) throw new Error('Telegram ID is required')
//     if (!username) throw new Error('Username is required')
//     if (!bot_name) throw new Error('Bot name is required')

//     const userExists = await getUserByTelegramIdString(telegram_id)
//     if (!userExists) {
//       throw new Error(`User with ID ${telegram_id} does not exist.`)
//     }
//     const level = userExists.level
//     if (level === 8) {
//       await updateUserLevelPlusOne(telegram_id, level)
//     }

//     const { bot: botFromBotName } = getBotByName(bot_name)

//     // Создаём временный ctx для processBalanceVideoOperation
//     const ctx = {
//       from: { id: telegram_id },
//       botInfo: { username: bot_name },
//       telegram: botFromBotName?.telegram,
//     } as any // MyContext
//     const { newBalance, paymentAmount } = await processBalanceVideoOperation(
//       ctx,
//       videoModel as VideoModel,
//       is_ru
//     )

//     if (typeof newBalance !== 'number') {
//       throw new Error('newBalance is undefined')
//     }

//     botFromBotName.telegram.sendMessage(
//       telegram_id,
//       is_ru ? '⏳ Генерация видео...' : '⏳ Generating video...',
//       {
//         reply_markup: {
//           remove_keyboard: true,
//         },
//       }
//     )

//     const runModel = async (
//       model: `${string}/${string}` | `${string}/${string}:${string}`,
//       input: any
//     ): Promise<ReplicateResponse> => {
//       const result = (await replicate.run(model, {
//         input,
//       })) as ReplicateResponse

//       return result
//     }

//     const imageBuffer = await downloadFile(imageUrl)
//     const modelConfig = VIDEO_MODELS.find(m => m.name === videoModel)
//     if (!modelConfig) {
//       throw new Error(`🚫 Unsupported service: ${videoModel}`)
//     }

//     // 🎯 Формируем параметры для модели
//     // !!! НАЧАЛО ПРОБЛЕМНОГО БЛОКА: Закомментировано из-за отсутствия данных о Replicate модели !!!
//     // Необходим маппинг videoModel ('minimax', 'haiper'...) на полный ID модели Replicate
//     // и знание структуры input для каждой модели (включая ключ для image).
//     /*
//     const modelInput = {
//       // ...modelConfig.api.input, // Ошибка: .api не существует
//       prompt,
//       aspect_ratio: userExists.aspectRatio,
//       // [(modelConfig.imageKey || 'image') as string]: imageBuffer, // Ошибка: .imageKey не существует
//     }

//     const result = await runModel(
//       // modelConfig.api.model as shortModelUrl, // Ошибка: .api не существует
//       'placeholder/replicate-model-id' as shortModelUrl, // <-- ЗАМЕНИТЬ НА РЕАЛЬНЫЙ ID
//       modelInput
//     )

//     // 🆕 Добавляем логирование параметров
//     console.log('🎬 Video generation params:', {
//       // model: modelConfig.api.model, // Ошибка: .api не существует
//       model: 'placeholder/replicate-model-id', // <-- ЗАМЕНИТЬ НА РЕАЛЬНЫЙ ID
//       input: {
//         ...modelInput,
//         imageBuffer: imageBuffer?.length ? 'exists' : 'missing', // 🖼 Логируем наличие буфера
//       },
//       userAspectRatio: userExists.aspectRatio,
//       // modelConfig: modelConfig.api.input, // Ошибка: .api не существует
//     })

//     const videoUrl = result?.output ? result.output : result
//     */
//     // !!! КОНЕЦ ПРОБЛЕМНОГО БЛОКА !!!

//     // Временно ставим заглушку, чтобы код ниже не падал
//     const videoUrl: string | undefined = undefined
//     // TODO: Раскомментировать блок выше и исправить его, когда будет информация о моделях Replicate

//     console.log('📹 Generated video URL (Placeholder):', videoUrl)

//     if (videoUrl) {
//       const videoLocalPath = path.join(
//         __dirname,
//         '../uploads',
//         telegram_id.toString(),
//         'image-to-video',
//         `${new Date().toISOString()}.mp4`
//       )
//       await mkdir(path.dirname(videoLocalPath), { recursive: true })

//       // 1. Сохраняем оригинальное видео в Supabase
//       const originalBuffer = await downloadFile(videoUrl as string)
//       await writeFile(videoLocalPath, originalBuffer)
//       await saveVideoUrlToSupabase(
//         telegram_id,
//         videoUrl as string,
//         videoLocalPath,
//         videoModel
//       )

//       await botFromBotName.telegram.sendVideo(telegram_id, {
//         source: videoLocalPath,
//       })

//       await botFromBotName.telegram.sendMessage(
//         telegram_id,
//         is_ru
//           ? `Ваше видео сгенерировано!\n\nСгенерировать еще?\n\nСтоимость: ${paymentAmount.toFixed(
//               2
//             )} ⭐️\nВаш новый баланс: ${newBalance.toFixed(2)} ⭐️`
//           : `Your video has been generated!\n\nGenerate more?\n\nCost: ${paymentAmount.toFixed(
//               2
//             )} ⭐️\nYour new balance: ${newBalance.toFixed(2)} ⭐️`,
//         {
//           reply_markup: {
//             keyboard: [
//               [
//                 {
//                   text: is_ru
//                     ? '🎥 Сгенерировать новое видео?'
//                     : '🎥 Generate new video?',
//                 },
//               ],
//             ],
//           },
//         }
//       )
//       await botFromBotName.telegram.sendVideo(
//         '@neuro_blogger_pulse',
//         { source: videoLocalPath },
//         {
//           caption: (is_ru
//             ? `${username} Telegram ID: ${telegram_id} сгенерировал видео с промптом: ${truncateText(
//                 prompt,
//                 900
//               )}\n\nКоманда: ${videoModel}\n\nBot: @${
//                 botFromBotName.botInfo?.username
//               }`
//             : `${username} Telegram ID: ${telegram_id} generated a video with a prompt: ${truncateText(
//                 prompt,
//                 900
//               )}\n\nCommand: ${videoModel}\n\nBot: @${
//                 botFromBotName.botInfo?.username
//               }`
//           ).slice(0, 1000),
//         }
//       )
//     } else {
//       throw new Error('Video URL is required')
//     }

//     return { videoUrl: videoUrl as string }
//   } catch (error) {
//     console.error('Error in generateImageToVideo:', error)

//     if (!bot) {
//       console.error('Bot instance became unavailable in catch block')
//       throw error
//     }

//     let errorMsg: string
//     if (error instanceof Error) {
//       errorMsg = error.message
//     } else {
//       errorMsg = String(error)
//     }
//     try {
//       await bot.telegram.sendMessage(
//         telegram_id,
//         is_ru
//           ? `Произошла ошибка при генерации видео. Попробуйте еще раз.\n\nОшибка: ${errorMsg}`
//           : `An error occurred during video generation. Please try again.\n\nError: ${errorMsg}`
//       )
//     } catch (sendUserError) {
//       console.error('Failed to send error message to user:', sendUserError)
//     }

//     await sendServiceErrorToAdmin(bot, telegram_id, error as Error)

//     throw error
//   }
// }
