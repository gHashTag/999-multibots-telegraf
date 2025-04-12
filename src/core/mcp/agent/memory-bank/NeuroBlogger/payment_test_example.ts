/**
 * Пример кода для тестирования платежного процессора
 * 
 * Этот файл демонстрирует, как правильно создавать и структурировать
 * тесты платежного процессора в проекте NeuroBlogger
 */

import { TestResult } from '../../types';
import { InngestTestEngine } from '../../inngestTestEngine';
import { getUserBalance } from '../../../core/supabase/getUserBalance';
import { ModeEnum } from '../../../types/enums';
import { generateUniqueId } from '../../../utils/generateId';
import { wait } from '../../../utils/time';

// Тестовый движок для Inngest
const inngestTestEngine = new InngestTestEngine();

/**
 * Тест пополнения баланса пользователя
 */
export async function testMoneyIncome(): Promise<TestResult> {
  try {
    console.log('🚀 Запуск теста пополнения баланса');
    
    // Инициализация тестового движка
    await inngestTestEngine.init({
      mockEvents: false,
      logLevel: 'info'
    });
    
    // Тестовые данные
    const testUser = { telegram_id: '123456789' };
    const amount = 100;
    const operationId = generateUniqueId();
    
    // Получение начального баланса
    const initialBalance = await getUserBalance(testUser.telegram_id);
    console.log(`💰 Начальный баланс: ${initialBalance}`);
    
    // Отправка события пополнения баланса
    await inngestTestEngine.sendEvent({
      name: 'payment/process',
      data: {
        telegram_id: testUser.telegram_id,
        amount: amount,
        type: 'money_income',
        description: 'Test balance replenishment',
        bot_name: 'TestBot',
        service_type: ModeEnum.TopUpBalance,
        operation_id: operationId
      }
    });
    
    console.log('🔍 Ожидание обработки события...');
    
    // Ожидание обработки события
    const processedEvent = await inngestTestEngine.waitForEvent('payment/processed', {
      timeout: 5000,
      filter: (event) => event.data.telegram_id === testUser.telegram_id
    });
    
    if (!processedEvent) {
      console.log('❌ Событие payment/processed не получено');
      return {
        success: false,
        message: 'Событие payment/processed не было получено в течение таймаута',
        name: 'Money Income Test'
      };
    }
    
    console.log('✅ Событие payment/processed получено');
    
    // Ожидание обновления баланса в базе данных
    await wait(1000);
    
    // Проверка баланса после операции
    const newBalance = await getUserBalance(testUser.telegram_id);
    console.log(`💰 Новый баланс: ${newBalance}`);
    
    const expectedBalance = initialBalance + amount;
    
    if (newBalance !== expectedBalance) {
      console.log(`❌ Баланс не соответствует ожидаемому: ${newBalance} != ${expectedBalance}`);
      return {
        success: false,
        message: `Баланс после пополнения неверен. Ожидалось: ${expectedBalance}, получено: ${newBalance}`,
        name: 'Money Income Test'
      };
    }
    
    console.log('✅ Тест пополнения баланса успешно пройден');
    return {
      success: true,
      message: 'Тест пополнения баланса успешно пройден',
      name: 'Money Income Test'
    };
  } catch (error) {
    console.log(`❌ Ошибка в тесте пополнения: ${error.message}`);
    return {
      success: false,
      message: `Ошибка в тесте пополнения: ${error.message}`,
      name: 'Money Income Test'
    };
  } finally {
    await inngestTestEngine.cleanup();
  }
}

/**
 * Тест списания средств с баланса пользователя
 */
