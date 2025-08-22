const https = require('https');
const fs = require('fs');

console.log('🔍 Быстрая проверка здоровья сервера...');

const API_SERVER_URL = 'https://ai-server-production-production-8e2d.up.railway.app';

// Проверяем переменные окружения
console.log('\n📋 Переменные окружения:');
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8');
  const serverUrlMatch = envContent.match(/API_SERVER_URL=(.+)/);
  if (serverUrlMatch) {
    console.log(`✅ API_SERVER_URL: ${serverUrlMatch[1]}`);
  }
}

// Простая проверка доступности
function checkHealth() {
  return new Promise((resolve, reject) => {
    const url = `${API_SERVER_URL}/health`;
    console.log(`\n🌐 Проверяем: ${url}`);
    
    const req = https.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Node.js Health Checker'
      }
    }, (res) => {
      console.log(`📊 HTTP Status: ${res.statusCode}`);
      console.log(`📋 Headers:`, res.headers);
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`📦 Response: ${data.substring(0, 200)}`);
        resolve({ status: res.statusCode, data });
      });
    });
    
    req.on('timeout', () => {
      console.log('⏱️ Timeout после 15 секунд');
      req.destroy();
      reject(new Error('Timeout'));
    });
    
    req.on('error', (error) => {
      console.log(`❌ Ошибка: ${error.message}`);
      reject(error);
    });
  });
}

// Основная функция
async function main() {
  try {
    await checkHealth();
    console.log('\n✅ Сервер доступен!');
  } catch (error) {
    console.log(`\n❌ Сервер недоступен: ${error.message}`);
    
    // Дополнительная диагностика
    console.log('\n🔧 Дополнительная диагностика:');
    console.log('1. Проверьте что Railway deployment завершен');
    console.log('2. Убедитесь что сервис не находится в режиме перезапуска');
    console.log('3. Возможно нужно обновить URL сервера');
    
    process.exit(1);
  }
}

main();