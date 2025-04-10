/**
 * Примеры использования функционального мок-модуля
 */
import mock from '../../core/mock';
import { logger } from '@/utils/logger';

// Пример 1: Базовое использование mock.create
export function example1() {
  // Создание простого мока с возвращаемым значением
  const simpleMock = mock.create({
    returnValue: 'Hello, World!'
  });
  
  // Вызов мока
  const result = simpleMock('arg1', 'arg2');
  
  // Проверка результата
  logger.info(`Результат вызова: ${result}`);
  logger.info(`Был ли вызван мок: ${simpleMock.called}`);
  logger.info(`Количество вызовов: ${simpleMock.callCount}`);
  logger.info(`Был ли вызван с 'arg1': ${simpleMock.calledWith('arg1', 'arg2')}`);
  
  return simpleMock;
}

// Пример 2: Мок с реализацией
export function example2() {
  // Создание мока с реализацией
  const mockWithImpl = mock.create({
    implementation: (a: number, b: number) => a + b
  });
  
  // Вызов мока
  const result = mockWithImpl(2, 3);
  
  // Проверка результата
  logger.info(`2 + 3 = ${result}`);
  logger.info(`Аргументы первого вызова: ${JSON.stringify(mockWithImpl.calls[0].args)}`);
  
  return mockWithImpl;
}

// Пример 3: Мок с ошибкой
export function example3() {
  // Создание мока, который выбрасывает ошибку
  const mockWithError = mock.create({
    throwError: new Error('Тестовая ошибка')
  });
  
  try {
    // Вызов мока
    mockWithError();
  } catch (error) {
    logger.info(`Поймана ошибка: ${(error as Error).message}`);
    logger.info(`Вызов зафиксирован: ${mockWithError.called}`);
    logger.info(`Ошибка в истории вызовов: ${mockWithError.calls[0].threw}`);
  }
  
  return mockWithError;
}

// Пример 4: Мокирование метода объекта
export function example4() {
  // Объект с методом
  const calculator = {
    add: (a: number, b: number) => a + b,
    subtract: (a: number, b: number) => a - b
  };
  
  // Мокируем метод add
  const addMock = mock.method(calculator, 'add', {
    returnValue: 42
  });
  
  // Вызов мокированного метода
  const result = calculator.add(5, 3);
  
  // Проверка результата
  logger.info(`Результат calculator.add(5, 3): ${result}`);
  logger.info(`Оригинальный результат был бы: ${addMock.original(5, 3)}`);
  
  // Восстановление оригинального метода
  (addMock as any).restore();
  
  // Проверка восстановленного метода
  const originalResult = calculator.add(5, 3);
  logger.info(`Результат после восстановления: ${originalResult}`);
  
  return { calculator, addMock };
}

// Пример 5: Мокирование всех методов объекта
export function example5() {
  // Объект с методами
  const api = {
    fetchUser: (id: string) => ({ id, name: 'John Doe' }),
    createUser: (name: string) => ({ id: '123', name }),
    deleteUser: (id: string) => true
  };
  
  // Мокируем все методы
  const apiMocks = mock.object(api);
  
  // Настраиваем мок для fetchUser
  apiMocks.fetchUser.resetCalls();
  (apiMocks.fetchUser as any).returnValue = { id: '456', name: 'Mocked User' };
  
  // Вызываем мокированный метод
  const user = api.fetchUser('789');
  
  // Проверяем результат
  logger.info(`Полученный пользователь: ${JSON.stringify(user)}`);
  logger.info(`fetchUser был вызван с id: ${apiMocks.fetchUser.calls[0].args[0]}`);
  
  return { api, apiMocks };
}

// Пример 6: Создание заглушки (stub)
export function example6() {
  // Создаем заглушку (stub) для API
  const apiStub = mock.stub('API', ['get', 'post', 'put', 'delete']);
  
  // Настраиваем метод get
  (apiStub.get as any).implementation = (url: string) => {
    if (url === '/users') {
      return [{ id: 1, name: 'User 1' }, { id: 2, name: 'User 2' }];
    }
    return null;
  };
  
  // Вызываем методы заглушки
  const users = apiStub.get('/users');
  const nonExistent = apiStub.get('/non-existent');
  
  // Проверяем результаты
  logger.info(`Получено пользователей: ${users ? (users as any).length : 0}`);
  logger.info(`Несуществующий путь вернул: ${nonExistent}`);
  logger.info(`Метод get был вызван ${apiStub.get.callCount} раз`);
  
  return apiStub;
}

// Пример 7: Проверка ожидаемых вызовов
export function example7() {
  // Создаем мок с ожидаемыми аргументами
  const mockWithExpectations = mock.create({
    expectedArgs: [
      ['arg1', 'arg2'],
      ['arg3', 'arg4']
    ]
  });
  
  // Вызываем мок дважды
  mockWithExpectations('arg1', 'arg2');
  mockWithExpectations('arg3', 'arg4');
  
  // Проверяем, что ожидания выполнены
  const result = mockWithExpectations.verify();
  logger.info(`Ожидания выполнены: ${result}`);
  
  // Проверяем сценарий с ошибкой
  const mockWithError = mock.create({
    expectedArgs: [['correct']]
  });
  
  mockWithError('wrong');
  
  // Ожидания не выполнены
  const errorResult = mockWithError.verify();
  logger.info(`Ожидания выполнены (должно быть false): ${errorResult}`);
  
  return { mockWithExpectations, mockWithError };
}

// Запуск всех примеров
export function runAllExamples() {
  logger.info('=== Пример 1: Базовое использование ===');
  example1();
  
  logger.info('\n=== Пример 2: Мок с реализацией ===');
  example2();
  
  logger.info('\n=== Пример 3: Мок с ошибкой ===');
  example3();
  
  logger.info('\n=== Пример 4: Мокирование метода объекта ===');
  example4();
  
  logger.info('\n=== Пример 5: Мокирование всех методов объекта ===');
  example5();
  
  logger.info('\n=== Пример 6: Создание заглушки ===');
  example6();
  
  logger.info('\n=== Пример 7: Проверка ожидаемых вызовов ===');
  example7();
}

// Если файл запущен напрямую, выполняем все примеры
if (require.main === module) {
  runAllExamples();
} 