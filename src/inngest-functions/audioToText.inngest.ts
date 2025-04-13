/**
 * Функция для обработки аудио и преобразования в текст
 * Обрабатывает события AUDIO_TRANSCRIPTION_EVENT и создает события AUDIO_PROCESSING_COMPLETED_EVENT
 */

import { inngest } from './clients';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { 
  AUDIO_PROCESSING_COMPLETED_EVENT, 
  AUDIO_TRANSCRIPTION_EVENT, 
  CHUNK_SIZE,
  MAX_SINGLE_AUDIO_DURATION,
  TranscriptionModels
} from '../scenes/audioToTextScene/constants';
import { 
  AudioProcessingCompletedEvent, 
  AudioProcessingEvent, 
  TranscriptionResult, 
  TranscriptionSettings 
} from '../scenes/audioToTextScene/types';
import { 
  downloadFile, 
  getUserById, 
  updateUserBalance 
} from '../core/supabase';
import { 
  extractAudioFromVideo, 
  getMediaDuration, 
  splitAudioIntoChunks, 
  cleanupTempFiles 
} from '../services/ffmpeg-service';
import { 
  transcribeAudio, 
  transcribeLongAudio 
} from '../services/openai-service';
import { getBotByName } from '../helpers/bot-helpers';
import { validateAndCalculateAudioTranscriptionPrice } from '../price/helpers';

// Тип события для обработки аудио
interface AudioToTextEvent {
  name: string;
  data: {
    userId: number;
    fileId: string;
    bot_name: string;
    settings: TranscriptionSettings;
    chunks?: Array<{
      start: number;
      end: number;
    }>;
  };
}

