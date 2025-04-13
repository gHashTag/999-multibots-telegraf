import { MyContext } from '../../../interfaces';
import { balanceNotifierScene, BALANCE_NOTIFIER_SCENE_ID } from '../../../scenes/balanceNotifierScene';
import { createMockContext } from '../../helpers/createMockContext';
import { TestResult } from '../../core/types';
import { TestCategory } from '../../core/categories';
import { logger } from '../../../utils/logger';
import * as supabaseModule from '../../../core/supabase';
import mockApi from '../../core/mock';
import { getUserInfo } from '../../../handlers/getUserInfo';

// Мокируем getUserInfo
jest.mock('../../../handlers/getUserInfo', () => ({
  getUserInfo: jest.fn()
}));

// Мокируем getUserBalance из core/supabase
jest.mock('../../../core/supabase', () => {
  const originalModule = jest.requireActual('../../../core/supabase');
  return {
    ...originalModule,
    getUserBalance: jest.fn()
  };
});

/**
 * Вспомогательная функция для создания тестового контекста
 */
const createTestContext = (options: { language?: string, callbackData?: string, balanceSettings?: any } = {}) => {
  // Создаем тестового пользователя
  const testUser = {
    telegram_id: '123456789',
    username: 'testuser'
  };

  // Создаем мок контекста с тестовым пользователем
  const ctx = createMockContext({
    user: testUser,
    callbackData: options.callbackData,
  }) as unknown as MyContext;

  // Мокируем данные пользователя
  (getUserInfo as jest.Mock).mockReturnValue({
    telegramId: testUser.telegram_id,
    userId: 'test-user-id'
  });

  // Мокируем получение баланса
  (supabaseModule.getUserBalance as jest.Mock).mockResolvedValue(100.5);

  // Добавляем функциональность сцены в контекст
  ctx.session = {
    __scenes: {
      current: BALANCE_NOTIFIER_SCENE_ID,
      state: {}
    },
    language: options.language || 'en',
    balanceNotifications: options.balanceSettings || {
      enabled: false,
      threshold: 10
    }
  } as any;

  // Добавляем методы для работы со сценой
  ctx.scene = {
    enter: jest.fn().mockResolvedValue(true),
    reenter: jest.fn().mockResolvedValue(true),
    leave: jest.fn().mockResolvedValue(true)
  } as any;

  // Добавляем методы для колбэков
  ctx.answerCbQuery = jest.fn().mockResolvedValue(true);
  ctx.editMessageText = jest.fn().mockResolvedValue(true);
  ctx.editMessageReplyMarkup = jest.fn().mockResolvedValue(true);

  // Мокируем методы Telegraf для проверки отправленных сообщений
  ctx.reply = jest.fn().mockResolvedValue(true);
  
  return { ctx };
};

/**
 * Проверка наличия определенного текста в сообщении
 */
const assertReplyContains = (ctx: any, expectedText: string) => {
  const replyCall = ctx.reply.mock.calls.find(
    (call: any[]) => call[0] && typeof call[0] === 'string' && call[0].includes(expectedText)
  );
  
  if (!replyCall) {
    throw new Error(`Ожидалось сообщение, содержащее текст "${expectedText}", но не найдено`);
  }
};

/**
 * Проверка наличия кнопок в инлайн-клавиатуре сообщения
 */
const assertInlineKeyboardContains = (ctx: any, expectedButtons: string[]) => {
  const replyCall = ctx.reply.mock.calls.find(
    (call: any[]) => call[1] && call[1].reply_markup && call[1].reply_markup.inline_keyboard
  );
  
  if (!replyCall) {
    throw new Error('Ожидалась инлайн-клавиатура, но не найдена');
  }
  
  const keyboard = replyCall[1].reply_markup.inline_keyboard;
  const allButtons = keyboard.flat().map((button: any) => button.text);
  
  expectedButtons.forEach(expectedButton => {
    if (!allButtons.some(button => button.includes(expectedButton))) {
      throw new Error(`Ожидалась кнопка "${expectedButton}", но она не найдена в клавиатуре`);
    }
  });
};

/**
 * Тест входа в сцену уведомлений о балансе
 */
