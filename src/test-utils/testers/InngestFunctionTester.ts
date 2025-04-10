import { InngestTester } from '../inngest/inngest-tests.test'
import { InngestFunctionTester as BaseInngestFunctionTester } from '../core/InngestFunctionTester'
import { logger } from '@/utils/logger'

/**
 * Возможные методы тестирования Inngest функций
 */
export enum InngestTestMethod {
  ModelTraining = 'testModelTraining',
  ModelTrainingV2 = 'testModelTrainingV2',
  NeuroImageGeneration = 'testNeuroImageGeneration',
  NeuroPhotoV2Generation = 'testNeuroPhotoV2Generation',
  TextToImage = 'testTextToImage',
  TextToVideo = 'testTextToVideo',
  VoiceAvatarCreation = 'testVoiceAvatarCreation',
  TextToSpeech = 'testTextToSpeech',
  RunAllTests = 'runAllTests'
}

/**
 * Результат выполнения теста Inngest функции
 */
export interface InngestTestResult {
  success: boolean;
  message?: string;
  data?: unknown;
  error?: Error | string;
  duration?: number;
}

/**
 * Дополнительные данные для теста
 */
export interface InngestTestData {
  [key: string]: unknown;
}

/**
 * Интерфейс для входных данных тестера Inngest функций
 */
export interface InngestFunctionTestInput {
  method?: InngestTestMethod | string;
  data?: InngestTestData;
}

/**
 * Опции для создания тестера Inngest функций
 */
export interface InngestFunctionTesterOptions {
  name?: string;
  verbose?: boolean;
  timeout?: number;
}

/**
 * Тестер для Inngest функций
 * 
 * Обертка над существующим InngestTester для интеграции в новую систему тестирования
 */
export class InngestFunctionTester extends BaseInngestFunctionTester<InngestFunctionTestInput, InngestTestResult> {
  private inngestTester: InngestTester;

  // Определяем индексную сигнатуру для доступа к методам по строковому ключу
  [key: string]: unknown;

  constructor(options: Partial<InngestFunctionTesterOptions> = {}) {
    super('inngest/function.test', {
      name: options.name || 'Inngest Function Tester',
      verbose: options.verbose || false,
    });
    
    this.inngestTester = new InngestTester();
  }

  /**
   * Тест функции тренировки модели
   */
  async testModelTraining(): Promise<InngestTestResult> {
    logger.info({
      message: '🧪 Тест функции тренировки модели',
      description: 'Testing model training function',
    });
    
    try {
      const result = await this.inngestTester.testModelTraining();
      return {
        success: true,
        message: 'Тест тренировки модели успешно выполнен',
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: 'Ошибка при тестировании функции тренировки модели',
        error: error instanceof Error ? error : String(error)
      };
    }
  }

  /**
   * Тест функции тренировки модели V2
   */
  async testModelTrainingV2(): Promise<InngestTestResult> {
    logger.info({
      message: '🧪 Тест функции тренировки модели V2',
      description: 'Testing model training V2 function',
    });
    
    try {
      const result = await this.inngestTester.testModelTrainingV2();
      return {
        success: true,
        message: 'Тест тренировки модели V2 успешно выполнен',
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: 'Ошибка при тестировании функции тренировки модели V2',
        error: error instanceof Error ? error : String(error)
      };
    }
  }

  /**
   * Тест функции генерации нейрофото
   */
  async testNeuroImageGeneration(): Promise<InngestTestResult> {
    logger.info({
      message: '🧪 Тест функции генерации изображений',
      description: 'Testing neuro image generation function',
    });
    
    try {
      const result = await this.inngestTester.testNeuroImageGeneration();
      return {
        success: true,
        message: 'Тест генерации нейрофото успешно выполнен',
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: 'Ошибка при тестировании функции генерации нейрофото',
        error: error instanceof Error ? error : String(error)
      };
    }
  }

  /**
   * Тест функции генерации нейрофото V2
   */
  async testNeuroPhotoV2Generation(): Promise<InngestTestResult> {
    logger.info({
      message: '🧪 Тест функции генерации нейрофото V2',
      description: 'Testing neurophoto V2 generation function',
    });
    
    try {
      const result = await this.inngestTester.testNeuroPhotoV2Generation();
      return {
        success: true,
        message: 'Тест генерации нейрофото V2 успешно выполнен',
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: 'Ошибка при тестировании функции генерации нейрофото V2',
        error: error instanceof Error ? error : String(error)
      };
    }
  }

