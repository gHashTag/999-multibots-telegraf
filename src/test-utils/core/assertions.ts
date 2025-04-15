/**
 * Утилиты для проверки утверждений в тестах
 */

/**
 * Проверяет, что текст содержится в ответе бота
 */
export function assertReplyContains(ctx: any, expectedText: string): void {
  const replies = ctx.replies || [];
  
  const containsText = replies.some((reply: any) => {
    if (!reply) return false;
    
    if (reply.text && typeof reply.text === 'string') {
      return reply.text.includes(expectedText);
    }
    
    return false;
  });
  
  if (!containsText) {
    throw new Error(`Ожидаемый текст "${expectedText}" не найден в ответах бота. Ответы: ${JSON.stringify(replies)}`);
  }
}

/**
 * Проверяет, что разметка клавиатуры содержит указанный текст на кнопке
 */
export function assertReplyMarkupContains(ctx: any, buttonText: string): void {
  const replies = ctx.replies || [];
  
  const containsButton = replies.some((reply: any) => {
    if (!reply || !reply.extra || !reply.extra.reply_markup) return false;
    
    const { reply_markup } = reply.extra;
    
    // Для inline keyboard
    if (reply_markup.inline_keyboard) {
      return reply_markup.inline_keyboard.some((row: any[]) => 
        row.some((button: any) => button.text === buttonText)
      );
    }
    
    // Для обычной клавиатуры
    if (reply_markup.keyboard) {
      return reply_markup.keyboard.some((row: any[]) => 
        row.some((button: any) => 
          (typeof button === 'string' && button === buttonText) || 
          (typeof button === 'object' && button.text === buttonText)
        )
      );
    }
    
    return false;
  });
  
  if (!containsButton) {
    throw new Error(`Кнопка с текстом "${buttonText}" не найдена в разметке клавиатуры. Ответы: ${JSON.stringify(replies)}`);
  }
}

/**
 * Проверяет, что текущая сцена находится на указанном шаге
 */
export function assertScene(ctx: any, sceneName: string, step: number): void {
  if (!ctx.wizard) {
    throw new Error('Контекст не содержит свойства wizard');
  }
  
  if (sceneName && ctx.wizard.scene && ctx.wizard.scene.current !== sceneName) {
    throw new Error(`Текущая сцена "${ctx.wizard.scene.current}" не соответствует ожидаемой "${sceneName}"`);
  }
  
  if (step !== undefined && ctx.wizard.cursor !== step) {
    throw new Error(`Текущий шаг сцены ${ctx.wizard.cursor} не соответствует ожидаемому ${step}`);
  }
}

/**
 * Проверяет, что значение содержит указанную подстроку
 */
export function assertContains(actual: any, expected: any): void {
  if (typeof actual === 'string' && typeof expected === 'string') {
    if (!actual.includes(expected)) {
      throw new Error(`Значение "${actual}" не содержит ожидаемую подстроку "${expected}"`);
    }
    return;
  }
  
  if (typeof actual === 'number' && typeof expected === 'number') {
    if (actual !== expected) {
      throw new Error(`Значение ${actual} не равно ожидаемому ${expected}`);
    }
    return;
  }
  
  if (Array.isArray(actual) && typeof expected === 'number') {
    if (actual.length !== expected) {
      throw new Error(`Длина массива ${actual.length} не равна ожидаемой ${expected}`);
    }
    return;
  }
  
  if (actual === null && expected === null) {
    return;
  }
  
  if (actual === undefined && expected === undefined) {
    return;
  }
  
  if (actual === expected) {
    return;
  }
  
  // Если ничего не подошло, сравниваем строковые представления
  const actualStr = String(actual);
  const expectedStr = String(expected);
  
  if (!actualStr.includes(expectedStr)) {
    throw new Error(`Значение "${actualStr}" не содержит ожидаемое значение "${expectedStr}"`);
  }
}

/**
 * Проверяет, что объект сессии содержит указанные свойства
 */
export function assertSessionContains(ctx: any, expectedProps: Record<string, any>): void {
  if (!ctx.session) {
    throw new Error('Контекст не содержит свойства session');
  }
  
  for (const [key, value] of Object.entries(expectedProps)) {
    if (!(key in ctx.session)) {
      throw new Error(`Сессия не содержит ожидаемого свойства "${key}"`);
    }
    
    if (ctx.session[key] !== value) {
      throw new Error(`Значение свойства "${key}" в сессии (${ctx.session[key]}) не соответствует ожидаемому (${value})`);
    }
  }
}

/**
 * Проверяет, что бот отправил фотографию
 */
export function assertPhotoSent(ctx: any): void {
  const replies = ctx.replies || [];
  
  const hasPhoto = replies.some((reply: any) => {
    return reply && (reply.photo !== undefined || reply.action === 'sendPhoto');
  });
  
  if (!hasPhoto) {
    throw new Error('Бот не отправил фотографию в ответе');
  }
}

/**
 * Проверяет, что бот отправил видео
 */
export function assertVideoSent(ctx: any): void {
  const replies = ctx.replies || [];
  
  const hasVideo = replies.some((reply: any) => {
    return reply && (reply.video !== undefined || reply.action === 'sendVideo');
  });
  
  if (!hasVideo) {
    throw new Error('Бот не отправил видео в ответе');
  }
}

/**
 * Проверяет вызовы мок-функции
 * @param mockFn - Мок-функция для проверки
 * @param expectedCalls - Ожидаемое количество вызовов
 * @param expectedArgs - Ожидаемые аргументы для конкретного вызова (опционально)
 * @param callIndex - Индекс вызова для проверки аргументов (по умолчанию 0)
 */
export function assertMockCalled(
  mockFn: any,
  expectedCalls?: number,
  expectedArgs?: any[],
  callIndex: number = 0
): void {
  if (!mockFn || typeof mockFn.mock !== 'object') {
    throw new Error('Переданная функция не является мок-функцией');
  }

  const actualCalls = mockFn.mock.calls.length;

  if (expectedCalls !== undefined && actualCalls !== expectedCalls) {
    throw new Error(
      `Ожидалось ${expectedCalls} вызовов мок-функции, но получено ${actualCalls}`
    );
  }

  if (expectedArgs) {
    if (callIndex >= actualCalls) {
      throw new Error(
        `Невозможно проверить аргументы вызова ${callIndex}, всего вызовов: ${actualCalls}`
      );
    }

    const actualArgs = mockFn.mock.calls[callIndex];
    
    if (actualArgs.length !== expectedArgs.length) {
      throw new Error(
        `Ожидалось ${expectedArgs.length} аргументов, но получено ${actualArgs.length}`
      );
    }

    for (let i = 0; i < expectedArgs.length; i++) {
      if (actualArgs[i] !== expectedArgs[i]) {
        throw new Error(
          `Аргумент ${i} не совпадает.\nОжидалось: ${JSON.stringify(expectedArgs[i])}\nПолучено: ${JSON.stringify(actualArgs[i])}`
        );
      }
    }
  }
}

export default {
  assertReplyContains,
  assertReplyMarkupContains,
  assertScene,
  assertContains,
  assertSessionContains,
  assertPhotoSent,
  assertVideoSent,
  assertMockCalled
}; 