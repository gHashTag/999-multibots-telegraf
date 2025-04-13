
      // Set up environment variables for tests
      process.env.TEST = 'true';
      process.env.NODE_ENV = 'test';
      process.env.SUPABASE_URL = 'https://mock-supabase-url.supabase.co';
      process.env.SUPABASE_KEY = 'mock-supabase-key';
      process.env.BOT_TOKEN = 'mock-bot-token';
      
      // Register module aliases to support @ imports
      try {
        require('./src/test-utils/core/setup/module-aliases.js');
        console.log('Module aliases registered');
      } catch (error) {
        console.error('Error registering module aliases:', error);
      }
      
      // Redirect console.error to capture errors
      const originalConsoleError = console.error;
      const errors = [];
      console.error = (...args) => {
        errors.push(args.join(' '));
        originalConsoleError(...args);
      };
      
      // Create global mocks for test environment
      global.mockCtx = {
        reply: () => {},
        replyWithHTML: () => {},
        replyWithMarkdown: () => {},
        wizard: { cursor: 0, scene: { current: '' } },
        session: {},
        replies: [],
        i18n: { t: (key) => key },
        from: { id: 12345, first_name: 'Test', username: 'testuser', language_code: 'en' }
      };
      
      async function runTheTest() {
        try {
          // Dynamic import to load the test module
          const testPath = '/Users/playom/999-multibots-telegraf/src/test-utils/tests/scenes/selectNeuroPhotoScene.test.ts';
          console.log('Loading test from: ' + testPath);
          
          // For TypeScript files, we need to use require with ts-node/register
          require('ts-node/register');
          
          // Attempt to load and run the test
          require(testPath);
          
          console.log('Test completed successfully');
          process.exit(0);
        } catch (error) {
          console.error('Test failed with error:', error);
          process.exit(1);
        }
      }
      
      runTheTest().catch(err => {
        console.error('Unhandled promise rejection:', err);
        process.exit(1);
      });
    