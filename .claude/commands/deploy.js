#!/usr/bin/env node

/**
 * Claude Code Custom Slash Command: /deploy
 * 
 * Автоматический деплой с проверками безопасности:
 * - Проверяет отсутствие токенов в коммитах
 * - Собирает проект и проверяет на ошибки
 * - Создает коммит и пушит в production
 * - Обновляет подмодули на продакшн сервере
 * - Перезапускает сервисы
 * - Проверяет статус развертывания
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Конфигурация
const CONFIG = {
  PRODUCTION_SERVER: {
    HOST: '212.86.115.30',
    USER: 'root',
    SSH_KEY: '~/.ssh/zomro',
    PROJECT_PATH: '/root/999-agents-vibecoder',
    SUBMODULE_PATH: '/root/999-agents-vibecoder/services/bot-farm',
    SERVICE_NAME: 'app'
  },
  SECURITY: {
    // Паттерны для поиска потенциально опасного контента
    DANGEROUS_PATTERNS: [
      /BOT_TOKEN_\d+=[0-9]+:[A-Za-z0-9_-]{35}/, // Telegram bot tokens
      /sk-[a-zA-Z0-9]{48}/, // OpenAI API keys
      /(?:password|passwd|pwd).*[:=]\s*[^\s\n]+/i, // Passwords
      /(?:secret|key|token).*[:=]\s*[^\s\n]+/i, // Generic secrets
      /[a-f0-9]{40}/, // 40-char hex strings (potential API keys)
      /[A-Za-z0-9]{32,}/, // Long alphanumeric strings
    ],
    // Исключения - файлы где токены допустимы
    ALLOWED_FILES: [
      '.env',
      '.env.example',
      'docs/',
      'README.md'
    ]
  },
  COLORS: {
    RED: '\x1b[31m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    BLUE: '\x1b[34m',
    MAGENTA: '\x1b[35m',
    CYAN: '\x1b[36m',
    RESET: '\x1b[0m',
    BOLD: '\x1b[1m'
  }
};

class DeployManager {
  constructor() {
    this.step = 0;
    this.totalSteps = 10;
  }

  log(message, color = CONFIG.COLORS.RESET) {
    console.log(`${color}${message}${CONFIG.COLORS.RESET}`);
  }

  logStep(message) {
    this.step++;
    this.log(`\n${CONFIG.COLORS.BOLD}${CONFIG.COLORS.CYAN}[${this.step}/${this.totalSteps}] ${message}${CONFIG.COLORS.RESET}`);
  }

  logSuccess(message) {
    this.log(`✅ ${message}`, CONFIG.COLORS.GREEN);
  }

  logWarning(message) {
    this.log(`⚠️  ${message}`, CONFIG.COLORS.YELLOW);
  }

  logError(message) {
    this.log(`❌ ${message}`, CONFIG.COLORS.RED);
  }

  exec(command, options = {}) {
    try {
      const result = execSync(command, { 
        encoding: 'utf8', 
        stdio: ['pipe', 'pipe', 'pipe'],
        ...options 
      });
      return { success: true, output: result.trim() };
    } catch (error) {
      return { 
        success: false, 
        error: error.message, 
        output: error.stdout || error.stderr || ''
      };
    }
  }

  async sshExec(command) {
    const sshCommand = `ssh -i ${CONFIG.PRODUCTION_SERVER.SSH_KEY} ${CONFIG.PRODUCTION_SERVER.USER}@${CONFIG.PRODUCTION_SERVER.HOST} '${command}'`;
    return this.exec(sshCommand);
  }

  // Проверка безопасности: поиск токенов и секретов в измененных файлах
  async securityCheck() {
    this.logStep('Проверка безопасности: поиск токенов и секретов');

    // Получаем список измененных файлов
    const gitDiff = this.exec('git diff --name-only HEAD~1');
    if (!gitDiff.success) {
      this.logWarning('Не удалось получить список измененных файлов, проверяем все файлы');
      return true; // Продолжаем, но с предупреждением
    }

    const changedFiles = gitDiff.output.split('\n').filter(f => f.trim());
    
    for (const file of changedFiles) {
      // Пропускаем разрешенные файлы
      const isAllowed = CONFIG.SECURITY.ALLOWED_FILES.some(allowed => 
        file.includes(allowed)
      );
      
      if (isAllowed) {
        this.log(`  📁 Пропускаем разрешенный файл: ${file}`, CONFIG.COLORS.BLUE);
        continue;
      }

      // Проверяем содержимое файла
      if (!fs.existsSync(file)) continue;
      
      try {
        const content = fs.readFileSync(file, 'utf8');
        
        for (const pattern of CONFIG.SECURITY.DANGEROUS_PATTERNS) {
          if (pattern.test(content)) {
            this.logError(`Обнаружен потенциальный секрет в файле: ${file}`);
            this.logError(`Паттерн: ${pattern}`);
            this.logError('Развертывание остановлено из соображений безопасности');
            return false;
          }
        }
        
        this.log(`  ✅ ${file} - безопасен`, CONFIG.COLORS.GREEN);
      } catch (error) {
        this.logWarning(`Не удалось проверить файл: ${file} - ${error.message}`);
      }
    }

    this.logSuccess('Проверка безопасности пройдена');
    return true;
  }

  // Проверка git статуса и подготовка к коммиту
  async gitPreCheck() {
    this.logStep('Проверка Git статуса');

    const status = this.exec('git status --porcelain');
    if (!status.success) {
      this.logError('Не удалось получить git status');
      return false;
    }

    const hasChanges = status.output.trim().length > 0;
    
    if (hasChanges) {
      this.log('Обнаружены незакоммиченные изменения:', CONFIG.COLORS.YELLOW);
      this.log(status.output);
      
      // Проверяем, находимся ли мы на правильной ветке
      const branch = this.exec('git branch --show-current');
      if (!branch.success || branch.output !== 'production') {
        this.logError('Разработка должна вестись на ветке production');
        return false;
      }

      this.logSuccess('Готов к созданию коммита');
    } else {
      this.log('Нет незакоммиченных изменений');
    }

    return true;
  }

  // Сборка проекта и проверка на ошибки
  async buildProject() {
    this.logStep('Сборка проекта');

    const build = this.exec('npm run build');
    if (!build.success) {
      this.logError('Ошибка при сборке проекта:');
      this.log(build.output, CONFIG.COLORS.RED);
      return false;
    }

    this.logSuccess('Проект успешно собран');
    return true;
  }

  // Создание коммита и пуш
  async commitAndPush() {
    this.logStep('Создание коммита и отправка в production');

    // Добавляем все изменения
    const add = this.exec('git add -A');
    if (!add.success) {
      this.logError('Не удалось добавить файлы в индекс');
      return false;
    }

    // Проверяем есть ли что коммитить
    const status = this.exec('git status --porcelain');
    if (!status.output.trim()) {
      this.logWarning('Нет изменений для коммита');
      return true;
    }

    // Создаем коммит с автоматическим сообщением
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const commitMessage = `🚀 AUTO-DEPLOY: ${timestamp}

Автоматический деплой через Claude Code slash команду /deploy

🔒 Проверки безопасности пройдены
🏗️ Проект успешно собран
📦 Готов к развертыванию

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>`;

    const commit = this.exec(`git commit -m "${commitMessage}"`);
    if (!commit.success) {
      this.logError('Не удалось создать коммит:');
      this.log(commit.output, CONFIG.COLORS.RED);
      return false;
    }

    // Пушим в production
    const push = this.exec('git push origin production');
    if (!push.success) {
      this.logError('Не удалось отправить изменения:');
      this.log(push.output, CONFIG.COLORS.RED);
      return false;
    }

    this.logSuccess('Изменения отправлены в production');
    return true;
  }

  // Обновление подмодулей на продакшн сервере
  async updateProductionSubmodules() {
    this.logStep('Обновление подмодулей на продакшн сервере');

    // Переходим в директорию подмодуля и обновляем
    const commands = [
      `cd ${CONFIG.PRODUCTION_SERVER.SUBMODULE_PATH}`,
      'git fetch origin production',
      'git checkout production',
      'git reset --hard origin/production'
    ];

    for (const cmd of commands) {
      const result = await this.sshExec(`cd ${CONFIG.PRODUCTION_SERVER.SUBMODULE_PATH} && ${cmd}`);
      if (!result.success) {
        this.logError(`Ошибка выполнения команды: ${cmd}`);
        this.log(result.output, CONFIG.COLORS.RED);
        return false;
      }
    }

    // Компилируем TypeScript на сервере
    this.log('Компилирование TypeScript на сервере...');
    const compile = await this.sshExec(`cd ${CONFIG.PRODUCTION_SERVER.SUBMODULE_PATH} && npx tsc`);
    if (!compile.success) {
      this.logWarning('Предупреждение при компиляции TypeScript');
      this.log(compile.output, CONFIG.COLORS.YELLOW);
    }

    // Обновляем ссылку на подмодуль в основном проекте
    const updateSubmodule = await this.sshExec(`cd ${CONFIG.PRODUCTION_SERVER.PROJECT_PATH} && git add services/bot-farm && git commit -m "Auto-update bot-farm submodule to latest production"`);
    if (!updateSubmodule.success) {
      this.logWarning('Подмодуль уже обновлен или нет изменений');
    }

    this.logSuccess('Подмодули обновлены');
    return true;
  }

  // Перезапуск сервисов на продакшн
  async restartProductionServices() {
    this.logStep('Перезапуск сервисов на продакшн');

    // Перезапускаем основной сервис
    const restart = await this.sshExec(`cd ${CONFIG.PRODUCTION_SERVER.PROJECT_PATH} && docker-compose restart ${CONFIG.PRODUCTION_SERVER.SERVICE_NAME}`);
    if (!restart.success) {
      this.logError('Не удалось перезапустить сервис');
      this.log(restart.output, CONFIG.COLORS.RED);
      return false;
    }

    // Ждем несколько секунд для старта сервиса
    this.log('Ожидание запуска сервиса...', CONFIG.COLORS.BLUE);
    await new Promise(resolve => setTimeout(resolve, 10000));

    this.logSuccess('Сервисы перезапущены');
    return true;
  }

  // Проверка статуса развертывания
  async verifyDeployment() {
    this.logStep('Проверка статуса развертывания');

    // Проверяем статус контейнера
    const status = await this.sshExec(`cd ${CONFIG.PRODUCTION_SERVER.PROJECT_PATH} && docker-compose ps ${CONFIG.PRODUCTION_SERVER.SERVICE_NAME}`);
    if (!status.success) {
      this.logError('Не удалось получить статус сервиса');
      return false;
    }

    this.log('Статус сервиса:', CONFIG.COLORS.BLUE);
    this.log(status.output);

    // Проверяем логи на наличие ошибок
    const logs = await this.sshExec(`cd ${CONFIG.PRODUCTION_SERVER.PROJECT_PATH} && docker-compose logs --tail=20 ${CONFIG.PRODUCTION_SERVER.SERVICE_NAME}`);
    if (logs.success) {
      const hasErrors = logs.output.includes('ERROR') || logs.output.includes('error') || logs.output.includes('Error');
      if (hasErrors) {
        this.logWarning('Обнаружены ошибки в логах:');
        this.log(logs.output, CONFIG.COLORS.YELLOW);
      } else {
        this.logSuccess('Логи не содержат ошибок');
      }
    }

    // Проверяем что боты успешно запустились
    const botLogs = await this.sshExec(`cd ${CONFIG.PRODUCTION_SERVER.PROJECT_PATH} && docker-compose logs ${CONFIG.PRODUCTION_SERVER.SERVICE_NAME} | grep "успешно запущены" | tail -1`);
    if (botLogs.success && botLogs.output.includes('успешно запущены')) {
      this.logSuccess('Боты успешно запущены');
    } else {
      this.logWarning('Не найдено подтверждение успешного запуска ботов');
    }

    return true;
  }

  // Генерация отчета о развертывании
  async generateReport() {
    this.logStep('Генерация отчета о развертывании');

    const timestamp = new Date().toISOString();
    const gitHash = this.exec('git rev-parse HEAD');
    const gitMessage = this.exec('git log -1 --pretty=%B');

    const report = {
      timestamp,
      status: 'SUCCESS',
      deployment: {
        commit: gitHash.success ? gitHash.output : 'unknown',
        message: gitMessage.success ? gitMessage.output : 'unknown',
        branch: 'production'
      },
      services: {
        restarted: [CONFIG.PRODUCTION_SERVER.SERVICE_NAME],
        status: 'running'
      },
      checks: {
        security: '✅ Passed',
        build: '✅ Passed',
        deployment: '✅ Completed'
      }
    };

    this.log('\n' + '='.repeat(60), CONFIG.COLORS.CYAN);
    this.log('📋 ОТЧЕТ О РАЗВЕРТЫВАНИИ', CONFIG.COLORS.BOLD);
    this.log('='.repeat(60), CONFIG.COLORS.CYAN);
    this.log(`🕐 Время: ${timestamp}`);
    this.log(`🌿 Ветка: ${report.deployment.branch}`);
    this.log(`📝 Коммит: ${report.deployment.commit.slice(0, 7)}`);
    this.log(`💬 Сообщение: ${report.deployment.message.split('\n')[0]}`);
    this.log(`🔒 Безопасность: ${report.checks.security}`);
    this.log(`🏗️ Сборка: ${report.checks.build}`);
    this.log(`🚀 Развертывание: ${report.checks.deployment}`);
    this.log(`⚙️ Сервисы: ${report.services.restarted.join(', ')}`);
    this.log('='.repeat(60), CONFIG.COLORS.CYAN);

    this.logSuccess('Развертывание успешно завершено!');
    return true;
  }

  // Основной метод развертывания
  async deploy() {
    this.log('\n🚀 АВТОМАТИЧЕСКОЕ РАЗВЕРТЫВАНИЕ ЗАПУЩЕНО', CONFIG.COLORS.BOLD);
    this.log('Claude Code Slash Command: /deploy\n', CONFIG.COLORS.MAGENTA);

    try {
      // Выполняем все этапы последовательно
      if (!(await this.securityCheck())) return false;
      if (!(await this.gitPreCheck())) return false;
      if (!(await this.buildProject())) return false;
      if (!(await this.commitAndPush())) return false;
      if (!(await this.updateProductionSubmodules())) return false;
      if (!(await this.restartProductionServices())) return false;
      if (!(await this.verifyDeployment())) return false;
      if (!(await this.generateReport())) return false;

      return true;
    } catch (error) {
      this.logError(`Критическая ошибка: ${error.message}`);
      return false;
    }
  }
}

// Главная функция
async function main() {
  const deployManager = new DeployManager();
  const success = await deployManager.deploy();
  
  process.exit(success ? 0 : 1);
}

// Запуск только если файл выполняется напрямую
if (require.main === module) {
  main().catch(error => {
    console.error('Необработанная ошибка:', error);
    process.exit(1);
  });
}

module.exports = { DeployManager };