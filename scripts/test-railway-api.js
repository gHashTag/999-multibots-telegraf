#!/usr/bin/env node

/**
 * Простой тест Railway API для проверки видео генерации
 */

const axios = require('axios');
require('dotenv').config();

const API_SERVER_URL = 'https://ai-server-production-production-8e2d.up.railway.app';
const SECRET_API_KEY = process.env.SECRET_API_KEY;

async function testVideoGeneration() {
  console.log('🚀 Тестируем Railway API для генерации видео...');
  
  try {
    const response = await axios.post(`${API_SERVER_URL}/generate/text-to-video`, {
      prompt: "Beautiful sunset over mountains",
      videoModel: "kie-veo-3-fast", 
      aspectRatio: "9:16",
      duration: 5,
      telegram_id: "test_user",
      username: "test",
      is_ru: true,
      bot_name: "test_bot"
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-secret-key': SECRET_API_KEY
      },
      timeout: 10000
    });
    
    console.log('✅ Ответ получен:', response.data);
    
    if (response.data.jobId) {
      console.log('🎯 Job ID получен:', response.data.jobId);
      console.log('✨ Сервер теперь возвращает jobId для отслеживания!');
    }
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    if (error.response) {
      console.error('Статус:', error.response.status);
      console.error('Данные:', error.response.data);
    }
  }
}

testVideoGeneration();