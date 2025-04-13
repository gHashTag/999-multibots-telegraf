import axios from 'axios';
import { logger } from '@/utils/logger';
import { TEST_PAYMENT_CONFIG } from './test-config';
import { MERCHANT_LOGIN, PASSWORD1, TEST_PASSWORD1, isDev } from '@/config';
import md5 from 'md5';
// Удаляем импорт Jest globals
import assert from '@/test-utils/core/assert';
import { TestResult } from '@/test-utils/core/types';

/**
 * Тест для проверки валидности URL платежной формы Robokassa
 */
// Используем собственную систему тестирования вместо Jest
export async function runRobokassaFormTests(): Promise<{ 
  success: boolean; 
  results: TestResult[]; 
  error?: string | Error;
}> {
  const testResults: { success: boolean; results: TestResult[]; error?: string | Error } = {
    success: true,
    results: [],
  };
  
  const merchantLogin = MERCHANT_LOGIN;
  const password1 = PASSWORD1;
  const testPassword1 = TEST_PASSWORD1;
  const useTestMode = isDev;

  /**
   * Функция для генерации корректного URL Robokassa с правильной подписью
   */
  function generateValidRobokassaUrl(
    outSum: number,
    invId: number,
    description: string,
    isTest: boolean = useTestMode
  ): string {
    // Если включен тестовый режим и доступен тестовый пароль, используем его
    const actualPassword = isTest && testPassword1 ? testPassword1 : password1;
    
    logger.info('🔍 Генерация тестового URL для Robokassa', {
      description: 'Generating test Robokassa URL',
      merchantLogin,
      outSum,
      invId,
      isTestMode: isTest
    });

    // Убеждаемся, что invId - целое число и не слишком длинное
    if (!Number.isInteger(invId) || invId > 2147483647) {
      logger.warn('⚠️ InvId некорректный, будет преобразован', {
        description: 'Warning: InvId is incorrect, will be converted',
        originalInvId: invId,
      });
      // Преобразуем в целое число если это не так и ограничиваем длину
      invId = Math.floor(invId % 1000000);
    }

    const signatureString = `${merchantLogin}:${outSum}:${invId}:${actualPassword}`;
    const signatureValue = md5(signatureString).toUpperCase();

    // Формируем базовый URL Robokassa
    const baseUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx';

    // Создаем параметры запроса
    const params = new URLSearchParams();
    
    // Добавляем все параметры
    params.append('MerchantLogin', merchantLogin || '');
    params.append('OutSum', outSum.toString());
    params.append('InvId', invId.toString());
    params.append('Description', description);
    params.append('SignatureValue', signatureValue);

    // Добавляем параметр IsTest только если включен тестовый режим
    if (isTest) {
      params.append('IsTest', '1');
    }

    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Проверяет доступность и валидность URL платежной формы
   */
  async function checkPaymentFormUrl(url: string): Promise<{
    isValid: boolean;
    statusCode?: number;
    error?: string;
    content?: string;
  }> {
    try {
      const response = await axios.get(url, {
        validateStatus: () => true, // Принимаем любой статус-код
        timeout: 10000, // 10 секунд таймаут
        maxRedirects: 5 // Максимальное количество редиректов
      });

      const isHtmlForm = response.data && 
                         (response.data.includes('<form') || 
                          response.data.includes('robokassa') ||
                          response.data.includes('payment'));

      return {
        isValid: response.status === 200 && isHtmlForm,
        statusCode: response.status,
        content: typeof response.data === 'string' ? response.data.substring(0, 500) : 'Not a string response'
      };
    } catch (error) {
      logger.error('❌ Ошибка при проверке URL платежной формы', {
        error: error instanceof Error ? error.message : String(error),
        url
      });
      
      return {
        isValid: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Проверяет, что URL содержит все необходимые параметры
   */
  function validateUrlParameters(url: string): { 
    isValid: boolean; 
    missingParams: string[] 
  } {
    const parsedUrl = new URL(url);
    const requiredParams = ['MerchantLogin', 'OutSum', 'InvId', 'Description', 'SignatureValue'];
    const missingParams = [];

    for (const param of requiredParams) {
      if (!parsedUrl.searchParams.has(param)) {
        missingParams.push(param);
      }
    }

    return {
      isValid: missingParams.length === 0,
      missingParams
    };
  }

  /**
   * Тест на создание валидного URL с правильными параметрами
   */
  async function testValidUrlGeneration(): Promise<TestResult> {
    logger.info('🧪 Запуск теста: генерация валидного URL Robokassa');
    
    try {
      const amount = TEST_PAYMENT_CONFIG.amounts.small; // Небольшая сумма для теста
      const invId = Math.floor(Date.now() / 1000); // Уникальный ID заказа
      const description = 'Тестовая оплата звезд';

      const url = generateValidRobokassaUrl(amount, invId, description);
      
      // Проверяем наличие всех параметров
      const paramsCheck = validateUrlParameters(url);
      assert.isTrue(paramsCheck.isValid, 'URL должен содержать все параметры');
      
      if (!paramsCheck.isValid) {
        const errMsg = `URL не содержит параметры: ${paramsCheck.missingParams.join(', ')}`;
        logger.error('❌ URL не содержит все необходимые параметры', {
          url,
          missingParams: paramsCheck.missingParams
        });
        
        return {
          name: 'Генерация валидного URL',
          success: false,
          message: errMsg,
          error: errMsg
        } as TestResult;
      }

      // Проверяем доступность URL
      const result = await checkPaymentFormUrl(url);

      // Логируем результат для диагностики
      if (!result.isValid) {
        const errMsg = `URL недоступен: ${result.error || `Код ответа: ${result.statusCode}`}`;
        logger.error('❌ URL платежной формы недоступен или невалиден', {
          url,
          statusCode: result.statusCode,
          error: result.error
        });
        
        if (result.content) {
          logger.info('📄 Содержимое ответа:', {
            content: result.content
          });
        }
        
        return {
          name: 'Генерация валидного URL',
          success: false,
          message: errMsg,
          error: errMsg,
          details: { statusCode: result.statusCode }
        } as TestResult;
      }

      logger.info('✅ Тест пройден: URL валиден и доступен', { url });
      
      return {
        name: 'Генерация валидного URL',
        success: true,
        message: 'URL валиден и доступен',
        details: { url }
      } as TestResult;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('❌ Ошибка при выполнении теста', {
        error: errMsg
      });
      
      return {
        name: 'Генерация валидного URL',
        success: false,
        message: 'Ошибка при выполнении теста',
        error: errMsg
      } as TestResult;
    }
  }

  /**
   * Тест с различными суммами платежа
   */
  async function testDifferentAmounts(): Promise<TestResult> {
    logger.info('🧪 Запуск теста: проверка различных сумм платежа');
    const testName = 'Проверка различных сумм';
    const resultsLog = [];

    try {
      const testAmounts = [
        TEST_PAYMENT_CONFIG.amounts.small,
        TEST_PAYMENT_CONFIG.amounts.medium,
        1.99, // Дробная сумма
        10000 // Крупная сумма
      ];
      
      for (const amount of testAmounts) {
        const invId = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000);
        const description = `Тест оплаты ${amount} руб.`;

        const url = generateValidRobokassaUrl(amount, invId, description);
        const result = await checkPaymentFormUrl(url);

        logger.info(`🧪 Тест URL с суммой ${amount} руб.`, {
          isValid: result.isValid,
          statusCode: result.statusCode
        });
        
        resultsLog.push({ amount, isValid: result.isValid, statusCode: result.statusCode });
        
        if (!result.isValid) {
          const errMsg = `Ошибка при сумме ${amount}: ${result.error || `Код ответа: ${result.statusCode}`}`;
          return {
            name: testName,
            success: false,
            message: errMsg,
            error: errMsg,
            details: { results: resultsLog }
          } as TestResult;
        }
      }
      
      logger.info('✅ Тест пройден: все суммы обрабатываются корректно');
      
      return {
        name: testName,
        success: true,
        message: 'Все суммы обрабатываются корректно',
        details: { results: resultsLog }
      } as TestResult;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Ошибка при выполнении теста ${testName}`, { error: errMsg });
      
      return {
        name: testName,
        success: false,
        message: `Ошибка при выполнении теста ${testName}`,
        error: errMsg
      } as TestResult;
    }
  }

  /**
   * Тест на проверку некорректных InvId
   */
  function testInvalidInvId(): TestResult {
    logger.info('🧪 Запуск теста: обработка некорректных InvId');
    const testName = 'Обработка некорректных InvId';

    try {
      const amount = TEST_PAYMENT_CONFIG.amounts.small;
      const description = 'Тест с некорректным InvId';
      
      // Слишком большой InvId (должен быть скорректирован)
      const hugeInvId = 9999999999;
      const url = generateValidRobokassaUrl(amount, hugeInvId, description);
      
      // Проверяем, что в URL InvId не превышает максимальное значение
      const parsedUrl = new URL(url);
      const invIdParam = parseInt(parsedUrl.searchParams.get('InvId') || '0');
      
      assert.isTrue(invIdParam < 1000000, 'InvId должен быть меньше 1000000');
      
      logger.info('✅ Тест пройден: некорректные InvId обрабатываются правильно');
      
      return {
        name: testName,
        success: true,
        message: 'Некорректные InvId обрабатываются правильно',
        details: { originalInvId: hugeInvId, correctedInvId: invIdParam }
      } as TestResult;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Ошибка при выполнении теста ${testName}`, { error: errMsg });
      
      return {
        name: testName,
        success: false,
        message: `Ошибка при выполнении теста ${testName}`,
        error: errMsg
      } as TestResult;
    }
  }

  /**
   * Тест проверки сигнатуры (подписи)
   */
  function testSignatureGeneration(): TestResult {
    logger.info('🧪 Запуск теста: проверка генерации подписи');
    const testName = 'Генерация подписи';

    try {
      const amount = TEST_PAYMENT_CONFIG.amounts.small;
      const invId = Math.floor(Date.now() / 1000);
      const description = 'Тест подписи';

      const url = generateValidRobokassaUrl(amount, invId, description, true);
      const parsedUrl = new URL(url);
      
      // Получаем параметры из URL
      const urlMerchantLogin = parsedUrl.searchParams.get('MerchantLogin');
      const urlOutSum = parsedUrl.searchParams.get('OutSum');
      const urlInvId = parsedUrl.searchParams.get('InvId');
      const urlSignatureValue = parsedUrl.searchParams.get('SignatureValue');
      
      // Проверяем, что все параметры есть
      assert.strictEqual(urlMerchantLogin, merchantLogin, 'MerchantLogin должен совпадать');
      assert.strictEqual(urlOutSum, amount.toString(), 'OutSum должен совпадать');
      assert.strictEqual(urlInvId, invId.toString(), 'InvId должен совпадать');
      assert.isTrue(!!urlSignatureValue, 'SignatureValue должен быть определен');
      
      // Пересчитываем подпись для проверки
      const actualPassword = testPassword1 || password1;
      const expectedSignatureString = `${merchantLogin}:${amount}:${invId}:${actualPassword}`;
      const expectedSignature = md5(expectedSignatureString).toUpperCase();
      
      assert.strictEqual(urlSignatureValue, expectedSignature, 'Подпись должна быть корректной');
      
      logger.info('✅ Тест пройден: генерация подписи работает корректно');
      
      return {
        name: testName,
        success: true,
        message: 'Генерация подписи работает корректно',
        details: { signature: urlSignatureValue }
      } as TestResult;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Ошибка при выполнении теста ${testName}`, { error: errMsg });
      
      return {
        name: testName,
        success: false,
        message: `Ошибка при выполнении теста ${testName}`,
        error: errMsg
      } as TestResult;
    }
  }

  /**
   * Тест на работу тестового режима
   */
  function testTestModeFlag(): TestResult {
    logger.info('🧪 Запуск теста: проверка работы флага тестового режима');
    const testName = 'Проверка флага IsTest';

    try {
      const amount = TEST_PAYMENT_CONFIG.amounts.small;
      const invId = Math.floor(Date.now() / 1000);
      const description = 'Тест режима IsTest';

      // URL с тестовым режимом
      const urlWithTestMode = generateValidRobokassaUrl(amount, invId, description, true);
      const parsedUrlWithTest = new URL(urlWithTestMode);
      assert.strictEqual(parsedUrlWithTest.searchParams.get('IsTest'), '1', 'IsTest должен быть равен 1');

      // URL без тестового режима
      const urlWithoutTestMode = generateValidRobokassaUrl(amount, invId, description, false);
      const parsedUrlWithoutTest = new URL(urlWithoutTestMode);
      assert.isFalse(parsedUrlWithoutTest.searchParams.has('IsTest'), 'IsTest не должен присутствовать');
      
      logger.info('✅ Тест пройден: флаг тестового режима работает корректно');
      
      return {
        name: testName,
        success: true,
        message: 'Флаг тестового режима работает корректно',
        details: { urlWithTest: urlWithTestMode, urlWithoutTest: urlWithoutTestMode }
      } as TestResult;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Ошибка при выполнении теста ${testName}`, { error: errMsg });
      
      return {
        name: testName,
        success: false,
        message: `Ошибка при выполнении теста ${testName}`,
        error: errMsg
      } as TestResult;
    }
  }

  // Запускаем все тесты
  try {
    logger.info('�� Запуск тестов формы Robokassa...');
    
    // Запускаем тесты последовательно и добавляем в results
    testResults.results.push(await testValidUrlGeneration());
    testResults.results.push(await testDifferentAmounts());
    testResults.results.push(testInvalidInvId());
    testResults.results.push(testSignatureGeneration());
    testResults.results.push(testTestModeFlag());
    
    // Проверяем, были ли ошибки в тестах
    const failedTests = testResults.results.filter(result => !result.success);
    
    if (failedTests.length > 0) {
      testResults.success = false;
      testResults.error = `Некоторые тесты не пройдены: ${failedTests.map(test => test.name).join(', ')}`;
      logger.error('❌ Некоторые тесты не пройдены:', {
        failedCount: failedTests.length,
        failedTests: failedTests.map(test => test.name)
      });
    } else {
      logger.info('✅ Все тесты успешно пройдены!');
    }
    
    return testResults;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('❌ Критическая ошибка при выполнении тестов:', { error: errorMsg });
    
    // Ensure results array exists even in case of critical error before pushing results
    if (!testResults.results) { testResults.results = []; } 
    
    testResults.success = false;
    testResults.error = errorMsg;
    return testResults;
  }
}

// Если файл запущен напрямую, запускаем тесты
if (require.main === module) {
  (async () => {
    const results = await runRobokassaFormTests();
    console.log('Результаты тестов:', JSON.stringify(results, null, 2));
    process.exit(results.success ? 0 : 1);
  })();
} 