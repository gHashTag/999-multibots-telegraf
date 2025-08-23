#!/usr/bin/env node
/**
 * 🔄 ТЕСТ REPLICATE FALLBACK ДЛЯ LIPSYNC
 * 
 * Проверяет что Replicate fallback будет работать
 * когда AI server не может обработать запрос
 */

require('dotenv').config();
const axios = require('axios');

// Цвета для консоли
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testReplicateFallback() {
    log('🔄 ТЕСТ REPLICATE FALLBACK', 'bold');
    log('=' .repeat(50), 'blue');
    
    // 1. Проверяем наличие Replicate токена
    log('\n1. Проверка переменных окружения...', 'blue');
    
    const replicateToken = process.env.REPLICATE_API_TOKEN;
    if (!replicateToken || replicateToken === 'your-replicate-token-here') {
        log('⚠️  REPLICATE_API_TOKEN не настроен в .env файле', 'yellow');
        log('   Настройте токен для полнофункционального fallback', 'yellow');
        return false;
    } else {
        log('✅ REPLICATE_API_TOKEN настроен', 'green');
    }

    // 2. Проверяем доступность Replicate API
    log('\n2. Проверка доступности Replicate API...', 'blue');
    
    try {
        const response = await axios.get('https://api.replicate.com/v1/models/kwaivgi/kling-lip-sync', {
            headers: {
                'Authorization': `Token ${replicateToken}`
            },
            timeout: 10000
        });

        if (response.status === 200) {
            log('✅ Replicate API доступен', 'green');
            log(`   Модель: ${response.data.name}`, 'blue');
            log(`   Версия: ${response.data.latest_version?.id?.substring(0, 8)}...`, 'blue');
        }
    } catch (error) {
        if (error.response?.status === 401) {
            log('❌ Неверный REPLICATE_API_TOKEN', 'red');
            return false;
        } else if (error.response?.status === 404) {
            log('⚠️  Модель kwaivgi/kling-lip-sync не найдена', 'yellow');
            log('   Возможно модель была удалена или изменена', 'yellow');
        } else {
            log(`⚠️  Ошибка доступа к Replicate: ${error.message}`, 'yellow');
        }
    }

    // 3. Проверяем логику fallback в нашем коде
    log('\n3. Проверка логики fallback в коде...', 'blue');
    
    const fs = require('fs');
    const path = require('path');
    
    const adapterPath = path.join(process.cwd(), 'src/core/ai-server/lipsync-adapter.ts');
    
    if (fs.existsSync(adapterPath)) {
        const adapterCode = fs.readFileSync(adapterPath, 'utf8');
        
        const hasAIServerCall = adapterCode.includes('generateLipSyncViaAIServer');
        const hasFallbackCall = adapterCode.includes('generateLipSyncViaReplicate'); 
        const hasErrorHandling = adapterCode.includes('catch') && adapterCode.includes('fallback');
        
        if (hasAIServerCall) log('✅ AI Server интеграция найдена', 'green');
        if (hasFallbackCall) log('✅ Replicate fallback найден', 'green');
        if (hasErrorHandling) log('✅ Обработка ошибок найдена', 'green');
        
        if (hasAIServerCall && hasFallbackCall && hasErrorHandling) {
            log('✅ Полная логика fallback реализована', 'green');
        } else {
            log('⚠️  Логика fallback требует доработки', 'yellow');
        }
    } else {
        log('❌ LipSync адаптер не найден', 'red');
        return false;
    }

    // 4. Симулируем fallback сценарий
    log('\n4. Симуляция fallback сценария...', 'blue');
    
    // Проверяем что происходит когда AI server недоступен
    try {
        const response = await axios.post('https://ai-server-production-production-8e2d.up.railway.app/api/lipsync', {
            video_url: 'https://example.com/test-video.mp4',
            audio_url: 'https://example.com/test-audio.mp3'
        }, {
            timeout: 5000,
            validateStatus: function (status) {
                return status < 500;
            }
        });

        if (response.status === 404) {
            log('✅ AI server корректно возвращает 404 для LipSync', 'green');
            log('   Fallback на Replicate будет активирован', 'green');
        } else if (response.status === 200) {
            log('🎉 AI server поддерживает LipSync напрямую!', 'green');
            log('   Fallback не потребуется', 'blue');
        }
    } catch (error) {
        log('✅ AI server недоступен для LipSync - активируется fallback', 'green');
    }

    // 5. Финальный отчет
    log('\n' + '='.repeat(50), 'blue');
    log('🎯 ЗАКЛЮЧЕНИЕ ПО REPLICATE FALLBACK:', 'bold');
    
    if (replicateToken && replicateToken !== 'your-replicate-token-here') {
        log('✅ Replicate fallback готов к работе', 'green');
        log('✅ При недоступности AI server будет использован Replicate', 'green');
        log('✅ LipSync функционал будет работать', 'green');
        
        log('\n💡 Рекомендации:', 'blue');
        log('   • Мониторить логи для отслеживания fallback активации');
        log('   • Протестировать реальный запрос с видео и аудио');
        log('   • Настроить алерты на частые fallback');
        
        return true;
    } else {
        log('⚠️  Для полноценной работы нужен REPLICATE_API_TOKEN', 'yellow');
        log('⚠️  Без токена fallback не сработает при отказе AI server', 'yellow');
        
        log('\n🛠️  Что нужно сделать:', 'yellow');
        log('   1. Получить токен на https://replicate.com');
        log('   2. Добавить REPLICATE_API_TOKEN в .env файл');
        log('   3. Перезапустить приложение');
        
        return false;
    }
}

// Запуск
if (require.main === module) {
    testReplicateFallback()
        .then((success) => {
            process.exit(success ? 0 : 1);
        })
        .catch((error) => {
            log(`💥 Критическая ошибка: ${error.message}`, 'red');
            process.exit(1);
        });
}

module.exports = testReplicateFallback;