  /**
   * Тест функции генерации текст-в-изображение
   */
  async testTextToImage(): Promise<InngestTestResult> {
    logger.info({
      message: '🧪 Тест функции генерации текст-в-изображение',
      description: 'Testing text to image function',
    });
    
    try {
      const result = await this.inngestTester.testTextToImage();
      return {
        success: true,
        message: 'Тест генерации текст-в-изображение успешно выполнен',
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: 'Ошибка при тестировании функции генерации текст-в-изображение',
        error: error instanceof Error ? error : String(error)
      };
    }
  }

  /**
   * Тест функции генерации текст-в-видео
   */
  async testTextToVideo(): Promise<InngestTestResult> {
    logger.info({
      message: '🧪 Тест функции генерации текст-в-видео',
      description: 'Testing text to video function',
    });
    
    try {
      const result = await this.inngestTester.testTextToVideo();
      return {
        success: true,
        message: 'Тест генерации текст-в-видео успешно выполнен',
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: 'Ошибка при тестировании функции генерации текст-в-видео',
        error: error instanceof Error ? error : String(error)
      };
    }
  }

  /**
   * Тест функции создания голосового аватара
   */
  async testVoiceAvatarCreation(): Promise<InngestTestResult> {
    logger.info({
      message: '🧪 Тест функции создания голосового аватара',
      description: 'Testing voice avatar creation function',
    });
    
    try {
      const result = await this.inngestTester.testVoiceAvatarCreation();
      return {
        success: true,
        message: 'Тест создания голосового аватара успешно выполнен',
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: 'Ошибка при тестировании функции создания голосового аватара',
        error: error instanceof Error ? error : String(error)
      };
    }
  }

  /**
   * Тест функции текст-в-речь
   */
  async testTextToSpeech(): Promise<InngestTestResult> {
    logger.info({
      message: '🧪 Тест функции текст-в-речь',
      description: 'Testing text to speech function',
    });
    
    try {
      const results = await this.inngestTester.runTextToSpeechTests();
      return {
        success: true,
        message: 'Тест генерации текст-в-речь успешно выполнен',
        data: results[0] // Возвращаем результат первого теста
      };
    } catch (error) {
      return {
        success: false,
        message: 'Ошибка при тестировании функции текст-в-речь',
        error: error instanceof Error ? error : String(error)
      };
    }
  }

  /**
   * Запускает все тесты Inngest функций
   */
  async runAllTests(): Promise<InngestTestResult[]> {
    logger.info({
      message: '🧪 Запуск всех тестов Inngest функций',
      description: 'Running all Inngest function tests',
    });
    
    try {
      const results = await this.inngestTester.runAllTests();
      return results.map(result => ({
        success: true,
        message: 'Тест успешно выполнен',
        data: result
      }));
    } catch (error) {
      return [{
        success: false,
        message: 'Ошибка при запуске всех тестов Inngest функций',
        error: error instanceof Error ? error : String(error)
      }];
    }
  }

  /**
   * Обязательный метод-реализация от базового класса
   */
  protected async executeTest(input: InngestFunctionTestInput): Promise<InngestTestResult> {
    logger.info({
      message: '🧪 Выполнение теста Inngest функции',
      description: 'Executing Inngest function test',
      input,
    });
    
    const startTime = Date.now();
    
    try {
      // Если указан метод, вызываем его
      if (input.method && typeof input.method === 'string' && typeof this[input.method as keyof this] === 'function') {
        const testMethod = this[input.method as keyof this] as (data?: any) => Promise<InngestTestResult>;
        const result = await testMethod(input.data);
        
        // Если результат уже в формате InngestTestResult, добавляем длительность и возвращаем
        if (typeof result === 'object' && result !== null && 'success' in result) {
          return {
            ...(result as InngestTestResult),
            duration: Date.now() - startTime
          };
        }
        
        // Иначе оборачиваем в InngestTestResult
        return {
          success: true,
          message: `Тест ${input.method} успешно выполнен`,
          data: result,
          duration: Date.now() - startTime
        };
      }
      
      // По умолчанию запускаем все тесты
      const results = await this.runAllTests();
      
      // Если все успешно, возвращаем общий результат
      return {
        success: results.every(r => r.success),
        message: 'Все тесты выполнены',
        data: results,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        message: 'Ошибка при выполнении теста Inngest функции',
        error: error instanceof Error ? error : String(error),
        duration: Date.now() - startTime
      };
    }
  }
} 