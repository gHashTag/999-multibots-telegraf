#!/usr/bin/env node

/**
 * Simplified Test Runner for Specific Scenes
 * 
 * This script focuses on testing a single scene with minimal dependencies.
 */

// Set environment variables for testing
process.env.TEST = 'true';
process.env.NODE_ENV = 'test';
process.env.BOT_TOKEN = 'mock-bot-token';

const fs = require('fs');
const path = require('path');

// Register TypeScript support
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    target: 'es2017',
    skipLibCheck: true
  }
});

// Create mocks for imported modules
require.extensions['.ts'] = function(module, filename) {
  if (filename.includes('node_modules')) {
    return require.extensions['.js'](module, filename);
  }
  
  // Read the TypeScript file
  const content = fs.readFileSync(filename, 'utf8');
  
  // Handle specific imports by adding mocks
  if (content.includes('@/utils/logger')) {
    global.logger = {
      info: console.log,
      error: console.error,
      warn: console.warn,
      debug: console.log,
      verbose: console.log,
      child: () => global.logger
    };
  }
  
  if (content.includes('@/helpers/language')) {
    global.languageHelper = {
      getUserLanguage: (ctx) => ctx?.from?.language_code || 'en',
      getLanguage: (ctx) => ctx?.from?.language_code || 'en',
      isRussian: (text) => /^[а-яА-ЯёЁ\s.,!?;:()"'-]+$/.test(text),
      isEnglish: (text) => /^[a-zA-Z\s.,!?;:()"'-]+$/.test(text),
      detectLanguage: (text) => /^[а-яА-ЯёЁ\s.,!?;:()"'-]+$/.test(text) ? 'ru' : 'en',
      setUserLanguage: (ctx, language) => { if (ctx && ctx.session) ctx.session.language = language; }
    };
  }
  
  if (content.includes('Markup')) {
    global.Markup = {
      keyboard: (buttons) => ({ keyboard: buttons, resize_keyboard: true }),
      inlineKeyboard: (buttons) => ({ inline_keyboard: buttons })
    };
  }
  
  return require.extensions['.js'](module, filename);
};

// Mock certain modules
const mocks = {
  '@/utils/logger': {
    logger: {
      info: console.log,
      error: console.error,
      warn: console.warn,
      debug: console.log,
      verbose: console.log,
      child: () => mocks['@/utils/logger'].logger
    }
  },
  '@/helpers/language': {
    getUserLanguage: (ctx) => ctx?.from?.language_code || 'en',
    getLanguage: (ctx) => ctx?.from?.language_code || 'en',
    isRussian: (text) => /^[а-яА-ЯёЁ\s.,!?;:()"'-]+$/.test(text),
    isEnglish: (text) => /^[a-zA-Z\s.,!?;:()"'-]+$/.test(text),
    detectLanguage: (text) => /^[а-яА-ЯёЁ\s.,!?;:()"'-]+$/.test(text) ? 'ru' : 'en',
    setUserLanguage: (ctx, language) => { if (ctx && ctx.session) ctx.session.language = language; }
  },
  'telegraf': {
    Markup: {
      keyboard: (buttons) => ({ keyboard: buttons, resize_keyboard: true }),
      inlineKeyboard: (buttons) => ({ inline_keyboard: buttons })
    },
    Scenes: {
      WizardScene: class WizardScene {
        constructor(id, ...handlers) {
          this.id = id;
          this.handlers = handlers;
        }
        middleware() {
          return {
            handlers: this.handlers
          };
        }
      }
    }
  }
};

// Override require to use our mocks
const originalRequire = module.require;
module.require = function(modulePath) {
  if (mocks[modulePath]) {
    return mocks[modulePath];
  }
  
  if (modulePath === '@/utils/logger') {
    return { logger: global.logger };
  }
  
  if (modulePath === '@/helpers/language') {
    return global.languageHelper;
  }
  
  if (modulePath === 'telegraf') {
    return mocks['telegraf'];
  }
  
  return originalRequire.apply(this, arguments);
};

// Minimal mock for Telegram context
const createMockContext = () => {
  return {
    reply: (text, extra) => {
      if (!mockCtx.replies) mockCtx.replies = [];
      mockCtx.replies.push({ text, extra });
      return Promise.resolve();
    },
    replyWithHTML: (text, extra) => {
      if (!mockCtx.replies) mockCtx.replies = [];
      mockCtx.replies.push({ text, extra, html: true });
      return Promise.resolve();
    },
    replyWithMarkdown: (text, extra) => {
      if (!mockCtx.replies) mockCtx.replies = [];
      mockCtx.replies.push({ text, extra, markdown: true });
      return Promise.resolve();
    },
    wizard: {
      cursor: 0,
      next: () => { mockCtx.wizard.cursor++; },
      selectStep: (step) => { mockCtx.wizard.cursor = step; },
      leave: () => { 
        mockCtx.wizard.cursor = 0;
        if (mockCtx.wizard.scene) mockCtx.wizard.scene.current = null;
      },
      scene: {
        current: 'selectNeuroPhotoScene',
        enter: (sceneName) => { 
          mockCtx.wizard.scene.current = sceneName; 
          mockCtx.wizard.cursor = 0;
        },
        leave: () => { 
          mockCtx.wizard.scene.current = null; 
          mockCtx.wizard.cursor = 0;
        }
      }
    },
    session: {},
    from: { id: 12345, first_name: 'Test', username: 'testuser', language_code: 'en' },
    message: { text: '', message_id: 1 },
    update: { update_id: 1 },
    i18n: {
      t: (key) => key
    },
    replies: []
  };
};

// Choose the scene to test
const sceneToTest = process.argv[2] || 'selectNeuroPhotoScene';

// Create global mock context
global.mockCtx = createMockContext();

// Basic tests for the scene
function runBasicTests() {
  console.log(`\n=== Running basic tests for ${sceneToTest} ===\n`);
  
  try {
    // Test entering the scene
    console.log(`Loading scene from ./src/scenes/${sceneToTest}/index.ts`);
    const scene = require(`./src/scenes/${sceneToTest}/index.ts`);
    
    // Test handler index 0 (initial scene prompt)
    console.log('Testing initial scene handler...');
    const handler0 = scene.default.middleware().handlers[0];
    if (handler0) {
      handler0(mockCtx);
      console.log('Handler 0 executed. Replies:', mockCtx.replies.length);
      
      // Check if any messages were sent
      if (mockCtx.replies.length > 0) {
        console.log('Scene sent message:', mockCtx.replies[0].text.substring(0, 50) + '...');
      } else {
        console.warn('No replies from initial handler');
      }
    } else {
      console.error('No initial handler found in scene');
    }
    
    // Clear replies and test the next handler with sample user input
    mockCtx.replies = [];
    mockCtx.wizard.cursor = 1;
    mockCtx.message.text = 'flux';
    
    console.log('\nTesting second scene handler with input "flux"...');
    const handler1 = scene.default.middleware().handlers[1];
    if (handler1) {
      handler1(mockCtx);
      console.log('Handler 1 executed. Replies:', mockCtx.replies.length);
      
      // Check if any messages were sent
      if (mockCtx.replies.length > 0) {
        console.log('Scene response:', mockCtx.replies[0].text.substring(0, 50) + '...');
      } else {
        console.warn('No replies from second handler');
      }
    } else {
      console.error('No second handler found in scene');
    }
    
    console.log('\n✅ Basic tests completed successfully');
  } catch (error) {
    console.error('❌ Error during scene testing:', error);
    console.error(error.stack);
  }
}

runBasicTests();