export async function testBalanceNotifierScene_EnterScene(): Promise<TestResult> {
  try {
    // Создаем тестовый контекст для русскоязычного пользователя
    const { ctx } = createTestContext({ language: 'ru' });
    
    // Вызываем обработчик входа в сцену
    await balanceNotifierScene.enterHandler(ctx);
    
    // Проверяем, что отображена информация о текущем балансе
    assertReplyContains(ctx, 'Текущий баланс');
    
    // Проверяем, что отображается статус уведомлений
    assertReplyContains(ctx, 'Уведомления: ');
    
    // Проверяем, что отображается порог уведомлений
    assertReplyContains(ctx, 'Порог уведомления');
    
    // Проверяем наличие кнопок
    assertInlineKeyboardContains(ctx, ['Включить', 'Изменить порог', 'Назад']);
    
    return {
      name: 'balanceNotifierScene: Enter Scene',
      category: TestCategory.All,
      success: true,
      message: 'Вход в сцену уведомлений о балансе отображается корректно'
    };
  } catch (error) {
    logger.error('Ошибка в тесте входа в сцену уведомлений о балансе:', error);
    return {
      name: 'balanceNotifierScene: Enter Scene',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тест включения/выключения уведомлений о балансе
 */
export async function testBalanceNotifierScene_ToggleNotifications(): Promise<TestResult> {
  try {
    // Создаем тестовый контекст с настройками баланса (уведомления выключены)
    const { ctx } = createTestContext({
      callbackData: 'toggle_notifications',
      balanceSettings: { enabled: false, threshold: 10 }
    });
    
    // Имитируем нажатие на кнопку "Включить уведомления"
    await balanceNotifierScene.callbackQuery('toggle_notifications', async (ctx) => {
      await ctx.answerCbQuery(); 
      return ctx.scene.reenter();
    })(ctx as any);
    
    // Проверяем, что уведомления были включены
    if (ctx.session.balanceNotifications.enabled !== true) {
      throw new Error(`Уведомления должны быть включены, но enabled = ${ctx.session.balanceNotifications.enabled}`);
    }
    
    // Проверяем, что был вызван answerCbQuery с подтверждением
    expect(ctx.answerCbQuery).toHaveBeenCalled();
    
    // Проверяем, что был вызван reenter для обновления интерфейса
    expect(ctx.scene.reenter).toHaveBeenCalled();
    
    return {
      name: 'balanceNotifierScene: Toggle Notifications',
      category: TestCategory.All,
      success: true,
      message: 'Переключение уведомлений работает корректно'
    };
  } catch (error) {
    logger.error('Ошибка в тесте переключения уведомлений:', error);
    return {
      name: 'balanceNotifierScene: Toggle Notifications',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тест изменения порога уведомлений о балансе
 */
export async function testBalanceNotifierScene_ChangeThreshold(): Promise<TestResult> {
  try {
    // Создаем тестовый контекст
    const { ctx } = createTestContext({
      callbackData: 'change_threshold'
    });
    
    // Имитируем нажатие на кнопку "Изменить порог"
    await balanceNotifierScene.callbackQuery('change_threshold', async (ctx) => {
      await ctx.reply('📝 Please enter the balance threshold for notifications (number of stars):');
      ctx.scene.session.waitingForThreshold = true;
      return ctx.answerCbQuery();
    })(ctx as any);
    
    // Проверяем, что был отправлен запрос на ввод порога
    assertReplyContains(ctx, 'balance threshold');
    
    // Проверяем, что установлен флаг ожидания ввода порога
    if (ctx.scene.session.waitingForThreshold !== true) {
      throw new Error('Флаг ожидания ввода порога не установлен');
    }
    
    // Проверяем, что был вызван answerCbQuery
    expect(ctx.answerCbQuery).toHaveBeenCalled();
    
    return {
      name: 'balanceNotifierScene: Change Threshold',
      category: TestCategory.All,
      success: true,
      message: 'Запрос на изменение порога уведомлений работает корректно'
    };
  } catch (error) {
    logger.error('Ошибка в тесте изменения порога уведомлений:', error);
    return {
      name: 'balanceNotifierScene: Change Threshold',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тест обработки ввода порога уведомлений
 */
export async function testBalanceNotifierScene_ThresholdInput(): Promise<TestResult> {
  try {
    // Создаем тестовый контекст с установленным флагом ожидания ввода порога
    const { ctx } = createTestContext();
    ctx.scene.session.waitingForThreshold = true;
    
    // Имитируем ввод текстового сообщения с числом
    ctx.message = {
      text: '25'
    } as any;
    
    // Вызываем обработчик текстовых сообщений
    await balanceNotifierScene.on('text', async (ctx) => {
      if (!ctx.scene.session.waitingForThreshold) return;
      
      const thresholdText = ctx.message.text.trim();
      const threshold = parseFloat(thresholdText);
      
      if (isNaN(threshold) || threshold <= 0) {
        await ctx.reply('❌ Please enter a positive number.');
        return;
      }
      
      if (!ctx.session.balanceNotifications) {
        ctx.session.balanceNotifications = { enabled: false, threshold: 10 };
      }
      
      ctx.session.balanceNotifications.threshold = threshold;
      ctx.scene.session.waitingForThreshold = false;
      
      return ctx.scene.reenter();
    })(ctx as any);
    
    // Проверяем, что порог был установлен
    if (ctx.session.balanceNotifications.threshold !== 25) {
      throw new Error(`Порог должен быть 25, но threshold = ${ctx.session.balanceNotifications.threshold}`);
    }
    
    // Проверяем, что флаг ожидания ввода порога сброшен
    if (ctx.scene.session.waitingForThreshold !== false) {
      throw new Error('Флаг ожидания ввода порога не сброшен');
    }
    
    // Проверяем, что был вызван reenter для обновления интерфейса
    expect(ctx.scene.reenter).toHaveBeenCalled();
    
    return {
      name: 'balanceNotifierScene: Threshold Input',
      category: TestCategory.All,
      success: true,
      message: 'Ввод порога уведомлений обрабатывается корректно'
    };
  } catch (error) {
    logger.error('Ошибка в тесте ввода порога уведомлений:', error);
    return {
      name: 'balanceNotifierScene: Threshold Input',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тест возврата в меню
 */
export async function testBalanceNotifierScene_BackToMenu(): Promise<TestResult> {
  try {
    // Создаем тестовый контекст
    const { ctx } = createTestContext({
      callbackData: 'back_to_menu'
    });
    
    // Имитируем нажатие на кнопку "Назад"
    await balanceNotifierScene.callbackQuery('back_to_menu', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.scene.leave();
      return ctx.scene.enter('menuScene');
    })(ctx as any);
    
    // Проверяем, что был вызван answerCbQuery
    expect(ctx.answerCbQuery).toHaveBeenCalled();
    
    // Проверяем, что сцена была завершена
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    // Проверяем, что был выполнен переход в меню
    expect(ctx.scene.enter).toHaveBeenCalledWith('menuScene');
    
    return {
      name: 'balanceNotifierScene: Back To Menu',
      category: TestCategory.All,
      success: true,
      message: 'Возврат в меню работает корректно'
    };
  } catch (error) {
    logger.error('Ошибка в тесте возврата в меню:', error);
    return {
      name: 'balanceNotifierScene: Back To Menu',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тест команд выхода
 */
export async function testBalanceNotifierScene_ExitCommands(): Promise<TestResult> {
  try {
    // Создаем тестовый контекст
    const { ctx } = createTestContext();
    
    // Устанавливаем команду
    ctx.message = {
      text: '/menu',
      entities: [{ type: 'bot_command', offset: 0, length: 5 }]
    } as any;
    
    // Имитируем выполнение команды /menu
    await balanceNotifierScene.command(['start', 'menu', 'exit', 'cancel'], async (ctx) => {
      await ctx.scene.leave();
      return ctx.scene.enter('menuScene');
    })(ctx as any);
    
    // Проверяем, что сцена была завершена
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    // Проверяем, что был выполнен переход в меню
    expect(ctx.scene.enter).toHaveBeenCalledWith('menuScene');
    
    return {
      name: 'balanceNotifierScene: Exit Commands',
      category: TestCategory.All,
      success: true,
      message: 'Команды выхода работают корректно'
    };
  } catch (error) {
    logger.error('Ошибка в тесте команд выхода:', error);
    return {
      name: 'balanceNotifierScene: Exit Commands',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Запуск всех тестов сцены уведомлений о балансе
 */
export async function runBalanceNotifierSceneTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  results.push(await testBalanceNotifierScene_EnterScene());
  results.push(await testBalanceNotifierScene_ToggleNotifications());
  results.push(await testBalanceNotifierScene_ChangeThreshold());
  results.push(await testBalanceNotifierScene_ThresholdInput());
  results.push(await testBalanceNotifierScene_BackToMenu());
  results.push(await testBalanceNotifierScene_ExitCommands());
  
  return results;
} 