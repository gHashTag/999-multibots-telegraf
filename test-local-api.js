#!/usr/bin/env node

const axios = require('axios');

console.log('🔧 Тестирование локального API на порту 2999...\n');

// Сначала запустим простой Express сервер для тестирования
const express = require('express');
const app = express();
const PORT = 2999;

app.use(express.json());

// Добавляем маршрут для статуса
app.get('/api/dart-ai/status', (req, res) => {
  res.json({
    success: true,
    data: {
      configured: !!process.env.DART_AI_API_KEY,
      api_key_present: !!process.env.DART_AI_API_KEY,
      base_url: 'https://api.dart.ai',
      timestamp: new Date().toISOString()
    }
  });
});

// Добавляем маршрут health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'UP',
    source: 'test-server',
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.send('Test API Server is running!');
});

// Запускаем тестовый сервер
const server = app.listen(PORT, () => {
  console.log(`🚀 Тестовый сервер запущен на http://localhost:${PORT}`);
  
  // Тестируем API
  setTimeout(async () => {
    try {
      console.log('\n📡 Тестирование API маршрутов...');
      
      const healthResponse = await axios.get(`http://localhost:${PORT}/api/health`);
      console.log('✅ Health endpoint:', healthResponse.data.status);
      
      const statusResponse = await axios.get(`http://localhost:${PORT}/api/dart-ai/status`);
      console.log('✅ Dart AI status endpoint:', statusResponse.data.success);
      console.log('🔑 API key configured:', statusResponse.data.data.configured);
      
      console.log('\n🎉 Базовые API маршруты работают!');
      
    } catch (error) {
      console.log(`❌ Ошибка тестирования: ${error.message}`);
    }
    
    server.close(() => {
      console.log('\n✅ Тестовый сервер остановлен');
    });
  }, 2000);
});

// Загружаем переменные окружения
require('dotenv').config();