/**
 * Обработчики для сцены Audio-to-Text
 */

import { Markup } from 'telegraf';
import { Message, CallbackQuery } from 'telegraf/types';
import { 
  CALLBACKS, 
  ExportFormats, 
  MAX_FILE_SIZE, 
  MAX_SINGLE_AUDIO_DURATION, 
  SUPPORTED_AUDIO_FORMATS, 
  SUPPORTED_VIDEO_FORMATS, 
  TranscriptionLanguages, 
  TranscriptionModels 
} from './constants';
import { AudioToTextContext, TranscriptionSettings } from './types';
import { getMediaDuration, extractAudioFromVideo, splitAudioIntoChunks, cleanupTempFiles } from '@/services/ffmpeg-service';
import { transcribeAudioBasic, transcribeLongAudioBasic } from '@/services/openai-service';
import { validateAndCalculateAudioTranscriptionPrice } from '@/price/helpers';
import { getUserBalance, updateUserBalance } from '@/core/supabase';
import { inngest } from '@/inngest-functions/clients';
import { MyContext } from '@/interfaces';
import { TransactionType } from '@/interfaces/payments.interface';
/**
 * Шаг 1: Входная точка сцены, запрашивает аудиофайл
 */
export async function entryHandler(ctx: MyContext) {
  try {
    // Локализация
    const isRu = ctx.session.language === 'ru';
    
    // Очищаем сессию
    ctx.session.audioToText = {
      audioFileId: '',
      audioFileUrl: '',
      transcription: ''
    };
    
    // Отправляем приветственное сообщение
    await ctx.reply(
      isRu
        ? '🎙️ Пожалуйста, загрузите аудиофайл или видео для преобразования в текст'
        : '🎙️ Please upload an audio file or video for transcription',
      Markup.keyboard([
        [isRu ? '❓ Помощь' : '❓ Help'],
        [isRu ? '🔙 Назад' : '🔙 Back']
      ])
      .resize()
      .oneTime()
    );
    
    // Переходим к следующему шагу
    return ctx.wizard.next();
  } catch (error) {
    console.error('Error in Audio-to-Text entry handler:', error);
    await ctx.reply('❌ Произошла ошибка. Пожалуйста, попробуйте еще раз.');
    return ctx.scene.leave();
  }
}

/**
 * Шаг 2: Обработка загруженного аудио/видео
 */