// Функция для обработки аудио
export const audioToTextFunction = inngest.createFunction(
  { id: 'audio-to-text-processing' },
  { event: AUDIO_TRANSCRIPTION_EVENT },
  async ({ event, step }: { event: AudioToTextEvent, step: any }) => {
    console.log('🎙️ Начало обработки аудио:', {
      description: 'Starting audio processing',
      event_id: event.name,
      user_id: event.data.userId
    });

    // Валидация входных данных
    const params = event.data;
    if (!params.userId || !params.fileId || !params.bot_name) {
      console.error('❌ Недостаточно данных для обработки аудио:', {
        description: 'Insufficient data for audio processing',
        params
      });
      throw new Error('Недостаточно данных для обработки аудио');
    }

    // Получаем пользователя и проверяем баланс
    const user = await step.run('check-user', () => 
      getUserById(params.userId, params.bot_name)
    );

    if (!user) {
      console.error('❌ Пользователь не найден:', {
        description: 'User not found',
        user_id: params.userId
      });
      throw new Error('Пользователь не найден');
    }

    // Получаем бота
    const botResult = getBotByName(params.bot_name);
    if (!botResult?.bot) {
      console.error('❌ Бот не найден:', {
        description: 'Bot not found',
        bot_name: params.bot_name
      });
      throw new Error(`Бот ${params.bot_name} не найден`);
    }
    const { bot } = botResult;

    try {
      // Скачиваем файл
      const fileUrl = await step.run('get-file', async () => {
        try {
          const fileLink = await bot.telegram.getFileLink(params.fileId);
          return fileLink.toString();
        } catch (error) {
          console.error('❌ Ошибка при получении ссылки на файл:', error);
          throw new Error('Не удалось получить ссылку на файл');
        }
      });

      // Создаем временный файл
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, `audio_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`);
      
      // Скачиваем аудио
      await step.run('download-file', async () => {
        try {
          await downloadFile(fileUrl, tempFilePath);
          console.log('✅ Файл скачан:', tempFilePath);
          
          if (!fs.existsSync(tempFilePath)) {
            throw new Error('Файл не был скачан');
          }
          
          return tempFilePath;
        } catch (error) {
          console.error('❌ Ошибка при скачивании файла:', error);
          throw new Error('Не удалось скачать файл');
        }
      });

      // Проверяем, является ли файл видео
      let audioPath = tempFilePath;
      const isVideo = params.settings?.model ? false : false; // Здесь должна быть реальная проверка
      const filesToCleanup = [tempFilePath];

      // Если это видео, извлекаем аудио
      if (isVideo) {
        audioPath = await step.run('extract-audio', async () => {
          try {
            const extractedAudioPath = await extractAudioFromVideo(tempFilePath);
            filesToCleanup.push(extractedAudioPath);
            return extractedAudioPath;
          } catch (error) {
            console.error('❌ Ошибка при извлечении аудио из видео:', error);
            throw new Error('Не удалось извлечь аудио из видео');
          }
        });
      }

      // Получаем длительность аудио
      const duration = await step.run('get-duration', async () => {
        try {
          return await getMediaDuration(audioPath);
        } catch (error) {
          console.error('❌ Ошибка при определении длительности аудио:', error);
          return 300; // Предполагаем 5 минут, если не удалось определить
        }
      });

      // Расчет стоимости транскрипции
      const priceResult = await step.run('calculate-price', async () => {
        try {
          return await validateAndCalculateAudioTranscriptionPrice(
            user.id,
            duration,
            params.bot_name,
            params.settings?.model || TranscriptionModels.WHISPER_MEDIUM
          );
        } catch (error) {
          console.error('❌ Ошибка при расчете стоимости транскрипции:', error);
          throw new Error('Не удалось рассчитать стоимость транскрипции');
        }
      });

      // Проверяем, достаточно ли средств
      if (user.balance < priceResult.amount) {
        await bot.telegram.sendMessage(
          user.id,
          `❌ Недостаточно средств для транскрипции. Требуется: ${priceResult.amount} кредитов, на балансе: ${user.balance} кредитов.`
        );
        throw new Error('Недостаточно средств для транскрипции');
      }

      // Списываем средства
      await step.run('deduct-balance', async () => {
        try {
          await updateUserBalance(user.id, -priceResult.amount, params.bot_name);
          await bot.telegram.sendMessage(
            user.id, 
            `💸 С вашего баланса списано ${priceResult.amount} кредитов за транскрипцию аудио.`
          );
          return true;
        } catch (error) {
          console.error('❌ Ошибка при списании средств:', error);
          throw new Error('Не удалось списать средства за транскрипцию');
        }
      });

      // Процесс транскрипции
      let transcriptionResult: TranscriptionResult;
      
      if (duration <= MAX_SINGLE_AUDIO_DURATION) {
        // Обработка короткого аудио
        transcriptionResult = await step.run('transcribe-audio', async () => {
          try {
            await bot.telegram.sendMessage(user.id, '🎧 Начинаю транскрипцию аудио...');
            
            const result = await transcribeAudio(
              audioPath,
              params.settings?.language,
              params.settings?.model || TranscriptionModels.WHISPER_MEDIUM
            );
            
            return {
              text: result,
              taskId: `audio_${Date.now()}_${Math.random().toString(36).substring(7)}`,
              language: params.settings?.language || 'auto'
            };
          } catch (error) {
            console.error('❌ Ошибка при транскрипции аудио:', error);
            throw new Error('Не удалось выполнить транскрипцию аудио');
          }
        });
      } else {
        // Обработка длинного аудио
        transcriptionResult = await step.run('transcribe-long-audio', async () => {
          try {
            await bot.telegram.sendMessage(
              user.id, 
              `🎧 Начинаю транскрипцию длинного аудио (${Math.round(duration / 60)} минут)...`
            );
            
            // Разбиваем аудио на части
            const audioParts = await splitAudioIntoChunks(audioPath, CHUNK_SIZE);
            filesToCleanup.push(...audioParts);
            
            // Уведомляем о количестве частей
            await bot.telegram.sendMessage(
              user.id, 
              `📊 Аудио разделено на ${audioParts.length} частей для обработки.`
            );
            
            // Транскрибируем каждую часть
            const result = await transcribeLongAudio(
              audioParts,
              params.settings?.language,
              params.settings?.model || TranscriptionModels.WHISPER_MEDIUM,
              (partIndex, total) => {
                bot.telegram.sendMessage(
                  user.id, 
                  `⏳ Обрабатываю часть ${partIndex + 1} из ${total}...`
                );
              }
            );
            
            return {
              text: result,
              taskId: `audio_long_${Date.now()}_${Math.random().toString(36).substring(7)}`,
              language: params.settings?.language || 'auto'
            };
          } catch (error) {
            console.error('❌ Ошибка при транскрипции длинного аудио:', error);
            throw new Error('Не удалось выполнить транскрипцию длинного аудио');
          }
        });
      }

      // Очищаем временные файлы
      await step.run('cleanup-files', async () => {
        try {
          await cleanupTempFiles(filesToCleanup);
          return true;
        } catch (error) {
          console.log('⚠️ Ошибка при очистке временных файлов:', error);
          return false;
        }
      });

      // Создаем событие о завершении обработки
      await step.run('create-completion-event', async () => {
        const completionEvent: AudioProcessingCompletedEvent = {
          userId: user.id,
          fileId: params.fileId,
          taskId: transcriptionResult.taskId,
          result: transcriptionResult
        };
        
        await inngest.send({
          name: AUDIO_PROCESSING_COMPLETED_EVENT,
          data: completionEvent
        });
        
        return true;
      });

      // Отправляем результат пользователю
      await step.run('send-result', async () => {
        try {
          await bot.telegram.sendMessage(
            user.id, 
            '✅ Транскрипция аудио успешно завершена!'
          );

          // Создаем сообщение с результатом
          const resultText = `📝 *Результат транскрипции:*\n\n${transcriptionResult.text}`;
          
          // Если текст слишком длинный, разбиваем на части
          if (resultText.length <= 4000) {
            await bot.telegram.sendMessage(user.id, resultText, { parse_mode: 'Markdown' });
          } else {
            // Разбиваем текст на части по 4000 символов
            const chunks = [];
            let text = resultText;
            while (text.length > 0) {
              chunks.push(text.substring(0, 4000));
              text = text.substring(4000);
            }
            
            // Отправляем каждую часть
            for (let i = 0; i < chunks.length; i++) {
              await bot.telegram.sendMessage(
                user.id, 
                `${i === 0 ? '📝 *Результат транскрипции:*\n\n' : ''}${chunks[i]}${i === chunks.length - 1 ? '' : '\n(продолжение следует...)'}`,
                { parse_mode: 'Markdown' }
              );
            }
          }
          
          // Отправляем кнопки для экспорта
          await bot.telegram.sendMessage(
            user.id,
            '📥 Выберите формат для экспорта:',
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: 'TXT', callback_data: `export_txt:${transcriptionResult.taskId}` },
                    { text: 'DOCX', callback_data: `export_docx:${transcriptionResult.taskId}` }
                  ],
                  [
                    { text: 'PDF', callback_data: `export_pdf:${transcriptionResult.taskId}` },
                    { text: 'JSON', callback_data: `export_json:${transcriptionResult.taskId}` }
                  ]
                ]
              }
            }
          );
          
          return true;
        } catch (error) {
          console.error('❌ Ошибка при отправке результата:', error);
          
          try {
            await bot.telegram.sendMessage(
              user.id, 
              '⚠️ Произошла ошибка при отправке результата транскрипции, но работа была выполнена. Попробуйте запросить транскрипцию повторно.'
            );
          } catch (sendError) {
            console.error('❌ Не удалось отправить сообщение об ошибке:', sendError);
          }
          
          return false;
        }
      });

      console.log('✅ Обработка аудио успешно завершена:', {
        description: 'Audio processing completed successfully',
        user_id: user.id,
        duration,
        transcription_length: transcriptionResult.text.length
      });

      return {
        success: true,
        userId: user.id,
        fileId: params.fileId,
        taskId: transcriptionResult.taskId
      };
    } catch (error) {
      console.error('❌ Ошибка при обработке аудио:', error);
      
      try {
        await bot.telegram.sendMessage(
          params.userId, 
          `❌ Произошла ошибка при обработке аудио: ${(error as Error).message}`
        );
      } catch (sendError) {
        console.error('❌ Не удалось отправить сообщение об ошибке:', sendError);
      }
      
      throw error;
    }
  }
); 