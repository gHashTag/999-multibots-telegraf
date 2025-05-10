import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createModelTrainingService } from './modelTraining.service';
import type { DigitalAvatarBodyDependencies } from '../index';
import type { ModelTrainingRequest, ModelTrainingResponse } from '../types';
import type { MyContext } from '@/interfaces';
import { PaymentType } from '@/interfaces/payments.interface';
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended';
import type { Logger as WinstonLogger } from 'winston';
import Replicate, { Training } from 'replicate';
import type { InngestClient } from 'inngest';
import type { Message } from 'telegraf/types';

// Мокируем зависимости, которые не являются частью DigitalAvatarBodyDependencies напрямую
vi.mock('fs');
vi.mock('axios'); // Если используется напрямую, но скорее всего через replicate SDK

// Глобальный мок для replicate клиента, если он импортируется где-то
// vi.mock('@/core/replicate', () => ({
//   replicate: mockDeep<ReplicateClientInstance>() // Предполагая, что у нас есть тип ReplicateClientInstance
// }));

describe('createModelTrainingService', () => {
  let mockDependencies: DeepMockProxy<DigitalAvatarBodyDependencies>;
  let modelTrainingServiceInstance: ReturnType<typeof createModelTrainingService>;
  let mockCtx: DeepMockProxy<MyContext>;

  const MOCK_UPLOAD_DIR = '/test_uploads';
  const MOCK_API_URL = 'http://test-api.com';

  beforeEach(() => {
    vi.resetAllMocks();

    // @ts-ignore
    fs.statSync = vi.fn().mockReturnValue({ size: 1024 * 1024 }); 
    // @ts-ignore
    fs.existsSync = vi.fn().mockReturnValue(true);
    // @ts-ignore
    fs.mkdirSync = vi.fn();
    // @ts-ignore
    fs.copyFileSync = vi.fn();
    // @ts-ignore
    fs.promises = { unlink: vi.fn().mockResolvedValue(undefined) };


    mockDependencies = {
      inngest: mockDeep<InngestClient>(),      // Используем InngestClient
      logger: mockDeep<WinstonLogger>(), 
      replicate: mockDeep<typeof Replicate>(),  // Используем typeof Replicate
      config: {
        API_URL: MOCK_API_URL,
        CONFIG_UPLOAD_DIR: MOCK_UPLOAD_DIR,
        COSTS: {
          [PaymentType.NEURO_TRAIN_LORA]: 100, // Используем PaymentType как ключ
        },
        REPLICATE: {
          TRAINING_MODEL_ID: 'test_owner/test_model',
          TRAINING_MODEL_VERSION: 'test_version',
        },
      },
      sendTelegramMessage: mockDeep<DigitalAvatarBodyDependencies['sendTelegramMessage']>(), // mockDeep
      updateUserBalance: mockDeep<DigitalAvatarBodyDependencies['updateUserBalance']>(),   // mockDeep
      getUserBalance: mockDeep<DigitalAvatarBodyDependencies['getUserBalance']>(),     // mockDeep
    } as DeepMockProxy<DigitalAvatarBodyDependencies>; 

    // Упрощенное мокирование MyContext, если mockDeep<MyContext>() вызывает проблемы
    mockCtx = {
      from: { id: 12345, is_bot: false, first_name: 'Test' },
      chat: { id: 54321, type: 'private' },
      message: { 
        message_id: 1001, 
        chat: { id: 54321, type: 'private' }, // Повторяем для вложенности
        from: { id: 12345, is_bot: false, first_name: 'Test' }, // Повторяем для вложенности
        // Добавляем другие поля, если они нужны Telegraf/types Message
        date: Date.now() / 1000, // Пример, Telegraf ожидает timestamp в секундах
        text: '/command' // Пример текста сообщения
      },
      session: {},
      // Мокируем только используемые функции reply, если они нужны
      reply: vi.fn().mockResolvedValue({} as Message.TextMessage), 
      replyWithHTML: vi.fn().mockResolvedValue({} as Message.TextMessage), 
      // ... другие поля/методы MyContext, если они используются сервисом
    } as DeepMockProxy<MyContext>; // Оставляем DeepMockProxy для консистентности, но структура создается вручную

    modelTrainingServiceInstance = createModelTrainingService(mockDependencies); 
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Plan B (Direct Replicate Call)', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv, USE_MODEL_TRAINING_PLAN_B: 'true' };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should successfully start training and return replicateTrainingId on success (Plan B)', async () => {
      const requestData: ModelTrainingRequest = {
        telegram_id: '12345',
        bot_name: 'test_bot',
        model_name: 'test_model_user',
        trigger_word: 'test_trigger',
        file_path: '/tmp/test_archive.zip',
        is_ru: false,
      };
      
      /* eslint-disable */
      const mockReplicateResponse: Training = {
        id: 'replicate_train_123',
        status: 'starting',
        version: 'test-version',
        model: 'test-model',
        // eslint-disable-next-line
        input: { input_images: 'url' }, 
        output: null,
        logs: null,
        error: null,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        urls: { get: '', cancel: '' },
      };
      /* eslint-enable */
      mockDependencies.replicate.trainings.create.mockResolvedValue(mockReplicateResponse as any);

      const response = await modelTrainingServiceInstance(requestData, mockCtx as MyContext);

      expect(response.success).toBe(true);
      expect(response.message).toContain('План Б (Replicate) выполнен');
      expect(response.replicateTrainingId).toBe(mockReplicateResponse.id);
      expect(response.replicateStatus).toBe(mockReplicateResponse.status);
      expect(response.cost).toBe(100);
      expect(mockDependencies.replicate.trainings.create).toHaveBeenCalledOnce();
      expect(mockDependencies.replicate.trainings.create).toHaveBeenCalledWith(
        'test_owner',
        'test_model',
        'test_version',
        expect.objectContaining({
          destination: 'neuroblogger/test_model_user',
          input: expect.objectContaining({
            input_images: `${MOCK_API_URL}/uploads/training_archives/test_archive_${expect.any(Number)}.zip`,
            instance_prompt: 'a photo of test_trigger person',
          }),
          webhook: `${MOCK_API_URL}/replicate-webhook/training-complete`,
          webhook_events_filter: ['completed'],
        })
      );
      expect(fs.copyFileSync).toHaveBeenCalledOnce();
      expect(fs.promises.unlink).toHaveBeenCalledWith(requestData.file_path);
      expect(mockCtx.replyWithHTML).toHaveBeenCalledOnce();
    });

    it('should return error if replicate training creation fails', async () => {
      const requestData: ModelTrainingRequest = {
        telegram_id: '12345',
        bot_name: 'test_bot',
        model_name: 'test_model_user_fail',
        trigger_word: 'test_trigger_fail',
        file_path: '/tmp/test_archive_fail.zip',
        is_ru: false,
      };

      const replicateError = new Error('Replicate exploded');
      mockDependencies.replicate.trainings.create.mockRejectedValue(replicateError);

      const response = await modelTrainingServiceInstance(requestData, mockCtx as MyContext);

      expect(response.success).toBe(false);
      expect(response.message).toContain('Ошибка при запуске Плана Б');
      expect(response.error).toBe('plan_b_replicate_error');
      expect(response.details).toBe(replicateError.message);
      expect(response.cost).toBe(100);
      expect(mockDependencies.sendTelegramMessage).toHaveBeenCalledOnce();
      expect(mockDependencies.sendTelegramMessage).toHaveBeenCalledWith(
        requestData.telegram_id,
        expect.stringContaining(replicateError.message)
      );
      expect(fs.promises.unlink).toHaveBeenCalledWith(requestData.file_path);
      expect(mockCtx.replyWithHTML).not.toHaveBeenCalled();
    });

    it('should return error if input file does not exist', async () => {
      // @ts-ignore
      fs.existsSync = vi.fn().mockReturnValue(false); // Файл не существует
      const requestData: ModelTrainingRequest = {
        telegram_id: '12345',
        bot_name: 'test_bot',
        model_name: 'test_model_no_file',
        trigger_word: 'test_trigger_no_file',
        file_path: '/tmp/non_existent_archive.zip',
        is_ru: false,
      };

      const response = await modelTrainingServiceInstance(requestData, mockCtx as MyContext);
      
      expect(response.success).toBe(false);
      expect(response.message).toContain('Ошибка при запуске Плана Б');
      expect(response.error).toBe('plan_b_replicate_error'); // Ошибка генерируется как общая plan_b_replicate_error
      expect(response.details).toContain('Файл не найден');
      expect(response.cost).toBe(100);
      expect(mockDependencies.replicate.trainings.create).not.toHaveBeenCalled();
      expect(mockDependencies.sendTelegramMessage).toHaveBeenCalledOnce();
      expect(fs.promises.unlink).not.toHaveBeenCalled(); // Не должен пытаться удалить несуществующий файл
    });

    it('should handle missing cost configuration', async () => {
        mockDependencies.config.COSTS = {}; // Убираем конфигурацию стоимости
        const requestData: ModelTrainingRequest = {
            telegram_id: '12345',
            bot_name: 'test_bot',
            model_name: 'test_model_no_cost',
            trigger_word: 'test_trigger_no_cost',
            file_path: '/tmp/archive_no_cost.zip',
            is_ru: false,
        };

        const response = await modelTrainingServiceInstance(requestData, mockCtx as MyContext);

        expect(response.success).toBe(false);
        expect(response.message).toBe('Ошибка конфигурации стоимости.');
        expect(response.error).toBe('cost_configuration_error');
        expect(response.cost).toBe(0);
        expect(mockDependencies.sendTelegramMessage).toHaveBeenCalledOnce();
        expect(mockDependencies.sendTelegramMessage).toHaveBeenCalledWith(
            requestData.telegram_id,
            expect.stringContaining('Ошибка конфигурации: не удалось определить стоимость операции')
        );
        expect(mockDependencies.replicate.trainings.create).not.toHaveBeenCalled();
    });

    it('should send Telegram notification on Plan B success if original_message_id and chat_id are present', async () => {
      const requestData: ModelTrainingRequest = {
        telegram_id: '12345',
        bot_name: 'test_bot',
        model_name: 'test_model_user',
        trigger_word: 'test_trigger',
        file_path: '/tmp/test_archive.zip',
        is_ru: false,
      };
      
      /* eslint-disable */
      const mockReplicateResponse: Training = {
        id: 'replicate_train_123',
        status: 'starting',
        version: 'test-version',
        model: 'test-model',
        // eslint-disable-next-line
        input: { input_images: 'url' }, 
        output: null,
        logs: null,
        error: null,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        urls: { get: '', cancel: '' },
      };
      /* eslint-enable */
      mockDependencies.replicate.trainings.create.mockResolvedValue(mockReplicateResponse as any);

      const response = await modelTrainingServiceInstance(requestData, mockCtx as MyContext);

      expect(mockDependencies.sendTelegramMessage).toHaveBeenCalledOnce();
      expect(mockDependencies.sendTelegramMessage).toHaveBeenCalledWith(
        requestData.telegram_id,
        expect.stringContaining('План Б (Replicate) выполнен')
      );
    });

  });

  describe('Plan A (Inngest Event Send)', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      // Убедимся, что План А активен
      process.env = { ...originalEnv, USE_MODEL_TRAINING_PLAN_B: 'false' };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should successfully send event to Inngest and return eventId (Plan A)', async () => {
      const requestData: ModelTrainingRequest = {
        telegram_id: '67890',
        bot_name: 'test_bot_inngest',
        model_name: 'inngest_model',
        trigger_word: 'inngest_trigger',
        file_path: '/tmp/inngest_archive.zip',
        is_ru: true,
      };
      
      const mockInngestResponse = { ids: ['event_id_123'] };
      mockDependencies.inngest.send.mockResolvedValue(mockInngestResponse as any); 

      const response = await modelTrainingServiceInstance(requestData, mockCtx as MyContext);

      expect(response.success).toBe(true);
      expect(response.message).toContain('Запрос на тренировку модели успешно отправлен в обработку (План А)');
      expect(response.eventId).toBe(mockInngestResponse.ids[0]);
      expect(response.cost).toBe(100);
      expect(mockDependencies.inngest.send).toHaveBeenCalledOnce();
      expect(mockDependencies.inngest.send).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'digital-avatar-body/model-training.requested',
          data: expect.objectContaining({
            zipUrl: `${MOCK_API_URL}/uploads/training_archives/inngest_archive_${expect.any(Number)}.zip`,
            // ... другие поля data
          }),
        })
      );
      expect(fs.copyFileSync).toHaveBeenCalledOnce();
      expect(fs.promises.unlink).toHaveBeenCalledWith(requestData.file_path); // Проверяем удаление файла
    });
    
    it('should return error if Inngest send fails and delete the file', async () => {
      const requestData: ModelTrainingRequest = {
        telegram_id: '67890',
        bot_name: 'test_bot_inngest_fail',
        model_name: 'inngest_model_fail',
        trigger_word: 'inngest_trigger_fail',
        file_path: '/tmp/inngest_archive_fail.zip',
        is_ru: true,
      };

      const inngestError = new Error('Inngest queue is full');
      mockDependencies.inngest.send.mockRejectedValue(inngestError);

      const response = await modelTrainingServiceInstance(requestData, mockCtx as MyContext);

      expect(response.success).toBe(false);
      expect(response.message).toContain('Ошибка при отправке события в Inngest (План А)');
      expect(response.cost).toBe(100);
      expect(mockDependencies.sendTelegramMessage).toHaveBeenCalledOnce();
      expect(fs.promises.unlink).toHaveBeenCalledWith(requestData.file_path); // Проверяем удаление файла и при ошибке
    });

    it('should return error if input file does not exist (Plan A)', async () => {
      // @ts-ignore
      fs.existsSync = vi.fn().mockReturnValue(false); // Файл не существует
      const requestData: ModelTrainingRequest = {
        telegram_id: '123',
        bot_name: 'test_bot_plan_a_no_file',
        model_name: 'plan_a_model_no_file',
        trigger_word: 'plan_a_trigger_no_file',
        file_path: '/tmp/non_existent_plan_a.zip',
        is_ru: false,
      };

      const response = await modelTrainingServiceInstance(requestData, mockCtx as MyContext);

      expect(response.success).toBe(false);
      expect(response.message).toContain('Ошибка при отправке события в Inngest (План А)');
      expect(response.error).toBe('plan_a_inngest_send_error');
      expect(response.details).toContain('Файл не найден');
      expect(response.cost).toBe(100);
      expect(mockDependencies.inngest.send).not.toHaveBeenCalled();
      expect(mockDependencies.sendTelegramMessage).toHaveBeenCalledOnce(); // Сообщение об ошибке отправляется
      expect(fs.promises.unlink).not.toHaveBeenCalled(); // Не должен пытаться удалить несуществующий файл
    });

    it('should handle missing cost configuration (Plan A)', async () => {
      mockDependencies.config.COSTS = {}; // Убираем конфигурацию стоимости
      const requestData: ModelTrainingRequest = {
        telegram_id: '123',
        bot_name: 'test_bot_plan_a_no_cost',
        model_name: 'plan_a_model_no_cost',
        trigger_word: 'plan_a_trigger_no_cost',
        file_path: '/tmp/plan_a_archive_no_cost.zip',
        is_ru: false,
      };

      const response = await modelTrainingServiceInstance(requestData, mockCtx as MyContext);

      expect(response.success).toBe(false);
      expect(response.message).toBe('Ошибка конфигурации стоимости.');
      expect(response.error).toBe('cost_configuration_error');
      expect(response.cost).toBe(0);
      expect(mockDependencies.sendTelegramMessage).toHaveBeenCalledOnce();
      expect(mockDependencies.sendTelegramMessage).toHaveBeenCalledWith(
        requestData.telegram_id,
        expect.stringContaining('Ошибка конфигурации: не удалось определить стоимость операции')
      );
      expect(mockDependencies.inngest.send).not.toHaveBeenCalled();
    });

    it('should send Telegram notification on Plan A success if original_message_id and chat_id are present in ctx', async () => {
      const requestData: ModelTrainingRequest = {
        telegram_id: '67890',
        bot_name: 'test_bot_inngest',
        model_name: 'inngest_model',
        trigger_word: 'inngest_trigger',
        file_path: '/tmp/inngest_archive.zip',
        is_ru: true,
      };
      
      const mockInngestResponse = { ids: ['event_id_123'] };
      mockDependencies.inngest.send.mockResolvedValue(mockInngestResponse as any); 

      const response = await modelTrainingServiceInstance(requestData, mockCtx as MyContext);

      expect(mockDependencies.sendTelegramMessage).toHaveBeenCalledOnce();
      expect(mockDependencies.sendTelegramMessage).toHaveBeenCalledWith(
        requestData.telegram_id,
        expect.stringContaining('Запрос на тренировку модели успешно отправлен в обработку (План А)')
      );
    });

  });

}); 