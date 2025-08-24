#!/usr/bin/env node

const axios = require('axios');

console.log('🚀 Быстрая проверка API без запуска бота...\n');

async function quickTest() {
  try {
    // Прямой тест с реальным Dart AI API
    console.log('1️⃣ Тестирование прямого подключения к Dart AI...');
    const dartResponse = await axios.get('https://api.dart.ai/v0/spaces', {
      headers: {
        'Authorization': 'Bearer dsa_e4231f3e7b1fa6bdbeb44c181ee2de1ca1db84184325f27f46adbd66266423f4',
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('✅ Dart AI API работает!');
    console.log(`📊 Найдено пространств: ${dartResponse.data.data.spaces.length}`);
    
    if (dartResponse.data.data.spaces.length > 0) {
      const space = dartResponse.data.data.spaces[0];
      console.log(`📝 Первое пространство: ${space.name} (ID: ${space.id})`);
      
      // Тестируем получение задач
      console.log('\n2️⃣ Тестирование получения задач...');
      const tasksResponse = await axios.get(`https://api.dart.ai/v0/spaces/${space.id}/tasks`, {
        headers: {
          'Authorization': 'Bearer dsa_e4231f3e7b1fa6bdbeb44c181ee2de1ca1db84184325f27f46adbd66266423f4',
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      console.log('✅ Получение задач работает!');
      console.log(`📋 Задач в пространстве: ${tasksResponse.data.data.tasks.length}`);
    }
    
    console.log('\n🎉 Dart AI API полностью функционален!');
    
  } catch (error) {
    console.log(`❌ Ошибка подключения: ${error.message}`);
    if (error.response) {
      console.log(`📊 Статус: ${error.response.status}`);
      console.log(`📝 Ответ: ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }
}

quickTest();