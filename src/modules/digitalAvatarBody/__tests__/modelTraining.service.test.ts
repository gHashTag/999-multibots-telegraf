import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createModelTrainingService } from '../services/modelTraining.service';
import { PaymentType } from '@/interfaces/payments.interface';
import { MyContext } from '@/interfaces';
import { DigitalAvatarBodyDependencies } from '../index';
import winston from 'winston'; // Импортируем winston для типа Logger
import fs from 'fs';
import path from 'path';
import type { Training } from 'replicate'; // Добавляем импорт Training

// Мокируем зависимости
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(), // Добавим часто используемые методы
  // Добавим остальные обязательные свойства из winston.Logger, если они будут нужны
  // Проще всего привести тип к Partial<winston.Logger> или мокнуть его более полно
  // Для данного теста, вероятно, достаточно базовых методов
} as unknown as winston.Logger; // Используем unknown as winston.Logger для упрощения

const mockConfig = {
  CONFIG_UPLOAD_DIR: '/tmp/uploads',
  API_URL: 'http://localhost:3000',
  REPLICATE: {
    TRAINING_MODEL_ID: 'stability-ai/sdxl',
    TRAINING_MODEL_VERSION: 'c221b2b8ef527988fb59bf24a8b97c4561f1c671f73bd389f866fe846a6de608',
  },
  COSTS: {}, // Изначально COSTS пустой для теста на ошибку конфигурации
  ARCHIVE_PATH: './temp_archives',
};

const mockReplicate = {
  trainings: {
    create: vi.fn(),
  },
};

const mockUpdateUserBalance = vi.fn();
const mockGetUserBalance = vi.fn();
const mockSendTelegramMessage = vi.fn();
const mockInngest = {
  send: vi.fn() // Предположим, что send возвращает промис, который может резолвиться в { ids: [...] }
};


