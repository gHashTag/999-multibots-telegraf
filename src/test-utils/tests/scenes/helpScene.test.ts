import { Context, Scenes } from 'telegraf';
import { createMockContext } from '../../core/mockContext';
import { helpScene } from '../../../scenes/helpScene';
import { mockFn, mockObject } from '../../core/mockFunction';
import { TestResult } from '../../core/types';
import { ModeEnum } from '@/price/helpers/modelsCost';
import { TestCategory } from '../../core/categories';

// Отладочный вывод для helpScene
console.log('🔍 helpScene:', {
  type: typeof helpScene,
  isBaseScene: helpScene instanceof Scenes.BaseScene,
  hasEnterHandler: typeof helpScene.enter === 'function',
  handlerKeys: Object.keys(helpScene)
});

// Create mock functions for the required services
const getReferalsCountAndUserDataMock = mockFn().mockResolvedValue({
  count: 5,
  isReferalFeatureEnabled: true,
  subscription: 'stars',
  level: 2
});

// Создаем моки для всех обработчиков уровней
const handleLevel1Mock = mockFn();
const handleLevel2Mock = mockFn();
const handleLevel3Mock = mockFn();
const handleLevel4Mock = mockFn();
const handleLevel5Mock = mockFn();
const handleLevel6Mock = mockFn();
const handleLevel7Mock = mockFn();
const handleLevel8Mock = mockFn();
const handleLevel9Mock = mockFn();
const handleLevel10Mock = mockFn();
const handleLevel11Mock = mockFn();
const handleLevel12Mock = mockFn();
const handleLevel13Mock = mockFn();

// Создаем мок для функции mainMenu
const mainMenuMock = mockFn().mockReturnValue({
  reply_markup: { inline_keyboard: [[{ text: 'Тест', callback_data: 'test' }]] }
});

// Создаем мок для isRussian
const isRussianMock = mockFn().mockImplementation((ctx: any) => {
  return ctx.session.user?.language === 'ru';
});

// Мок для логгера
const logMock = mockObject({
  info: mockFn(),
  error: mockFn()
});

// Создаем моки и внедряем их в глобальное пространство имен
console.log('🔧 Настраиваем моки для глобальных функций');
(global as any).getReferalsCountAndUserData = getReferalsCountAndUserDataMock;
(global as any).handleLevel1 = handleLevel1Mock;
(global as any).handleLevel2 = handleLevel2Mock;
(global as any).handleLevel3 = handleLevel3Mock;
(global as any).handleLevel4 = handleLevel4Mock;
(global as any).handleLevel5 = handleLevel5Mock;
(global as any).handleLevel6 = handleLevel6Mock;
(global as any).handleLevel7 = handleLevel7Mock;
(global as any).handleLevel8 = handleLevel8Mock;
(global as any).handleLevel9 = handleLevel9Mock;
(global as any).handleLevel10 = handleLevel10Mock;
(global as any).handleLevel11 = handleLevel11Mock;
(global as any).handleLevel12 = handleLevel12Mock;
(global as any).handleLevel13 = handleLevel13Mock;
(global as any).mainMenu = mainMenuMock;
(global as any).isRussian = isRussianMock;
(global as any).log = logMock;

// Проверяем, что моки установлены правильно
console.log('✅ Проверка установки моков:', {
  getReferalsMockExists: Boolean((global as any).getReferalsCountAndUserData),
  handleLevel2Exists: Boolean((global as any).handleLevel2),
  mainMenuExists: Boolean((global as any).mainMenu),
  isRussianExists: Boolean((global as any).isRussian)
});

// Инжектируем моки в нужные модули
// Это важно для правильной работы импортированной helpScene
jest.mock('../../../scenes/levelQuestWizard/handlers', () => ({
  handleLevel1: handleLevel1Mock,
  handleLevel2: handleLevel2Mock,
  handleLevel3: handleLevel3Mock,
  handleLevel4: handleLevel4Mock,
  handleLevel5: handleLevel5Mock,
  handleLevel6: handleLevel6Mock,
  handleLevel7: handleLevel7Mock,
  handleLevel8: handleLevel8Mock,
  handleLevel9: handleLevel9Mock,
  handleLevel10: handleLevel10Mock,
  handleLevel11: handleLevel11Mock,
  handleLevel12: handleLevel12Mock,
  handleLevel13: handleLevel13Mock
}));

