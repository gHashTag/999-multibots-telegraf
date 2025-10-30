#!/usr/bin/env node

// Простой тест для проверки работы generateNanoBanana
const { generateNanoBanana } = require('./dist/services/generateNanoBanana.js');

async function testGeneration() {
  console.log('🧪 Testing generateNanoBanana function...');
  
  // Mock context
  const mockCtx = {
    telegram: { token: process.env.BOT_TOKEN_MAIN },
    botInfo: { username: 'test_bot' },
    reply: async (text, opts) => {
      console.log('Bot reply:', text);
      return { message_id: 123 };
    },
    deleteMessage: async (msgId) => {
      console.log('Delete message:', msgId);
      return true;
    },
    from: { username: 'test_user' }
  };

  try {
    const result = await generateNanoBanana({
      telegram_id: '144022504',
      promptText: 'Transform person into mighty Russian warrior Ilya Muromets. Ancient Russian armor with chainmail and helmet.',
      inputImageUrl: 'https://api.telegram.org/file/bot7313269542:AAG6NLu6NRSblDvWhd2-M26auR1BLNZiLoU/photos/file_6.jpg',
      ctx: mockCtx,
      username: 'test_user',
      is_ru: true
    });

    console.log('✅ Test result:', result ? 'SUCCESS' : 'FAILED');
    console.log('Generated image URL:', result);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testGeneration();