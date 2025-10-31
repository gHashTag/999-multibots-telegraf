#!/usr/bin/env node

/**
 * СПЕЦИАЛИЗИРОВАННЫЙ АГЕНТ ДЛЯ АВТОМАТИЗАЦИИ УПРАВЛЕНИЯ ПОЛЬЗОВАТЕЛЯМИ TELEGRAM-БОТОВ
 * 
 * ФУНКЦИОНАЛЬНОСТЬ:
 * 1. Автоматическое обнаружение Telegram ID в сообщениях (regex \d{8,12})
 * 2. Проверка статуса пользователя (база, баланс, подписка)
 * 3. Автоматические предложения решений на основе анализа
 * 4. Выполнение действий по команде пользователя
 * 5. Генерация готовых SSH команд для исполнения
 * 
 * АВТОР: Claude Code Agent System
 * ВЕРСИЯ: 1.0.0
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class TelegramUserAccessAgent {
    constructor(options = {}) {
        this.SERVER_HOST = options.host || '212.86.115.30';
        this.SERVER_USER = options.user || 'root';
        this.PROJECT_PATH = options.projectPath || '/root/999-agents-telegraf';
        this.logFile = options.logFile || '/tmp/user-access-agent.log';
        
        // Паттерн для обнаружения Telegram ID
        this.telegramIdRegex = /\b(\d{8,12})\b/g;
        
        // Типы подписок
        this.subscriptionTypes = {
            NEUROTESTER: 'NEUROTESTER',
            NEUROVIDEO: 'NEUROVIDEO', 
            NEUROPHOTO: 'NEUROPHOTO',
            STARS: 'STARS'
        };
        
        // Пороговые значения для автоматических рекомендаций
        this.thresholds = {
            highBalance: 1000, // XTR
            lowBalance: 100,   // XTR
            inactiveSubscriptionDays: 30
        };
        
        this.log('🤖 Telegram User Access Agent инициализирован');
    }

    /**
     * ОСНОВНОЙ МЕТОД: Автоматический анализ входящего сообщения
     */
    async analyzeMessage(message) {
        this.log(`📝 Анализ сообщения: ${message.substring(0, 100)}...`);
        
        // 1. Поиск Telegram ID в сообщении
        const telegramIds = this.extractTelegramIds(message);
        
        if (telegramIds.length === 0) {
            return {
                hasUsers: false,
                message: '❌ Telegram ID не обнаружены в сообщении'
            };
        }

        // 2. Анализ каждого найденного ID
        const userAnalytics = [];
        for (const telegramId of telegramIds) {
            try {
                const analysis = await this.analyzeUser(telegramId);
                userAnalytics.push(analysis);
            } catch (error) {
                this.log(`❌ Ошибка анализа пользователя ${telegramId}: ${error.message}`);
                userAnalytics.push({
                    telegramId,
                    error: error.message,
                    recommendations: ['Проверить подключение к серверу']
                });
            }
        }

        return {
            hasUsers: true,
            foundIds: telegramIds,
            analytics: userAnalytics,
            summary: this.generateSummary(userAnalytics)
        };
    }

    /**
     * Извлечение Telegram ID из текста
     */
    extractTelegramIds(text) {
        const matches = text.match(this.telegramIdRegex) || [];
        // Фильтруем только валидные Telegram ID (8-12 цифр)
        return [...new Set(matches.filter(id => id.length >= 8 && id.length <= 12))];
    }

    /**
     * ДЕТАЛЬНЫЙ АНАЛИЗ ПОЛЬЗОВАТЕЛЯ
     */
    async analyzeUser(telegramId) {
        this.log(`🔍 Анализ пользователя: ${telegramId}`);
        
        const userDetails = await this.getUserDetails(telegramId);
        const userBalance = await this.getUserBalance(telegramId);
        
        const analysis = {
            telegramId,
            exists: userDetails.isExist,
            balance: userBalance,
            subscription: {
                type: userDetails.subscriptionType,
                isActive: userDetails.isSubscriptionActive,
                startDate: userDetails.subscriptionStartDate
            },
            stars: userDetails.stars,
            recommendations: [],
            actions: [],
            sshCommands: []
        };

        // Генерация рекомендаций на основе анализа
        this.generateRecommendations(analysis);
        
        return analysis;
    }

    /**
     * ГЕНЕРАЦИЯ АВТОМАТИЧЕСКИХ РЕКОМЕНДАЦИЙ
     */
    generateRecommendations(analysis) {
        const { telegramId, exists, balance, subscription, stars } = analysis;

        // Пользователь не существует
        if (!exists) {
            analysis.recommendations.push('🆕 Пользователь не найден в базе данных');
            analysis.actions.push('create_user');
            analysis.sshCommands.push(this.generateCreateUserCommand(telegramId));
            return;
        }

        // Высокий баланс + нет активной подписки
        if (balance >= this.thresholds.highBalance && !subscription.isActive) {
            analysis.recommendations.push(`💰 Высокий баланс (${balance} XTR) без активной подписки`);
            analysis.recommendations.push('🎯 РЕКОМЕНДАЦИЯ: Предоставить NEUROTESTER подписку');
            analysis.actions.push('grant_neurotester');
            analysis.sshCommands.push(this.generateGrantSubscriptionCommand(telegramId, 'NEUROTESTER'));
        }

        // Низкий баланс
        if (balance < this.thresholds.lowBalance) {
            analysis.recommendations.push(`⚠️ Низкий баланс: ${balance} XTR`);
            analysis.recommendations.push('💳 РЕКОМЕНДАЦИЯ: Уведомить о пополнении баланса');
            analysis.actions.push('notify_low_balance');
        }

        // Истекшая подписка
        if (subscription.type && !subscription.isActive) {
            analysis.recommendations.push(`⏰ Истекшая подписка: ${subscription.type}`);
            analysis.recommendations.push('🔄 РЕКОМЕНДАЦИЯ: Обновить до NEUROTESTER подписки');
            analysis.actions.push('renew_subscription');
            analysis.sshCommands.push(this.generateGrantSubscriptionCommand(telegramId, 'NEUROTESTER'));
        }

        // Активная подписка - все хорошо
        if (subscription.isActive) {
            analysis.recommendations.push(`✅ Активная подписка: ${subscription.type}`);
            analysis.recommendations.push(`📅 Дата начала: ${subscription.startDate}`);
        }

        // Проверка доступа к функциям
        analysis.actions.push('check_access');
        analysis.sshCommands.push(this.generateCheckAccessCommand(telegramId));
    }

    /**
     * ВЫПОЛНЕНИЕ ДЕЙСТВИЙ ПО КОМАНДЕ ПОЛЬЗОВАТЕЛЯ
     */
    async executeAction(telegramId, action) {
        this.log(`⚡ Выполнение действия: ${action} для пользователя ${telegramId}`);
        
        const commands = {
            'grant_neurotester': () => this.grantNeurotesterSubscription(telegramId),
            'check_access': () => this.checkUserAccess(telegramId),
            'create_user': () => this.createUser(telegramId),
            'generate_report': () => this.generateUserReport(telegramId),
            'check_subscription': () => this.checkSubscriptionStatus(telegramId)
        };

        if (commands[action]) {
            try {
                const result = await commands[action]();
                this.log(`✅ Действие ${action} выполнено успешно`);
                return result;
            } catch (error) {
                this.log(`❌ Ошибка выполнения действия ${action}: ${error.message}`);
                throw error;
            }
        } else {
            throw new Error(`Неизвестное действие: ${action}`);
        }
    }

    /**
     * ПРЕДОСТАВЛЕНИЕ NEUROTESTER ПОДПИСКИ
     */
    async grantNeurotesterSubscription(telegramId) {
        const command = this.generateGrantSubscriptionCommand(telegramId, 'NEUROTESTER');
        const result = await this.executeSSHCommand(command);
        
        // Проверяем результат
        await this.delay(2000); // Ждем обновления БД
        const verification = await this.getUserDetails(telegramId);
        
        return {
            success: verification.subscriptionType === 'NEUROTESTER',
            command,
            result,
            verification
        };
    }

    /**
     * ПРОВЕРКА ДОСТУПА ПОЛЬЗОВАТЕЛЯ
     */
    async checkUserAccess(telegramId) {
        const command = this.generateCheckAccessCommand(telegramId);
        const result = await this.executeSSHCommand(command);
        
        return {
            telegramId,
            command,
            accessReport: result
        };
    }

    /**
     * СОЗДАНИЕ НОВОГО ПОЛЬЗОВАТЕЛЯ
     */
    async createUser(telegramId) {
        const command = this.generateCreateUserCommand(telegramId);
        const result = await this.executeSSHCommand(command);
        
        return {
            telegramId,
            command,
            result
        };
    }

    /**
     * ГЕНЕРАЦИЯ ДЕТАЛЬНОГО ОТЧЕТА
     */
    async generateUserReport(telegramId) {
        const userDetails = await this.getUserDetails(telegramId);
        const userBalance = await this.getUserBalance(telegramId);
        
        const report = {
            telegramId,
            timestamp: new Date().toISOString(),
            exists: userDetails.isExist,
            balance: userBalance,
            stars: userDetails.stars,
            subscription: {
                type: userDetails.subscriptionType,
                isActive: userDetails.isSubscriptionActive,
                startDate: userDetails.subscriptionStartDate
            },
            recommendations: []
        };

        // Добавляем рекомендации
        this.generateRecommendations(report);
        
        return report;
    }

    /**
     * ГЕНЕРАТОРЫ SSH КОМАНД
     */
    generateGrantSubscriptionCommand(telegramId, subscriptionType) {
        return `ssh -i ~/.ssh/zomro ${this.SERVER_USER}@${this.SERVER_HOST} 'cd ${this.PROJECT_PATH} && node -e "
const { getUserDetailsSubscription } = require(\"./dist/core/supabase/getUserDetailsSubscription\");
const { createClient } = require(\"@supabase/supabase-js\");

async function grantSubscription() {
    try {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        
        console.log(\"🔄 Предоставление подписки ${subscriptionType} пользователю ${telegramId}...\");
        
        const { data, error } = await supabase
            .from(\"payments_v2\")
            .insert({
                telegram_id: \"${telegramId}\",
                type: \"${subscriptionType}\",
                amount: 0,
                transaction_id: \"AGENT_GRANT_\" + Date.now(),
                created_at: new Date().toISOString()
            });
            
        if (error) throw error;
        
        console.log(\"✅ Подписка ${subscriptionType} успешно предоставлена пользователю ${telegramId}\");
        
        // Проверяем результат
        const verification = await getUserDetailsSubscription(\"${telegramId}\");
        console.log(\"📊 Статус после предоставления:\", JSON.stringify(verification, null, 2));
        
    } catch (error) {
        console.error(\"❌ Ошибка предоставления подписки:\", error.message);
    }
}

grantSubscription();
"'`;
    }

    generateCheckAccessCommand(telegramId) {
        return `ssh -i ~/.ssh/zomro ${this.SERVER_USER}@${this.SERVER_HOST} 'cd ${this.PROJECT_PATH} && node -e "
const { getUserDetailsSubscription } = require(\"./dist/core/supabase/getUserDetailsSubscription\");
const { getUserBalance } = require(\"./dist/core/supabase/getUserBalance\");

async function checkAccess() {
    try {
        console.log(\"🔍 Проверка доступа для пользователя ${telegramId}...\");
        
        const details = await getUserDetailsSubscription(\"${telegramId}\");
        const balance = await getUserBalance(\"${telegramId}\");
        
        console.log(\"📊 ДЕТАЛЬНЫЙ ОТЧЕТ О ДОСТУПЕ:\");
        console.log(\"===============================\");
        console.log(\"👤 Telegram ID:\", \"${telegramId}\");
        console.log(\"🔍 Существует в БД:\", details.isExist);
        console.log(\"💰 Баланс XTR:\", balance);
        console.log(\"⭐ Stars:\", details.stars);
        console.log(\"📅 Тип подписки:\", details.subscriptionType || \"Нет\");
        console.log(\"✅ Подписка активна:\", details.isSubscriptionActive);
        console.log(\"📆 Дата начала подписки:\", details.subscriptionStartDate || \"Нет\");
        console.log(\"===============================\");
        
        // Определяем доступные функции
        const access = {
            neurophoto: details.isSubscriptionActive || balance >= 100,
            neurovideo: details.subscriptionType === \"NEUROTESTER\" || details.subscriptionType === \"NEUROVIDEO\" || balance >= 500,
            unlimited: details.subscriptionType === \"NEUROTESTER\"
        };
        
        console.log(\"🔓 ДОСТУПНЫЕ ФУНКЦИИ:\");
        console.log(\"- Нейрофото:\", access.neurophoto ? \"✅ Доступно\" : \"❌ Недоступно\");
        console.log(\"- Нейровидео:\", access.neurovideo ? \"✅ Доступно\" : \"❌ Недоступно\");
        console.log(\"- Безлимитный доступ:\", access.unlimited ? \"✅ Доступно\" : \"❌ Недоступно\");
        
    } catch (error) {
        console.error(\"❌ Ошибка проверки доступа:\", error.message);
    }
}

checkAccess();
"'`;
    }

    generateCreateUserCommand(telegramId) {
        return `ssh -i ~/.ssh/zomro ${this.SERVER_USER}@${this.SERVER_HOST} 'cd ${this.PROJECT_PATH} && node -e "
const { createClient } = require(\"@supabase/supabase-js\");

async function createUser() {
    try {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        
        console.log(\"🔄 Создание пользователя ${telegramId}...\");
        
        const { data, error } = await supabase
            .from(\"users\")
            .insert({
                telegram_id: \"${telegramId}\",
                created_at: new Date().toISOString(),
                is_blocked: false
            });
            
        if (error && error.code !== \"23505\") { // 23505 = unique constraint violation
            throw error;
        }
        
        if (error && error.code === \"23505\") {
            console.log(\"ℹ️ Пользователь ${telegramId} уже существует в базе данных\");
        } else {
            console.log(\"✅ Пользователь ${telegramId} успешно создан\");
        }
        
    } catch (error) {
        console.error(\"❌ Ошибка создания пользователя:\", error.message);
    }
}

createUser();
"'`;
    }

    /**
     * ПОЛУЧЕНИЕ ДАННЫХ ПОЛЬЗОВАТЕЛЯ (через SSH)
     */
    async getUserDetails(telegramId) {
        const command = `ssh -i ~/.ssh/zomro ${this.SERVER_USER}@${this.SERVER_HOST} 'cd ${this.PROJECT_PATH} && node -e "
const { getUserDetailsSubscription } = require(\"./dist/core/supabase/getUserDetailsSubscription\");
getUserDetailsSubscription(\"${telegramId}\").then(result => console.log(JSON.stringify(result))).catch(err => console.error(err.message));"'`;
        
        const result = await this.executeSSHCommand(command);
        try {
            return JSON.parse(result);
        } catch (error) {
            this.log(`❌ Ошибка парсинга данных пользователя: ${error.message}`);
            return {
                isExist: false,
                subscriptionType: null,
                isSubscriptionActive: false,
                stars: 0,
                subscriptionStartDate: null
            };
        }
    }

    /**
     * ПОЛУЧЕНИЕ БАЛАНСА ПОЛЬЗОВАТЕЛЯ (через SSH)
     */
    async getUserBalance(telegramId) {
        const command = `ssh -i ~/.ssh/zomro ${this.SERVER_USER}@${this.SERVER_HOST} 'cd ${this.PROJECT_PATH} && node -e "
const { getUserBalance } = require(\"./dist/core/supabase/getUserBalance\");
getUserBalance(\"${telegramId}\").then(result => console.log(result)).catch(err => console.error(err.message));"'`;
        
        const result = await this.executeSSHCommand(command);
        return parseFloat(result) || 0;
    }

    /**
     * ВЫПОЛНЕНИЕ SSH КОМАНДЫ
     */
    async executeSSHCommand(command) {
        return new Promise((resolve, reject) => {
            const child = spawn('bash', ['-c', command], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
                if (code === 0) {
                    resolve(stdout.trim());
                } else {
                    reject(new Error(`SSH команда завершилась с кодом ${code}: ${stderr}`));
                }
            });

            child.on('error', (error) => {
                reject(new Error(`Ошибка выполнения SSH команды: ${error.message}`));
            });
        });
    }

    /**
     * ГЕНЕРАЦИЯ СВОДКИ ПО ВСЕМ ПОЛЬЗОВАТЕЛЯМ
     */
    generateSummary(userAnalytics) {
        const summary = {
            totalUsers: userAnalytics.length,
            existingUsers: 0,
            newUsers: 0,
            activeSubscriptions: 0,
            highBalanceUsers: 0,
            lowBalanceUsers: 0,
            recommendedActions: []
        };

        userAnalytics.forEach(user => {
            if (user.error) return;

            if (user.exists) {
                summary.existingUsers++;
            } else {
                summary.newUsers++;
            }

            if (user.subscription.isActive) {
                summary.activeSubscriptions++;
            }

            if (user.balance >= this.thresholds.highBalance) {
                summary.highBalanceUsers++;
            }

            if (user.balance < this.thresholds.lowBalance) {
                summary.lowBalanceUsers++;
            }

            // Собираем рекомендуемые действия
            user.actions.forEach(action => {
                if (!summary.recommendedActions.includes(action)) {
                    summary.recommendedActions.push(action);
                }
            });
        });

        return summary;
    }

    /**
     * ЛОГИРОВАНИЕ
     */
    async log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        
        console.log(logMessage.trim());
        
        try {
            await fs.appendFile(this.logFile, logMessage);
        } catch (error) {
            console.error(`Ошибка записи в лог: ${error.message}`);
        }
    }

    /**
     * ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ЗАДЕРЖКИ
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * ФОРМАТИРОВАНИЕ ОТЧЕТА ДЛЯ ВЫВОДА
     */
    formatAnalysisReport(analysis) {
        if (analysis.error) {
            return `❌ ОШИБКА АНАЛИЗА ПОЛЬЗОВАТЕЛЯ ${analysis.telegramId}:\n${analysis.error}`;
        }

        let report = `
📊 АНАЛИЗ ПОЛЬЗОВАТЕЛЯ: ${analysis.telegramId}
================================================
👤 Существует в БД: ${analysis.exists ? '✅ Да' : '❌ Нет'}
💰 Баланс XTR: ${analysis.balance}
⭐ Stars: ${analysis.stars}
📅 Тип подписки: ${analysis.subscription.type || 'Нет'}
✅ Подписка активна: ${analysis.subscription.isActive ? 'Да' : 'Нет'}
📆 Дата начала: ${analysis.subscription.startDate || 'Нет'}

🎯 РЕКОМЕНДАЦИИ:
${analysis.recommendations.map(rec => `• ${rec}`).join('\n')}

⚡ ДОСТУПНЫЕ ДЕЙСТВИЯ:
${analysis.actions.map(action => `• ${action}`).join('\n')}

🖥️ SSH КОМАНДЫ ДЛЯ ВЫПОЛНЕНИЯ:
${analysis.sshCommands.map((cmd, i) => `${i + 1}. ${cmd}`).join('\n\n')}
================================================
`;

        return report;
    }
}

