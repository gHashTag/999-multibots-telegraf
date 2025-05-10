// import { inngest } from '@/inngest_app/client' // Не импортируем глобальный inngest здесь
// import { मानव_av_event_names } from '@/interfaces/inngest.interface' // <--- Удаляем этот импорт
import type { ModelTrainingInngestEventData } from '../types'
import type { DigitalAvatarBodyDependencies } from '../index' // Импорт типа зависимостей

// Эта функция теперь будет ФАБРИКОЙ для Inngest-воркера
export function createModelTrainingWorker(dependencies: DigitalAvatarBodyDependencies) {
  const { replicate, logger, sendTelegramMessage, updateUserBalance } = dependencies

  // Возвращаем конфигурацию функции, которую можно передать в inngest.createFunction
  // или напрямую в массив функций для inngest.serve
  return {
    id: 'model-training-worker', // было generate-model-training-from-file
    name: 'Model Training Worker',
    trigger: { event: 'digital-avatar-body/model-training.requested' as const }, // Убедимся, что имя события совпадает
    fn: async ({ event, step }: { event: { data: ModelTrainingInngestEventData }, step: any }) => {
      const { 
        telegram_id, 
        bot_name, // ИЗМЕНЕНО с bot_username на bot_name
        model_name, 
        trigger_word, 
        zipUrl, // Используем zipUrl вместо file_path
        steps, 
        is_ru, 
        cost_for_refund,         // <--- Извлекаем cost_for_refund
        operation_type_for_refund, // <--- Извлекаем operation_type_for_refund
        original_message_id,
        chat_id,
      } = event.data
      logger.info(
        'Получено событие на тренировку модели (через DI)',
        {
          telegram_id,
          bot_name, // Логируем bot_name
          model_name,
          trigger_word,
          zipUrl_sample: zipUrl ? `${zipUrl.substring(0,20)}...` : 'undefined', // Логируем zipUrl
          steps,
          is_ru,
          cost_for_refund, // Логируем
          operation_type_for_refund // Логируем
        }
      )

      if (!zipUrl) { // Проверяем zipUrl
        logger.error('zipUrl is undefined in Inngest event (DI)', { eventData: event.data })
        await sendTelegramMessage(
          telegram_id,
          is_ru
            ? 'Произошла ошибка: URL файла не определен для тренировки модели.'
            : 'An error occurred: File URL is undefined for model training.'
        )
        return { event, body: 'Error: zipUrl is undefined' }
      }

      try {
        const webhookUrl = `https://neuro-api.playg.dev/api/replicate-webhook-model-training?telegram_id=${telegram_id}&bot_name=${bot_name}` 
        logger.info(`Запуск тренировки модели через Replicate для пользователя ${telegram_id} (DI)`);

        const replicateModelOwner = 'replicate'
        const replicateModelName = 'sdxl-lora-trainer'
        const replicateModelVersion = 'c221b2b8ef527988fb59bf24a8b97c4561f1c671f73bd389f866fe846a6de608'

        const trainingInput = {
            input_images: zipUrl, 
            instance_prompt: `a photo of ${trigger_word} person`, 
            max_train_steps: steps || 2000, 
        };

        logger.info({ message: 'Данные для Replicate (DI Worker)', input: trainingInput, model: `${replicateModelOwner}/${replicateModelName}:${replicateModelVersion}` });

        const prediction = await step.run('start-replicate-training-di', async () => {
          return await replicate.trainings.create(
            replicateModelOwner, 
            replicateModelName, 
            replicateModelVersion, 
          {
            destination: `neuroblogger/${model_name}`, 
            input: trainingInput,
            webhook: webhookUrl,
            webhook_events_filter: ['completed'],
          })
        })

        logger.info(
          `Тренировка модели запущена для ${telegram_id} (DI). Replicate ID: ${prediction.id}. Статус: ${prediction.status}`
        )
        await sendTelegramMessage(
          telegram_id,
          is_ru
            ? `⏳ Ваша модель "${model_name}" начала обучение. Это может занять от 30 минут до нескольких часов. Я сообщу, когда будет готово.`
            : `⏳ Your model "${model_name}" has started training. This may take anywhere from 30 minutes to several hours. I will notify you when it is ready.`
        )
        
        return {
          event,
          body: `Model training started successfully for ${telegram_id} (DI). Replicate ID: ${prediction.id}`,
        }
      } catch (e: any) {
        logger.error('Ошибка при запуске тренировки модели через Replicate (DI)', {
          telegram_id,
          error: e.message,
          error_stack: e.stack,
          error_details: e,
        })
        
        if (cost_for_refund && cost_for_refund > 0 && operation_type_for_refund) {
          logger.info(`[Worker Refund] Refunding ${cost_for_refund} for user ${telegram_id} due to Replicate failure. Operation type: ${operation_type_for_refund}`);
          try {
            const refundSuccess = await updateUserBalance(
              telegram_id,
              cost_for_refund,
              operation_type_for_refund, // Используем тип операции из эвента
              `REFUND_REPLICATE_FAILURE_WORKER`,
              { bot_name: bot_name, replicate_error: e.message }
            );
            if (refundSuccess) {
              logger.info({
                message: `💸 Средства (${cost_for_refund}) возвращены после ошибки в воркере для ${operation_type_for_refund}`,
                telegramId: telegram_id.toString(),
                amountRefunded: cost_for_refund,
                operationType: `${operation_type_for_refund}_REFUND_WORKER_FAILURE`
              });
              await sendTelegramMessage(
                telegram_id,
                is_ru
                  ? `⚠️ Произошла ошибка во время обработки вашего запроса на обучение. Средства (${cost_for_refund} звезд) были возвращены на ваш баланс.`
                  : `⚠️ An error occurred while processing your training request. Funds (${cost_for_refund} stars) have been refunded.`
              );
            } else {
              logger.error({
                message: `🆘 КРИТИЧЕСКАЯ ОШИБКА: Не удалось вернуть средства (${cost_for_refund}) после ошибки в воркере для ${operation_type_for_refund}`,
                telegramId: telegram_id.toString(),
                originalError: e.message, 
              });
              await sendTelegramMessage(
                telegram_id,
                is_ru
                  ? `🆘 КРИТИЧЕСКАЯ ОШИБКА во время обучения И возврата средств. Обратитесь в поддержку для разрешения ситуации с балансом.`
                  : `🆘 CRITICAL ERROR during training AND refund. Please contact support to resolve your balance.`
              );
            }
          } catch (refundError: any) {
            logger.error({
              message: `🆘 КРИТИЧЕСКАЯ ОШИБКА: Не удалось вернуть средства (${cost_for_refund}) после ошибки в воркере для ${operation_type_for_refund}`,
              telegramId: telegram_id.toString(),
              originalError: e.message, 
              refundError: refundError.message,
            });
            await sendTelegramMessage(
              telegram_id,
              is_ru
                ? `🆘 КРИТИЧЕСКАЯ ОШИБКА во время обучения И возврата средств. Обратитесь в поддержку для разрешения ситуации с балансом.`
                : `🆘 CRITICAL ERROR during training AND refund. Please contact support to resolve your balance.`
            );
          }
        } else {
          logger.warn({
            message: 'Данные для возврата средств (cost_for_refund или operation_type_for_refund) отсутствуют в событии или cost_for_refund <=0. Возврат не выполнен после ошибки Replicate.',
            eventData: event.data,
            telegramId: telegram_id.toString(),
          });
        }

        await sendTelegramMessage(
          telegram_id,
          is_ru
            ? `❌ Произошла ошибка при запуске тренировки модели "${model_name}". Администратор уже уведомлен.`
            : `❌ An error occurred while starting the training of model "${model_name}". The administrator has been notified.`
        )
        return {
          event,
          body: `Replicate training failed. Error: ${e.message || 'Unknown error'}`,
          details: e.stack
        }
      }
    }
  }
}

// Важно: нужно убедиться, что этот воркер экспортируется в основном файле функций Inngest
// например, в src/inngest/functions.ts (или куда он переедет)
// export const functions = [helloWorldFunction, modelTrainingWorker];