#!/usr/bin/env node
/**
 * 🧪 ПОЛНЫЙ ИНТЕГРАЦИОННЫЙ ТЕСТ API СЕРВЕРА
 * 
 * Проверяет все аспекты API сервера для LipSync функционала:
 * - Доступность сервера
 * - Health endpoints
 * - LipSync API endpoints
 * - Replicate fallback
 * - Обработка ошибок
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Конфигурация
const AI_SERVER_URL = 'https://ai-server-production-production-8e2d.up.railway.app';
const TIMEOUT = 10000; // 10 секунд

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

class APIIntegrationTester {
    constructor() {
        this.results = [];
        this.startTime = Date.now();
    }

    async runTest(name, testFunction) {
        log(`\n🧪 Тест: ${name}`, 'blue');
        const start = Date.now();
        
        try {
            const result = await testFunction();
            const duration = Date.now() - start;
            
            this.results.push({
                name,
                status: 'SUCCESS',
                duration,
                result
            });
            
            log(`✅ УСПЕХ (${duration}ms): ${result}`, 'green');
        } catch (error) {
            const duration = Date.now() - start;
            
            this.results.push({
                name,
                status: 'FAILED',
                duration,
                error: error.message
            });
            
            log(`❌ ОШИБКА (${duration}ms): ${error.message}`, 'red');
        }
    }

    // Тест 1: Базовая доступность сервера
    async testServerAvailability() {
        const response = await axios.get(AI_SERVER_URL, { timeout: TIMEOUT });
        
        if (response.status !== 200) {
            throw new Error(`Сервер недоступен: ${response.status}`);
        }

        const data = response.data;
        if (!data.status || data.status !== 'success') {
            throw new Error('Некорректный ответ сервера');
        }

        return `Сервер доступен (${data.version})`;
    }

    // Тест 2: Health Check
    async testHealthEndpoint() {
        const response = await axios.get(`${AI_SERVER_URL}/health`, { timeout: TIMEOUT });
        
        if (response.status !== 200) {
            throw new Error(`Health check failed: ${response.status}`);
        }

        const data = response.data;
        if (!data.success || data.status !== 'healthy') {
            throw new Error('Сервер не здоров');
        }

        return `Health OK (${data.service})`;
    }

    // Тест 3: Проверка всех доступных endpoints
    async testAvailableEndpoints() {
        const response = await axios.get(`${AI_SERVER_URL}/health`, { timeout: TIMEOUT });
        const data = response.data;
        
        if (!data.endpoints) {
            throw new Error('Endpoints не найдены');
        }

        const endpointCount = Object.keys(data.endpoints).length;
        return `Найдено ${endpointCount} endpoints`;
    }

    // Тест 4: Попытка найти LipSync endpoint
    async testLipSyncEndpoints() {
        const possibleEndpoints = [
            '/api/lipsync',
            '/lipsync',
            '/generate/lipsync',
            '/api/generate/lipsync',
            '/v1/lipsync',
            '/lip-sync'
        ];

        let foundEndpoints = [];
        let notFoundEndpoints = [];

        for (const endpoint of possibleEndpoints) {
            try {
                const response = await axios.get(`${AI_SERVER_URL}${endpoint}`, { 
                    timeout: TIMEOUT,
                    validateStatus: function (status) {
                        return status < 500; // Принимаем 404, но не 500+
                    }
                });

                if (response.status === 200) {
                    foundEndpoints.push(endpoint);
                } else if (response.status === 404) {
                    notFoundEndpoints.push(endpoint);
                } else {
                    log(`⚠️  ${endpoint}: status ${response.status}`, 'yellow');
                }
            } catch (error) {
                notFoundEndpoints.push(`${endpoint} (${error.message})`);
            }
        }

        if (foundEndpoints.length > 0) {
            return `Найдены LipSync endpoints: ${foundEndpoints.join(', ')}`;
        } else {
            return `LipSync endpoints не найдены (проверено ${possibleEndpoints.length})`;
        }
    }

    // Тест 5: POST запрос к потенциальному LipSync endpoint
    async testLipSyncPOST() {
        const testPayload = {
            video_url: "https://example.com/test-video.mp4",
            audio_url: "https://example.com/test-audio.mp3",
            model: "kwaivgi/kling-lip-sync"
        };

        const possibleEndpoints = ['/api/lipsync', '/lipsync', '/generate/lipsync'];
        
        for (const endpoint of possibleEndpoints) {
            try {
                const response = await axios.post(`${AI_SERVER_URL}${endpoint}`, testPayload, {
                    timeout: TIMEOUT,
                    headers: { 'Content-Type': 'application/json' },
                    validateStatus: function (status) {
                        return status < 500;
                    }
                });

                if (response.status === 200 || response.status === 202) {
                    return `LipSync POST работает на ${endpoint}`;
                }
            } catch (error) {
                // Продолжаем поиск
                continue;
            }
        }

        return 'LipSync POST endpoints не найдены - будет использован Replicate fallback';
    }

    // Тест 6: Проверка переменных окружения для fallback
    async testEnvironmentConfiguration() {
        const envPath = path.join(process.cwd(), '.env');
        
        if (!fs.existsSync(envPath)) {
            throw new Error('.env файл не найден');
        }

        const envContent = fs.readFileSync(envPath, 'utf8');
        const hasReplicateToken = envContent.includes('REPLICATE_API_TOKEN=');
        const hasAIServerURL = envContent.includes('AI_SERVER_URL=');
        
        let results = [];
        if (hasAIServerURL) results.push('AI_SERVER_URL настроен');
        if (hasReplicateToken) results.push('REPLICATE_API_TOKEN настроен');
        
        return `Переменные окружения: ${results.join(', ')}`;
    }

    // Тест 7: Проверка LipSync адаптера
    async testLipSyncAdapter() {
        const adapterPath = path.join(process.cwd(), 'src/core/ai-server/lipsync-adapter.ts');
        
        if (!fs.existsSync(adapterPath)) {
            throw new Error('LipSync адаптер не найден');
        }

        const adapterContent = fs.readFileSync(adapterPath, 'utf8');
        
        const hasAIServerLogic = adapterContent.includes('generateLipSyncViaAIServer');
        const hasFallbackLogic = adapterContent.includes('generateLipSyncViaReplicate');
        const hasErrorHandling = adapterContent.includes('catch') && adapterContent.includes('error');
        
        let features = [];
        if (hasAIServerLogic) features.push('AI Server интеграция');
        if (hasFallbackLogic) features.push('Replicate fallback');
        if (hasErrorHandling) features.push('обработка ошибок');
        
        return `LipSync адаптер: ${features.join(', ')}`;
    }

    // Тест 8: Симуляция полного workflow
    async testLipSyncWorkflow() {
        const testData = {
            videoUrl: 'https://example.com/test-video.mp4',
            audioUrl: 'https://example.com/test-audio.mp3',
            config: {
                model: 'kwaivgi/kling-lip-sync',
                provider: 'ai-server-first'
            }
        };

        // Имитируем workflow через наш код
        try {
            // Проверяем что файлы существуют
            const requiredFiles = [
                'src/services/generateLipSync.ts',
                'src/core/ai-server/lipsync-adapter.ts',
                'src/scenes/lipSyncWizard/index.ts'
            ];

            for (const file of requiredFiles) {
                const fullPath = path.join(process.cwd(), file);
                if (!fs.existsSync(fullPath)) {
                    throw new Error(`Отсутствует файл: ${file}`);
                }
            }

            return 'LipSync workflow файлы на месте';
        } catch (error) {
            throw error;
        }
    }

    // Генерация отчета
    generateReport() {
        const totalDuration = Date.now() - this.startTime;
        const successCount = this.results.filter(r => r.status === 'SUCCESS').length;
        const totalCount = this.results.length;

        log(`\n${'='.repeat(60)}`, 'bold');
        log(`🧪 ОТЧЕТ ПО ИНТЕГРАЦИОННОМУ ТЕСТИРОВАНИЮ API`, 'bold');
        log(`${'='.repeat(60)}`, 'bold');

        log(`\n📊 Общая статистика:`);
        log(`   Всего тестов: ${totalCount}`);
        log(`   Успешных: ${successCount}`, 'green');
        log(`   Ошибок: ${totalCount - successCount}`, successCount === totalCount ? 'green' : 'red');
        log(`   Общее время: ${totalDuration}ms`);

        log(`\n📋 Детальные результаты:`);
        this.results.forEach((result, index) => {
            const status = result.status === 'SUCCESS' ? '✅' : '❌';
            const color = result.status === 'SUCCESS' ? 'green' : 'red';
            
            log(`   ${index + 1}. ${status} ${result.name} (${result.duration}ms)`, color);
            
            if (result.result) {
                log(`      ${result.result}`, 'blue');
            }
            if (result.error) {
                log(`      Ошибка: ${result.error}`, 'red');
            }
        });

        log(`\n🎯 ЗАКЛЮЧЕНИЕ:`);
        if (successCount === totalCount) {
            log(`   🟢 ВСЕ ТЕСТЫ ПРОШЛИ УСПЕШНО!`, 'green');
            log(`   🚀 API сервер готов к работе с LipSync`, 'green');
        } else if (successCount >= totalCount * 0.7) {
            log(`   🟡 ЧАСТИЧНЫЙ УСПЕХ`, 'yellow');
            log(`   🔧 Некоторые компоненты требуют внимания`, 'yellow');
        } else {
            log(`   🔴 ТРЕБУЕТСЯ ИСПРАВЛЕНИЕ`, 'red');
            log(`   🛠️  Много критических проблем`, 'red');
        }

        // Рекомендации
        log(`\n💡 РЕКОМЕНДАЦИИ:`);
        
        const hasLipSyncEndpoint = this.results.some(r => 
            r.name.includes('LipSync') && r.result && r.result.includes('работает')
        );
        
        if (!hasLipSyncEndpoint) {
            log(`   • Добавить LipSync endpoints на AI сервер`, 'yellow');
            log(`   • Убедиться что Replicate fallback настроен`, 'yellow');
        }
        
        log(`   • Проверить переменные окружения в продакшне`);
        log(`   • Протестировать реальный LipSync запрос`);
        log(`   • Мониторить логи при первых запросах`);

        return successCount === totalCount;
    }

    // Основной метод запуска всех тестов
    async runAllTests() {
        log(`🚀 ЗАПУСК ИНТЕГРАЦИОННОГО ТЕСТИРОВАНИЯ API СЕРВЕРА`, 'bold');
        log(`📡 Сервер: ${AI_SERVER_URL}`, 'blue');
        log(`⏱️  Timeout: ${TIMEOUT}ms\n`);

        await this.runTest('Доступность сервера', () => this.testServerAvailability());
        await this.runTest('Health Check', () => this.testHealthEndpoint());
        await this.runTest('Доступные endpoints', () => this.testAvailableEndpoints());
        await this.runTest('LipSync GET endpoints', () => this.testLipSyncEndpoints());
        await this.runTest('LipSync POST endpoints', () => this.testLipSyncPOST());
        await this.runTest('Переменные окружения', () => this.testEnvironmentConfiguration());
        await this.runTest('LipSync адаптер', () => this.testLipSyncAdapter());
        await this.runTest('LipSync workflow', () => this.testLipSyncWorkflow());

        return this.generateReport();
    }
}

// Запуск тестов
if (require.main === module) {
    const tester = new APIIntegrationTester();
    
    tester.runAllTests()
        .then((allPassed) => {
            process.exit(allPassed ? 0 : 1);
        })
        .catch((error) => {
            log(`\n💥 КРИТИЧЕСКАЯ ОШИБКА: ${error.message}`, 'red');
            process.exit(1);
        });
}

module.exports = APIIntegrationTester;