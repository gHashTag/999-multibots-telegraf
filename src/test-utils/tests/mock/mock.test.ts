/**
 * Тесты для функционального мок-модуля
 */
import mock from '../../core/mock';
import { TestCategory } from '../../core/categories';
import { logger } from '@/utils/logger';

/**
 * Запуск тестов мок-модуля
 */
export async function runMockTests() {
  logger.info('Запуск тестов мок-модуля...');
  
  const results = [
    testCreateMock(),
    testMockWithImplementation(),
    testMockWithError(),
    testMethodMocking(),
    testObjectMocking(),
    testStubCreation(),
    testExpectedArgs()
  ];
  
  const passed = results.filter(r => r.success).length;
  const failed = results.length - passed;
  
  logger.info(`Тесты мок-модуля завершены. Пройдено: ${passed}, Не пройдено: ${failed}`);
  
  return results;
}

/**
 * Тест создания простого мока
 */
function testCreateMock() {
  logger.info('Тест: Создание простого мока');
  
  try {
    // Создаем мок
    const mockFn = mock.create({
      returnValue: 'test value'
    });
    
    // Вызываем
    const result = mockFn('arg1', 123);
    
    // Проверяем результат
    if (result !== 'test value') {
      return {
        success: false,
        message: `Ожидалось 'test value', получено '${result}'`,
        name: 'testCreateMock',
        category: TestCategory.Functional
      };
    }
    
    // Проверяем свойства мока
    if (!mockFn.called) {
      return {
        success: false,
        message: 'Мок должен быть помечен как вызванный',
        name: 'testCreateMock',
        category: TestCategory.Functional
      };
    }
    
    if (mockFn.callCount !== 1) {
      return {
        success: false,
        message: `Ожидалось callCount=1, получено ${mockFn.callCount}`,
        name: 'testCreateMock',
        category: TestCategory.Functional
      };
    }
    
    if (!mockFn.calledWith('arg1', 123)) {
      return {
        success: false,
        message: 'Мок должен быть вызван с правильными аргументами',
        name: 'testCreateMock',
        category: TestCategory.Functional
      };
    }
    
    // Проверяем историю вызовов
    if (mockFn.calls.length !== 1) {
      return {
        success: false,
        message: `Ожидалась 1 запись в истории вызовов, получено ${mockFn.calls.length}`,
        name: 'testCreateMock',
        category: TestCategory.Functional
      };
    }
    
    if (mockFn.calls[0].args[0] !== 'arg1' || mockFn.calls[0].args[1] !== 123) {
      return {
        success: false,
        message: 'Неверные аргументы в истории вызовов',
        name: 'testCreateMock',
        category: TestCategory.Functional
      };
    }
    
    return {
      success: true,
      message: 'Тест успешно пройден',
      name: 'testCreateMock',
      category: TestCategory.Functional
    };
  } catch (error) {
    return {
      success: false,
      message: `Ошибка выполнения теста: ${(error as Error).message}`,
      name: 'testCreateMock',
      category: TestCategory.Functional
    };
  }
}

/**
 * Тест мока с реализацией
 */
function testMockWithImplementation() {
  logger.info('Тест: Мок с реализацией');
  
  try {
    // Создаем мок с реализацией
    const mockFn = mock.create({
      implementation: (a: number, b: number) => a * b
    });
    
    // Вызываем с разными аргументами
    const result1 = mockFn(2, 3);
    const result2 = mockFn(5, 4);
    
    // Проверяем результаты
    if (result1 !== 6) {
      return {
        success: false,
        message: `Ожидалось 6, получено ${result1}`,
        name: 'testMockWithImplementation',
        category: TestCategory.Functional
      };
    }
    
    if (result2 !== 20) {
      return {
        success: false,
        message: `Ожидалось 20, получено ${result2}`,
        name: 'testMockWithImplementation',
        category: TestCategory.Functional
      };
    }
    
    // Проверяем историю вызовов
    if (mockFn.callCount !== 2) {
      return {
        success: false,
        message: `Ожидалось callCount=2, получено ${mockFn.callCount}`,
        name: 'testMockWithImplementation',
        category: TestCategory.Functional
      };
    }
    
    return {
      success: true,
      message: 'Тест успешно пройден',
      name: 'testMockWithImplementation',
      category: TestCategory.Functional
    };
  } catch (error) {
    return {
      success: false,
      message: `Ошибка выполнения теста: ${(error as Error).message}`,
      name: 'testMockWithImplementation',
      category: TestCategory.Functional
    };
  }
}

/**
 * Тест мока с ошибкой
 */