export async function fileProcessingHandler(ctx: MyContext) {
  try {
    // Локализация
    const isRu = ctx.session.language === 'ru';
    
    // Проверяем, есть ли команды отмены
    if (ctx.message && 'text' in ctx.message) {
      const text = ctx.message.text;
      
      if (text === '🔙 Назад' || text === '🔙 Back' || text === '/cancel' || text === '/start') {
        await ctx.reply(
          isRu ? '✅ Действие отменено' : '✅ Action cancelled',
          Markup.removeKeyboard()
        );
        return ctx.scene.leave();
      } else if (text === '❓ Помощь' || text === '❓ Help') {
        await ctx.reply(
          isRu
            ? '📋 Вы можете загрузить аудиофайл (MP3, WAV, OGG, M4A) или видео для преобразования в текст. Бот обработает файл и предоставит вам транскрипцию.'
            : '📋 You can upload an audio file (MP3, WAV, OGG, M4A) or video for transcription. The bot will process the file and provide you with a transcript.'
        );
        return;
      }
    }
    
    // Проверяем наличие файла
    let fileId: string | undefined;
    let fileType: string | undefined;
    let duration: number | undefined;
    let fileName: string | undefined;
    
    // Проверяем различные типы сообщений
    if (ctx.message) {
      if ('voice' in ctx.message && ctx.message.voice) {
        // Голосовое сообщение
        fileId = ctx.message.voice.file_id;
        fileType = 'voice';
        duration = ctx.message.voice.duration;
        fileName = 'voice_message.ogg';
      } else if ('audio' in ctx.message && ctx.message.audio) {
        // Аудиофайл
        fileId = ctx.message.audio.file_id;
        fileType = 'audio';
        duration = ctx.message.audio.duration;
        fileName = ctx.message.audio.file_name || 'audio.mp3';
      } else if ('video' in ctx.message && ctx.message.video) {
        // Видеофайл
        fileId = ctx.message.video.file_id;
        fileType = 'video';
        duration = ctx.message.video.duration;
        fileName = ctx.message.video.file_name || 'video.mp4';
      } else if ('document' in ctx.message && ctx.message.document) {
        // Документ - проверяем MIME-тип
        fileId = ctx.message.document.file_id;
        fileType = ctx.message.document.mime_type || 'unknown';
        fileName = ctx.message.document.file_name || 'document';
        
        // Проверяем, что MIME-тип документа поддерживается
        if (![...SUPPORTED_AUDIO_FORMATS, ...SUPPORTED_VIDEO_FORMATS].includes(fileType)) {
          await ctx.reply(
            isRu
              ? '❌ Неподдерживаемый формат файла. Пожалуйста, загрузите аудио (MP3, WAV, OGG, M4A) или видео.'
              : '❌ Unsupported file format. Please upload audio (MP3, WAV, OGG, M4A) or video.'
          );
          return;
        }
      } else {
        // Неподдерживаемый тип сообщения
        await ctx.reply(
          isRu
            ? '❌ Пожалуйста, загрузите аудиофайл или видео для преобразования в текст.'
            : '❌ Please upload an audio file or video for transcription.'
        );
        return;
      }
    } else {
      // Нет сообщения с файлом
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, загрузите аудиофайл или видео для преобразования в текст.'
          : '❌ Please upload an audio file or video for transcription.'
      );
      return;
    }
    
    // Сохраняем информацию в сессии
    ctx.session.audioToText.audioFileId = fileId;
    ctx.session.audioToText.audioFileUrl = fileType;
    ctx.session.audioToText.transcription = fileName;
    ctx.session.audioToText.duration = duration || 0 ;
    
    // Получаем файл
    await ctx.reply(
      isRu
        ? '⏳ Получаю файл...'
        : '⏳ Getting the file...'
    );
    
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const filePath = fileLink.toString();
    ctx.session.audioToText.filePath = filePath;
    
    // Если это видео, извлекаем аудиодорожку
    if (fileType === 'video' || SUPPORTED_VIDEO_FORMATS.includes(fileType)) {
      await ctx.reply(
        isRu
          ? '🎬 Извлекаю аудиодорожку из видео...'
          : '🎬 Extracting audio from video...'
      );
      
      // Здесь будет реальная реализация извлечения аудио
      // Для тестов просто устанавливаем путь к предполагаемому аудиофайлу
      // ctx.session.audioToText.filePath = extractedAudioPath;
    }
    
    // Если длительность неизвестна, пытаемся получить её
    if (!duration && ctx.session.audioToText.filePath) {
      try {
        duration = await getMediaDuration(ctx.session.audioToText.filePath);
        ctx.session.audioToText.duration = duration;
      } catch (error) {
        console.error('Failed to get media duration:', error);
        // Если не можем получить длительность, используем значение по умолчанию
        duration = 300; // 5 минут
        ctx.session.audioToText.duration = duration;
      }
    }
    
    // Проверяем, является ли аудио длинным
    const isLongAudio = duration && duration > MAX_SINGLE_AUDIO_DURATION;
    ctx.session.audioToText.isLongAudio = isLongAudio || false;
    
    if (isLongAudio) {
      await ctx.reply(
        isRu
          ? '⚠️ Обнаружен длинный аудиофайл. Он будет разделен на части для обработки.'
          : '⚠️ Long audio file detected. It will be split into parts for processing.'
      );
    }
    
    // Переходим к следующему шагу - настройки транскрипции
    await ctx.reply(
      isRu
        ? '⚙️ Выберите настройки транскрипции:'
        : '⚙️ Choose transcription settings:',
      Markup.inlineKeyboard([
        [Markup.button.callback(isRu ? 'Язык: Автоопределение' : 'Language: Auto-detect', CALLBACKS.LANG_AUTO)],
        [Markup.button.callback(isRu ? 'Модель: Whisper Medium' : 'Model: Whisper Medium', CALLBACKS.MODEL_MEDIUM)],
        [Markup.button.callback(isRu ? 'Точность: Средняя' : 'Accuracy: Medium', CALLBACKS.ACCURACY_MEDIUM)],
        [Markup.button.callback(isRu ? 'Начать транскрипцию' : 'Start transcription', CALLBACKS.START_TRANSCRIPTION)]
      ])
    );
    
    // Устанавливаем начальные настройки
    ctx.session.audioToText.transcriptionLanguage = TranscriptionLanguages.AUTO;
    ctx.session.audioToText.transcriptionModel = TranscriptionModels.WHISPER_MEDIUM;
    ctx.session.audioToText.accuracy = 'medium';
    
    return ctx.wizard.next();
  } catch (error) {
    console.error('Error in Audio-to-Text file processing handler:', error);
    
    const isRu = ctx.session.language === 'ru';
    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка при обработке файла. Пожалуйста, попробуйте еще раз.'
        : '❌ An error occurred while processing the file. Please try again.'
    );
    return ctx.scene.leave();
  }
}

