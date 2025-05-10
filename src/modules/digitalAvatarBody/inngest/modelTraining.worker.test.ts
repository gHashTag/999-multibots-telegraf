import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createModelTrainingWorker } from './modelTraining.worker';
import type { DigitalAvatarBodyDependencies } from '../index';
import type { ModelTrainingInngestEventData } from '../types';
import { PaymentType } from '@/interfaces/payments.interface';
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended';
import type { Logger as WinstonLogger } from 'winston';
import Replicate, { Training } from 'replicate';
import type { Inngest } from 'inngest';
import type { Message } from 'telegraf/types';

// Мокируем зависимости, если они не мокируются глобально для всех тестов модуля
// vi.mock('@/core/replicate'); // Если replicate SDK импортируется напрямую

describe('createModelTrainingWorker', () => {
  let mockDependencies: DeepMockProxy<DigitalAvatarBodyDependencies>;
  let workerFn: any; // Тип будет ({ event, step }) => Promise<any>

  beforeEach(() => {
    vi.resetAllMocks();

    // Используем mockDeep для зависимостей
    mockDependencies = {
      logger: mockDeep<WinstonLogger>(), // Мокируем Winston Logger правильно
      replicate: mockDeep<typeof Replicate>(),   // Мокируем Replicate Client
      sendTelegramMessage: vi.fn().mockResolvedValue({ message_id: 1 } as Message.TextMessage), // Оставляем vi.fn() для простоты, если calledWith не нужен
      updateUserBalance: vi.fn().mockResolvedValue(true),
      config: {
        API_URL: 'http://test-api.com',
        REPLICATE: {
            TRAINING_MODEL_ID: 'replicate/sdxl-lora-trainer',
            TRAINING_MODEL_VERSION: 'c221b2b8ef527988fb59bf24a8b97c4561f1c671f73bd389f866fe846a6de608'
        }
        // ... другие поля конфига, если они вдруг понадобятся
      },
      inngest: mockDeep<Inngest<any>>(), // Мокируем Inngest Client
      getUserBalance: vi.fn().mockResolvedValue(500), // Оставляем vi.fn()
    } as DeepMockProxy<DigitalAvatarBodyDependencies>; // Приведение типа для всего объекта

    // Создаем инстанс воркера (точнее, его конфигурацию)
    const workerConfig = createModelTrainingWorker(mockDependencies);
    workerFn = workerConfig.fn; // Получаем саму функцию обработчика
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockStep = {
    run: vi.fn().mockImplementation((name, fn) => fn()), // Мок для step.run, который просто выполняет переданную функцию
  };

  const baseEventData: ModelTrainingInngestEventData = {
    telegram_id: 'user123',
    bot_name: 'test_bot_worker',
    model_name: 'worker_model',
    trigger_word: 'worker_trigger',
    zipUrl: 'http://example.com/test.zip',
    is_ru: false,
    cost_for_refund: 50,
    operation_type_for_refund: PaymentType.NEURO_TRAIN_LORA,
    original_message_id: 1001,
    chat_id: 2002,
  };

  it('should successfully start Replicate training and send notification', async () => {
    const mockReplicateCreateResponse: Training = {
      id: 'replicate_train_worker_123',
      status: 'starting',
      version: 'test-version',
      model: 'test-model',
      input: { input_images: baseEventData.zipUrl },
      output: null,
      logs: null,
      error: null,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      urls: { get: '', cancel: '' },
    };
    mockDependencies.replicate.trainings.create.mockResolvedValue(mockReplicateCreateResponse as any);

    const event = { data: baseEventData };
    const result = await workerFn({ event, step: mockStep });

    expect(mockDependencies.replicate.trainings.create).toHaveBeenCalledOnce();
    expect(mockDependencies.replicate.trainings.create).toHaveBeenCalledWith(
      'replicate', // Воркер использует эти значения по умолчанию
      'sdxl-lora-trainer',
      'c221b2b8ef527988fb59bf24a8b97c4561f1c671f73bd389f866fe846a6de608',
      expect.objectContaining({
        destination: `neuroblogger/${baseEventData.model_name}`,
        input: {
          input_images: baseEventData.zipUrl,
          instance_prompt: `a photo of ${baseEventData.trigger_word} person`,
          max_train_steps: 2000, // Значение по умолчанию в воркере
        },
        webhook: `https://neuro-api.playg.dev/api/replicate-webhook-model-training?telegram_id=${baseEventData.telegram_id}&bot_name=${baseEventData.bot_name}`,
        webhook_events_filter: ['completed'],
      })
    );
    expect(mockDependencies.sendTelegramMessage).toHaveBeenCalledOnce();
    expect(mockDependencies.sendTelegramMessage).toHaveBeenCalledWith(
      baseEventData.telegram_id,
      expect.stringContaining('Your model "worker_model" has started training')
    );
    expect(result.body).toContain('Model training started successfully');
    expect(result.body).toContain(mockReplicateCreateResponse.id);
    expect(mockDependencies.updateUserBalance).toHaveBeenCalledOnce();
  });

  it('should handle Replicate training failure and refund user', async () => {
    const replicateError = new Error('Replicate failed to start training');
    mockDependencies.replicate.trainings.create.mockRejectedValue(replicateError);
    mockDependencies.updateUserBalance.mockResolvedValue(true); // Успешный возврат

    const event = { data: baseEventData };
    const result = await workerFn({ event, step: mockStep });

    expect(mockDependencies.replicate.trainings.create).toHaveBeenCalledOnce();
    expect(mockDependencies.updateUserBalance).toHaveBeenCalledOnce();
    expect(mockDependencies.updateUserBalance).toHaveBeenCalledWith(
      baseEventData.telegram_id,
      baseEventData.cost_for_refund, 
      baseEventData.operation_type_for_refund,
      'REFUND_REPLICATE_FAILURE_WORKER',
      expect.objectContaining({ bot_name: baseEventData.bot_name, replicate_error: replicateError.message })
    );
    expect(mockDependencies.sendTelegramMessage).toHaveBeenCalledTimes(2);
    expect(mockDependencies.sendTelegramMessage).toHaveBeenCalledWith(
      baseEventData.telegram_id,
      expect.stringContaining('An error occurred while starting the training')
    );
    expect(mockDependencies.sendTelegramMessage).toHaveBeenCalledWith(
      baseEventData.telegram_id,
      expect.stringContaining('Funds (50 stars) have been refunded')
    );
    expect(result.body).toContain('Replicate training failed');
    expect(result.details).toBe(replicateError.stack);
  });

  it('should handle Replicate failure AND refund failure (critical error)', async () => {
    const replicateError = new Error('Replicate just exploded');
    const refundError = new Error('Supabase said NO to refund');
    mockDependencies.replicate.trainings.create.mockRejectedValue(replicateError);
    mockDependencies.updateUserBalance.mockRejectedValue(refundError); // Ошибка при возврате

    const event = { data: baseEventData };
    const result = await workerFn({ event, step: mockStep });

    expect(mockDependencies.replicate.trainings.create).toHaveBeenCalledOnce();
    expect(mockDependencies.updateUserBalance).toHaveBeenCalledOnce();
    expect(mockDependencies.sendTelegramMessage).toHaveBeenCalledTimes(2);
    expect(mockDependencies.sendTelegramMessage).toHaveBeenCalledWith(
      baseEventData.telegram_id,
      expect.stringContaining('CRITICAL ERROR during training AND refund')
    );
    expect(mockDependencies.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('КРИТИЧЕСКАЯ ОШИБКА: Не удалось вернуть средства')}),
      // Можно добавить более точные проверки объекта ошибки, если нужно
    );
    expect(result.body).toContain('Replicate training failed');
  });

  it('should not attempt refund if cost_for_refund is missing or zero', async () => {
    const eventDataNoCost = { ...baseEventData, cost_for_refund: 0 };
    mockDependencies.replicate.trainings.create.mockRejectedValue(new Error('Replicate error, no refund'));

    const event = { data: eventDataNoCost };
    await workerFn({ event, step: mockStep });

    expect(mockDependencies.updateUserBalance).not.toHaveBeenCalled();
    expect(mockDependencies.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ 
        message: expect.stringContaining('Данные для возврата средств (cost_for_refund или operation_type_for_refund) отсутствуют') 
      })
    );
    expect(mockDependencies.sendTelegramMessage).toHaveBeenCalledOnce();
    expect(mockDependencies.sendTelegramMessage).toHaveBeenCalledWith(
      baseEventData.telegram_id,
      expect.stringContaining('An error occurred while starting the training')
    );
  });

  it('should return error if zipUrl is missing in event data', async () => {
    const eventDataNoZip = { ...baseEventData, zipUrl: undefined as any }; // Убираем zipUrl
    
    const event = { data: eventDataNoZip };
    const result = await workerFn({ event, step: mockStep });

    expect(mockDependencies.replicate.trainings.create).not.toHaveBeenCalled();
    expect(mockDependencies.sendTelegramMessage).toHaveBeenCalledOnce();
    expect(mockDependencies.sendTelegramMessage).toHaveBeenCalledWith(
      eventDataNoZip.telegram_id,
      expect.stringContaining('File URL is undefined for model training')
    );
    expect(result.body).toBe('Error: zipUrl is undefined');
  });

  // Можно добавить тесты на разные значения is_ru для текстов сообщений
}); 