function testMockWithError() {
  logger.info('Тест: Мок с ошибкой');
  
  try {
    // Создаем мок, который выбрасывает ошибку
    const mockFn = mock.create({
      throwError: new Error('Test error')
    });
    
    // Пытаемся вызвать, должна быть ошибка
    let errorCaught = false;
    try {
      mockFn();
    } catch (error) {
      errorCaught = true;
      
      // Проверяем сообщение об ошибке
      if ((error as Error).message !== 'Test error') {
        return {
          success: false,
          message: `Неверное сообщение об ошибке: ${(error as Error).message}`,
          name: 'testMockWithError',
          category: TestCategory.Functional
        };
      }
    }
    
    if (!errorCaught) {
      return {
        success: false,
        message: 'Ошибка не была выброшена',
        name: 'testMockWithError',
        category: TestCategory.Functional
      };
    }
    
    // Проверяем, что вызов был зафиксирован
    if (!mockFn.called) {
      return {
        success: false,
        message: 'Мок должен быть помечен как вызванный, несмотря на ошибку',
        name: 'testMockWithError',
        category: TestCategory.Functional
      };
    }
    
    // Проверяем запись об ошибке в истории вызовов
    if (!mockFn.calls[0].threw) {
      return {
        success: false,
        message: 'В истории вызовов должна быть отметка о выброшенной ошибке',
        name: 'testMockWithError',
        category: TestCategory.Functional
      };
    }
    
    return {
      success: true,
      message: 'Тест успешно пройден',
      name: 'testMockWithError',
      category: TestCategory.Functional
    };
  } catch (error) {
    return {
      success: false,
      message: `Ошибка выполнения теста: ${(error as Error).message}`,
      name: 'testMockWithError',
      category: TestCategory.Functional
    };
  }
}

/**
 * Тест мокирования метода объекта
 */
function testMethodMocking() {
  logger.info('Тест: Мокирование метода объекта');
  
  try {
    // Создаем объект с методом
    const obj = {
      method: (a: number, b: number) => a + b
    };
    
    // Сохраняем оригинальную реализацию
    const originalImplementation = obj.method;
    
    // Мокируем метод
    const mockedMethod = mock.method(obj, 'method', {
      returnValue: 42
    });
    
    // Вызываем мокированный метод
    const result = obj.method(2, 3);
    
    // Проверяем результат
    if (result !== 42) {
      return {
        success: false,
        message: `Ожидалось 42, получено ${result}`,
        name: 'testMethodMocking',
        category: TestCategory.Functional
      };
    }
    
    // Проверяем, что оригинальная функция сохранена
    if (mockedMethod.original(2, 3) !== 5) {
      return {
        success: false,
        message: 'Оригинальная функция должна возвращать правильный результат',
        name: 'testMethodMocking',
        category: TestCategory.Functional
      };
    }
    
    // Восстанавливаем оригинальный метод
    mockedMethod.restore();
    
    // Проверяем, что оригинальный метод восстановлен
    if (obj.method !== originalImplementation) {
      return {
        success: false,
        message: 'Оригинальный метод не был восстановлен',
        name: 'testMethodMocking',
        category: TestCategory.Functional
      };
    }
    
    return {
      success: true,
      message: 'Тест успешно пройден',
      name: 'testMethodMocking',
      category: TestCategory.Functional
    };
  } catch (error) {
    return {
      success: false,
      message: `Ошибка выполнения теста: ${(error as Error).message}`,
      name: 'testMethodMocking',
      category: TestCategory.Functional
    };
  }
}

/**
 * Тест мокирования всех методов объекта
 */
