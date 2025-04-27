// import { createWriteStream } from 'fs'
// import path from 'path'
// import os from 'os'
// import { elevenlabs } from '@/core/elevenlabs'

// import type { Message, Update } from "telegraf/types"
// import {
//   getUserByTelegramIdString,
//   updateUserLevelPlusOne,
// } from '@/core/supabase'
// import {
//   sendServiceErrorToUser,
//   sendServiceErrorToAdmin,
// } from '@/helpers/error'
// import { Telegraf } from 'telegraf'
// import type { MyContext } from '@/interfaces'
// import { modeCosts } from '@/price/helpers/modelsCost'
// import { ModeEnum } from '@/interfaces/modes';
// import { processBalanceOperation, sendBalanceMessage } from '@/price/helpers'
// import { PaymentType } from '@/interfaces/payments.interface'

// export const generateSpeech = async ({
//   text,
//   voice_id,
//   telegram_id,
//   is_ru,
//   bot,
//   bot_name,
// }: {
//   text: string
//   voice_id: string
//   telegram_id: string
//   is_ru: boolean
//   bot: Telegraf<MyContext>
//   bot_name: string
// }): Promise<{ audioUrl: string }> => {
//   console.log('telegram_id', telegram_id)
//   const userExists = await getUserByTelegramIdString(telegram_id)
//   console.log('userExists', userExists)
//   if (!userExists) {
//     throw new Error(`User with ID ${telegram_id} does not exist.`)
//   }
//   const level = userExists.level
//   if (level === 7) {
//     await updateUserLevelPlusOne(telegram_id, level)
//   }
//   // // Проверка баланса для всех изображений
//   // const balanceCheck = await processBalanceOperation({
//   //   telegram_id: Number(telegram_id),
//   //   paymentAmount: modeCosts[ModeEnum.TextToSpeech] as number,
//   //   is_ru,
//   //   type: PaymentType.MONEY_OUTCOME,
//   // })

//   // if (!balanceCheck.success) {
//   //   throw new Error(balanceCheck.error)
//   // }

//   // return new Promise<{ audioUrl: string }>((resolve, reject) => {
//   //   try {
//   //     // Проверяем наличие API ключа
//   //     if (!process.env.ELEVENLABS_API_KEY) {
//   //       throw new Error('ELEVENLABS_API_KEY отсутствует')
//   //     }
//   //     bot.telegram.sendMessage(
//   //       telegram_id,
//   //       is_ru ? '⏳ Генерация аудио...' : '⏳ Generating audio...'
//   //     )
//   //     // Логируем попытку генерации

//   //     const audioStream = await elevenlabs.generate({
//   //       voice: voice_id,
//   //       model_id: 'eleven_turbo_v2_5',
//   //       text,
//   //     })

//   //     const audioUrl = path.join(os.tmpdir(), `audio_${Date.now()}.mp3`)
//   //     const writeStream = createWriteStream(audioUrl)

//   //     audioStream.pipe(writeStream)

//   //     writeStream.on('finish', () => {
//   //       const audio = { source: audioUrl }
//   //       bot.telegram.sendAudio(telegram_id, audio as InputFile, {
//   //         reply_markup: {
//   //           keyboard: [
//   //             [
//   //               {
//   //                 text: is_ru ? '🎙️ Текст в голос' : '🎙️ Текст в голос',
//   //               },
//   //               { text: is_ru ? '🏠 Главное меню' : '🏠 Main menu' },
//   //             ],
//   //           ],
//   //         },
//   //       })
//   //       bot.telegram.sendMessage(
//   //         telegram_id,
//   //         is_ru
//   //           ? `Стоимость: ${(
//   //               modeCosts[ModeEnum.TextToSpeech] as number
//   //             ).toFixed(2)} ⭐️\nВаш баланс: ${(
//   //               balanceCheck.newBalance || 0
//   //             ).toFixed(2)} ⭐️`
//   //           : `Cost: ${(modeCosts[ModeEnum.TextToSpeech] as number).toFixed(
//   //               2
//   //             )} ⭐️\nYour balance: ${(balanceCheck.newBalance || 0).toFixed(
//   //               2
//   //             )} ⭐️`
//   //       )
//   //       resolve({ audioUrl })
//   //     })

//   //     writeStream.on('error', error => {
//   //       console.error('Error writing audio file:', error)
//   //       reject(error)
//   //     })
//   //   } catch (error: any) {
//   //     console.error('Error generating speech:', error)
//   //     await sendServiceErrorToUser(bot, telegram_id, error as Error, is_ru)
//   //     await sendServiceErrorToAdmin(bot, telegram_id, error as Error)
//   //     console.error('Error in createAudioFileFromText:', {
//   //       message: error.message,
//   //       statusCode: error.statusCode,
//   //       stack: error.stack,
//   //     })
//   //     reject(error)
//   //   }
//   // })
// }
