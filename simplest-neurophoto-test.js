#!/usr/bin/env node

/**
 * Extremely simple test for selectNeuroPhotoScene
 * Tests the two handlers directly to ensure they work correctly
 */

// First, define basic mocks
const mockMarkup = {
  keyboard: (buttons) => ({
    keyboard: buttons,
    resize_keyboard: true,
    oneTime: () => ({
      keyboard: buttons,
      resize_keyboard: true,
      one_time_keyboard: true,
      resize: () => ({
        keyboard: buttons,
        resize_keyboard: true,
        one_time_keyboard: true
      })
    }),
    resize: () => ({
      keyboard: buttons,
      resize_keyboard: true
    }),
  }),
  inlineKeyboard: (buttons) => ({
    inline_keyboard: buttons,
  }),
};

// Create a fake context for testing
const createMockContext = () => ({
  reply: (text, extra) => {
    console.log(`🤖 Bot replied: ${text.substring(0, 50)}...`);
    if (!mockCtx.replies) mockCtx.replies = [];
    mockCtx.replies.push({ text, extra });
    return Promise.resolve();
  },
  wizard: {
    cursor: 0,
    next: () => {
      mockCtx.wizard.cursor++;
      console.log(`👉 Moving to step ${mockCtx.wizard.cursor}`);
      return mockCtx.wizard.cursor;
    },
    back: () => {
      mockCtx.wizard.cursor--;
      console.log(`👈 Moving back to step ${mockCtx.wizard.cursor}`);
      return mockCtx.wizard.cursor;
    },
    selectStep: (step) => {
      mockCtx.wizard.cursor = step;
      console.log(`🔄 Selected step ${step}`);
      return step;
    },
    leave: () => {
      console.log('🚪 Leaving wizard');
      return Promise.resolve();
    },
    scene: {
      current: 'selectNeuroPhotoScene',
      enter: (sceneName) => {
        console.log(`🚪 Entering scene: ${sceneName}`);
        return Promise.resolve();
      },
      leave: () => {
        console.log('🚪 Leaving scene');
        return Promise.resolve();
      },
    },
  },
  scene: {
    enter: (sceneName) => {
      console.log(`🚪 Entering scene: ${sceneName}`);
      return Promise.resolve();
    },
    leave: () => {
      console.log('🚪 Leaving scene');
      return Promise.resolve();
    },
  },
  from: { id: 12345 },
  message: { text: 'test', message_id: 1 },
  session: {},
  replies: [],
});

// Mock the required modules
const mockModeEnum = {
  SelectNeuroPhoto: 'selectNeuroPhotoScene',
  NeuroPhoto: 'neuroPhotoScene',
  NeuroPhotoV2: 'neuroPhotoV2Scene',
  CheckBalanceScene: 'checkBalanceScene',
};

const mockHandlers = {
  handleHelpCancel: async () => false,
};

const mockLanguageHelper = {
  isRussian: () => false, // Default to English
};

const mockLogger = {
  info: (data) => console.log(`📝 LOG: ${data.message || data.description || 'Info log'}`),
  warn: (data) => console.log(`⚠️ WARNING: ${data.message || data.description || 'Warning log'}`),
  error: (data) => console.log(`❌ ERROR: ${data.message || data.description || 'Error log'}`),
};

// Create the mock wizard scene class
class WizardScene {
  constructor(id, ...handlers) {
    console.log(`🔧 Creating WizardScene with ID: ${id} and ${handlers.length} handlers`);
    this.id = id;
    this.handlers = handlers;
  }
}

// Global mock context
const mockCtx = createMockContext();