function testObjectMocking() {
  logger.info('Тест: Мокирование всех методов объекта');
  
  try {
    // Создаем объект с методами
    const obj = {
      method1: () => 'original1',
      method2: () => 'original2'
    };
    
    // Сохраняем оригинальные реализации
    const originalMethod1 = obj.method1;
    const originalMethod2 = obj.method2;
    
    // Мокируем все методы
    const mocks = mock.object(obj);
    
    // Настраиваем возвращаемые значения
    mocks.method1.returnValue = 'mocked1';
    mocks.method2.returnValue = 'mocked2';
    
    // Вызываем мокированные методы
    const result1 = obj.method1();
    const result2 = obj.method2();
    
    // Проверяем результаты
    if (result1 !== 'mocked1') {
      return {
        success: false,
        message: `Ожидалось 'mocked1', получено '${result1}'`,
        name: 'testObjectMocking',
        category: TestCategory.Functional
      };
    }
    
    if (result2 !== 'mocked2') {
      return {
        success: false,
        message: `Ожидалось 'mocked2', получено '${result2}'`,
        name: 'testObjectMocking',
        category: TestCategory.Functional
      };
    }
    
    // Проверяем, что вызовы зафиксированы
    if (mocks.method1.callCount !== 1 || mocks.method2.callCount !== 1) {
      return {
        success: false,
        message: 'Неверное количество вызовов',
        name: 'testObjectMocking',
        category: TestCategory.Functional
      };
    }
    
    // Восстанавливаем оригинальные методы
    mocks.method1.restore();
    mocks.method2.restore();
    
    // Проверяем, что оригинальные методы восстановлены
    if (obj.method1 !== originalMethod1 || obj.method2 !== originalMethod2) {
      return {
        success: false,
        message: 'Оригинальные методы не были восстановлены',
        name: 'testObjectMocking',
        category: TestCategory.Functional
      };
    }
    
    return {
      success: true,
      message: 'Тест успешно пройден',
      name: 'testObjectMocking',
      category: TestCategory.Functional
    };
  } catch (error) {
    return {
      success: false,
      message: `Ошибка выполнения теста: ${(error as Error).message}`,
      name: 'testObjectMocking',
      category: TestCategory.Functional
    };
  }
}

/**
 * Тест создания заглушки (stub)
 */
function testStubCreation() {
  logger.info('Тест: Создание заглушки (stub)');
  
  try {
    // Создаем заглушку
    const stub = mock.stub('TestStub', ['method1', 'method2']);
    
    // Настраиваем метод
    stub.method1.returnValue = 'stubbed value';
    
    // Вызываем метод
    const result = stub.method1();
    
    // Проверяем результат
    if (result !== 'stubbed value') {
      return {
        success: false,
        message: `Ожидалось 'stubbed value', получено '${result}'`,
        name: 'testStubCreation',
        category: TestCategory.Functional
      };
    }
    
    // Проверяем, что все методы созданы
    if (typeof stub.method2 !== 'function') {
      return {
        success: false,
        message: 'Метод method2 не был создан',
        name: 'testStubCreation',
        category: TestCategory.Functional
      };
    }
    
    // Проверяем имя заглушки
    if (stub.name !== 'TestStub') {
      return {
        success: false,
        message: `Неверное имя заглушки: ${stub.name}`,
        name: 'testStubCreation',
        category: TestCategory.Functional
      };
    }
    
    return {
      success: true,
      message: 'Тест успешно пройден',
      name: 'testStubCreation',
      category: TestCategory.Functional
    };
  } catch (error) {
    return {
      success: false,
      message: `Ошибка выполнения теста: ${(error as Error).message}`,
      name: 'testStubCreation',
      category: TestCategory.Functional
    };
  }
}

/**
 * Тест ожидаемых аргументов
 */
function testExpectedArgs() {
  logger.info('Тест: Ожидаемые аргументы');
  
  try {
    // Создаем мок с ожидаемыми аргументами
    const mockFn = mock.create({
      expectedArgs: [
        ['arg1', 'arg2'],
        [42, 'arg3']
      ]
    });
    
    // Вызываем мок с правильными аргументами
    mockFn('arg1', 'arg2');
    mockFn(42, 'arg3');
    
    // Проверяем успешность верификации
    const verificationResult = mockFn.verify();
    
    if (!verificationResult) {
      return {
        success: false,
        message: 'Верификация должна пройти успешно при правильных аргументах',
        name: 'testExpectedArgs',
        category: TestCategory.Functional
      };
    }
    
    // Создаем мок с ожидаемыми аргументами и вызываем с неправильными
    const mockFnFail = mock.create({
      expectedArgs: [['correct']]
    });
    
    mockFnFail('wrong');
    
    // Проверяем, что верификация не проходит
    const failResult = mockFnFail.verify();
    
    if (failResult) {
      return {
        success: false,
        message: 'Верификация должна провалиться при неправильных аргументах',
        name: 'testExpectedArgs',
        category: TestCategory.Functional
      };
    }
    
    return {
      success: true,
      message: 'Тест успешно пройден',
      name: 'testExpectedArgs',
      category: TestCategory.Functional
    };
  } catch (error) {
    return {
      success: false,
      message: `Ошибка выполнения теста: ${(error as Error).message}`,
      name: 'testExpectedArgs',
      category: TestCategory.Functional
    };
  }
}

// Если файл запущен напрямую, выполняем тесты
if (require.main === module) {
  runMockTests().then(results => {
    const passed = results.filter(r => r.success).length;
    const failed = results.length - passed;
    
    logger.info(`Результаты тестов: Успешно - ${passed}, Провалено - ${failed}`);
    
    if (failed > 0) {
      process.exit(1);
    }
  });
} 