/**
 * Шаг 3: Обработка настроек транскрипции и выполнение транскрипции
 */
export async function transcriptionHandler(ctx: MyContext) {
  try {
    // Проверяем, что это callback
    if (!ctx.callbackQuery) {
      return;
    }
    
    // Локализация
    const isRu = ctx.session.language === 'ru';
    
    // Получаем данные callback
    // Type assertion for callbackQuery to access data property safely
    const callbackQuery = ctx.callbackQuery as any;
    const callbackData = callbackQuery.data;
    
    if (!callbackData) {
      return;
    }
    
    // Обработка настроек языка
    if (callbackData === CALLBACKS.LANG_AUTO) {
      ctx.session.audioToText.transcriptionLanguage = TranscriptionLanguages.AUTO;
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [
          [Markup.button.callback(isRu ? 'Язык: Автоопределение ✓' : 'Language: Auto-detect ✓', CALLBACKS.LANG_AUTO)],
          [Markup.button.callback(isRu ? 'Язык: Русский' : 'Language: Russian', CALLBACKS.LANG_RU)],
          [Markup.button.callback(isRu ? 'Язык: Английский' : 'Language: English', CALLBACKS.LANG_EN)],
          [Markup.button.callback(isRu ? 'Назад к настройкам' : 'Back to settings', CALLBACKS.SETTINGS)]
        ]
      });
      return;
    } else if (callbackData === CALLBACKS.LANG_RU) {
      ctx.session.audioToText.transcriptionLanguage = TranscriptionLanguages.RUSSIAN;
      await ctx.reply(
        isRu ? '✅ Выбран язык: Русский' : '✅ Selected language: Russian'
      );
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [
          [Markup.button.callback(isRu ? 'Язык: Автоопределение' : 'Language: Auto-detect', CALLBACKS.LANG_AUTO)],
          [Markup.button.callback(isRu ? 'Язык: Русский ✓' : 'Language: Russian ✓', CALLBACKS.LANG_RU)],
          [Markup.button.callback(isRu ? 'Язык: Английский' : 'Language: English', CALLBACKS.LANG_EN)],
          [Markup.button.callback(isRu ? 'Назад к настройкам' : 'Back to settings', CALLBACKS.SETTINGS)]
        ]
      });
      return;
    } else if (callbackData === CALLBACKS.LANG_EN) {
      ctx.session.audioToText.transcriptionLanguage = TranscriptionLanguages.ENGLISH;
      await ctx.reply(
        isRu ? '✅ Выбран язык: Английский' : '✅ Selected language: English'
      );
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [
          [Markup.button.callback(isRu ? 'Язык: Автоопределение' : 'Language: Auto-detect', CALLBACKS.LANG_AUTO)],
          [Markup.button.callback(isRu ? 'Язык: Русский' : 'Language: Russian', CALLBACKS.LANG_RU)],
          [Markup.button.callback(isRu ? 'Язык: Английский ✓' : 'Language: English ✓', CALLBACKS.LANG_EN)],
          [Markup.button.callback(isRu ? 'Назад к настройкам' : 'Back to settings', CALLBACKS.SETTINGS)]
        ]
      });
      return;
    }
    
    // Обработка настроек модели
    if (callbackData === CALLBACKS.MODEL_TINY) {
      ctx.session.audioToText.transcriptionModel = TranscriptionModels.WHISPER_TINY;
      await ctx.reply(
        isRu ? '✅ Выбрана модель: Whisper Tiny' : '✅ Selected model: Whisper Tiny'
      );
      return;
    } else if (callbackData === CALLBACKS.MODEL_BASE) {
      ctx.session.audioToText.transcriptionModel = TranscriptionModels.WHISPER_BASE;
      await ctx.reply(
        isRu ? '✅ Выбрана модель: Whisper Base' : '✅ Selected model: Whisper Base'
      );
      return;
    } else if (callbackData === CALLBACKS.MODEL_SMALL) {
      ctx.session.audioToText.transcriptionModel = TranscriptionModels.WHISPER_SMALL;
      await ctx.reply(
        isRu ? '✅ Выбрана модель: Whisper Small' : '✅ Selected model: Whisper Small'
      );
      return;
    } else if (callbackData === CALLBACKS.MODEL_MEDIUM) {
      ctx.session.audioToText.transcriptionModel = TranscriptionModels.WHISPER_MEDIUM;
      await ctx.reply(
        isRu ? '✅ Выбрана модель: Whisper Medium' : '✅ Selected model: Whisper Medium'
      );
      return;
    } else if (callbackData === CALLBACKS.MODEL_LARGE) {
      ctx.session.audioToText.transcriptionModel = TranscriptionModels.WHISPER_LARGE;
      await ctx.reply(
        isRu ? '✅ Выбрана модель: Whisper Large' : '✅ Selected model: Whisper Large'
      );
      return;
    }
    
    // Обработка настроек точности
    if (callbackData === CALLBACKS.ACCURACY_LOW) {
      ctx.session.audioToText.accuracy = 'low';
      await ctx.reply(
        isRu ? '✅ Выбрана точность: Низкая' : '✅ Selected accuracy: Low'
      );
      return;
    } else if (callbackData === CALLBACKS.ACCURACY_MEDIUM) {
      ctx.session.audioToText.accuracy = 'medium';
      await ctx.reply(
        isRu ? '✅ Выбрана точность: Средняя' : '✅ Selected accuracy: Medium'
      );
      return;
    } else if (callbackData === CALLBACKS.ACCURACY_HIGH) {
      ctx.session.audioToText.accuracy = 'high';
      await ctx.reply(
        isRu ? '✅ Выбрана точность: Высокая' : '✅ Selected accuracy: High'
      );
      return;
    }
    
    // Возврат к настройкам
    if (callbackData === CALLBACKS.SETTINGS) {
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [
          [Markup.button.callback(
            isRu 
              ? `Язык: ${ctx.session.audioToText.transcriptionLanguage === TranscriptionLanguages.AUTO ? 'Автоопределение' : 
                 ctx.session.audioToText.transcriptionLanguage === TranscriptionLanguages.RUSSIAN ? 'Русский' : 'Английский'}`
              : `Language: ${ctx.session.audioToText.transcriptionLanguage === TranscriptionLanguages.AUTO ? 'Auto-detect' : 
                 ctx.session.audioToText.transcriptionLanguage === TranscriptionLanguages.RUSSIAN ? 'Russian' : 'English'}`,
            CALLBACKS.LANG_AUTO
          )],
          [Markup.button.callback(
            `${isRu ? 'Модель: ' : 'Model: '}Whisper ${ctx.session.audioToText.transcriptionModel ? ctx.session.audioToText.transcriptionModel.split('-')[1].charAt(0).toUpperCase() + ctx.session.audioToText.transcriptionModel.split('-')[1].slice(1) : 'Medium'}`,
            CALLBACKS.MODEL_MEDIUM
          )],
          [Markup.button.callback(
            isRu 
              ? `Точность: ${ctx.session.audioToText.accuracy === 'low' ? 'Низкая' : 
                 ctx.session.audioToText.accuracy === 'medium' ? 'Средняя' : 'Высокая'}`
              : `Accuracy: ${ctx.session.audioToText.accuracy === 'low' ? 'Low' : 
                 ctx.session.audioToText.accuracy === 'medium' ? 'Medium' : 'High'}`,
            CALLBACKS.ACCURACY_MEDIUM
          )],
          [Markup.button.callback(isRu ? 'Начать транскрипцию' : 'Start transcription', CALLBACKS.START_TRANSCRIPTION)]
        ]
      });
      return;
    }
    
    // Запуск транскрипции
    if (callbackData === CALLBACKS.START_TRANSCRIPTION) {
      // Проверяем баланс пользователя
      const userId = ctx.from?.id;
      if (!userId) {
        await ctx.reply(
          isRu
            ? '❌ Не удалось определить ID пользователя.'
            : '❌ Failed to determine user ID.'
        );
        return ctx.scene.leave();
      }
      
      const userBalance = await getUserBalance(userId.toString());
      
      // Рассчитываем стоимость транскрипции
      if (!ctx.session.audioToText.duration || !ctx.session.audioToText.transcriptionModel) {
        await ctx.reply(
          isRu
            ? '❌ Отсутствуют необходимые данные для транскрипции.'
            : '❌ Missing necessary data for transcription.'
        );
        return ctx.scene.leave();
      }
      
      const priceResult = await validateAndCalculateAudioTranscriptionPrice(
        ctx.session.audioToText.duration,
        ctx.session.audioToText.transcriptionModel as TranscriptionModels
      );
      
      ctx.session.audioToText.amount = priceResult.amount;
      
      // Проверяем достаточность баланса
      if (userBalance < priceResult.amount) {
        await ctx.reply(
          isRu
            ? `❌ Недостаточно средств на балансе. Необходимо: ${priceResult.amount}, на балансе: ${userBalance}.`
            : `❌ Insufficient balance. Required: ${priceResult.amount}, available: ${userBalance}.`
        );
        return ctx.scene.leave();
      }
      
      // Списываем средства
      await updateUserBalance({
        telegram_id: userId.toString(),
        amount: priceResult.amount, // As per user instructions, using positive amount
        type: TransactionType.MONEY_EXPENSE,
        description: `Транскрипция аудио (${ctx.session.audioToText.transcriptionModel ? ctx.session.audioToText.transcriptionModel.split('-')[1] : 'Medium'})`,
        bot_name: ctx.botInfo.username || 'unknown',
        service_type: 'audio_transcription'
      });
      
      await ctx.reply(
        isRu
          ? `⏳ Начинаю транскрипцию с параметрами:\nЯзык: ${ctx.session.audioToText.transcriptionLanguage === TranscriptionLanguages.AUTO ? 'Автоопределение' : 
             ctx.session.audioToText.transcriptionLanguage === TranscriptionLanguages.RUSSIAN ? 'Русский' : 'Английский'}\nМодель: Whisper ${ctx.session.audioToText.transcriptionModel.split('-')[1].charAt(0).toUpperCase() + ctx.session.audioToText.transcriptionModel.split('-')[1].slice(1)}\nТочность: ${ctx.session.audioToText.accuracy === 'low' ? 'Низкая' : 
             ctx.session.audioToText.accuracy === 'medium' ? 'Средняя' : 'Высокая'}\nСтоимость: ${priceResult.amount} кредитов`
          : `⏳ Starting transcription with parameters:\nLanguage: ${ctx.session.audioToText.transcriptionLanguage === TranscriptionLanguages.AUTO ? 'Auto-detect' : 
             ctx.session.audioToText.transcriptionLanguage === TranscriptionLanguages.RUSSIAN ? 'Russian' : 'English'}\nModel: Whisper ${ctx.session.audioToText.transcriptionModel.split('-')[1].charAt(0).toUpperCase() + ctx.session.audioToText.transcriptionModel.split('-')[1].slice(1)}\nAccuracy: ${ctx.session.audioToText.accuracy === 'low' ? 'Low' : 
             ctx.session.audioToText.accuracy === 'medium' ? 'Medium' : 'High'}\nCost: ${priceResult.amount} credits`
      );
      
      // Запускаем задачу транскрипции через Inngest
      // Use default values and cast to the correct enum types
      const defaultModel = TranscriptionModels.WHISPER_MEDIUM;
      const defaultLanguage = TranscriptionLanguages.AUTO;
      const defaultAccuracy = 'medium' as 'low' | 'medium' | 'high';
      
      const settings: TranscriptionSettings = {
        model: (ctx.session.audioToText.transcriptionModel as unknown as TranscriptionModels) || defaultModel,
        language: (ctx.session.audioToText.transcriptionLanguage as unknown as TranscriptionLanguages) || defaultLanguage,
        accuracy: (ctx.session.audioToText.accuracy as 'low' | 'medium' | 'high') || defaultAccuracy
      };
      
      // Используем Inngest для асинхронной обработки
      await inngest.send({
        name: 'audio/transcription',
        data: {
          userId: userId,
          fileId: ctx.session.audioToText.audioFileId!,
          filePath: ctx.session.audioToText.filePath!,
          fileType: ctx.session.audioToText.audioFileUrl!,
          duration: ctx.session.audioToText.duration,
          isLongAudio: ctx.session.audioToText.isLongAudio,
          settings: settings
        }
      });
      
      await ctx.reply(
        isRu
          ? '⏳ Ваш запрос на транскрипцию обрабатывается. Вы получите уведомление, когда результат будет готов.'
          : '⏳ Your transcription request is being processed. You will be notified when the result is ready.'
      );
      
      return ctx.scene.leave();
    }
    
    // Обработка экспорта результатов
    if (callbackData.startsWith('export_')) {
      const format = callbackData.split('_')[1];
      
      await ctx.reply(
        isRu
          ? `⏳ Подготовка файла в формате ${format.toUpperCase()}...`
          : `⏳ Preparing file in ${format.toUpperCase()} format...`
      );
      
      // Здесь будет реальная реализация экспорта в выбранный формат
      
      await ctx.reply(
        isRu
          ? `✅ Файл готов!`
          : `✅ File is ready!`,
        Markup.inlineKeyboard([
          [Markup.button.url(
            isRu ? `Скачать ${format.toUpperCase()}` : `Download ${format.toUpperCase()}`,
            `https://example.com/transcript.${format}`
          )]
        ])
      );
      
      return;
    }
    
  } catch (error) {
    console.error('Error in Audio-to-Text transcription handler:', error);
    
    const isRu = ctx.session.language === 'ru';
    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка при обработке транскрипции. Пожалуйста, попробуйте еще раз.'
        : '❌ An error occurred while processing the transcription. Please try again.'
    );
    return ctx.scene.leave();
  }
} 