describe('modelTrainingService', () => {
  let modelTrainingService: ReturnType<typeof createModelTrainingService>;
  let mockCtx: MyContext;

  beforeEach(() => {
    vi.clearAllMocks();

    const dependencies: DigitalAvatarBodyDependencies = {
      logger: mockLogger,
      config: mockConfig as any, // Приведем к any для упрощения, т.к. COSTS меняется в тесте
      replicate: mockReplicate as any, 
      updateUserBalance: mockUpdateUserBalance,
      getUserBalance: mockGetUserBalance,
      sendTelegramMessage: mockSendTelegramMessage,
      inngest: mockInngest as any, 
    };
    
    modelTrainingService = createModelTrainingService(dependencies);

    mockCtx = {
      from: { id: 123, language_code: 'ru' },
      session: {},
      // @ts-ignore
      replyWithHTML: vi.fn(), // Мокируем replyWithHTML
      // Добавляем message и chat для eventPayload в Плане А, если ctx используется там
      message: { message_id: 100, chat: { id: 200 } }, 
      chat: { id: 200 },
    } as unknown as MyContext; // Исправляем приведение типа
  });

  describe('Scenario: Cost Configuration Error', () => {
    it('should return success:false and correct error message if cost is not configured', async () => {
      mockConfig.COSTS = {}; 

      const requestData = {
        telegram_id: '12345',
        file_path: '/path/to/some/archive.zip',
        model_name: 'test-model',
        trigger_word: 'test-trigger',
        is_ru: true,
        bot_name: 'test_bot_name', // ✅ Добавлено недостающее свойство
      };

      const result = await modelTrainingService(requestData, mockCtx);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Ошибка конфигурации стоимости.');
      expect(result.error).toBe('cost_configuration_error');
      expect(result.details).toContain(PaymentType.NEURO_TRAIN_LORA);
      expect(result.cost).toBe(0);

      expect(mockSendTelegramMessage).toHaveBeenCalledTimes(1);
      expect(mockSendTelegramMessage).toHaveBeenCalledWith(
        requestData.telegram_id,
        expect.stringContaining('Ошибка конфигурации: не удалось определить стоимость операции')
      );
      
      expect(mockReplicate.trainings.create).not.toHaveBeenCalled();
      expect(mockInngest.send).not.toHaveBeenCalled();
    });
  });

  describe('Scenario: File Upload Error (Plan B)', () => {
    beforeEach(() => {
      // Устанавливаем process.env для этого конкретного describe блока
      process.env.USE_MODEL_TRAINING_PLAN_B = 'true';
      // Конфигурируем стоимость
      mockConfig.COSTS = {
        [PaymentType.NEURO_TRAIN_LORA]: 100,
      };
      // Мокируем fs.copyFileSync, чтобы он выбрасывал ошибку
      // Это основной способ имитировать ошибку в uploadFileAndGetUrl
      vi.spyOn(fs, 'existsSync').mockReturnValue(true); // Предполагаем, что файл существует
      vi.spyOn(fs, 'statSync').mockReturnValue({ size: 1024 * 1024 } as fs.Stats); // Мок для statSync
      vi.spyOn(fs, 'copyFileSync').mockImplementation(() => {
        throw new Error('Test copyFileSync error');
      });
    });

    afterEach(() => {
      // Очищаем process.env после тестов в этом блоке
      delete process.env.USE_MODEL_TRAINING_PLAN_B;
      vi.restoreAllMocks(); // Восстанавливаем все моки fs
    });

    it('should return success:false and specific error if file upload fails in Plan B', async () => {
      const requestData = {
        telegram_id: '12345',
        file_path: '/path/to/some/archive.zip',
        model_name: 'test-model-planb',
        trigger_word: 'test-trigger-planb',
        is_ru: true,
        bot_name: 'test_bot_name_planb',
      };

      const result = await modelTrainingService(requestData, mockCtx);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Ошибка при запуске Плана Б (Replicate).');
      expect(result.error).toBe('plan_b_replicate_error');
      expect(result.details).toContain('Ошибка при сохранении файла: Test copyFileSync error');
      expect(result.cost).toBe(100); // Стоимость должна быть определена, даже если операция не удалась

      // Проверяем, что Replicate и Inngest не были вызваны
      expect(mockReplicate.trainings.create).not.toHaveBeenCalled();
      expect(mockInngest.send).not.toHaveBeenCalled();

      // Проверяем, что пользователю было отправлено сообщение об ошибке
      expect(mockSendTelegramMessage).toHaveBeenCalledTimes(1);
      expect(mockSendTelegramMessage).toHaveBeenCalledWith(
        requestData.telegram_id,
        expect.stringContaining('Произошла ошибка при запуске обучения (План Б): Ошибка при сохранении файла: Test copyFileSync error')
      );
    });
  });

  describe('Scenario: Successful Plan B', () => {
    const mockUploadedUrl = 'http://example.com/uploads/archive.zip';
    const mockReplicateTrainingId = 'train_planb_success_123';
    // const mockInngestEventId = 'inngest_evt_planb_success_456'; // Inngest не вызывается в Плане Б

    // Выносим requestData сюда, чтобы он был доступен в beforeEach
    const requestData = {
      telegram_id: 'user789',
      file_path: '/original/path/to/planb_success.zip',
      model_name: 'model-planb-success',
      trigger_word: 'trigger-planb-success',
      is_ru: true,
      bot_name: 'bot_planb_success',
    };

    beforeEach(() => {
      process.env.USE_MODEL_TRAINING_PLAN_B = 'true';
      mockConfig.COSTS = {
        [PaymentType.NEURO_TRAIN_LORA]: 150,
      };
      mockConfig.CONFIG_UPLOAD_DIR = './test_uploads'; // Добавляем для предсказуемости

      // Мокируем успешную загрузку файла
      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        const permanentDirConstructed = path.join(mockConfig.CONFIG_UPLOAD_DIR || '', 'training_archives');
        if (p === requestData.file_path) return true; // Для проверки if (!fs.existsSync(requestData.file_path))
        if (p === permanentDirConstructed) return false; // Для проверки if (!fs.existsSync(permanentDir))
        return true; // Для других путей, если они будут
      });
      vi.spyOn(fs, 'statSync').mockReturnValue({ size: 1024 * 1024 } as fs.Stats);
      vi.spyOn(fs, 'copyFileSync').mockImplementation(() => { /* успешно */ });
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined); // Мокируем mkdirSync

      // Мокируем успешный ответ Replicate
      mockReplicate.trainings.create.mockResolvedValue({
        id: mockReplicateTrainingId,
        status: 'starting',
        version: 'v1', // Добавим недостающие поля из типа Training
        model: 'test/model',
        input: { some_input: 'value' },
        output: null,
        error: null,
        logs: null,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        source: 'api',
        urls: { get: '', cancel: '' }
      } as Training);

      // mockInngest.send.mockResolvedValue({ ids: [mockInngestEventId] } as any); // Inngest не вызывается
    });

    afterEach(() => {
      delete process.env.USE_MODEL_TRAINING_PLAN_B;
      delete mockConfig.CONFIG_UPLOAD_DIR; // Очищаем мок
      vi.restoreAllMocks();
    });

    it('should successfully initiate training via Plan B and call Replicate', async () => {
      // requestData уже определен выше
      const result = await modelTrainingService(requestData, mockCtx);

      expect(result.success).toBe(true);
      expect(result.message).toBe('План Б (Replicate) выполнен, тренировка запущена.');
      expect(result.error).toBeUndefined();
      expect(result.cost).toBe(150);
      expect(result.eventId).toBeUndefined(); // eventId не должно быть в Плане Б
      expect(result.replicateTrainingId).toBe(mockReplicateTrainingId);
      expect(result.replicateStatus).toBe('starting');

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.copyFileSync).toHaveBeenCalledOnce(); // Проверяем, что файл копировался
      
      expect(mockReplicate.trainings.create).toHaveBeenCalledOnce();

      const [expectedModelOwner, expectedModelName] = mockConfig.REPLICATE.TRAINING_MODEL_ID.split('/'); 
      const expectedWebhookUrlPattern = `${mockConfig.API_URL}/replicate-webhook/training-complete`;

      expect(mockReplicate.trainings.create).toHaveBeenCalledWith(
        expectedModelOwner, // Используем разделенные значения
        expectedModelName,  // Используем разделенные значения
        mockConfig.REPLICATE.TRAINING_MODEL_VERSION,
        expect.objectContaining({
          destination: `neuroblogger/${requestData.model_name}`,
          input: expect.objectContaining({
            input_images: expect.stringContaining(path.parse(requestData.file_path).name),
            instance_prompt: `a photo of ${requestData.trigger_word} person`,
            class_prompt: 'a photo of a person',
          }),
          webhook: expect.stringContaining(expectedWebhookUrlPattern),
          webhook_events_filter: ['completed'],
        })
      );

      expect(mockInngest.send).not.toHaveBeenCalled(); // Убеждаемся, что Inngest не вызывался

      expect(mockCtx.replyWithHTML).toHaveBeenCalledOnce();
      expect(mockCtx.replyWithHTML).toHaveBeenCalledWith(
        `🚀 <b>Тренировка модели (План Б - Replicate) запущена!</b> ID: ${mockReplicateTrainingId}. Ожидайте уведомления.`
      );
      expect(mockSendTelegramMessage).not.toHaveBeenCalled(); // sendTelegramMessage не должен вызываться при успехе Плана Б
    });
  });

  describe('Scenario: Replicate Call Error (Plan B)', () => {
    beforeEach(() => {
      process.env.USE_MODEL_TRAINING_PLAN_B = 'true';
      mockConfig.COSTS = {
        [PaymentType.NEURO_TRAIN_LORA]: 200,
      };
      mockConfig.CONFIG_UPLOAD_DIR = './test_uploads_error_replicate';

      // Мокируем успешную загрузку файла
      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('test_uploads_error_replicate')) return false;
        return true;
      });
      vi.spyOn(fs, 'statSync').mockReturnValue({ size: 1024 * 1024 } as fs.Stats);
      vi.spyOn(fs, 'copyFileSync').mockImplementation(() => { /* успешно */ });
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      // Мокируем ошибку от Replicate
      mockReplicate.trainings.create.mockRejectedValue(new Error('Replicate API Error Test'));
    });

    afterEach(() => {
      delete process.env.USE_MODEL_TRAINING_PLAN_B;
      delete mockConfig.CONFIG_UPLOAD_DIR;
      vi.restoreAllMocks();
    });

    it('should return success:false, specific error message, and notify user if Replicate call fails', async () => {
      const requestData = {
        telegram_id: 'user_replicate_fail',
        file_path: '/path/to/replicate_fail.zip',
        model_name: 'model-replicate-fail',
        trigger_word: 'trigger-replicate-fail',
        is_ru: false,
        bot_name: 'bot_replicate_fail',
      };

      const result = await modelTrainingService(requestData, mockCtx);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Ошибка при запуске Плана Б (Replicate).');
      expect(result.error).toBe('plan_b_replicate_error');
      expect(result.details).toContain('Replicate API Error Test');
      expect(result.cost).toBe(200);

      expect(mockReplicate.trainings.create).toHaveBeenCalledOnce();
      expect(mockInngest.send).not.toHaveBeenCalled();

      expect(mockSendTelegramMessage).toHaveBeenCalledOnce();
      expect(mockSendTelegramMessage).toHaveBeenCalledWith(
        requestData.telegram_id,
        expect.stringContaining('An error occurred starting training (Plan B): Replicate API Error Test')
      );
      // ctx.replyWithHTML не должен вызываться при ошибке Replicate
      expect(mockCtx.replyWithHTML).not.toHaveBeenCalled(); 
    });
  });

  describe('Scenario: Successful Plan A (Inngest)', () => {
    const mockInngestEventId = 'inngest_evt_plan_a_success_789';

    beforeEach(() => {
      // Убедимся, что План Б не активен
      delete process.env.USE_MODEL_TRAINING_PLAN_B;
      
      mockConfig.COSTS = {
        [PaymentType.NEURO_TRAIN_LORA]: 250,
      };
      mockConfig.CONFIG_UPLOAD_DIR = './test_uploads_plan_a';

      // Мокируем успешную загрузку файла
      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        const permanentDirConstructed = path.join(mockConfig.CONFIG_UPLOAD_DIR || '', 'training_archives');
        if (p && typeof p === 'string' && p.endsWith('_plan_a.zip')) return true; // Для requestData.file_path
        if (p === permanentDirConstructed) return false; // Для permanentDir, чтобы mkdirSync вызвался
        return true;
      });
      vi.spyOn(fs, 'statSync').mockReturnValue({ size: 1024 * 1024 } as fs.Stats);
      vi.spyOn(fs, 'copyFileSync').mockImplementation(() => { /* успешно */ });
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      // Мокируем успешный ответ Inngest
      mockInngest.send.mockResolvedValue({ ids: [mockInngestEventId] });
    });

    afterEach(() => {
      delete mockConfig.CONFIG_UPLOAD_DIR;
      vi.restoreAllMocks();
    });

    it('should successfully send event to Inngest and notify user', async () => {
      const requestData = {
        telegram_id: 'user_plan_a_success',
        file_path: '/path/to/archive_plan_a.zip',
        model_name: 'model-plan_a',
        trigger_word: 'trigger-plan_a',
        is_ru: true,
        bot_name: 'bot_plan_a',
      };

      const result = await modelTrainingService(requestData, mockCtx);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Запрос на тренировку модели успешно отправлен в обработку (План А).');
      expect(result.error).toBeUndefined();
      expect(result.cost).toBe(250);
      expect(result.eventId).toBe(mockInngestEventId);
      expect(result.replicateTrainingId).toBeUndefined();
      expect(result.replicateStatus).toBeUndefined();

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.copyFileSync).toHaveBeenCalledOnce();
      
      expect(mockInngest.send).toHaveBeenCalledOnce();
      const expectedEventPayload = {
        name: 'digital-avatar-body/model-training.requested',
        data: {
          telegram_id: requestData.telegram_id,
          bot_name: requestData.bot_name,
          model_name: requestData.model_name,
          trigger_word: requestData.trigger_word,
          zipUrl: expect.stringContaining(`/${requestData.file_path.split('/').pop()?.replace('.zip', '')}_`), // Проверяем, что URL содержит имя файла
          is_ru: requestData.is_ru,
          cost_for_refund: 250,
          operation_type_for_refund: PaymentType.NEURO_TRAIN_LORA,
          original_message_id: mockCtx.message?.message_id,
          chat_id: mockCtx.chat?.id
        }
      };
      expect(mockInngest.send).toHaveBeenCalledWith(expect.objectContaining(expectedEventPayload));
      
      expect(mockReplicate.trainings.create).not.toHaveBeenCalled();

      expect(mockSendTelegramMessage).toHaveBeenCalledOnce();
      expect(mockSendTelegramMessage).toHaveBeenCalledWith(
        requestData.telegram_id,
        expect.stringContaining(`Запрос на тренировку модели \"${requestData.model_name}\" успешно отправлен`) &&
        expect.stringContaining(`ID события: ${mockInngestEventId}`)
      );
      // replyWithHTML не используется в Плане А для основного ответа
      expect(mockCtx.replyWithHTML).not.toHaveBeenCalled(); 
    });
  });
});