jest.mock('@/menu', () => ({
  mainMenu: mainMenuMock
}));

jest.mock('@/helpers', () => ({
  isRussian: isRussianMock
}));

jest.mock('@/core/supabase', () => ({
  getReferalsCountAndUserData: getReferalsCountAndUserDataMock
}));

async function setupContext(language = 'ru', mode = ModeEnum.NeuroPhoto) {
  const mockContext = createMockContext();
  
  // Устанавливаем session с полями, необходимыми для тестирования
  mockContext.session = {
    ...mockContext.session,
    mode: mode,
    user: {
      language
    }
  } as any;

  // Добавляем from.id для правильной работы с telegram_id в сцене
  mockContext.from = {
    ...mockContext.from,
    id: 123456789
  } as any;
  
  // Мокаем метод reply для проверки вызовов
  mockContext.reply = mockFn().mockImplementation(function(text, extra) {
    if (!mockContext.replies) {
      mockContext.replies = [];
    }
    mockContext.replies.push({ text, extra });
    return Promise.resolve({ message_id: mockContext.replies.length });
  });
  
  // Мокаем scene.enter для отслеживания вызовов
  mockContext.scene = {
    ...mockContext.scene,
    enter: mockFn().mockImplementation((sceneId) => {
      console.log(`Вызов scene.enter с аргументом: ${sceneId}`);
      return Promise.resolve();
    })
  } as any;

  return mockContext;
}

const simplestTest = async (): Promise<TestResult> => {
  try {
    // Arrange
    const ctx = await setupContext();
    
    // Act
    await helpScene.enter(ctx as any);
    
    // Assert
    if ((ctx.reply as any).mock.calls.length > 0) {
      return { 
        name: 'Самый простой тест helpScene',
        success: true,
        message: 'helpScene отвечает на команду помощи' 
      };
    } else {
      return {
        name: 'Самый простой тест helpScene',
        success: false,
        message: 'helpScene не отправил сообщение при входе'
      };
    }
  } catch (error) {
    return { 
      name: 'Самый простой тест helpScene',
      success: false, 
      message: 'Ошибка при выполнении теста',
      error: error instanceof Error ? error.message : String(error) 
    };
  }
};

const testEnterHelpScene = async (): Promise<TestResult> => {
  try {
    // Arrange
    const ctx = await setupContext('ru');
    ctx.session = {
      language: 'ru',
      balance: 0,
      isAdmin: false,
      __scenes: {} // Добавляем для совместимости с session
    } as any;
    
    // Act
    await helpScene.enter(ctx as any);
    
    // Assert
    const replies = (ctx.replies || []) as any[];
    const hasHelpMessage = replies.some(reply => 
      typeof reply.text === 'string' && reply.text.includes('Помощь')
    );
    
    if (hasHelpMessage) {
      return { 
        name: 'Вход в сцену helpScene (русский)',
        success: true,
        message: 'helpScene показывает правильное сообщение на русском языке' 
      };
    } else {
      return {
        name: 'Вход в сцену helpScene (русский)',
        success: false,
        message: 'helpScene не показывает правильное сообщение на русском языке'
      };
    }
  } catch (error) {
    return { 
      name: 'Вход в сцену helpScene (русский)',
      success: false, 
      message: 'Ошибка при выполнении теста',
      error: error instanceof Error ? error.message : String(error) 
    };
  }
};

const testEnterHelpSceneEnglish = async (): Promise<TestResult> => {
  try {
    // Arrange
    const ctx = await setupContext('en');
    ctx.session = {
      language: 'en',
      balance: 0,
      isAdmin: false,
      __scenes: {} // Добавляем для совместимости с session
    } as any;
    
    // Переопределяем mocks для английского языка
    isRussianMock.mockReturnValue(false);
    
    // Act
    await helpScene.enter(ctx as any);
    
    // Assert
    const replies = (ctx.replies || []) as any[];
    const hasHelpMessage = replies.some(reply => 
      typeof reply.text === 'string' && reply.text.includes('Help')
    );
    
    if (hasHelpMessage) {
      return { 
        name: 'Вход в сцену helpScene (английский)',
        success: true,
        message: 'helpScene показывает правильное сообщение на английском языке' 
      };
    } else {
      return {
        name: 'Вход в сцену helpScene (английский)',
        success: false,
        message: 'helpScene не показывает правильное сообщение на английском языке'
      };
    }
  } catch (error) {
    return { 
      name: 'Вход в сцену helpScene (английский)',
      success: false, 
      message: 'Ошибка при выполнении теста',
      error: error instanceof Error ? error.message : String(error) 
    };
  }
};