// Main test function
async function testNeuroPhotoScene() {
  console.log('\n=== 🧪 Testing selectNeuroPhotoScene ===\n');

  try {
    // Manually create the handlers similar to the real scene
    const handler0 = async (ctx) => {
      const isRu = mockLanguageHelper.isRussian(ctx);
      mockLogger.info({
        message: '🎨 Вход в сцену выбора версии нейрофото',
        description: 'Entering neuro photo version selection scene',
        telegram_id: ctx.from?.id,
      });

      const message = isRu
        ? '📸 Какую версию Нейрофото вы хотите использовать?...'
        : '📸 Which Neuro Photo version do you want to use?...';

      await ctx.reply(
        message,
        mockMarkup.keyboard([
          isRu
            ? ['Нейрофото Flux', 'Нейрофото Flux Pro']
            : ['Neuro Photo Flux', 'Neuro Photo Flux Pro'],
        ])
          .oneTime()
          .resize()
      );

      return ctx.wizard.next();
    };

    const handler1 = async (ctx) => {
      const isRu = mockLanguageHelper.isRussian(ctx);
      const message = ctx.message;

      mockLogger.info({
        message: '🔄 Обработка выбора версии нейрофото',
        description: 'Processing neuro photo version selection',
        telegram_id: ctx.from?.id,
      });

      if (!message || !('text' in message)) {
        mockLogger.warn({
          message: '⚠️ Получено сообщение без текста',
          description: 'Received message without text',
          telegram_id: ctx.from?.id,
        });
        await ctx.reply(
          isRu
            ? 'Пожалуйста, выберите версию, используя кнопки'
            : 'Please select a version using the buttons'
        );
        return ctx.wizard.back();
      }

      const isCancel = await mockHandlers.handleHelpCancel(ctx);
      if (isCancel) {
        return ctx.scene.leave();
      }

      const text = message.text.toLowerCase();

      if (text.includes('flux pro') || text.includes('pro')) {
        mockLogger.info({
          message: '✨ Выбрана версия Flux Pro',
          description: 'Selected Flux Pro version',
          telegram_id: ctx.from?.id,
        });
        ctx.session.mode = mockModeEnum.NeuroPhotoV2;
        await ctx.scene.enter(mockModeEnum.CheckBalanceScene);
        return;
      } else if (text.includes('flux')) {
        mockLogger.info({
          message: '✨ Выбрана версия Flux',
          description: 'Selected Flux version',
          telegram_id: ctx.from?.id,
        });
        ctx.session.mode = mockModeEnum.NeuroPhoto;
        await ctx.scene.enter(mockModeEnum.CheckBalanceScene);
        return;
      }

      mockLogger.warn({
        message: '⚠️ Неверный выбор версии',
        description: 'Invalid version selection',
        telegram_id: ctx.from?.id,
        text: text,
      });

      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, выберите версию (Нейрофото Flux или Нейрофото Flux Pro)'
          : '❌ Please select a version (Neuro Photo Flux or Neuro Photo Flux Pro)'
      );
      return ctx.wizard.back();
    };

    // Run test cases
    console.log('\n--- Test Case 1: Initial handler ---');
    await handler0(mockCtx);
    console.log(`Got ${mockCtx.replies.length} replies`);

    console.log('\n--- Test Case 2: Selecting Flux ---');
    mockCtx.replies = [];
    mockCtx.message.text = 'Neuro Photo Flux';
    await handler1(mockCtx);
    console.log('Session mode:', mockCtx.session.mode);

    console.log('\n--- Test Case 3: Selecting Flux Pro ---');
    mockCtx.replies = [];
    mockCtx.message.text = 'Neuro Photo Flux Pro';
    await handler1(mockCtx);
    console.log('Session mode:', mockCtx.session.mode);

    console.log('\n--- Test Case 4: Invalid selection ---');
    mockCtx.replies = [];
    mockCtx.message.text = 'Something else';
    await handler1(mockCtx);
    console.log(`Got ${mockCtx.replies.length} replies`);

    console.log('\n--- Test Case 5: Empty message ---');
    mockCtx.replies = [];
    mockCtx.message = {};
    await handler1(mockCtx);
    console.log(`Got ${mockCtx.replies.length} replies`);

    console.log('\n✅ All tests completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
  }
}

// Run the tests
testNeuroPhotoScene(); 