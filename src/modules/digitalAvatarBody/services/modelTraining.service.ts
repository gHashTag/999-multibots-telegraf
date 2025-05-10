import axios, { AxiosError, AxiosResponse } from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import path from 'path'
import type { ModelTrainingRequest, ModelTrainingResponse, ModelTrainingInngestEventData } from '../types'
import type { DigitalAvatarBodyDependencies } from '../index'
import { MyContext } from '@/interfaces'
import { PaymentType } from '@/interfaces/payments.interface'

/* // Закомментируем эту функцию, так как она не используется и вызывает ошибку с logger
// Функция для кодирования файла в base64 (остается для справки или потенциального использования)
async function encodeFileToBase64(filePath: string): Promise<string> {
  try {
    const fileBuffer = fs.readFileSync(filePath)
    return fileBuffer.toString('base64')
  } catch (error) {
    // logger.error({ // Здесь была бы ошибка, если бы функция использовалась
    //   message: '❌ Ошибка при кодировании файла в base64',
    //   error: (error as Error).message, 
    //   filePath,
    // })
    throw error
  }
}
*/

// Функция-фабрика для сервиса
export function createModelTrainingService(dependencies: DigitalAvatarBodyDependencies) {
  const {
    inngest,
    logger,
    config,
    replicate,
    updateUserBalance,
    getUserBalance,
    sendTelegramMessage
  } = dependencies

  // Вспомогательная функция для загрузки файла и получения URL
  async function uploadFileAndGetUrl(filePath: string): Promise<string> {
    try {
      const fileStats = fs.statSync(filePath)
      const fileSizeMB = fileStats.size / (1024 * 1024)

      logger.info({
        message: '📏 Размер файла для загрузки',
        fileSizeMB: fileSizeMB.toFixed(2) + ' МБ',
        fileSize: fileStats.size,
      })

      const fileName = path.basename(filePath)
      const timestamp = Date.now()
      
      const uploadBaseDir = config.CONFIG_UPLOAD_DIR || path.join(process.cwd(), 'uploads');
      const permanentDir = path.join(uploadBaseDir, 'training_archives');

      if (!fs.existsSync(permanentDir)) {
        fs.mkdirSync(permanentDir, { recursive: true })
      }

      const destFileName = `${path.parse(fileName).name}_${timestamp}${
        path.parse(fileName).ext
      }`
      const destPath = path.join(permanentDir, destFileName)

      fs.copyFileSync(filePath, destPath)
      
      const apiUrlForUpload = config.API_URL || 'http://localhost:3000';
      const fullUrl = `${apiUrlForUpload}/uploads/training_archives/${destFileName}`

      logger.info({
        message: '✅ Файл сохранен в постоянное хранилище и доступен по URL',
        path: destPath,
        fullUrl,
        urlLength: fullUrl.length,
      })
      return fullUrl
    } catch (error) {
      logger.error({
        message: '❌ Ошибка при сохранении файла',
        error: (error as Error).message, // Явное приведение к типу Error
      })
      throw new Error(`Ошибка при сохранении файла: ${(error as Error).message}`)
    }
  }

  // Основная функция сервиса, возвращаемая фабрикой
  return async function modelTrainingService(
    requestData: ModelTrainingRequest,
    ctx: MyContext 
  ): Promise<ModelTrainingResponse> {
    const telegramId = requestData.telegram_id;
    const isRu = requestData.is_ru;

    // --- 1. Логика стоимости ---
    const operationTypeForCost = PaymentType.NEURO_TRAIN_LORA;
    const cost = config.COSTS?.[operationTypeForCost];

    if (cost === undefined || cost === null) {
      logger.error({
        message: `💰 Стоимость для операции ${operationTypeForCost} не найдена в конфигурации.`,
        telegramId,
      });
      // Отправляем сообщение пользователю об ошибке конфигурации
      await sendTelegramMessage?.(
        telegramId,
        isRu
          ? '❌ Ошибка конфигурации: не удалось определить стоимость операции. Пожалуйста, сообщите администратору.'
          : '❌ Configuration error: could not determine the operation cost. Please notify an administrator.'
      );
      return {
        success: false,
        message: 'Ошибка конфигурации стоимости.',
        error: 'cost_configuration_error',
        details: `Стоимость для ${operationTypeForCost} не найдена.`,
        cost: 0, // Возвращаем 0, так как стоимость не определена
      };
    }
    
    logger.info({
      message: `💰 Рассчитана стоимость для операции ${operationTypeForCost}`,
      telegramId,
      cost,
    });
    // --- Конец логики стоимости ---

    const USE_PLAN_B_DIRECT_CALL = process.env.USE_MODEL_TRAINING_PLAN_B === 'true'

    if (USE_PLAN_B_DIRECT_CALL) {
      // ================= PLAN B LOGIC (локальный вызов Replicate) =================
      logger.info({
        message: '🚀 Запуск тренировки модели через ПЛАН Б (прямой вызов Replicate)',
        requestData: { ...requestData, file_path: `${requestData.file_path.substring(0,20)}...` },
        cost, // Логируем стоимость и для Плана Б
      })
      try {
        if (!fs.existsSync(requestData.file_path)) {
          throw new Error('Файл не найден (План Б): ' + requestData.file_path)
        }

        const zipUrl = await uploadFileAndGetUrl(requestData.file_path);
        logger.info({
          message: '🔗 Загружен файл для Replicate (План Б)',
          model_name: requestData.model_name,
          telegramId: requestData.telegram_id,
          zipUrl: zipUrl,
        });

        const modelIdString = config.REPLICATE?.TRAINING_MODEL_ID || 'stability-ai/sdxl';
        const modelVersion = config.REPLICATE?.TRAINING_MODEL_VERSION || 'c221b2b8ef527988fb59bf24a8b97c4561f1c671f73bd389f866fe846a6de608';
        
        const [modelOwner, modelName] = modelIdString.split('/');
        if (!modelOwner || !modelName) {
          throw new Error(`Некорректный формат TRAINING_MODEL_ID: ${modelIdString}. Ожидается 'owner/name'.`);
        }

        // Проверка model_name из requestData перед использованием
        if (!requestData.model_name || typeof requestData.model_name !== 'string' || requestData.model_name.trim() === '') {
          throw new Error('Некорректное имя модели (model_name) в запросе.');
        }
        
        const webhookUrl = `${config.API_URL}/replicate-webhook/training-complete`;
        const replicateDestination = `neuroblogger/${requestData.model_name}` as const; // Используем as const для более строгого типа

        const trainingInput = {
          input_images: zipUrl,
          //lora_training_urls: zipUrl, // Для некоторых моделей может быть так
          instance_prompt: `a photo of ${requestData.trigger_word} person`,
          class_prompt: 'a photo of a person',
          // Дополнительные параметры могут зависеть от конкретной модели Replicate
          // model_name: requestData.model_name, // Может быть нужно для некоторых моделей
          // ckpt_base: 'sdxl_1_0.safetensors', // Пример базовой модели
        };
        
        logger.info({ message: 'Данные для Replicate (План Б)', input: trainingInput, model: `${modelOwner}/${modelName}:${modelVersion}`, destination: replicateDestination, webhookUrl });

        const prediction = await replicate.trainings.create(
          modelOwner,
          modelName,
          modelVersion,
          {
            // destination: webhookUrl, // НЕПРАВИЛЬНО БЫЛО ЗДЕСЬ
            destination: replicateDestination, // ПРАВИЛЬНО
            input: trainingInput,
            webhook: webhookUrl, // ПРАВИЛЬНО
            webhook_events_filter: ['completed'],
          }
        );
        
        logger.info({
          message: '✅ Тренировка Replicate успешно запущена (План Б)',
          replicateTrainingId: prediction.id,
          status: prediction.status,
          telegram_id: requestData.telegram_id,
        });
        
        if (fs.existsSync(requestData.file_path)) {
          await fs.promises.unlink(requestData.file_path).catch(e => logger.error('Не удалось удалить файл (План Б)', { error: (e as Error).message }));
        }
        
        await ctx.replyWithHTML(requestData.is_ru ? `🚀 <b>Тренировка модели (План Б - Replicate) запущена!</b> ID: ${prediction.id}. Ожидайте уведомления.` : `🚀 <b>Model training (Plan B - Replicate) started!</b> ID: ${prediction.id}. Await notification.`);
        
        return { 
          success: true,
          message: 'План Б (Replicate) выполнен, тренировка запущена.', 
          replicateTrainingId: prediction.id,
          replicateStatus: prediction.status,
          cost,
        };

      } catch (error) {
        const errorMessage = axios.isAxiosError(error) && error.response?.data?.message 
          ? error.response.data.message 
          : (error as Error).message;

        logger.error({
          message: '❌ Ошибка ПЛАНА Б (прямой вызов Replicate)',
          error: errorMessage,
          stack: (error as Error).stack,
          requestData: { model_name: requestData.model_name, telegram_id: requestData.telegram_id },
        });
        
        // Логика возврата удалена. Вместо этого, просто сообщаем об ошибке.
        // Вызывающий код (сцена) должен будет обработать это и решить, нужен ли возврат.
        await sendTelegramMessage?.(telegramId, isRu ? `⚠️ Произошла ошибка при запуске обучения (План Б): ${errorMessage}. Если средства были списаны, обратитесь в поддержку для возврата.` : `⚠️ An error occurred starting training (Plan B): ${errorMessage}. If funds were debited, please contact support for a refund.`);
        
        if (fs.existsSync(requestData.file_path)) {
          await fs.promises.unlink(requestData.file_path).catch(e => logger.error('Не удалось удалить файл после ошибки Плана Б', { error: (e as Error).message }));
        }
        return {
          success: false,
          message: 'Ошибка при запуске Плана Б (Replicate).',
          error: 'plan_b_replicate_error',
          details: errorMessage,
          cost,
        };
      }
    } else {
      // ================= PLAN A LOGIC (через Inngest) =================
      logger.info({
        message: '🚀 Запуск тренировки модели через ПЛАН А (Inngest)',
        requestData: { ...requestData, file_path: `${requestData.file_path.substring(0,20)}...` },
        cost, // Логируем стоимость и для Плана А
      });
      try {
        if (!fs.existsSync(requestData.file_path)) {
          throw new Error('Файл не найден (План А): ' + requestData.file_path);
        }

        const zipUrlForInngest = await uploadFileAndGetUrl(requestData.file_path);
        logger.info({
          message: '🔗 Загружен файл для Inngest (План А)',
          model_name: requestData.model_name,
          telegramId: requestData.telegram_id,
          zipUrl: zipUrlForInngest,
        });

        const eventPayload: ModelTrainingInngestEventData = {
          telegram_id: requestData.telegram_id,
          bot_name: requestData.bot_name,
          model_name: requestData.model_name,
          trigger_word: requestData.trigger_word,
          zipUrl: zipUrlForInngest,
          is_ru: requestData.is_ru,
          cost_for_refund: cost, 
          operation_type_for_refund: operationTypeForCost,
          original_message_id: ctx.message?.message_id,
          chat_id: ctx.chat?.id
        };
        
        const result = await inngest.send({
          name: 'digital-avatar-body/model-training.requested',
          data: eventPayload
        });

        logger.info('Событие для тренировки модели отправлено в Inngest (План А)', { eventName: 'digital-avatar-body/model-training.requested', eventIds: result.ids });

        // Удаляем файл после успешной отправки события
        if (fs.existsSync(requestData.file_path)) {
          await fs.promises.unlink(requestData.file_path).catch(e => logger.error('Не удалось удалить файл (План А) после успеха', { error: (e as Error).message, filePath: requestData.file_path }));
        }

        if (ctx.message?.message_id && ctx.chat?.id) {
          await sendTelegramMessage?.(
            telegramId,
            isRu
              ? `✅ Запрос на тренировку модели "${requestData.model_name}" успешно отправлен в обработку (План А). ID события: ${result.ids?.[0]}. Вы будете уведомлены о завершении.`
              : `✅ Model training request "${requestData.model_name}" successfully sent for processing (Plan A). Event ID: ${result.ids?.[0]}. You will be notified upon completion.`
          );
        }

        return {
          success: true,
          message: 'Запрос на тренировку модели успешно отправлен в обработку (План А).',
          eventId: result.ids?.[0],
          cost: cost,
        };
      } catch (error) {
        const errorMessage = axios.isAxiosError(error) && error.response?.data?.message 
          ? error.response.data.message 
          : (error as Error).message;

        logger.error({
          message: '❌ Ошибка ПЛАНА А (отправка в Inngest)',
          error: errorMessage,
          stack: (error as Error).stack,
          requestData: { model_name: requestData.model_name, telegram_id: requestData.telegram_id },
        })

        // Логика возврата удалена. Вместо этого, просто сообщаем об ошибке.
        // Вызывающий код (сцена) должен будет обработать это и решить, нужен ли возврат.
        await sendTelegramMessage?.(telegramId, isRu ? `⚠️ Произошла ошибка при отправке запроса на обучение (План А): ${errorMessage}. Если средства были списаны, обратитесь в поддержку для возврата.` : `⚠️ An error occurred sending training request (Plan A): ${errorMessage}. If funds were debited, please contact support for a refund.`);

        if (fs.existsSync(requestData.file_path)) {
          await fs.promises.unlink(requestData.file_path).catch(e => logger.error('Не удалось удалить файл после ошибки Плана А', { error: (e as Error).message }));
        }
        return {
          success: false,
          message: 'Ошибка при отправке события в Inngest (План А).',
          error: 'plan_a_inngest_send_error',
          details: errorMessage,
          cost,
        }
      }
    }
  }
} 