// ЭКСПОРТ И CLI ИНТЕРФЕЙС
module.exports = TelegramUserAccessAgent;

// Если запущен как CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    const agent = new TelegramUserAccessAgent();

    if (args.length === 0) {
        console.log(`
🤖 TELEGRAM USER ACCESS AGENT v1.0.0

ИСПОЛЬЗОВАНИЕ:
  node user-access-agent.js analyze "сообщение с Telegram ID"
  node user-access-agent.js action <telegram_id> <action>
  node user-access-agent.js report <telegram_id>

ПРИМЕРЫ:
  node user-access-agent.js analyze "Пользователь 123456789 жалуется"
  node user-access-agent.js action 123456789 grant_neurotester
  node user-access-agent.js report 123456789

ДОСТУПНЫЕ ДЕЙСТВИЯ:
  - grant_neurotester    Предоставить NEUROTESTER подписку
  - check_access         Проверить доступ к функциям
  - create_user          Создать пользователя в БД
  - generate_report      Создать детальный отчет
  - check_subscription   Проверить статус подписки
        `);
        process.exit(0);
    }

    const command = args[0];

    (async () => {
        try {
            if (command === 'analyze') {
                const message = args[1];
                if (!message) {
                    console.error('❌ Необходимо указать сообщение для анализа');
                    process.exit(1);
                }

                const result = await agent.analyzeMessage(message);
                
                if (!result.hasUsers) {
                    console.log(result.message);
                    return;
                }

                console.log(`🔍 НАЙДЕНО TELEGRAM ID: ${result.foundIds.join(', ')}\n`);
                
                for (const analysis of result.analytics) {
                    console.log(agent.formatAnalysisReport(analysis));
                }

                console.log(`📈 СВОДКА: ${result.analytics.length} пользователей проанализировано`);

            } else if (command === 'action') {
                const telegramId = args[1];
                const action = args[2];
                
                if (!telegramId || !action) {
                    console.error('❌ Необходимо указать telegram_id и действие');
                    process.exit(1);
                }

                const result = await agent.executeAction(telegramId, action);
                console.log('✅ Результат выполнения:', JSON.stringify(result, null, 2));

            } else if (command === 'report') {
                const telegramId = args[1];
                
                if (!telegramId) {
                    console.error('❌ Необходимо указать telegram_id');
                    process.exit(1);
                }

                const report = await agent.generateUserReport(telegramId);
                console.log(agent.formatAnalysisReport(report));

            } else {
                console.error(`❌ Неизвестная команда: ${command}`);
                process.exit(1);
            }

        } catch (error) {
            console.error(`❌ Ошибка выполнения: ${error.message}`);
            process.exit(1);
        }
    })();
}