export async function testMoneyExpense(): Promise<TestResult> {
  try {
    console.log('🚀 Запуск теста списания средств');
    
    // Инициализация тестового движка
    await inngestTestEngine.init({
      mockEvents: false,
      logLevel: 'info'
    });
    
    // Тестовые данные
    const testUser = { telegram_id: '123456789' };
    const expenseAmount = 50;
    const operationId = generateUniqueId();
    
    // Получение начального баланса
    const initialBalance = await getUserBalance(testUser.telegram_id);
    console.log(`💰 Начальный баланс: ${initialBalance}`);
    
    // Проверка, достаточно ли средств на балансе
    if (initialBalance < expenseAmount) {
      console.log('⚠️ Недостаточно средств на балансе, пополняем для теста');
      
      // Пополнение баланса для теста
      await inngestTestEngine.sendEvent({
        name: 'payment/process',
        data: {
          telegram_id: testUser.telegram_id,
          amount: expenseAmount * 2,
          type: 'money_income',
          description: 'Test balance replenishment for expense test',
          bot_name: 'TestBot',
          service_type: ModeEnum.TopUpBalance,
          operation_id: generateUniqueId()
        }
      });
      
      // Ожидание обработки пополнения
      await inngestTestEngine.waitForEvent('payment/processed', {
        timeout: 5000,
        filter: (event) => 
          event.data.telegram_id === testUser.telegram_id && 
          event.data.type === 'money_income'
      });
      
      await wait(1000);
    }
    
    // Получение обновленного баланса после возможного пополнения
    const updatedInitialBalance = await getUserBalance(testUser.telegram_id);
    console.log(`💰 Обновленный начальный баланс: ${updatedInitialBalance}`);
    
    // Отправка события списания средств
    await inngestTestEngine.sendEvent({
      name: 'payment/process',
      data: {
        telegram_id: testUser.telegram_id,
        amount: expenseAmount,
        type: 'money_expense',
        description: 'Test expense operation',
        bot_name: 'TestBot',
        service_type: ModeEnum.TextGeneration,
        operation_id: operationId
      }
    });
    
    console.log('🔍 Ожидание обработки события...');
    
    // Ожидание обработки события
    const processedEvent = await inngestTestEngine.waitForEvent('payment/processed', {
      timeout: 5000,
      filter: (event) => 
        event.data.telegram_id === testUser.telegram_id && 
        event.data.type === 'money_expense'
    });
    
    if (!processedEvent) {
      console.log('❌ Событие payment/processed не получено');
      return {
        success: false,
        message: 'Событие payment/processed не было получено в течение таймаута',
        name: 'Money Expense Test'
      };
    }
    
    console.log('✅ Событие payment/processed получено');
    
    // Ожидание обновления баланса в базе данных
    await wait(1000);
    
    // Проверка баланса после операции
    const newBalance = await getUserBalance(testUser.telegram_id);
    console.log(`💰 Новый баланс: ${newBalance}`);
    
    const expectedBalance = updatedInitialBalance - expenseAmount;
    
    if (newBalance !== expectedBalance) {
      console.log(`❌ Баланс не соответствует ожидаемому: ${newBalance} != ${expectedBalance}`);
      return {
        success: false,
        message: `Баланс после списания неверен. Ожидалось: ${expectedBalance}, получено: ${newBalance}`,
        name: 'Money Expense Test'
      };
    }
    
    console.log('✅ Тест списания средств успешно пройден');
    return {
      success: true,
      message: 'Тест списания средств успешно пройден',
      name: 'Money Expense Test'
    };
  } catch (error) {
    console.log(`❌ Ошибка в тесте списания: ${error.message}`);
    return {
      success: false,
      message: `Ошибка в тесте списания: ${error.message}`,
      name: 'Money Expense Test'
    };
  } finally {
    await inngestTestEngine.cleanup();
  }
}

/**
 * Тест обработки дублирующихся транзакций
 */