const testHelpMode = async (): Promise<TestResult> => {
  try {
    // Arrange
    const ctx = await setupContext('ru');
    ctx.session = {
      language: 'ru',
      balance: 0,
      isAdmin: false,
      __scenes: {}, // Добавляем для совместимости с session
      mode: 'help'
    } as any;
    
    // Act
    await helpScene.enter(ctx as any);
    
    // Assert
    const replies = (ctx.replies || []) as any[];
    const hasHelpMessage = replies.some(reply => 
      typeof reply.text === 'string' && reply.text.includes('Помощь')
    );
    
    if (hasHelpMessage) {
      return { 
        name: 'Вход в сцену helpScene с режимом help',
        success: true,
        message: 'helpScene правильно обрабатывает режим help' 
      };
    } else {
      return {
        name: 'Вход в сцену helpScene с режимом help',
        success: false,
        message: 'helpScene неправильно обрабатывает режим help'
      };
    }
  } catch (error) {
    return { 
      name: 'Вход в сцену helpScene с режимом help',
      success: false, 
      message: 'Ошибка при выполнении теста',
      error: error instanceof Error ? error.message : String(error) 
    };
  }
};

const testErrorHandling = async (): Promise<TestResult> => {
  try {
    // Arrange
    const ctx = await setupContext();
    
    // Mock rejection
    const tempMock = mockFn().mockRejectedValue(new Error('Test error'));
    const originalFn = (global as any).getReferalsCountAndUserData;
    (global as any).getReferalsCountAndUserData = tempMock;
    
    // Act
    await helpScene.enter(ctx as any);
    
    // Restore original mock
    (global as any).getReferalsCountAndUserData = originalFn;
    
    // Assert
    if (logMock.error.mock.calls.length > 0) {
      return { 
        name: 'Обработка ошибок в helpScene',
        success: true,
        message: 'helpScene правильно обрабатывает ошибки' 
      };
    } else {
      return {
        name: 'Обработка ошибок в helpScene',
        success: false,
        message: 'helpScene неправильно обрабатывает ошибки'
      };
    }
  } catch (error) {
    return { 
      name: 'Обработка ошибок в helpScene',
      success: false, 
      message: 'Ошибка при выполнении теста',
      error: error instanceof Error ? error.message : String(error) 
    };
  }
};

// Run all help scene tests
export async function runHelpSceneTests(): Promise<TestResult[]> {
  console.log('Running helpScene tests...');
  
  const results: TestResult[] = [];
  
  try {
    // Основные тесты
    results.push(await simplestTest());
    results.push(await testEnterHelpScene());
    results.push(await testEnterHelpSceneEnglish());
    results.push(await testHelpMode());
    results.push(await testErrorHandling());
    
    // Log results
    let passCount = 0;
    results.forEach(result => {
      if (result.success) {
        passCount++;
        console.log(`✅ ${result.name}: ${result.message}`);
      } else {
        console.error(`❌ ${result.name}: ${result.message}`);
      }
    });
    
    console.log(`Help scene tests: ${passCount}/${results.length} passed`);
    return results;
  } catch (error: any) {
    console.error('❌ helpScene tests failed:', error);
    results.push({
      name: 'Help Scene Tests',
      success: false,
      message: `Unexpected error: ${error.message}`,
      category: TestCategory.All
    });
    return results;
  }
}

// Run tests if this file is executed directly
if (typeof require !== 'undefined' && require.main === module) {
  runHelpSceneTests()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

// Экспортируем функцию для запуска тестов по умолчанию
export default runHelpSceneTests; 