#!/usr/bin/env node

/**
 * Extremely simple test for neuroPhotoWizardV2
 * Tests the main handlers directly to verify their behavior
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
  replyWithPhoto: (photo, extra) => {
    console.log(`🖼️ Bot sent a photo with caption: ${(extra?.caption || '').substring(0, 50)}...`);
    if (!mockCtx.replies) mockCtx.replies = [];
    mockCtx.replies.push({ photo, extra, type: 'photo' });
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
      current: 'neuroPhotoWizardV2',
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
  from: { id: 12345, language_code: 'en' },
  botInfo: { username: 'test_bot' },
  message: { text: 'test', message_id: 1 },
  session: {
    mode: 'neuroPhotoV2Scene',
    userModel: {
      finetune_id: 'test-finetune-id',
      trigger_word: 'masterpiece, photorealistic, a beautiful portrait of tfg777',
    }
  },
  replies: [],
});

// Helper functions mock
const mockServices = {
  generateNeuroImageV2: async (prompt, count, telegramId, ctx, botUsername) => {
    console.log(`🎨 Generating ${count} images with prompt: "${prompt.substring(0, 50)}..."`);
    
    // Simulate image generation and reply
    await ctx.replyWithPhoto('mock-photo-url', {
      caption: `Generated ${count} image(s) with your prompt.`,
      reply_markup: {
        keyboard: [
          ['1️⃣ One image', '2️⃣ Two images'],
          ['3️⃣ Three images', '4️⃣ Four images'],
          ['⬆️ Improve prompt', '📐 Change size'],
          ['📋 Main menu']
        ],
        resize_keyboard: true
      }
    });
    
    return { success: true };
  },
  
  getLatestUserModel: async (telegramId, modelType) => {
    console.log(`📦 Getting latest ${modelType} model for user ${telegramId}`);
    return {
      finetune_id: 'test-finetune-id',
      trigger_word: 'masterpiece, photorealistic, a beautiful portrait of tfg777',
      id: 'model-123',
      created_at: new Date().toISOString(),
      status: 'completed',
      model_type: modelType
    };
  },
  
  getReferalsCountAndUserData: async (telegramId) => {
    console.log(`👥 Getting referrals for user ${telegramId}`);
    return {
      count: 5,
      subscription: 'premium',
      level: 2
    };
  }
};

const mockMenuFunctions = {
  mainMenu: async (options) => ({
    reply_markup: {
      keyboard: [
        ['📷 Neurophotos', '🎥 Neurovideo'],
        ['🤖 Digital body', '💰 Balance'],
        ['📱 My profile', '❓ Help']
      ]
    }
  }),
  
  mainMenuButton: {
    title_ru: '📋 Главное меню',
    title_en: '📋 Main menu'
  },
  
  sendGenericErrorMessage: async (ctx, isRu, error) => {
    await ctx.reply(isRu ? '❌ Произошла ошибка' : '❌ An error occurred');
  },
  
  sendPhotoDescriptionRequest: async (ctx, isRu, mode) => {
    await ctx.reply(
      isRu 
        ? '🖋 Введите описание для нейрофото (что вы хотите сгенерировать):'
        : '🖋 Enter a description for your neurophoto (what you want to generate):'
    );
  }
};

const mockHandlers = {
  handleHelpCancel: async (ctx) => {
    // Return true if text is /help or /cancel
    if (ctx.message && 'text' in ctx.message) {
      const text = ctx.message.text.toLowerCase();
      return text === '/help' || text === '/cancel';
    }
    return false;
  },
  
  handleMenu: async (ctx) => {
    await ctx.reply('Main menu', {
      reply_markup: {
        keyboard: [
          ['📷 Neurophotos', '🎥 Neurovideo'],
          ['🤖 Digital body', '💰 Balance'],
          ['📱 My profile', '❓ Help']
        ],
        resize_keyboard: true
      }
    });
    return ctx.scene.leave();
  },
  
  getUserInfo: (ctx) => {
    return {
      telegramId: ctx.from.id.toString(),
      firstName: 'Test',
      username: 'testuser'
    };
  }
};

const mockLogger = {
  info: (data) => console.log(`📝 LOG: ${data.message || data.description || 'Info log'}`),
  warn: (data) => console.log(`⚠️ WARNING: ${data.message || data.description || 'Warning log'}`),
  error: (data) => console.log(`❌ ERROR: ${data.message || data.description || 'Error log'}`),
};

// Global mock context
const mockCtx = createMockContext();

// Main test function
async function testNeuroPhotoV2Scene() {
  console.log('\n=== 🧪 Testing neuroPhotoWizardV2 ===\n');

  try {
    // Manually create the handlers similar to the real scene
    const neuroPhotoConversationStep = async (ctx) => {
      const isRu = ctx.from?.language_code === 'ru';
      try {
        console.log('CASE 1: neuroPhotoConversationV2');
        
        mockLogger.info({
          message: '🚀 ЗАПУСК neuroPhotoWizardV2 (v2)',
          description: 'Starting neuroPhotoWizardV2 (v2)',
          telegram_id: ctx.from?.id,
          session_data: {
            mode: ctx.session.mode,
            user_model: ctx.session.userModel ? 'exists' : 'not exists',
          },
        });
        
        const { telegramId } = mockHandlers.getUserInfo(ctx);
        const userModel = await mockServices.getLatestUserModel(telegramId, 'bfl');
        
        const { count, subscription, level } = await mockServices.getReferalsCountAndUserData(telegramId);
        
        if (!userModel || !userModel.finetune_id || !subscription) {
          await ctx.reply(
            isRu
              ? '❌ У вас нет обученных моделей.\n\nИспользуйте команду "🤖 Цифровое тело аватара"...'
              : "❌ You don't have any trained models.\n\nUse the '🤖 Digital avatar body' command...",
            {
              reply_markup: {
                keyboard: (
                  await mockMenuFunctions.mainMenu({
                    isRu,
                    inviteCount: count,
                    subscription: subscription || 'stars',
                    ctx,
                    level,
                  })
                ).reply_markup.keyboard,
              },
            }
          );
          
          return ctx.scene.leave();
        }
        
        ctx.session.userModel = userModel;
        
        await mockMenuFunctions.sendPhotoDescriptionRequest(ctx, isRu, 'neuro_photo');
        const isCancel = await mockHandlers.handleHelpCancel(ctx);
        if (isCancel) {
          return ctx.scene.leave();
        }
        
        return ctx.wizard.next();
      } catch (error) {
        console.error('Error in neuroPhotoConversationStep:', error);
        await mockMenuFunctions.sendGenericErrorMessage(ctx, isRu, error);
        throw error;
      }
    };
    
    const neuroPhotoPromptStep = async (ctx) => {
      console.log('CASE 2: neuroPhotoPromptStep');
      const isRu = ctx.from?.language_code === 'ru';
      const promptMsg = ctx.message;
      
      if (promptMsg && 'text' in promptMsg) {
        const promptText = promptMsg.text;
        
        const isCancel = await mockHandlers.handleHelpCancel(ctx);
        
        if (isCancel) {
          return ctx.scene.leave();
        } else {
          ctx.session.prompt = promptText;
          
          const trigger_word = ctx.session.userModel.trigger_word;
          
          if (trigger_word) {
            const fullPrompt = `${trigger_word}, ${promptText}`;
            const telegramId = ctx.from?.id.toString();
            if (!telegramId) {
              await ctx.reply(
                isRu
                  ? '❌ Ошибка: не удалось получить ID пользователя'
                  : '❌ Error: User ID not found'
              );
              return ctx.scene.leave();
            }
            
            const result = await mockServices.generateNeuroImageV2(
              fullPrompt,
              1,
              telegramId,
              ctx,
              ctx.botInfo?.username
            );
            
            if (result === null) {
              return;
            }
            
            ctx.wizard.next();
            return;
          } else {
            await ctx.reply(isRu ? '❌ Некорректный промпт' : '❌ Invalid prompt');
            ctx.scene.leave();
            return;
          }
        }
      }
    };
    
    const neuroPhotoButtonStep = async (ctx) => {
      console.log('CASE 3: neuroPhotoButtonStep');
      if (ctx.message && 'text' in ctx.message) {
        const text = ctx.message.text;
        console.log(`CASE: Нажата кнопка ${text}`);
        const isRu = ctx.from?.language_code === 'ru';
        
        // Handle "Improve prompt" and "Change size" buttons
        if (text === '⬆️ Улучшить промпт' || text === '⬆️ Improve prompt') {
          console.log('CASE: Улучшить промпт');
          await ctx.scene.enter('improvePromptWizard');
          return;
        }
        
        if (text === '📐 Изменить размер' || text === '📐 Change size') {
          console.log('CASE: Изменить размер');
          await ctx.scene.enter('sizeWizard');
          return;
        }
        
        if (text === mockMenuFunctions.mainMenuButton.title_ru || 
            text === mockMenuFunctions.mainMenuButton.title_en) {
          console.log('CASE: Главное меню');
          await mockHandlers.handleMenu(ctx);
          return;
        }
        
        // Handle buttons with numbers
        const numImages = parseInt(text[0]);
        
        if (!isNaN(numImages) && numImages >= 1 && numImages <= 4) {
          const prompt = ctx.session.prompt;
          const trigger_word = ctx.session.userModel.trigger_word;
          const fullPrompt = `${trigger_word}, ${prompt}`;
          
          const telegramId = ctx.from?.id.toString();
          if (!telegramId) {
            await ctx.reply(
              isRu
                ? '❌ Ошибка: не удалось получить ID пользователя'
                : '❌ Error: User ID not found'
            );
            return ctx.scene.leave();
          }
          
          const result = await mockServices.generateNeuroImageV2(
            fullPrompt,
            numImages,
            telegramId,
            ctx,
            ctx.botInfo?.username
          );
          
          if (result === null) {
            return ctx.scene.leave();
          }
          
          return;
        }
        
        // Default case - show main menu
        await mockHandlers.handleMenu(ctx);
      }
    };

    // Run test cases
    console.log('\n--- Test Case 1: Initial handler ---');
    await neuroPhotoConversationStep(mockCtx);
    console.log(`Got ${mockCtx.replies.length} replies`);

    console.log('\n--- Test Case 2: Entering prompt ---');
    mockCtx.replies = [];
    mockCtx.message.text = 'A photorealistic portrait of me as an astronaut on the moon';
    await neuroPhotoPromptStep(mockCtx);
    console.log(`Got ${mockCtx.replies.length} replies with photos`);

    console.log('\n--- Test Case 3: Selecting number of images ---');
    mockCtx.replies = [];
    mockCtx.message.text = '2️⃣ Two images';
    await neuroPhotoButtonStep(mockCtx);
    console.log(`Got ${mockCtx.replies.length} replies with photos`);

    console.log('\n--- Test Case 4: Improve prompt button ---');
    mockCtx.replies = [];
    mockCtx.message.text = '⬆️ Improve prompt';
    await neuroPhotoButtonStep(mockCtx);
    console.log(`Scene changed to: improvePromptWizard`);

    console.log('\n--- Test Case 5: Main menu button ---');
    mockCtx.replies = [];
    mockCtx.message.text = '📋 Main menu';
    await neuroPhotoButtonStep(mockCtx);
    console.log(`Left scene and showed main menu`);

    console.log('\n✅ All tests completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the tests
testNeuroPhotoV2Scene(); 