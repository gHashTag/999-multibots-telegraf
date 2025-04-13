import { MyContext } from '@/interfaces';
import { createMockContext } from '../../core/mockContext';
import { TestResult } from '../../core/types';
import { assertReplyContains, assertScene } from '../../core/assertions';
import { create as mockFunction } from '../../core/mock';
import { TestCategory } from '../../core/categories';
import { logger } from '@/utils/logger';

// Константы для тестирования
const TEST_USER_ID = 123456789;
const TEST_USERNAME = 'test_user';

/**
 * Настройка тестовой среды
 */
function setupTest() {
  // Сброс моков между тестами
}

/**
 * Тест для входа в сцену помощи
 */
export async function testHelpSceneEnter(): Promise<TestResult> {
  try {
    setupTest();
    
    // Создаем мок-контекст
    const ctx = createMockContext();
    ctx.from = { id: TEST_USER_ID, username: TEST_USERNAME, language_code: 'ru' } as any;
    ctx.session = { 
      mode: 'help',
      balance: 0,
      isAdmin: false,
      language: 'ru' 
    } as any;
    
    // Мокируем необходимые функции
    const mockGetReferalsCountAndUserData = mockFunction().mockReturnValue(Promise.resolve({
      count: 0,
      subscription: 'stars',
      level: 1
    }));
    
    // Подменяем реальную функцию на мок
    const supabaseModule = await import('@/core/supabase');
    Object.defineProperty(supabaseModule, 'getReferalsCountAndUserData', {
      value: mockGetReferalsCountAndUserData
    });
    
    // Импортируем сцену помощи
    await import('@/scenes/helpScene');
    
    // Вызываем обработчик входа в сцену через метод сцены
    await ctx.scene.enter('helpScene');
    
    // Проверки
    assertReplyContains(ctx, 'Справка по команде');
    
    return {
      name: 'HelpScene: Enter Scene',
      category: TestCategory.All,
      success: true,
      message: 'Тест входа в сцену помощи успешно пройден'
    };
  } catch (error) {
    logger.error('Ошибка в тесте входа в сцену помощи:', error);
    return {
      name: 'HelpScene: Enter Scene',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Запуск всех тестов для сцены помощи
 */
export async function runHelpSceneTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  try {
    results.push(await testHelpSceneEnter());
  } catch (error) {
    logger.error('Ошибка при запуске тестов сцены помощи:', error);
    results.push({
      name: 'HelpScene: Общая ошибка',
      category: TestCategory.All,
      success: false,
      message: String(error)
    });
  }
  
  return results;
}

export default runHelpSceneTests; 