export async function testDuplicatePayments(): Promise<TestResult> {
  try {
    console.log('🚀 Запуск теста дублирующихся транзакций');
    
    // Инициализация тестового движка
    await inngestTestEngine.init({
      mockEvents: false,
      logLevel: 'info'
    });
    
    // Тестовые данные
    const testUser = { telegram_id: '123456789' };
    const amount = 100;
    const operationId = generateUniqueId(); // Один и тот же ID для обоих запросов
    
    // Получение начального баланса
    const initialBalance = await getUserBalance(testUser.telegram_id);
    console.log(`💰 Начальный баланс: ${initialBalance}`);
    
    // Отправка первого события пополнения баланса
    await inngestTestEngine.sendEvent({
      name: 'payment/process',
      data: {
        telegram_id: testUser.telegram_id,
        amount: amount,
        type: 'money_income',
        description: 'Test duplicate payment - first attempt',
        bot_name: 'TestBot',
        service_type: ModeEnum.TopUpBalance,
        operation_id: operationId
      }
    });
    
    console.log('🔍 Ожидание обработки первого события...');
    
    // Ожидание обработки первого события
    await inngestTestEngine.waitForEvent('payment/processed', {
      timeout: 5000,
      filter: (event) => event.data.telegram_id === testUser.telegram_id
    });
    
    // Ожидание обновления баланса в базе данных
    await wait(1000);
    
    // Проверка баланса после первой операции
    const balanceAfterFirstOperation = await getUserBalance(testUser.telegram_id);
    console.log(`💰 Баланс после первой операции: ${balanceAfterFirstOperation}`);
    
    // Отправка дублирующего события с тем же operation_id
    await inngestTestEngine.sendEvent({
      name: 'payment/process',
      data: {
        telegram_id: testUser.telegram_id,
        amount: amount,
        type: 'money_income',
        description: 'Test duplicate payment - second attempt',
        bot_name: 'TestBot',
        service_type: ModeEnum.TopUpBalance,
        operation_id: operationId // Тот же ID
      }
    });
    
    console.log('🔍 Ожидание обработки второго события...');
    
    // Ждем некоторое время для обработки дублирующего запроса
    await wait(2000);
    
    // Проверка баланса после второй операции (должен остаться тем же)
    const balanceAfterSecondOperation = await getUserBalance(testUser.telegram_id);
    console.log(`💰 Баланс после второй операции: ${balanceAfterSecondOperation}`);
    
    // Проверка, что баланс не изменился после дублирующей операции
    if (balanceAfterFirstOperation !== balanceAfterSecondOperation) {
      console.log(`❌ Баланс изменился после дублирующей операции: ${balanceAfterFirstOperation} → ${balanceAfterSecondOperation}`);
      return {
        success: false,
        message: `Ошибка: дублирующая операция изменила баланс. Было: ${balanceAfterFirstOperation}, стало: ${balanceAfterSecondOperation}`,
        name: 'Duplicate Payment Test'
      };
    }
    
    console.log('✅ Тест дублирующихся транзакций успешно пройден');
    return {
      success: true,
      message: 'Система корректно обработала дублирующуюся транзакцию (не изменила баланс)',
      name: 'Duplicate Payment Test'
    };
  } catch (error) {
    console.log(`❌ Ошибка в тесте дублирующихся транзакций: ${error.message}`);
    return {
      success: false,
      message: `Ошибка в тесте дублирующихся транзакций: ${error.message}`,
      name: 'Duplicate Payment Test'
    };
  } finally {
    await inngestTestEngine.cleanup();
  }
}

// Функция для запуска всех тестов платежного процессора
export async function runPaymentProcessorTests(): Promise<TestResult[]> {
  console.log('🚀 Запуск всех тестов платежного процессора');
  
  const results: TestResult[] = [];
  
  // Запуск всех тестов последовательно
  results.push(await testMoneyIncome());
  results.push(await testMoneyExpense());
  results.push(await testDuplicatePayments());
  
  // Сводка результатов
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  
  console.log(`🏁 Тестирование завершено. Успешно: ${successCount}/${totalCount}`);
  
  return results;
}